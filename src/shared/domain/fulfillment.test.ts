import { describe, expect, it } from "vitest";

import { evaluateFulfillmentAvailability } from "./fulfillment";

const store = {
	timezone: "Asia/Kolkata",
	orderCutoffMinutes: 18 * 60,
	hours: Array.from({ length: 7 }, (_, weekday) => ({
		weekday,
		opensMinute: 9 * 60,
		closesMinute: 20 * 60,
		closed: weekday === 0,
	})),
	serviceablePostalCodes: ["560001", "560002"],
	closures: [] as Array<{ startsOn: string; endsOn: string }>,
};

describe("evaluateFulfillmentAvailability", () => {
	it("accepts a serviceable postal code while the store is open before cutoff", () => {
		expect(evaluateFulfillmentAvailability(store, " 560001 ", new Date("2026-09-04T06:30:00.000Z"))).toEqual({
			available: true,
			reason: "available",
			localDate: "2026-09-04",
		});
	});

	it("rejects a postal code outside the configured service area", () => {
		expect(evaluateFulfillmentAvailability(store, "999999", new Date("2026-09-04T06:30:00.000Z")).reason).toBe("unserviceable_postal_code");
	});

	it("rejects weekly closures and exceptional closure ranges", () => {
		expect(evaluateFulfillmentAvailability(store, "560001", new Date("2026-09-06T06:30:00.000Z")).reason).toBe("store_closed");
		expect(evaluateFulfillmentAvailability({ ...store, closures: [{ startsOn: "2026-09-04", endsOn: "2026-09-05" }] }, "560001", new Date("2026-09-04T06:30:00.000Z")).reason).toBe("store_closed");
	});

	it("rejects times outside opening hours and at the configured cutoff", () => {
		expect(evaluateFulfillmentAvailability(store, "560001", new Date("2026-09-04T02:30:00.000Z")).reason).toBe("store_closed");
		expect(evaluateFulfillmentAvailability(store, "560001", new Date("2026-09-04T12:30:00.000Z")).reason).toBe("order_cutoff_passed");
	});

	it("reports an unconfigured store without throwing", () => {
		expect(evaluateFulfillmentAvailability(null, "560001", new Date("2026-09-04T06:30:00.000Z"))).toEqual({
			available: false,
			reason: "store_not_configured",
			localDate: null,
		});
	});
});
