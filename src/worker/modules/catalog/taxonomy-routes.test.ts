import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { request, signInAs } from "../../test/catalog-fixtures";

function categoryPayload(overrides: Record<string, unknown> = {}) {
	const suffix = crypto.randomUUID();
	return {
		name: `Dairy ${suffix}`,
		slug: ` Dairy ${suffix} `,
		description: "Chilled goods",
		active: true,
		...overrides,
	};
}

describe("catalog taxonomy routes", () => {
	it("requires authentication and rejects delivery users", async () => {
		expect((await request("/api/cms/categories")).status).toBe(401);
		const { cookie } = await signInAs("delivery");
		expect((await request("/api/cms/categories", cookie)).status).toBe(403);
	});

	it.each(["owner", "admin", "operations"] as const)("allows %s to manage categories", async (role) => {
		const { cookie } = await signInAs(role);
		const suffix = crypto.randomUUID();
		const response = await request("/api/cms/categories", cookie, "POST", categoryPayload({ slug: ` Whole Milk ${suffix} ` }));
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({ slug: `whole-milk-${suffix}`, active: true, productCount: 0 });
	});

	it("returns validation and duplicate conflicts through stable envelopes", async () => {
		const { cookie } = await signInAs("operations");
		const payload = categoryPayload({ slug: "duplicate-category" });
		expect((await request("/api/cms/categories", cookie, "POST", payload)).status).toBe(201);
		const duplicate = await request("/api/cms/categories", cookie, "POST", { ...payload, name: `${payload.name} other` });
		expect(duplicate.status).toBe(409);
		expect(await duplicate.json()).toMatchObject({ error: { code: "CONFLICT" } });
		const invalid = await request("/api/cms/categories", cookie, "POST", { ...payload, name: "" });
		expect(invalid.status).toBe(422);
		expect(await invalid.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", details: { issues: expect.any(Array) } } });
	});

	it("paginates and filters categories with metadata", async () => {
		const { cookie } = await signInAs("admin");
		await request("/api/cms/categories", cookie, "POST", categoryPayload({ name: `Paged ${crypto.randomUUID()}` }));
		const response = await request("/api/cms/categories?page=1&pageSize=1&sortBy=name&sortDirection=asc", cookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ page: 1, pageSize: 1, items: [expect.any(Object)] });
	});

	it("allows assigned tags to be deactivated", async () => {
		const { cookie, userId } = await signInAs("operations");
		const now = Date.now();
		const categoryId = crypto.randomUUID();
		const productId = crypto.randomUUID();
		const tagId = crypto.randomUUID();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, `Category ${categoryId}`, `category-${categoryId}`, now, now),
			env.DB.prepare("INSERT INTO tag (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(tagId, `Tag ${tagId}`, `tag-${tagId}`, now, now),
			env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Milk', '', ?, 0, 1, ?, ?)").bind(productId, `P_${productId}`, `milk-${productId}`, categoryId, now, now),
			env.DB.prepare("INSERT INTO product_tag (product_id, tag_id) VALUES (?, ?)").bind(productId, tagId),
		]);
		void userId;
		const response = await request(`/api/cms/tags/${tagId}`, cookie, "PUT", { name: `Tag ${tagId}`, slug: `tag-${tagId}`, active: false });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ active: false, productCount: 1 });
	});

	it("blocks category deactivation while an active product belongs to it", async () => {
		const { cookie } = await signInAs("owner");
		const now = Date.now();
		const categoryId = crypto.randomUUID();
		const productId = crypto.randomUUID();
		await env.DB.batch([
			env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, `Category ${categoryId}`, `category-${categoryId}`, now, now),
			env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Milk', '', ?, 1, 1, ?, ?)").bind(productId, `P_${productId}`, `milk-${productId}`, categoryId, now, now),
		]);
		const response = await request(`/api/cms/categories/${categoryId}`, cookie, "PUT", { name: `Category ${categoryId}`, slug: `category-${categoryId}`, description: null, active: false });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: { code: "CONFLICT" } });
	});
});
