import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShopHomePage } from "./shop-home-page";
import { ShopProductPage } from "./shop-product-page";
import { ShopSearchPage } from "./shop-search-page";

const category = { id: "category-1", name: "Dairy", slug: "dairy", description: null, active: true, productCount: 1, createdAt: 1, updatedAt: 1 };
const product = {
	id: "product-1", code: "MILK-1", slug: "whole-milk", name: "Whole Milk", description: "Farm fresh milk",
	baseWeightValue: 1, baseWeightUnit: "l", categoryId: category.id, category, active: true, version: 1, createdAt: 1, updatedAt: 1,
	primaryImage: null, activeOfferingCount: 2, minimumEffectivePriceMinor: 500, hasPromotion: true, inStock: true,
};
const offering = {
	id: "offering-1", productId: product.id, sku: "MILK-1L", label: "1 litre bottle", packQuantity: 1,
	weightValue: 1, weightUnit: "l", listPriceMinor: 600, discountType: "fixed", discountValue: 100,
	discountMinor: 100, effectivePriceMinor: 500, stockQuantity: 3, lowStockThreshold: 2, inStock: true,
	lowStock: false, active: true, version: 1, createdAt: 1, updatedAt: 1,
};
const unavailableOffering = { ...offering, id: "offering-2", label: "2 litre bottle", stockQuantity: 0, inStock: false, lowStock: true };

function renderPage(page: React.ReactNode, entry: string) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}>{page}</MemoryRouter></QueryClientProvider>);
}

function catalogFetch() {
	return vi.fn((url: string) => {
		if (url.startsWith("/api/catalog/categories")) return Promise.resolve(new Response(JSON.stringify([category])));
		if (url.startsWith("/api/catalog/tags")) return Promise.resolve(new Response(JSON.stringify([])));
		if (url.startsWith("/api/catalog/products/whole-milk")) return Promise.resolve(new Response(JSON.stringify({ ...product, tags: [], images: [], offerings: [offering, unavailableOffering] })));
		if (url.startsWith("/api/catalog/search")) return Promise.resolve(new Response(JSON.stringify({ items: [product], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })));
		if (url.startsWith("/api/catalog/products")) return Promise.resolve(new Response(JSON.stringify({ items: [product], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 })));
		if (url === "/api/cart/items") return Promise.resolve(new Response(JSON.stringify({ lines: [{ offeringId: offering.id, productId: product.id, productSlug: product.slug, productName: product.name, offeringLabel: offering.label, imageUrl: null, quantity: 1, lineVersion: 1, unitPriceMinorAtAdd: offering.effectivePriceMinor, currentUnitPriceMinor: offering.effectivePriceMinor, lineTotalMinor: offering.effectivePriceMinor, priceChanged: false, availableStock: offering.stockQuantity, availability: "available" }], itemCount: 1, subtotalMinor: offering.effectivePriceMinor, requiresReview: false, updatedAt: 1 })));
		return Promise.reject(new Error(`Unexpected request ${url}`));
	});
}

afterEach(() => vi.unstubAllGlobals());

describe("ShopHomePage", () => {
	it("falls back to the unfiltered view for an invalid category URL parameter", async () => {
		const fetchMock = catalogFetch();
		vi.stubGlobal("fetch", fetchMock);
		expect(() => renderPage(<ShopHomePage />, "/shop?category=---")).not.toThrow();
		expect(await screen.findByRole("heading", { name: "Whole Milk" })).toBeInTheDocument();
		expect(fetchMock.mock.calls.some(([url]) => String(url).includes("categorySlug"))).toBe(false);
	});

	it("shows a loading affordance before catalog data arrives", () => {
		vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
		renderPage(<ShopHomePage />, "/shop");
		expect(screen.getByLabelText("Loading products…")).toBeInTheDocument();
	});

	it("shows categories and responsive product cards, and filters by category", async () => {
		const user = userEvent.setup();
		const fetchMock = catalogFetch();
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<ShopHomePage />, "/shop");

		expect(await screen.findByRole("heading", { name: "Whole Milk" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /whole milk/i })).toHaveAttribute("href", "/products/whole-milk");
		await user.click(screen.getByRole("button", { name: "Dairy" }));
		await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("categorySlug=dairy"))).toBe(true));
	});

	it("shows a retryable error when the catalog cannot load", async () => {
		vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify({ error: { message: "Offline" } }), { status: url.startsWith("/api/catalog/products") ? 500 : 200 }))));
		renderPage(<ShopHomePage />, "/shop");
		expect(await screen.findByRole("heading", { name: /could not load products/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
	});

	it("explains when a selected category has no available products", async () => {
		const fetchMock = catalogFetch();
		fetchMock.mockImplementation((url: string) => {
			if (url.startsWith("/api/catalog/categories")) return Promise.resolve(new Response(JSON.stringify([category])));
			if (url.startsWith("/api/catalog/products")) return Promise.resolve(new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 })));
			return Promise.resolve(new Response(JSON.stringify([])));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<ShopHomePage />, "/shop?category=dairy");
		expect(await screen.findByText(/no products are available/i)).toBeInTheDocument();
	});
});

