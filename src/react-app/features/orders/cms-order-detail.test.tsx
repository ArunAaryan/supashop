import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsOrderDetail } from "./cms-order-detail";

const orderNumber = "ord_ABCDEFGHIJKLMNOPQRST";
const detail = {
	id: "order-1", orderNumber, status: "placed", paymentStatus: "pending", currency: "INR",
	subtotalMinor: 500, deliveryFeeMinor: 0, totalMinor: 500, itemCount: 1, placedAt: 1_700_000_000_000,
	expectedDeliveryAt: null, cancelledAt: null, customerCanCancel: true, version: 1,
	address: { orderId: "order-1", recipientName: "Asha", mobile: "+919876543210", addressLine1: "1 Market Road", addressLine2: null, landmark: null, city: "Pune", state: "Maharashtra", postalCode: "411001", latitude: null, longitude: null, deliveryInstructions: null },
	items: [{ offeringId: "offering-1", productId: "product-1", productCode: "MILK-1", productName: "Whole Milk", offeringSku: "MILK-1L", offeringLabel: "1 litre", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 500, discountType: "none", discountValue: 0, effectiveUnitPriceMinor: 500, quantity: 1, lineTotalMinor: 500 }],
	statusHistory: [{ id: "history-1", fromStatus: null, toStatus: "placed", reason: null, actorUserId: null, createdAt: 1_700_000_000_000 }],
};

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/cms/orders/${orderNumber}`]}><Routes><Route path="/cms/orders/:orderNumber" element={<CmsOrderDetail orderNumber={orderNumber} />} /></Routes></MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("CmsOrderDetail", () => {
	it("acknowledges a placed order with an expected delivery time", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url === `/api/cms/orders/${orderNumber}` && !init?.method) {
				return Promise.resolve(new Response(JSON.stringify(detail)));
			}
			if (url === `/api/cms/orders/${orderNumber}/transition`) {
				return Promise.resolve(new Response(JSON.stringify({
					...detail,
					status: "confirmed",
					expectedDeliveryAt: 1_700_000_100_000,
					statusHistory: [...detail.statusHistory, { id: "history-2", fromStatus: "placed", toStatus: "confirmed", reason: null, actorUserId: null, createdAt: 1_700_000_100_000 }],
				})));
			}
			return Promise.reject(new Error(`Unexpected request ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderPage();
		await screen.findByRole("heading", { name: new RegExp(orderNumber) });
		fireEvent.change(screen.getByLabelText("Expected delivery"), { target: { value: "2026-12-24T10:30" } });
		await waitFor(() => expect(screen.getByRole("button", { name: /acknowledge/i })).not.toBeDisabled());
		fireEvent.click(screen.getByRole("button", { name: /acknowledge/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
			`/api/cms/orders/${orderNumber}/transition`,
			expect.objectContaining({ method: "POST" }),
		));
		const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
		const body = JSON.parse((call?.[1] as RequestInit).body as string) as { toStatus: string; expectedDeliveryAt: number };
		expect(body.toStatus).toBe("confirmed");
		expect(body.expectedDeliveryAt).toBe(new Date("2026-12-24T10:30").getTime());
	});
});
