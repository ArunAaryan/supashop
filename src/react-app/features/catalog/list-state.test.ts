import { describe, expect, it } from "vitest";

import { readListState, writeListState } from "./list-state";

describe("list state", () => {
	it("round-trips manual table state through URL parameters", () => {
		const state = readListState(new URLSearchParams("page=3&pageSize=50&sort=name&direction=desc&q=milk"));
		expect(state).toEqual({ page: 3, pageSize: 50, sort: "name", direction: "desc", q: "milk" });
		expect(writeListState(state).toString()).toBe("page=3&pageSize=50&sort=name&direction=desc&q=milk");
	});

	it("clamps pagination and defaults an unsupported direction", () => {
		expect(readListState(new URLSearchParams("page=0&pageSize=120&sort=%20%20&q=%20%20&direction=sideways"))).toEqual({
			page: 1,
			pageSize: 100,
			direction: "asc",
		});
	});
});
