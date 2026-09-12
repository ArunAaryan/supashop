import { describe, expect, it } from "vitest";

import { startOfLocalDayUtc } from "./timezone";

describe("startOfLocalDayUtc", () => {
	it("computes local midnight for a fixed-offset zone (Asia/Kolkata, UTC+5:30)", () => {
		// 2026-09-12T10:00:00Z is 2026-09-12T15:30 in Kolkata.
		const now = new Date(Date.UTC(2026, 8, 12, 10, 0, 0));
		expect(startOfLocalDayUtc("Asia/Kolkata", now)).toBe(Date.UTC(2026, 8, 11, 18, 30, 0));
	});

	it("computes local midnight across a DST boundary (America/New_York)", () => {
		// 2026-11-02T10:00:00Z is 2026-11-02T05:00 EST (UTC-5), after the DST fall-back.
		const now = new Date(Date.UTC(2026, 10, 2, 10, 0, 0));
		expect(startOfLocalDayUtc("America/New_York", now)).toBe(Date.UTC(2026, 10, 2, 5, 0, 0));
	});

	it("computes a later local day boundary for zones east of UTC", () => {
		const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
		// 2026-01-01T00:00Z is 2026-01-01T09:00 in Tokyo (UTC+9); its local day started 9h earlier.
		expect(startOfLocalDayUtc("Asia/Tokyo", now)).toBe(Date.UTC(2025, 11, 31, 15, 0, 0));
	});
});
