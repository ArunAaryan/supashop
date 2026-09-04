import { describe, expect, it } from "vitest";

import { storeSettingsResponseSchema, storeSettingsSchema, type StoreSettingsInput, type StoreSettingsResponse } from "./store";

const base = {
	version: 1,
	name: "SupaShop Market",
	description: "",
	contactName: "Asha Patel",
	phone: "+919876543210",
	email: "hello@supashop.example",
	addressLine1: "42 Market Road",
	addressLine2: "",
	landmark: "",
	city: "Bengaluru",
	state: "Karnataka",
	postalCode: "560001",
	directionsUrl: null,
	deliveryInstructions: null,
	latitude: 12.9716,
	longitude: 77.5946,
	timezone: "Asia/Kolkata",
	orderCutoffMinutes: null,
	hours: Array.from({ length: 7 }, (_, weekday) => ({
		weekday,
		opensMinute: 0,
		closesMinute: 0,
		closed: true,
	})),
	serviceablePostalCodes: [],
	closures: [],
};

describe("store closure contract", () => {
	it("round-trips a valid closure list", () => {
		const input: StoreSettingsInput = {
			...base,
			closures: [
				{ id: "closure-1", startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "Christmas holiday" },
				{ id: "closure-2", startsOn: "2026-12-25", endsOn: "2026-12-25", reason: "" },
			],
		};

		const parsed = storeSettingsSchema.parse(input);
		expect(parsed.closures).toEqual(input.closures);
	});

	it("accepts a single-day closure", () => {
		const parsed = storeSettingsSchema.parse({
			...base,
			closures: [{ id: "closure-1", startsOn: "2026-05-01", endsOn: "2026-05-01", reason: "Labour day" }],
		});
		expect(parsed.closures).toHaveLength(1);
	});

	it("rejects duplicate closure ids", () => {
		const result = storeSettingsSchema.safeParse({
			...base,
			closures: [
				{ id: "same-id", startsOn: "2026-01-01", endsOn: "2026-01-02", reason: "A" },
				{ id: "same-id", startsOn: "2026-02-01", endsOn: "2026-02-02", reason: "B" },
			],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.some((issue) => issue.path.join(".") === "closures.1.id")).toBe(true);
		}
	});

	it("rejects a closure whose start date is after its end date", () => {
		const result = storeSettingsSchema.safeParse({
			...base,
			closures: [{ id: "closure-1", startsOn: "2026-12-26", endsOn: "2026-12-24", reason: "Bad range" }],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.some((issue) => issue.path.join(".") === "closures.0.endsOn")).toBe(true);
		}
	});

	it("rejects malformed dates", () => {
		const result = storeSettingsSchema.safeParse({
			...base,
			closures: [{ id: "closure-1", startsOn: "12/24/2026", endsOn: "2026-12-26", reason: "" }],
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.some((issue) => issue.path.join(".") === "closures.0.startsOn")).toBe(true);
		}
	});

	it("trims the reason field", () => {
		const parsed = storeSettingsSchema.parse({
			...base,
			closures: [{ id: "closure-1", startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "  Deepavali  " }],
		});
		expect(parsed.closures[0]?.reason).toBe("Deepavali");
	});

	it("rejects more than the maximum number of closures", () => {
		const result = storeSettingsSchema.safeParse({
			...base,
			closures: Array.from({ length: 101 }, (_, index) => ({
				id: `closure-${index}`,
				startsOn: "2026-01-01",
				endsOn: "2026-01-02",
				reason: "",
			})),
		});
		expect(result.success).toBe(false);
	});

	it("keeps closures absent from the public response shape", () => {
		// The configured response schema drives toStoreSettings; closures are included.
		const configured: StoreSettingsResponse = {
			configured: true,
			ownerUserId: "user-1",
			version: 2,
			name: "SupaShop Market",
			description: "",
			contactName: "Asha Patel",
			phone: "+919876543210",
			email: "hello@supashop.example",
			addressLine1: "42 Market Road",
			addressLine2: "",
			landmark: "",
			city: "Bengaluru",
			state: "Karnataka",
			postalCode: "560001",
			directionsUrl: null,
			deliveryInstructions: null,
			latitude: 12.9716,
			longitude: 77.5946,
			timezone: "Asia/Kolkata",
			orderCutoffMinutes: null,
			hours: base.hours,
			serviceablePostalCodes: [],
			closures: [
				{ id: "closure-1", startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "" },
			],
		};

		const result = storeSettingsResponseSchema.safeParse(configured);
		expect(result.success).toBe(true);
	});
});
