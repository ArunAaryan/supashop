import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckoutPage } from "./checkout-page";

const orderNumber = "ord_ABCDEFGHIJKLMNOPQRST";
const cart = { lines: [{ offeringId: "offering-1", productId: "product-1", productSlug: "whole-milk", productName: "Whole Milk", offeringLabel: "1 litre", imageUrl: null, quantity: 1, lineVersion: 3, offeringVersion: 3, unitPriceMinorAtAdd: 500, currentUnitPriceMinor: 500, lineTotalMinor: 500, priceChanged: false, availableStock: 2, availability: "available" }], itemCount: 1, subtotalMinor: 500, requiresReview: false, updatedAt: 5 };
const order = { id: "order-1", orderNumber, status: "placed", paymentStatus: "pending", currency: "INR", subtotalMinor: 500, deliveryFeeMinor: 0, totalMinor: 500, itemCount: 1, placedAt: 1_700_000_000_000, expectedDeliveryAt: null, cancelledAt: null, customerCanCancel: true, version: 1, address: { orderId: "order-1", recipientName: "Asha", mobile: "+919876543210", addressLine1: "1 Market Road", addressLine2: null, landmark: null, city: "Pune", state: "Maharashtra", postalCode: "411001", latitude: null, longitude: null, deliveryInstructions: null }, items: [{ offeringId: "offering-1", productId: "product-1", productCode: "MILK-1", productName: "Whole Milk", offeringSku: "MILK-1L", offeringLabel: "1 litre", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 500, discountType: "none", discountValue: 0, effectiveUnitPriceMinor: 500, quantity: 1, lineTotalMinor: 500 }], statusHistory: [{ id: "history-1", fromStatus: null, toStatus: "placed", reason: null, actorUserId: null, createdAt: 1_700_000_000_000 }] };

function renderPage() {
	return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/checkout"]}><Routes><Route path="/checkout" element={<CheckoutPage />} /><Route path={`/orders/${orderNumber}`} element={<p>Order destination</p>} /></Routes></MemoryRouter></QueryClientProvider>);
}

async function completeAddress(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByRole("textbox", { name: /recipient name/i }), "Asha");
	await user.type(screen.getByRole("textbox", { name: /mobile number/i }), "+919876543210");
	await user.type(screen.getByRole("textbox", { name: /^address line 1/i }), "1 Market Road");
	await user.type(screen.getByRole("textbox", { name: /^city/i }), "Pune");
	await user.type(screen.getByRole("textbox", { name: /^state/i }), "Maharashtra");
	await user.type(screen.getByRole("textbox", { name: /postal code/i }), "411001");
}

afterEach(() => vi.unstubAllGlobals());

describe("CheckoutPage", () => {
	it("explains E.164 input and places a COD order with one stable idempotency key", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			void init;
			if (url === "/api/cart") return Promise.resolve(new Response(JSON.stringify(cart)));
			if (url === "/api/session") return Promise.resolve(new Response(JSON.stringify({ user: null, session: null, cmsRole: null, guest: true })));
			if (url === "/api/checkout") return Promise.resolve(new Response(JSON.stringify(order)));
			return Promise.reject(new Error(`Unexpected request ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderPage();
		expect(await screen.findByText(/use international format/i)).toBeInTheDocument();
		await completeAddress(user);
		await user.click(screen.getByRole("button", { name: /place cod order/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/checkout", expect.objectContaining({ method: "POST", headers: expect.any(Headers) })));
		const checkoutCall = fetchMock.mock.calls.find(([url]) => url === "/api/checkout");
		const headers = (checkoutCall?.[1] as RequestInit).headers as Headers;
		expect(headers.get("Idempotency-Key")).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
		expect(screen.getByText("Order destination")).toBeInTheDocument();
	});

	it("keeps entered delivery details and refreshes the cart after a checkout conflict", async () => {
		const user = userEvent.setup();
		let cartReads = 0;
		let checkoutAttempts = 0;
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			void init;
			if (url === "/api/cart") { cartReads += 1; return Promise.resolve(new Response(JSON.stringify(cart))); }
			if (url === "/api/session") return Promise.resolve(new Response(JSON.stringify({ user: null, session: null, cmsRole: null, guest: true })));
			if (url === "/api/checkout") { checkoutAttempts += 1; return Promise.resolve(checkoutAttempts === 1 ? new Response(JSON.stringify({ error: { code: "CONFLICT", message: "Cart changed" } }), { status: 409 }) : new Response(JSON.stringify(order))); }
			return Promise.reject(new Error(`Unexpected request ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderPage();
		await screen.findByRole("heading", { name: /delivery details/i });
		await completeAddress(user);
		await user.click(screen.getByRole("button", { name: /place cod order/i }));
		expect(await screen.findByText(/cart changed while we checked it/i)).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: /recipient name/i })).toHaveValue("Asha");
		expect(cartReads).toBeGreaterThan(1);
		await user.click(screen.getByRole("button", { name: /place cod order/i }));
		expect(await screen.findByText("Order destination")).toBeInTheDocument();
		const keys = fetchMock.mock.calls.filter(([url]) => url === "/api/checkout").map(([, init]) => ((init as RequestInit).headers as Headers).get("Idempotency-Key"));
		expect(keys).toHaveLength(2);
		expect(keys[0]).not.toBe(keys[1]);
	});
});
