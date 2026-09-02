import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfferingsPage } from "./offerings-page";

const offering = { id: "offering-1", productId: "product-1", sku: "MILK-1L", label: "Bottle", packQuantity: 1, weightValue: 1, weightUnit: "l", listPriceMinor: 1000, discountType: "fixed", discountValue: 100, discountMinor: 100, effectivePriceMinor: 900, stockQuantity: 2, lowStockThreshold: 3, inStock: true, lowStock: true, active: true, version: 1, createdAt: 1, updatedAt: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("OfferingsPage", () => {
	it("shows pricing, pack, stock, and status without exposing a normal stock editor", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [offering], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))));
		render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><OfferingsPage /></MemoryRouter></QueryClientProvider>);
		expect(await screen.findByText("MILK-1L")).toBeInTheDocument();
		expect(screen.getByText("1 pack · 1 l")).toBeInTheDocument();
		expect(screen.getByText("₹10.00")).toBeInTheDocument();
		expect(screen.getByText("₹9.00")).toBeInTheDocument();
		expect(screen.getByText(/2 · Low/)).toBeInTheDocument();
		expect(screen.queryByLabelText(/stock quantity/i)).not.toBeInTheDocument();
	});
});
