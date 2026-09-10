import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeliveryOrdersPage } from "./delivery-orders";

const orderNumber = "ord_ABCDEFGHIJKLMNOPQRST";
const outForDelivery = {
	id: "order-1", orderNumber, status: "out_for_delivery", paymentStatus: "pending", currency: "INR",
	subtotalMinor: 500, deliveryFeeMinor: 0, totalMinor: 500, itemCount: 1, placedAt: 1_700_000_000_000,
	expectedDeliveryAt: null, cancelledAt: null, customerCanCancel: false, version: 3,
};

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/cms/deliver"]}><DeliveryOrdersPage /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("DeliveryOrdersPage", () => {
	it("verifies a delivery by six-digit PIN", async () => {
		const fetchMock = vi.fn((url: string, init?: RequestInit) => {
			if (url === "/api/cms/delivery/orders" && !init?.method) {
				return Promise.resolve(new Response(JSON.stringify({ items: [outForDelivery], page: 1, pageSize: 50, totalItems: 1, totalPages: 1 })));
			}
			if (url === `/api/cms/delivery/orders/${orderNumber}/verify`) {
				return Promise.resolve(new Response(JSON.stringify({
					...outForDelivery,
					status: "delivered",
					paymentStatus: "collected",
				})));
			}
			return Promise.reject(new Error(`Unexpected request ${url}`));
		});
		vi.stubGlobal("fetch", fetchMock);
		renderPage();
		await screen.findByRole("heading", { name: /complete each drop-off/i });
		fireEvent.click(screen.getByRole("button", { name: /complete delivery/i }));
		fireEvent.change(screen.getByLabelText("Delivery PIN"), { target: { value: "123456" } });
		fireEvent.click(screen.getByRole("button", { name: /confirm delivery/i }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
			`/api/cms/delivery/orders/${orderNumber}/verify`,
			expect.objectContaining({ method: "POST" }),
		));
		const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
		const body = JSON.parse((call?.[1] as RequestInit).body as string) as { pin: string };
		expect(body).toEqual({ pin: "123456" });
	});
});
