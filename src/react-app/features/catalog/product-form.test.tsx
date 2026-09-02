import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductForm } from "./product-form";

const category = { id: "category-1", name: "Dairy", slug: "dairy", description: null, active: true, productCount: 1, createdAt: 1, updatedAt: 1 };
const tag = { id: "tag-1", name: "Organic", slug: "organic", active: true, productCount: 1, createdAt: 1, updatedAt: 1 };
const detail = {
	id: "product-1", code: "MILK-1", slug: "whole-milk", name: "Whole Milk", description: "Fresh milk",
	baseWeightValue: 1, baseWeightUnit: "l" as const, categoryId: category.id, category, primaryImage: null,
	activeOfferingCount: 1, minimumEffectivePriceMinor: 500, hasPromotion: false, inStock: true, active: false, version: 4, createdAt: 1, updatedAt: 1,
	tags: [tag], images: [], offerings: [],
};

function page(items: unknown[]) {
	return { items, page: 1, pageSize: 100, totalItems: items.length, totalPages: items.length ? 1 : 0 };
}

function renderForm(mode: "create" | "edit") {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const entry = mode === "edit" ? "/cms/products/product-1" : "/cms/products/new";
	return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Routes><Route element={<ProductForm mode={mode} />} path="/cms/products/new" /><Route element={<ProductForm mode={mode} />} path="/cms/products/:productId" /></Routes></MemoryRouter></QueryClientProvider>);
}

function taxonomyResponse(url: string) {
	if (url.startsWith("/api/cms/categories?")) return new Response(JSON.stringify(page([category])));
	if (url.startsWith("/api/cms/tags?")) return new Response(JSON.stringify(page([tag])));
	return undefined;
}

afterEach(() => vi.unstubAllGlobals());

describe("ProductForm", () => {
	it("builds a normalized product payload and keeps activation unavailable before offerings exist", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const taxonomy = taxonomyResponse(url);
			if (taxonomy) return taxonomy;
			if (url === "/api/cms/products" && init?.method === "POST") return new Response(JSON.stringify(detail));
			throw new Error(`Unexpected request ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		renderForm("create");

		await screen.findByRole("option", { name: "Dairy" });
		expect(screen.getByRole("checkbox", { name: /active — visible/i })).toBeDisabled();
		await user.type(screen.getByLabelText(/product code/i), " milk-1 ");
		await user.type(screen.getByLabelText(/^slug$/i), " Whole Milk ");
		await user.type(screen.getByLabelText(/product name/i), " Whole Milk ");
		await user.selectOptions(screen.getByLabelText(/^category$/i), category.id);
		await user.click(screen.getByRole("checkbox", { name: "Organic" }));
		await user.click(screen.getByRole("button", { name: /save product/i }));

		expect(fetchMock).toHaveBeenLastCalledWith("/api/cms/products", expect.objectContaining({
			method: "POST",
			body: JSON.stringify({ code: "MILK-1", slug: "whole-milk", name: "Whole Milk", description: "", baseWeightValue: null, baseWeightUnit: null, categoryId: "category-1", tagIds: ["tag-1"], active: false }),
		}));
	});

	it("preserves edits after a stale update and offers to reload the canonical record", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const taxonomy = taxonomyResponse(url);
			if (taxonomy) return taxonomy;
			if (url === "/api/cms/products/product-1" && !init?.method) return new Response(JSON.stringify(detail));
			if (url === "/api/cms/products/product-1" && init?.method === "PUT") return new Response(JSON.stringify({ error: { code: "CONFLICT", message: "Product has changed. Reload and try again." } }), { status: 409 });
			throw new Error(`Unexpected request ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		renderForm("edit");

		const name = await screen.findByLabelText(/product name/i);
		await user.clear(name);
		await user.type(name, "Milk with edits");
		await user.click(screen.getByRole("button", { name: /save product/i }));

		expect(await screen.findByText(/reload and try again/i)).toBeInTheDocument();
		expect(name).toHaveValue("Milk with edits");
		expect(screen.getByRole("button", { name: /reload latest/i })).toBeInTheDocument();
	});
});
