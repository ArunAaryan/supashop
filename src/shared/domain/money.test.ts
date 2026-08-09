import { describe, expect, it } from "vitest";
import { formatMinorUnits } from "./money";

describe("formatMinorUnits", () => {
	it("formats integer paise as INR", () => {
		expect(formatMinorUnits(12345, "en-IN", "INR")).toBe("₹123.45");
	});
});
