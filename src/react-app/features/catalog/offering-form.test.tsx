import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfferingForm } from "./offering-form";

const product = { id: "product-1", code: "MILK", slug: "milk", name: "Whole Milk", description: "", baseWeightValue: null, baseWeightUnit: null, categoryId: "category-1", category: { id: "category-1", name: "Dairy", slug: "dairy", description: null, active: true, productCount: 1, createdAt: 1, updatedAt: 1 }, active: false, version: 1, createdAt: 1, updatedAt: 1, primaryImage: null, activeOfferingCount: 0, minimumEffectivePriceMinor: null, hasPromotion: false, inStock: false };
const saved = { id: "offering-1", productId: "product-1", sku: "MILK-1", label: "Single", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 1000, discountType: "percentage", discountValue: 1250, discountMinor: 125, effectivePriceMinor: 875, stockQuantity: 0, lowStockThreshold: 2, inStock: false, lowStock: true, active: true, version: 1, createdAt: 1, updatedAt: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("OfferingForm", () => {
	it("uses structured pack and discount fields and never submits stock", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.startsWith("/api/cms/products?")) return new Response(JSON.stringify({ items: [product], page: 1, pageSize: 100, totalItems: 1, totalPages: 1 }));
			if (url === "/api/cms/offerings" && init?.method === "POST") return new Response(JSON.stringify(saved));
			throw new Error(`Unexpected request ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/cms/offerings/new"]}><Routes><Route element={<OfferingForm mode="create" />} path="/cms/offerings/new" /></Routes></MemoryRouter></QueryClientProvider>);
		await user.selectOptions(await screen.findByLabelText(/^product$/i), "product-1");
		await user.type(screen.getByLabelText(/^sku$/i), " milk-1 ");
		await user.type(screen.getByLabelText(/pack label/i), "Single");
		await user.type(screen.getByLabelText(/pack quantity/i), "1");
		await user.type(screen.getByLabelText(/list price/i), "1000");
		await user.selectOptions(screen.getByLabelText(/discount type/i), "percentage");
		await user.clear(screen.getByLabelText(/basis points/i));
		await user.type(screen.getByLabelText(/basis points/i), "1250");
		await user.clear(screen.getByLabelText(/low stock threshold/i));
		await user.type(screen.getByLabelText(/low stock threshold/i), "2");
		await user.click(screen.getByRole("checkbox", { name: "Active" }));
		await user.click(screen.getByRole("button", { name: /save offering/i }));
		const request = fetchMock.mock.calls.find(([url]) => url === "/api/cms/offerings");
		expect(request?.[1]?.body).toBe(JSON.stringify({ productId: "product-1", sku: "MILK-1", label: "Single", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 1000, discountType: "percentage", discountValue: 1250, lowStockThreshold: 2, active: true }));
		expect(String(request?.[1]?.body)).not.toContain("stockQuantity");
	});
});
