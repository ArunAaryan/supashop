import { describe, expect, it } from "vitest";
import { calculateEffectivePrice } from "./discount";

describe("calculateEffectivePrice", () => {
	it("subtracts a fixed discount in minor units", () => {
		expect(calculateEffectivePrice(1_000, "fixed", 125)).toEqual({
			discountMinor: 125,
			effectivePriceMinor: 875,
		});
	});

	it("rounds percentage discounts down to the nearest minor unit", () => {
		expect(calculateEffectivePrice(999, "percentage", 1_250)).toEqual({
			discountMinor: 124,
			effectivePriceMinor: 875,
		});
	});

	it("requires a zero discount value when the type is none", () => {
		expect(() => calculateEffectivePrice(1_000, "none", 1)).toThrow();
	});

	it("rejects fixed discounts greater than or equal to the list price", () => {
		expect(() => calculateEffectivePrice(1_000, "fixed", 1_000)).toThrow();
		expect(() => calculateEffectivePrice(1_000, "fixed", 1_001)).toThrow();
	});

	it("rejects percentage discounts greater than 100 percent", () => {
		expect(() => calculateEffectivePrice(1_000, "percentage", 10_001)).toThrow();
	});

	it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
		"rejects an unsafe or nonpositive list price: %s",
		(listPriceMinor) => {
			expect(() => calculateEffectivePrice(listPriceMinor, "none", 0)).toThrow();
		},
	);

	it.each([
		["none", -1],
		["fixed", -1],
		["fixed", 1.5],
		["fixed", Number.MAX_SAFE_INTEGER + 1],
		["percentage", 0],
		["percentage", -1],
		["percentage", 1.5],
		["percentage", Number.MAX_SAFE_INTEGER + 1],
	] as const)("rejects invalid %s discount value %s", (type, value) => {
		expect(() => calculateEffectivePrice(1_000, type, value)).toThrow();
	});

	it("rejects an unknown discount type at runtime", () => {
		expect(() =>
			calculateEffectivePrice(1_000, "coupon" as "none", 0),
		).toThrow();
	});
});
