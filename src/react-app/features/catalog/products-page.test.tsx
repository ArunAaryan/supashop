import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductsPage } from "./products-page";

const category = { id: "category-1", name: "Dairy", slug: "dairy", description: null, active: true, productCount: 1, createdAt: 1, updatedAt: 1 };
const product = {
	id: "product-1", code: "MILK-1", slug: "whole-milk", name: "Whole Milk", description: "Fresh milk",
	baseWeightValue: 1, baseWeightUnit: "l" as const, categoryId: category.id, category, primaryImage: null,
	activeOfferingCount: 1, minimumEffectivePriceMinor: 500, hasPromotion: false, inStock: true, active: true, version: 1, createdAt: 1, updatedAt: 1,
};

function renderPage(initialEntry = "/cms/products") {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><ProductsPage /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("ProductsPage", () => {
	it("shows product operational values, an image placeholder, and server-backed search", async () => {
		const user = userEvent.setup();
		const page = { items: [product], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 };
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page)));
		vi.stubGlobal("fetch", fetchMock);
		renderPage("/cms/products?page=1&pageSize=20&q=milk&sort=code&direction=asc");

		expect(await screen.findByText("Whole Milk")).toBeInTheDocument();
		expect(screen.getByText("MILK-1")).toBeInTheDocument();
		expect(screen.getByText("Dairy")).toBeInTheDocument();
		expect(screen.getByLabelText("No product image")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Whole Milk" })).toHaveAttribute("href", "/cms/products/product-1");
		expect(fetchMock.mock.calls[0]?.[0]).toContain("search=milk");
		expect(fetchMock.mock.calls[0]?.[0]).toContain("sortBy=code");

		await user.clear(screen.getByRole("textbox", { name: /search products/i }));
		await user.type(screen.getByRole("textbox", { name: /search products/i }), "whole");
		await user.click(screen.getByRole("button", { name: /^search$/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock.mock.calls[1]?.[0]).toContain("search=whole");
	});
});
