import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { CmsShell } from "./cms-shell";
import { CustomerShell } from "./customer-shell";

describe("application shells", () => {
	it("gives the customer experience a labelled mobile bottom navigation", () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ lines: [], itemCount: 0, subtotalMinor: 0, requiresReview: false, updatedAt: null }))));
		render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CustomerShell><p>Shop</p></CustomerShell></MemoryRouter></QueryClientProvider>);
		const navigation = screen.getByRole("navigation", { name: /customer navigation/i });
		expect(navigation).toBeInTheDocument();
		expect(within(navigation).getByRole("link", { name: /search/i })).toHaveAttribute("href", "/search");
		expect(within(navigation).getByRole("link", { name: /^cart/i })).toHaveAttribute("href", "/cart");
		expect(within(navigation).getByRole("link", { name: /account/i })).toHaveAttribute("href", "/account");
		expect(navigation).not.toHaveClass("overflow-x-hidden");
	});

	it("shows the current cart count in the persistent header", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ lines: [{ offeringId: "offer-1", productId: "product-1", productSlug: "milk", productName: "Milk", offeringLabel: "1 litre", imageUrl: null, quantity: 3, lineVersion: 1, offeringVersion: 1, unitPriceMinorAtAdd: 100, currentUnitPriceMinor: 100, lineTotalMinor: 300, priceChanged: false, availableStock: 4, availability: "available" }], itemCount: 3, subtotalMinor: 300, requiresReview: false, updatedAt: 1 }))));
		render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CustomerShell><p>Shop</p></CustomerShell></MemoryRouter></QueryClientProvider>);
		expect(await screen.findByRole("link", { name: /cart, 3 items/i })).toHaveAttribute("href", "/cart");
	});

	it.each(["owner", "admin", "operations"] as const)("exposes Phase 2 catalog navigation to %s", (role) => {
		render(<MemoryRouter><CmsShell role={role}><p>CMS</p></CmsShell></MemoryRouter>);
		expect(screen.getByRole("navigation", { name: /CMS navigation/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("href", "/cms/products");
		expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("href", "/cms/categories");
		expect(screen.getByRole("link", { name: "Tags" })).toHaveAttribute("href", "/cms/tags");
		expect(screen.getByRole("link", { name: "Offerings" })).toHaveAttribute("href", "/cms/offerings");
		expect(screen.getByRole("link", { name: "Inventory" })).toHaveAttribute("href", "/cms/inventory");
	});

	it("keeps the delivery navigation compact and excludes Phase 2 catalog links", () => {
		render(<MemoryRouter><CmsShell role="delivery"><p>CMS</p></CmsShell></MemoryRouter>);
		expect(screen.getByRole("navigation", { name: /delivery navigation/i })).toBeInTheDocument();
		for (const label of ["Products", "Categories", "Tags", "Offerings", "Inventory"]) {
			expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
		}
	});
});
