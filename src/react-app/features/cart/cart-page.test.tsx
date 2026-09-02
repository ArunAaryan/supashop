import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CartPage } from "./cart-page";
import { useAddCartItem } from "./cart-api";

const cart = {
	lines: [{
		offeringId: "offering-1", productId: "product-1", productSlug: "whole-milk", productName: "Whole Milk", offeringLabel: "1 litre bottle", imageUrl: null,
		quantity: 2, lineVersion: 1, unitPriceMinorAtAdd: 600, currentUnitPriceMinor: 500, lineTotalMinor: 1000,
		priceChanged: true, availableStock: 1, availability: "insufficient_stock",
	}],
	itemCount: 2, subtotalMinor: 1000, requiresReview: true, updatedAt: 1,
};

function renderWithClient(node: React.ReactNode) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>);
}

function cartFetch() {
	return vi.fn((url: string, init?: RequestInit) => {
		if (url === "/api/cart" && (!init?.method || init.method === "GET")) return Promise.resolve(new Response(JSON.stringify(cart)));
		if (url === "/api/cart/items/offering-1" && init?.method === "PUT") return Promise.resolve(new Response(JSON.stringify({ ...cart, lines: [{ ...cart.lines[0], quantity: 3, lineTotalMinor: 1500, availableStock: 2 }], itemCount: 3, subtotalMinor: 1500 })));
		if (url === "/api/cart/items/offering-1" && init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
		return Promise.reject(new Error(`Unexpected request: ${url}`));
	});
}

afterEach(() => vi.unstubAllGlobals());

describe("CartPage", () => {
	it("renders cart lines, repricing and availability warnings, totals, and Phase 4 checkout status", async () => {
		vi.stubGlobal("fetch", cartFetch());
		renderWithClient(<CartPage />);

		expect(await screen.findByRole("heading", { name: "Your cart" })).toBeInTheDocument();
		expect(screen.getAllByRole("link", { name: /whole milk/i })[0]).toHaveAttribute("href", "/products/whole-milk");
		expect(screen.getByText(/price changed/i)).toBeInTheDocument();
		expect(screen.getByText(/only 1 available/i)).toBeInTheDocument();
		expect(screen.getAllByText("₹10.00")).toHaveLength(2);
		expect(screen.getByText(/checkout arrives in phase 4/i)).toBeInTheDocument();
	});

	it("updates quantities and removes a line when decrement reaches zero", async () => {
		const user = userEvent.setup();
		const editableCart = { ...cart, lines: [{ ...cart.lines[0], availableStock: 5, availability: "available", priceChanged: false, unitPriceMinorAtAdd: 500 }], requiresReview: false };
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url === "/api/cart" && (!init?.method || init.method === "GET")) return Promise.resolve(new Response(JSON.stringify(editableCart)));
			if (url === "/api/cart/items/offering-1" && init?.method === "PUT") return Promise.resolve(new Response(JSON.stringify({ ...editableCart, lines: [{ ...editableCart.lines[0], quantity: 3, lineTotalMinor: 1500 }], itemCount: 3, subtotalMinor: 1500 })));
			if (url === "/api/cart/items/offering-1" && init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
			return Promise.reject(new Error(`Unexpected request: ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderWithClient(<CartPage />);
		await screen.findByRole("heading", { name: "Your cart" });

		await user.click(screen.getByRole("button", { name: /add one whole milk/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cart/items/offering-1", expect.objectContaining({ method: "PUT" })));
		await user.click(screen.getByRole("button", { name: /remove whole milk/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cart/items/offering-1", expect.objectContaining({ method: "DELETE" })));
	});

	it("uses DELETE rather than a zero quantity when decrementing the final item", async () => {
		const user = userEvent.setup();
		const oneItemCart = { ...cart, lines: [{ ...cart.lines[0], quantity: 1, lineTotalMinor: 500, availableStock: 1, availability: "available", priceChanged: false, unitPriceMinorAtAdd: 500 }], itemCount: 1, subtotalMinor: 500, requiresReview: false };
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url === "/api/cart") return Promise.resolve(new Response(JSON.stringify(oneItemCart)));
			if (url === "/api/cart/items/offering-1" && init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
			return Promise.reject(new Error(`Unexpected request: ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderWithClient(<CartPage />);
		await screen.findByRole("button", { name: /remove one whole milk/i });
		await user.click(screen.getByRole("button", { name: /remove one whole milk/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cart/items/offering-1", expect.objectContaining({ method: "DELETE" })));
	});

	it("blocks impossible quantity increases", async () => {
		const atStock = { ...cart, lines: [{ ...cart.lines[0], quantity: 1, lineTotalMinor: 500, availableStock: 1, availability: "available", priceChanged: false, unitPriceMinorAtAdd: 500 }], itemCount: 1, subtotalMinor: 500, requiresReview: false };
		const fetchMock = vi.fn((url: string) => {
			if (url === "/api/cart") return Promise.resolve(new Response(JSON.stringify(atStock)));
			return Promise.reject(new Error(`Unexpected request: ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderWithClient(<CartPage />);
		const add = await screen.findByRole("button", { name: /add one whole milk/i });
		expect(add).toBeDisabled();
	});

	it("explains a failed cart update and refreshes the cart", async () => {
		const user = userEvent.setup();
		const canIncrease = { ...cart, lines: [{ ...cart.lines[0], quantity: 1, lineTotalMinor: 500, availableStock: 3, availability: "available", priceChanged: false, unitPriceMinorAtAdd: 500 }], itemCount: 1, subtotalMinor: 500, requiresReview: false };
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url === "/api/cart") return Promise.resolve(new Response(JSON.stringify(canIncrease)));
			if (url === "/api/cart/items/offering-1" && init?.method === "PUT") return Promise.resolve(new Response(JSON.stringify({ error: { message: "Offering is unavailable" } }), { status: 409 }));
			return Promise.reject(new Error(`Unexpected request: ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderWithClient(<CartPage />);
		await user.click(await screen.findByRole("button", { name: /add one whole milk/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cart/items/offering-1", expect.objectContaining({ method: "PUT" })));
		expect(await screen.findByText(/could not update whole milk/i)).toBeInTheDocument();
	});

	it("handles loading, empty, and retryable error states", async () => {
		vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
		const { unmount } = renderWithClient(<CartPage />);
		expect(screen.getByLabelText("Loading cart…")).toBeInTheDocument();
		unmount();

		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ lines: [], itemCount: 0, subtotalMinor: 0, requiresReview: false, updatedAt: null }))));
		renderWithClient(<CartPage />);
		expect(await screen.findByText(/your cart is empty/i)).toBeInTheDocument();
	});
});

function AddProbe() {
	const add = useAddCartItem();
	return <button onClick={() => add.mutate({ offeringId: "offering-1", quantity: 1 })} type="button">Add</button>;
}

describe("useAddCartItem", () => {
	it("starts a guest session and retries once after an unauthenticated add", async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Guest required" } }), { status: 401 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ guest: true })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ...cart, lines: [{ ...cart.lines[0], quantity: 1, lineTotalMinor: 500, availableStock: 1 }], itemCount: 1, subtotalMinor: 500 })));
		vi.stubGlobal("fetch", fetchMock);
		const user = userEvent.setup();
		renderWithClient(<AddProbe />);
		await user.click(screen.getByRole("button", { name: "Add" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/cart/items");
		expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/guest/session");
		expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/cart/items");
	});
});
