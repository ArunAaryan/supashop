import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmsOrdersPage } from "./cms-orders-page";

const orderNumber = "ord_ABCDEFGHIJKLMNOPQRST";
const order = {
	id: "order-1", orderNumber, status: "placed", paymentStatus: "pending", currency: "INR",
	subtotalMinor: 500, deliveryFeeMinor: 0, totalMinor: 500, itemCount: 1, placedAt: 1_700_000_000_000,
	expectedDeliveryAt: null, cancelledAt: null, customerCanCancel: true, version: 1,
};

function renderPage(initialEntry = "/cms/orders") {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initialEntry]}><CmsOrdersPage /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.unstubAllGlobals());

describe("CmsOrdersPage", () => {
	it("renders the order number as a link to its detail page", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [order], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }))));
		renderPage("/cms/orders?page=1&pageSize=20&search=ord");

		expect(await screen.findByRole("heading", { name: /from placement to doorstep/i })).toBeInTheDocument();
		expect(await screen.findByRole("link", { name: orderNumber })).toHaveAttribute("href", `/cms/orders/${orderNumber}`);
		expect(screen.getByText("Pending")).toBeInTheDocument();
		expect(screen.queryByText("No orders match this view.")).not.toBeInTheDocument();
	});
});
