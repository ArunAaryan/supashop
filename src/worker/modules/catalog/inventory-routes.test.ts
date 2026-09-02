import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { request, signInAs } from "../../test/catalog-fixtures";

async function offeringFixture(role: "operations" | "delivery" = "operations") {
	const auth = await signInAs(role);
	const now = Date.now();
	const categoryId = crypto.randomUUID();
	const productId = crypto.randomUUID();
	const offeringId = crypto.randomUUID();
	await env.DB.batch([
		env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, `Category ${categoryId}`, `category-${categoryId}`, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Milk', '', ?, 0, 1, ?, ?)").bind(productId, `P_${productId}`, `milk-${productId}`, categoryId, now, now),
		env.DB.prepare("INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Single', 1, 100, 'none', 0, 0, 2, 1, 1, ?, ?)").bind(offeringId, productId, `SKU_${offeringId}`, now, now),
	]);
	return { ...auth, offeringId };
}

describe("inventory routes", () => {
	it("enforces inventory permission", async () => {
		expect((await request("/api/cms/inventory-movements")).status).toBe(401);
		const fixture = await offeringFixture("delivery");
		expect((await request(`/api/cms/offerings/${fixture.offeringId}/inventory-adjustments`, fixture.cookie, "POST", { stockQuantity: 1, reason: "Count", version: 1 })).status).toBe(403);
	});

	it("updates stock and records exactly one balanced movement", async () => {
		const fixture = await offeringFixture();
		const response = await request(`/api/cms/offerings/${fixture.offeringId}/inventory-adjustments`, fixture.cookie, "POST", { stockQuantity: 12, reason: "Opening count", version: 1 });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ offering: { stockQuantity: 12, version: 2 }, movement: { previousQuantity: 0, quantityDelta: 12, resultingQuantity: 12, reason: "Opening count", offeringVersion: 2 } });
		const count = await env.DB.prepare("SELECT count(*) AS total FROM inventory_movement WHERE offering_id = ?").bind(fixture.offeringId).first<{ total: number }>();
		expect(count?.total).toBe(1);
	});

	it("rejects no-change and stale adjustments without ledger rows", async () => {
		const fixture = await offeringFixture();
		expect((await request(`/api/cms/offerings/${fixture.offeringId}/inventory-adjustments`, fixture.cookie, "POST", { stockQuantity: 0, reason: "No change", version: 1 })).status).toBe(422);
		await request(`/api/cms/offerings/${fixture.offeringId}/inventory-adjustments`, fixture.cookie, "POST", { stockQuantity: 2, reason: "Count", version: 1 });
		expect((await request(`/api/cms/offerings/${fixture.offeringId}/inventory-adjustments`, fixture.cookie, "POST", { stockQuantity: 3, reason: "Stale", version: 1 })).status).toBe(409);
		const count = await env.DB.prepare("SELECT count(*) AS total FROM inventory_movement WHERE offering_id = ?").bind(fixture.offeringId).first<{ total: number }>();
		expect(count?.total).toBe(1);
	});

	it("lists the immutable ledger newest first", async () => {
		const fixture = await offeringFixture();
		await request(`/api/cms/offerings/${fixture.offeringId}/inventory-adjustments`, fixture.cookie, "POST", { stockQuantity: 2, reason: "First", version: 1 });
		await request(`/api/cms/offerings/${fixture.offeringId}/inventory-adjustments`, fixture.cookie, "POST", { stockQuantity: 4, reason: "Second", version: 2 });
		const response = await request(`/api/cms/inventory-movements?offeringId=${fixture.offeringId}`, fixture.cookie);
		expect(response.status).toBe(200);
		const body = await response.json() as { items: Array<{ reason: string }> };
		expect(body.items.map((item) => item.reason)).toEqual(["Second", "First"]);
	});
});
