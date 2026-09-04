import { describe, expect, it } from "vitest";

import {
	calculateOrderTotal,
	canCustomerCancelOrder,
	isOpaqueOrderNumber,
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