describe("ShopSearchPage", () => {
	it("normalizes invalid URL filters without crashing and keeps the input synced to the URL", async () => {
		const user = userEvent.setup();
		const fetchMock = catalogFetch();
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<ShopSearchPage />, "/search?q=milk&sort=invalid&category=not%20a%20slug!");
		expect(await screen.findByText("1 result")).toBeInTheDocument();
		const request = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/catalog/search"))?.[0] as string;
		expect(request).toContain("sortBy=relevance");
		expect(request).not.toContain("categorySlug");

		await user.clear(screen.getByRole("textbox", { name: /search products/i }));
		await user.type(screen.getByRole("textbox", { name: /search products/i }), "bread");
		await user.click(screen.getByRole("button", { name: "Search" }));
		expect(screen.getByRole("textbox", { name: /search products/i })).toHaveValue("bread");
	});

	it("drives the public search and filters from URL state", async () => {
		const fetchMock = catalogFetch();
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<ShopSearchPage />, "/search?q=milk&category=dairy&inStock=true&sort=price&direction=asc");

		expect(await screen.findByText("1 result")).toBeInTheDocument();
		const request = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/catalog/search"))?.[0] as string;
		expect(request).toContain("search=milk");
		expect(request).toContain("categorySlug=dairy");
		expect(request).toContain("inStock=true");
		expect(request).toContain("sortBy=price");
	});

	it("does not search until there is a query and renders the empty state", async () => {
		const fetchMock = catalogFetch();
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<ShopSearchPage />, "/search");
		expect(screen.getByText(/start with a product/i)).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/catalog/search"), expect.anything());
	});
});

describe("ShopProductPage", () => {
	it("lets customers inspect each gallery image", async () => {
		const user = userEvent.setup();
		const imageOne = { id: "image-1", productId: product.id, url: "/api/catalog/images/image-1", mimeType: "image/png", byteSize: 10, altText: "Milk bottle front", displayOrder: 0, createdAt: 1 };
		const imageTwo = { id: "image-2", productId: product.id, url: "/api/catalog/images/image-2", mimeType: "image/png", byteSize: 10, altText: "Milk bottle side", displayOrder: 1, createdAt: 1 };
		vi.stubGlobal("fetch", vi.fn((url: string) => {
			if (url.startsWith("/api/catalog/products/whole-milk")) return Promise.resolve(new Response(JSON.stringify({ ...product, primaryImage: imageOne, tags: [], images: [imageOne, imageTwo], offerings: [offering] })));
			return Promise.resolve(new Response(JSON.stringify([])));
		}));
		renderPage(<ShopProductPage slug="whole-milk" />, "/products/whole-milk");
		expect((await screen.findAllByAltText("Milk bottle front"))[0]).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /view image 2/i }));
		expect(screen.getByRole("img", { name: "Milk bottle side" })).toHaveAttribute("src", imageTwo.url);
	});

	it("adds the selected in-stock offering to the cart", async () => {
		const user = userEvent.setup();
		const fetchMock = catalogFetch();
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<ShopProductPage slug="whole-milk" />, "/products/whole-milk");
		await screen.findByRole("button", { name: "Add to cart" });
		await user.click(screen.getByRole("button", { name: "Add to cart" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cart/items", expect.objectContaining({ method: "POST" })));
	});

	it("selects offerings and prevents adding an out-of-stock offering", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", catalogFetch());
		renderPage(<ShopProductPage slug="whole-milk" />, "/products/whole-milk");

		expect(await screen.findByRole("radio", { name: /1 litre bottle/i })).toBeInTheDocument();
		await user.click(screen.getByRole("radio", { name: /2 litre bottle/i }));
		expect(screen.getByRole("button", { name: /out of stock/i })).toBeDisabled();
	});
});
