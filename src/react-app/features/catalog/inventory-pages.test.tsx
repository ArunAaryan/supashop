import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Offering } from "../../../shared/contracts/catalog";
import { InventoryAdjustment } from "./inventory-pages";

const offering: Offering = { id: "offering-1", productId: "product-1", sku: "MILK-1", label: "Single", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 1000, discountType: "none", discountValue: 0, discountMinor: 0, effectivePriceMinor: 1000, stockQuantity: 5, lowStockThreshold: 2, inStock: true, lowStock: false, active: true, version: 3, createdAt: 1, updatedAt: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("InventoryAdjustment", () => {
	it("previews the absolute-to-delta change and submits the current version with a reason", async () => {
		const user = userEvent.setup();
		const response = { offering: { ...offering, stockQuantity: 8, version: 4 }, movement: { id: "movement-1", offeringId: offering.id, previousQuantity: 5, quantityDelta: 3, resultingQuantity: 8, reason: "Opening count", movementType: "manual_adjustment", actorUserId: "user-1", offeringVersion: 4, createdAt: 2 } };
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
		vi.stubGlobal("fetch", fetchMock);
		render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><InventoryAdjustment offering={offering} onReload={() => undefined} /></QueryClientProvider>);
		await user.clear(screen.getByLabelText(/desired stock count/i));
		await user.type(screen.getByLabelText(/desired stock count/i), "8");
		expect(screen.getByText("Stock change: +3")).toBeInTheDocument();
		await user.type(screen.getByLabelText(/^reason$/i), "Opening count");
		await user.click(screen.getByRole("button", { name: /adjust inventory/i }));
		expect(fetchMock).toHaveBeenCalledWith("/api/cms/offerings/offering-1/inventory-adjustments", expect.objectContaining({ method: "POST", body: JSON.stringify({ stockQuantity: 8, reason: "Opening count", version: 3 }) }));
	});
});
