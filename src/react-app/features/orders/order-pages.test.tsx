import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderDetailPage } from "./order-detail-page";
import { OrdersPage } from "./orders-page";

const orderNumber = "ord_ABCDEFGHIJKLMNOPQRST";
const order = {
	id: "order-1", orderNumber, status: "placed", paymentStatus: "pending", currency: "INR",
	subtotalMinor: 500, deliveryFeeMinor: 0, totalMinor: 500, itemCount: 1, placedAt: 1_700_000_000_000,
	expectedDeliveryAt: null, cancelledAt: null, customerCanCancel: true, version: 1,
};
const detail = {
	...order,
	address: { orderId: order.id, recipientName: "Asha", mobile: "+919876543210", addressLine1: "1 Market Road", addressLine2: null, landmark: null, city: "Pune", state: "Maharashtra", postalCode: "411001", latitude: null, longitude: null, deliveryInstructions: null },
	items: [{ offeringId: "offering-1", productId: "product-1", productCode: "MILK-1", productName: "Whole Milk", offeringSku: "MILK-1L", offeringLabel: "1 litre bottle", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 500, discountType: "none", discountValue: 0, effectiveUnitPriceMinor: 500, quantity: 1, lineTotalMinor: 500 }],
	statusHistory: [{ id: "history-1", fromStatus: null, toStatus: "placed", reason: null, actorUserId: null, createdAt: 1_700_000_000_000 }],
};

function renderPage(page: React.ReactNode, entry: string) {
	return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[entry]}><Routes><Route path="/orders" element={<OrdersPage />} /><Route path="/orders/:orderNumber" element={page} /><Route path="/cart" element={<p>Cart destination</p>} /></Routes></MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("OrdersPage", () => {
	it("renders an accessible empty, loading, and populated history", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [order], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))));
		renderPage(<OrderDetailPage orderNumber={orderNumber} />, "/orders");
		expect(await screen.findByRole("heading", { name: /your orders/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: new RegExp(orderNumber) })).toHaveAttribute("href", `/orders/${orderNumber}`);
	});
});

describe("OrderDetailPage", () => {
	it("cancels with a reason and reports partial reorder results before going to cart", async () => {
		const user = userEvent.setup();
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url === `/api/orders/${orderNumber}` && !init?.method) return Promise.resolve(new Response(JSON.stringify(detail)));
			if (url === `/api/orders/${orderNumber}/cancel`) return Promise.resolve(new Response(JSON.stringify({ ...detail, status: "cancelled", cancelledAt: 1_700_000_001_000, customerCanCancel: false })));
			if (url === `/api/orders/${orderNumber}/reorder`) return Promise.resolve(new Response(JSON.stringify({ cartItemCount: 1, lines: [{ offeringId: "offering-1", requestedQuantity: 1, addedQuantity: 1, status: "added" }, { offeringId: "offering-2", requestedQuantity: 1, addedQuantity: 0, status: "out_of_stock" }] })));
			return Promise.reject(new Error(`Unexpected request ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderPage(<OrderDetailPage orderNumber={orderNumber} />, `/orders/${orderNumber}`);
		await screen.findByRole("heading", { name: new RegExp(orderNumber) });
		await user.click(screen.getByRole("button", { name: /cancel order/i }));
		await user.type(screen.getByRole("textbox", { name: /cancellation reason/i }), "No longer needed");
		await user.click(screen.getByRole("button", { name: /confirm cancellation/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/orders/${orderNumber}/cancel`, expect.objectContaining({ method: "POST" })));
		await user.click(screen.getByRole("button", { name: /reorder available items/i }));
		expect(await screen.findByText(/1 item could not be added/i)).toBeInTheDocument();
		await user.click(screen.getByRole("link", { name: /view cart/i }));
		expect(screen.getByText("Cart destination")).toBeInTheDocument();
	});

	it("shows the delivery QR code and PIN while out for delivery", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
			...detail,
			status: "out_for_delivery",
			customerCanCancel: false,
			deliveryProof: { orderId: "order-1", qrToken: "a".repeat(64), pin: "123456", expiresAt: 1_700_000_100_000 },
		}))));
		renderPage(<OrderDetailPage orderNumber={orderNumber} />, `/orders/${orderNumber}`);
		await screen.findByRole("heading", { name: new RegExp(orderNumber) });
		expect(screen.getByText("123456")).toBeInTheDocument();
		expect(await screen.findByAltText("Delivery verification QR code")).toBeInTheDocument();
	});
});
