import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

async function seedPublicCatalog() {
	const now = Date.now();
	const categoryId = crypto.randomUUID();
	const tagId = crypto.randomUUID();
	const productId = crypto.randomUUID();
	const inactiveProductId = crypto.randomUUID();
	const offeringId = crypto.randomUUID();
	const slug = `whole-milk-${productId}`;
	const productName = `Whole Milk ${productId}`;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, `Dairy ${categoryId}`, `dairy-${categoryId}`, now, now),
		env.DB.prepare("INSERT INTO tag (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(tagId, `Fresh ${tagId}`, `fresh-${tagId}`, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, 'Farm fresh dairy', ?, 1, 1, ?, ?)").bind(productId, `P_${productId}`, slug, productName, categoryId, now, now),
		env.DB.prepare("INSERT INTO product_tag (product_id, tag_id) VALUES (?, ?)").bind(productId, tagId),
		env.DB.prepare("INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Single bottle', 1, 1000, 'percentage', 1250, 4, 2, 1, 1, ?, ?)").bind(offeringId, productId, `SKU_${offeringId}`, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, 0, 1, ?, ?)").bind(inactiveProductId, `P_${inactiveProductId}`, `hidden-${inactiveProductId}`, `Hidden Milk ${inactiveProductId}`, categoryId, now, now),
	]);
	return { categoryId, tagId, productId, productName, slug };
}

describe("public catalog routes", () => {
	it("allows anonymous browsing and excludes inactive products", async () => {
		const fixture = await seedPublicCatalog();
		const response = await exports.default.fetch("http://example.com/api/catalog/products");
		expect(response.status).toBe(200);
		const body = await response.json() as { items: Array<Record<string, unknown>> };
		expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.productId, minimumEffectivePriceMinor: 875, hasPromotion: true, inStock: true })]));
		expect(body.items.some((item) => String(item.name).startsWith("Hidden Milk"))).toBe(false);
	});

	it("returns active detail with active offerings and a customer-safe gallery", async () => {
		const fixture = await seedPublicCatalog();
		const response = await exports.default.fetch(`http://example.com/api/catalog/products/${fixture.slug}`);
		expect(response.status).toBe(200);
		const body = await response.json() as Record<string, unknown>;
		expect(body).toMatchObject({ id: fixture.productId, offerings: [expect.objectContaining({ effectivePriceMinor: 875 })], images: [] });
		expect(JSON.stringify(body)).not.toContain("object_key");
	});

	it("escapes LIKE metacharacters and searches approved fields", async () => {
		await seedPublicCatalog();
		const literal = await exports.default.fetch("http://example.com/api/catalog/search?search=%25");
		expect(literal.status).toBe(200);
		expect(await literal.json()).toMatchObject({ items: [] });
		const search = await exports.default.fetch("http://example.com/api/catalog/search?search=Single%20bottle");
		expect(search.status).toBe(200);
		expect(await search.json()).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ name: expect.stringContaining("Whole Milk") })]) });
	});

	it("validates pagination and price filters", async () => {
		await seedPublicCatalog();
		expect((await exports.default.fetch("http://example.com/api/catalog/products?pageSize=101")).status).toBe(400);
		expect((await exports.default.fetch("http://example.com/api/catalog/products?minPriceMinor=900")).status).toBe(200);
		const filtered = await exports.default.fetch("http://example.com/api/catalog/products?maxPriceMinor=874");
		expect(await filtered.json()).toMatchObject({ items: [] });
	});
});
