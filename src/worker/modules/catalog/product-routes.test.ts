import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { insertTaxonomyFixture, request, signInAs } from "../../test/catalog-fixtures";

function productPayload(categoryId: string, tagIds: string[], overrides: Record<string, unknown> = {}) {
	const suffix = crypto.randomUUID();
	return {
		code: ` milk-${suffix} `,
		slug: ` Whole Milk ${suffix} `,
		name: `Whole Milk ${suffix}`,
		description: "Fresh milk",
		baseWeightValue: 1,
		baseWeightUnit: "l",
		categoryId,
		tagIds,
		active: false,
		...overrides,
	};
}

async function createProduct(cookie: string, categoryId: string, tagIds: string[], overrides: Record<string, unknown> = {}) {
	const response = await request("/api/cms/products", cookie, "POST", productPayload(categoryId, tagIds, overrides));
	expect(response.status).toBe(201);
	return (await response.json()) as { id: string; version: number; code: string; slug: string };
}

describe("catalog product routes", () => {
	it("requires catalog permission", async () => {
		expect((await request("/api/cms/products")).status).toBe(401);
		const { cookie } = await signInAs("delivery");
		expect((await request("/api/cms/products", cookie)).status).toBe(403);
	});

	it("creates canonical product details and returns their list projection", async () => {
		const fixture = await insertTaxonomyFixture();
		const product = await createProduct(fixture.cookie, fixture.categoryId, [fixture.tagId]);

		expect(product).toMatchObject({ code: expect.stringMatching(/^MILK-/), slug: expect.stringMatching(/^whole-milk-/), version: 1 });
		const detail = await request(`/api/cms/products/${product.id}`, fixture.cookie);
		expect(detail.status).toBe(200);
		expect(await detail.json()).toMatchObject({
			id: product.id,
			category: { id: fixture.categoryId },
			tags: [{ id: fixture.tagId }],
			images: [],
			offerings: [],
			activeOfferingCount: 0,
		});

		const listed = await request(`/api/cms/products?categoryId=${fixture.categoryId}&tagId=${fixture.tagId}&sortBy=code&sortDirection=asc`, fixture.cookie);
		expect(listed.status).toBe(200);
		expect(await listed.json()).toMatchObject({ items: [expect.objectContaining({ id: product.id })], page: 1, pageSize: 20 });
	});

	it("replaces product tags and increments version", async () => {
		const fixture = await insertTaxonomyFixture();
		const secondTag = await request("/api/cms/tags", fixture.cookie, "POST", {
			name: `Organic ${crypto.randomUUID()}`,
			slug: `organic-${crypto.randomUUID()}`,
			active: true,
		});
		expect(secondTag.status).toBe(201);
		const tagId = ((await secondTag.json()) as { id: string }).id;
		const product = await createProduct(fixture.cookie, fixture.categoryId, [fixture.tagId]);
		const response = await request(`/api/cms/products/${product.id}`, fixture.cookie, "PUT", {
			...productPayload(fixture.categoryId, [tagId], { code: product.code, slug: product.slug }),
			version: 1,
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ version: 2, tags: [{ id: tagId }] });
	});

	it("rejects inactive tags and duplicate normalized identifiers", async () => {
		const fixture = await insertTaxonomyFixture();
		const firstPayload = productPayload(fixture.categoryId, [fixture.tagId]);
		expect((await request("/api/cms/products", fixture.cookie, "POST", firstPayload)).status).toBe(201);
		expect((await request("/api/cms/products", fixture.cookie, "POST", { ...firstPayload, name: `Other ${crypto.randomUUID()}` })).status).toBe(409);
		expect((await request(`/api/cms/tags/${fixture.tagId}`, fixture.cookie, "PUT", {
			name: `Fresh ${crypto.randomUUID()}`,
			slug: `fresh-${crypto.randomUUID()}`,
			active: false,
		})).status).toBe(200);
		const inactiveTagProduct = await request("/api/cms/products", fixture.cookie, "POST", productPayload(fixture.categoryId, [fixture.tagId]));
		expect(inactiveTagProduct.status).toBe(422);
	});

	it("reports stale and missing products", async () => {
		const fixture = await insertTaxonomyFixture();
		const product = await createProduct(fixture.cookie, fixture.categoryId, [fixture.tagId]);
		const update = productPayload(fixture.categoryId, [fixture.tagId], { code: product.code, slug: product.slug, version: 1 });
		expect((await request(`/api/cms/products/${product.id}`, fixture.cookie, "PUT", update)).status).toBe(200);
		expect((await request(`/api/cms/products/${product.id}`, fixture.cookie, "PUT", update)).status).toBe(409);
		expect((await request(`/api/cms/products/${crypto.randomUUID()}`, fixture.cookie)).status).toBe(404);
	});

	it("requires an active category and active offering before activation", async () => {
		const fixture = await insertTaxonomyFixture();
		const product = await createProduct(fixture.cookie, fixture.categoryId, [fixture.tagId]);
		const activate = productPayload(fixture.categoryId, [fixture.tagId], { code: product.code, slug: product.slug, active: true, version: 1 });
		expect((await request(`/api/cms/products/${product.id}`, fixture.cookie, "PUT", activate)).status).toBe(409);

		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Single', 1, 100, 'none', 0, 0, 1, 1, 1, ?, ?)",
		).bind(crypto.randomUUID(), product.id, `SKU-${crypto.randomUUID()}`, now, now).run();
		const deactivateCategory = await request(`/api/cms/categories/${fixture.categoryId}`, fixture.cookie, "PUT", {
			name: `Dairy ${crypto.randomUUID()}`,
			slug: `dairy-${crypto.randomUUID()}`,
			description: "Chilled products",
			active: false,
		});
		expect(deactivateCategory.status).toBe(200);
		expect((await request(`/api/cms/products/${product.id}`, fixture.cookie, "PUT", activate)).status).toBe(409);

		const reactivateCategory = await request(`/api/cms/categories/${fixture.categoryId}`, fixture.cookie, "PUT", {
			name: `Dairy ${crypto.randomUUID()}`,
			slug: `dairy-${crypto.randomUUID()}`,
			description: "Chilled products",
			active: true,
		});
		expect(reactivateCategory.status).toBe(200);
		expect((await request(`/api/cms/products/${product.id}`, fixture.cookie, "PUT", activate)).status).toBe(200);
	});
});
