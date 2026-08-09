import { describe, expect, it } from "vitest";
import { formatMinorUnits } from "./money";

describe("formatMinorUnits", () => {
	it("formats integer paise as INR", () => {
		expect(formatMinorUnits(12345, "en-IN", "INR")).toBe("₹123.45");
	});

	it("uses INR and en-IN by default", () => {
		expect(formatMinorUnits(12345)).toBe("₹123.45");
	});

	it("formats zero", () => {
		expect(formatMinorUnits(0)).toBe("₹0.00");
	});

	it("formats negative amounts", () => {
		expect(formatMinorUnits(-12345)).toBe("-₹123.45");
	});

	it("rejects fractional amounts", () => {
		expect(() => formatMinorUnits(123.45)).toThrow(
			new TypeError("amount must be an integer"),
		);
	});

	it("rejects unsafe integers", () => {
		expect(() => formatMinorUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow(
			new TypeError("amount must be an integer"),
		);
	});
});
