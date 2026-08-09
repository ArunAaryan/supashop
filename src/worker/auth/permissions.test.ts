import { describe, expect, it } from "vitest";

import { can } from "./permissions";

describe("CMS permissions", () => {
	it("grants every permission to an owner, including team management", () => {
		expect(can("owner", "team:update")).toBe(true);
		expect(can("owner", "delivery:complete")).toBe(true);
	});

	it("does not grant team management to an admin", () => {
		expect(can("admin", "team:update")).toBe(false);
		expect(can("admin", "store:update")).toBe(true);
	});

	it("limits operations to catalog, inventory, order, and analytics work", () => {
		expect(can("operations", "catalog:write")).toBe(true);
		expect(can("operations", "analytics:read")).toBe(true);
		expect(can("operations", "store:update")).toBe(false);
	});

	it("does not let delivery users update the store", () => {
		expect(can("delivery", "delivery:complete")).toBe(true);
		expect(can("delivery", "store:update")).toBe(false);
	});
});
