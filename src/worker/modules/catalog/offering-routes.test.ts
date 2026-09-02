import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { request, signInAs } from "../../test/catalog-fixtures";

async function productFixture() {
	const { cookie } = await signInAs("operations");
	const now = Date.now();
	const categoryId = crypto.randomUUID();
	const productId = crypto.randomUUID();
	await env.DB.batch([
		env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, `Category ${categoryId}`, `category-${categoryId}`, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Milk', '', ?, 0, 1, ?, ?)").bind(productId, `P_${productId}`, `milk-${productId}`, categoryId, now, now),
	]);
	return { cookie, productId };
}

function payload(productId: string, overrides: Record<string, unknown> = {}) {
	return { productId, sku: `SKU_${crypto.randomUUID()}`, label: "Single", packQuantity: 1, weightValue: null, weightUnit: null, listPriceMinor: 999, discountType: "percentage", discountValue: 1250, lowStockThreshold: 2, active: true, ...overrides };
}

describe("CMS offering routes", () => {
	it("enforces permissions", async () => {
		expect((await request("/api/cms/offerings")).status).toBe(401);
		const { cookie } = await signInAs("delivery");
		expect((await request("/api/cms/offerings", cookie)).status).toBe(403);
	});

	it("creates an offering with zero stock and deterministic effective price", async () => {
		const fixture = await productFixture();
		const response = await request("/api/cms/offerings", fixture.cookie, "POST", payload(fixture.productId));
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({ stockQuantity: 0, version: 1, discountMinor: 124, effectivePriceMinor: 875, inStock: false });
	});

	it("validates pack structure and rejects duplicate SKUs", async () => {
		const fixture = await productFixture();
		const sku = `SKU_${crypto.randomUUID()}`;
		const invalid = await request("/api/cms/offerings", fixture.cookie, "POST", payload(fixture.productId, { sku, packQuantity: null }));
		expect(invalid.status).toBe(422);
		expect((await request("/api/cms/offerings", fixture.cookie, "POST", payload(fixture.productId, { sku }))).status).toBe(201);
		expect((await request("/api/cms/offerings", fixture.cookie, "POST", payload(fixture.productId, { sku }))).status).toBe(409);
	});

	it("increments versions and rejects stale writes", async () => {
		const fixture = await productFixture();
		const created = await request("/api/cms/offerings", fixture.cookie, "POST", payload(fixture.productId));
		const offering = await created.json() as { id: string; sku: string };
		const update = { version: 1, sku: offering.sku, label: "Two pack", packQuantity: 2, weightValue: null, weightUnit: null, listPriceMinor: 1000, discountType: "fixed", discountValue: 100, lowStockThreshold: 1, active: true };
		expect(await (await request(`/api/cms/offerings/${offering.id}`, fixture.cookie, "PUT", update)).json()).toMatchObject({ version: 2, effectivePriceMinor: 900 });
		expect((await request(`/api/cms/offerings/${offering.id}`, fixture.cookie, "PUT", update)).status).toBe(409);
	});
});
