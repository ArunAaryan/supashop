import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function uniqueId(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`;
}

async function insertUser(id: string) {
	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
	).bind(id, id, `${id}@example.com`, now, now).run();
}

async function insertOffering() {
	const now = Date.now();
	const categoryId = uniqueId("category");
	const productId = uniqueId("product");
	const offeringId = uniqueId("offering");
	await env.DB.batch([
		env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, categoryId, categoryId, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, 1, 1, ?, ?)").bind(productId, productId, productId, productId, categoryId, now, now),
		env.DB.prepare("INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Single', 1, 100, 'none', 0, 1, 0, 1, 1, ?, ?)").bind(offeringId, productId, offeringId, now, now),
	]);
	return offeringId;
}

async function insertCart(values: { id?: string; userId?: string | null; guestId?: string | null } = {}) {
	const now = Date.now();
	const id = values.id ?? uniqueId("cart");
	await env.DB.prepare(
		"INSERT INTO cart (id, user_id, guest_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
	).bind(id, values.userId ?? null, values.guestId ?? null, now, now).run();
	return id;
}

describe("cart schema invariants", () => {
	it("requires exactly one registered-user or guest owner and only one cart per owner", async () => {
		const userId = uniqueId("user");
		await insertUser(userId);
		await expect(insertCart()).rejects.toThrow();
		await expect(insertCart({ userId, guestId: uniqueId("guest") })).rejects.toThrow();
		await insertCart({ userId });
		await expect(insertCart({ userId })).rejects.toThrow();
		const guestId = uniqueId("guest");
		await insertCart({ guestId });
		await expect(insertCart({ guestId })).rejects.toThrow();
	});

	it("requires each cart offering once and a quantity from one through ninety-nine", async () => {
		const offeringId = await insertOffering();
		const cartId = await insertCart({ guestId: uniqueId("guest") });
		const now = Date.now();
		const insertItem = (targetCartId: string, quantity: number, price = 100) =>
			env.DB.prepare(
				"INSERT INTO cart_item (cart_id, offering_id, quantity, effective_price_minor_at_add, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
			).bind(targetCartId, offeringId, quantity, price, now, now).run();

		await expect(insertItem(cartId, 1)).resolves.toMatchObject({ success: true });
		await expect(insertItem(cartId, 1)).rejects.toThrow();
		await expect(insertItem(await insertCart({ guestId: uniqueId("guest") }), 0)).rejects.toThrow();
		await expect(insertItem(await insertCart({ guestId: uniqueId("guest") }), 100)).rejects.toThrow();
		await expect(insertItem(await insertCart({ guestId: uniqueId("guest") }), 2, 0)).resolves.toMatchObject({ success: true });
	});
});
