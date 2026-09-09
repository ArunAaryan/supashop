import { describe, expect, it } from "vitest";

import {
	calculateOrderTotal,
	canCustomerCancelOrder,
	canTransitionOrder,
	isOpaqueOrderNumber,
	orderStatusValues,
} from "./order";

describe("order domain helpers", () => {
	it("allows customer cancellation only before fulfilment begins", () => {
		expect(canCustomerCancelOrder("placed")).toBe(true);
		expect(canCustomerCancelOrder("confirmed")).toBe(true);
		expect(canCustomerCancelOrder("preparing")).toBe(false);
		expect(canCustomerCancelOrder("cancelled")).toBe(false);
	});

	it("calculates COD totals from integer minor units", () => {
		expect(calculateOrderTotal(1_250, 99)).toBe(1_349);
	});

	it("recognizes only opaque, non-sequential public order numbers", () => {
		expect(isOpaqueOrderNumber("ord_u5NrWL4i6aQYVbScRM5T7z_e")).toBe(true);
		expect(isOpaqueOrderNumber("12345")).toBe(false);
		expect(isOpaqueOrderNumber("ord_short")).toBe(false);
	});
});

describe("order transitions", () => {
	it("walks the fulfilment path in order", () => {
		expect(canTransitionOrder("placed", "confirmed", "cms")).toBe(true);
		expect(canTransitionOrder("confirmed", "preparing", "cms")).toBe(true);
		expect(canTransitionOrder("preparing", "ready", "cms")).toBe(true);
		expect(canTransitionOrder("ready", "out_for_delivery", "cms")).toBe(true);
		expect(canTransitionOrder("out_for_delivery", "delivered", "cms")).toBe(true);
	});

	it("allows customer cancel only while placed or confirmed", () => {
		expect(canTransitionOrder("placed", "cancelled", "customer")).toBe(true);
		expect(canTransitionOrder("confirmed", "cancelled", "customer")).toBe(true);
		expect(canTransitionOrder("preparing", "cancelled", "customer")).toBe(false);
	});

	it("allows CMS cancel or reject of any undelivered order", () => {
		for (const from of ["placed", "confirmed", "preparing", "ready", "out_for_delivery"] as const) {
			expect(canTransitionOrder(from, "cancelled", "cms")).toBe(true);
			expect(canTransitionOrder(from, "rejected", "cms")).toBe(true);
		}
	});

	it("never leaves a terminal status", () => {
		for (const from of ["delivered", "cancelled", "rejected"] as const) {
			for (const to of orderStatusValues) expect(canTransitionOrder(from, to, "cms")).toBe(false);
		}
	});

	it("rejects same-status and skipped transitions", () => {
		expect(canTransitionOrder("placed", "placed", "cms")).toBe(false);
		expect(canTransitionOrder("confirmed", "out_for_delivery", "cms")).toBe(false);
	});
});
