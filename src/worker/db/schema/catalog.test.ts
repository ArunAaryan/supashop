import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function uniqueId(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`;
}

async function insertCatalogFixture() {
	const now = Date.now();
	const userId = uniqueId("user");
	const categoryId = uniqueId("category");
	const productId = uniqueId("product");
	const offeringId = uniqueId("offering");

	await env.DB.batch([
		env.DB
			.prepare("INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, 'Operator', ?, ?, ?)")
			.bind(userId, `${userId}@example.com`, now, now),
			env.DB
				.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
				.bind(categoryId, `Dairy ${categoryId}`, `dairy-${categoryId}`, now, now),
		env.DB
			.prepare(
				"INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Milk', '', ?, 0, 1, ?, ?)",
			)
			.bind(productId, `P-${productId}`, `milk-${productId}`, categoryId, now, now),
		env.DB
			.prepare(
				"INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Single', 1, 100, 'none', 0, 5, 1, 1, 1, ?, ?)",
			)
			.bind(offeringId, productId, `SKU-${offeringId}`, now, now),
	]);

	return { userId, categoryId, productId, offeringId };
}

describe("catalog and inventory schema invariants", () => {
	it("rejects duplicate globally unique catalog identifiers", async () => {
		const fixture = await insertCatalogFixture();
		const now = Date.now();

		await expect(
			env.DB
				.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, 'Other dairy', ?, 1, ?, ?)")
				.bind(uniqueId("category"), `dairy-${fixture.categoryId}`, now, now)
				.run(),
		).rejects.toThrow();

		await expect(
			env.DB
				.prepare(
					"INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Other milk', '', ?, 0, 1, ?, ?)",
				)
				.bind(
					uniqueId("product"),
					`P-${fixture.productId}`,
					`other-milk-${fixture.productId}`,
					fixture.categoryId,
					now,
					now,
				)
				.run(),
		).rejects.toThrow();

		await expect(
			env.DB
				.prepare(
					"INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Duplicate SKU', 2, 100, 'none', 0, 0, 0, 0, 1, ?, ?)",
				)
				.bind(uniqueId("offering"), fixture.productId, `SKU-${fixture.offeringId}`, now, now)
				.run(),
		).rejects.toThrow();
	});

	it("rejects invalid offering discounts, packs, and stock", async () => {
		const fixture = await insertCatalogFixture();
		const now = Date.now();
		const insertOffering = (id: string, values: string) =>
			env.DB
				.prepare(
					"INSERT INTO offering (id, product_id, sku, label, pack_quantity, weight_value, weight_unit, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Invalid', " +
						values +
						", 1, ?, ?)",
				)
				.bind(id, fixture.productId, `SKU-${id}`, now, now);

		await expect(insertOffering(uniqueId("offering"), "1, NULL, NULL, 100, 'none', 1, 0, 0, 0").run()).rejects.toThrow();
		await expect(insertOffering(uniqueId("offering"), "1, NULL, NULL, 100, 'fixed', 100, 0, 0, 0").run()).rejects.toThrow();
		await expect(insertOffering(uniqueId("offering"), "1, NULL, NULL, 100, 'percentage', 10001, 0, 0, 0").run()).rejects.toThrow();
		await expect(insertOffering(uniqueId("offering"), "NULL, NULL, NULL, 100, 'none', 0, 0, 0, 0").run()).rejects.toThrow();
		await expect(insertOffering(uniqueId("offering"), "1, 10, NULL, 100, 'none', 0, 0, 0, 0").run()).rejects.toThrow();
		await expect(insertOffering(uniqueId("offering"), "1, NULL, NULL, 100, 'none', 0, -1, 0, 0").run()).rejects.toThrow();
	});

	it("rejects duplicate image display orders", async () => {
		const fixture = await insertCatalogFixture();
		const now = Date.now();
		const insertImage = (id: string, objectKey: string) =>
			env.DB
				.prepare(
					"INSERT INTO product_image (id, product_id, object_key, mime_type, byte_size, alt_text, display_order, created_by, created_at) VALUES (?, ?, ?, 'image/png', 1, 'Milk', 0, ?, ?)",
				)
				.bind(id, fixture.productId, objectKey, fixture.userId, now)
				.run();

		await expect(insertImage(uniqueId("image"), `products/${fixture.productId}/one.png`)).resolves.toMatchObject({ success: true });
		await expect(insertImage(uniqueId("image"), `products/${fixture.productId}/two.png`)).rejects.toThrow();
	});

	it("rejects an unbalanced inventory movement", async () => {
		const fixture = await insertCatalogFixture();

		await expect(
			env.DB
				.prepare(
					"INSERT INTO inventory_movement (id, offering_id, previous_quantity, quantity_delta, resulting_quantity, reason, movement_type, actor_user_id, offering_version, created_at) VALUES (?, ?, 5, -2, 4, ?, 'manual_adjustment', ?, 2, ?)",
				)
				.bind(uniqueId("movement"), fixture.offeringId, "Count correction", fixture.userId, Date.now())
				.run(),
		).rejects.toThrow();
	});
});
