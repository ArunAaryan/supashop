import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function uniqueId(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`;
}

function orderNumber() {
	return `ord_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function insertUser(id = uniqueId("user")) {
	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
	).bind(id, id, `${id}@example.com`, now, now).run();
	return id;
}

async function insertOrder(values: { userId?: string | null; guestId?: string | null; status?: string; total?: number } = {}) {
	const id = uniqueId("order");
	const now = Date.now();
	const userId = values.userId ?? null;
	const guestId = values.guestId ?? (userId === null ? uniqueId("guest") : null);
	await env.DB.prepare(
		"INSERT INTO commerce_order (id, order_number, user_id, guest_id, status, payment_status, currency, subtotal_minor, delivery_fee_minor, total_minor, placed_at, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', 'INR', 100, 0, ?, ?, 1, ?, ?)",
	).bind(id, orderNumber(), userId, guestId, values.status ?? "placed", values.total ?? 100, now, now, now).run();
	return id;
}

async function insertOffering() {
	const now = Date.now();
	const categoryId = uniqueId("category");
	const productId = uniqueId("product");
	const offeringId = uniqueId("offering");
	await env.DB.batch([
		env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, categoryId, categoryId, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, 1, 1, ?, ?)").bind(productId, productId, productId, productId, categoryId, now, now),
		env.DB.prepare("INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Single', 1, 100, 'none', 0, 5, 0, 1, 1, ?, ?)").bind(offeringId, productId, offeringId, now, now),
	]);
	return { offeringId, productId };
}

describe("order schema invariants", () => {
	it("requires an opaque order number, one customer owner, allowed lifecycle state, and correct total", async () => {
		const userId = await insertUser();
		await expect(insertOrder({ userId, guestId: uniqueId("guest") })).rejects.toThrow();
		await expect(insertOrder({ userId, total: 99 })).rejects.toThrow();
		await expect(insertOrder({ userId, status: "shipping" })).rejects.toThrow();
		await expect(insertOrder({ userId })).resolves.toMatch(/^order-/);
	});

	it("keeps registered addresses valid and permits one default per user", async () => {
		const userId = await insertUser();
		const now = Date.now();
		const insertAddress = (id: string, mobile: string, isDefault: boolean, latitude: number | null = null, longitude: number | null = null) => env.DB.prepare(
			"INSERT INTO customer_address (id, user_id, recipient_name, mobile, address_line_1, city, state, postal_code, latitude, longitude, is_default, version, created_at, updated_at) VALUES (?, ?, 'Arun', ?, '10 Market Street', 'Bengaluru', 'Karnataka', '560001', ?, ?, ?, 1, ?, ?)",
		).bind(id, userId, mobile, latitude, longitude, isDefault, now, now).run();
		await expect(insertAddress(uniqueId("address"), "+919876543210", true)).resolves.toMatchObject({ success: true });
		await expect(insertAddress(uniqueId("address"), "+919876543211", true)).rejects.toThrow();
		await expect(insertAddress(uniqueId("address"), "9876543210", false)).rejects.toThrow();
		await expect(insertAddress(uniqueId("address"), "+919876543212", false, 12.9, null)).rejects.toThrow();
	});

	it("stores immutable item arithmetic and checkout movement idempotence", async () => {
		const userId = await insertUser();
		const orderId = await insertOrder({ userId });
		const { offeringId, productId } = await insertOffering();
		const now = Date.now();
		const item = (lineTotal: number) => env.DB.prepare(
			"INSERT INTO order_item (order_id, offering_id, product_id, product_code, product_name, offering_sku, offering_label, pack_quantity, list_price_minor, discount_type, discount_value, effective_unit_price_minor, quantity, line_total_minor, created_at) VALUES (?, ?, ?, 'MILK-1', 'Milk', 'MILK-1L', '1 litre', 1, 100, 'none', 0, 100, 2, ?, ?)",
		).bind(orderId, offeringId, productId, lineTotal, now).run();
		await expect(item(199)).rejects.toThrow();
		await expect(item(200)).resolves.toMatchObject({ success: true });
		const movement = (id: string, type: string) => env.DB.prepare(
			"INSERT INTO inventory_movement (id, offering_id, previous_quantity, quantity_delta, resulting_quantity, reason, movement_type, actor_user_id, order_id, offering_version, created_at) VALUES (?, ?, 5, -2, 3, 'checkout', ?, NULL, ?, 2, ?)",
		).bind(id, offeringId, type, orderId, now).run();
		await expect(movement(uniqueId("movement"), "checkout_deduction")).resolves.toMatchObject({ success: true });
		await expect(movement(uniqueId("movement"), "checkout_deduction")).rejects.toThrow();
		await expect(movement(uniqueId("movement"), "cancellation_restoration")).resolves.toMatchObject({ success: true });
	});

	it("makes idempotency keys owner-scoped and validates closure ranges", async () => {
		const userId = await insertUser();
		const orderId = await insertOrder({ userId });
		const now = Date.now();
		const hash = "a".repeat(64);
		const insertKey = (id: string, ownerKey: string, key: string, linkedOrderId: string) => env.DB.prepare(
			"INSERT INTO checkout_idempotency (id, owner_key, idempotency_key, request_hash, order_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).bind(id, ownerKey, key, hash, linkedOrderId, now, now).run();
		await expect(insertKey(uniqueId("key"), `user:${userId}`, "client-key-1", orderId)).resolves.toMatchObject({ success: true });
		const anotherOrderId = await insertOrder({ guestId: uniqueId("guest") });
		await expect(insertKey(uniqueId("key"), `user:${userId}`, "client-key-1", anotherOrderId)).rejects.toThrow();
		await expect(insertKey(uniqueId("key"), "invalid-owner", "client-key-2", anotherOrderId)).rejects.toThrow();
		await expect(
			env.DB.prepare("INSERT INTO store_closure (id, starts_on, ends_on, reason, created_at, updated_at) VALUES (?, '2026-12-02', '2026-12-01', 'Holiday', ?, ?)")
				.bind(uniqueId("closure"), now, now)
				.run(),
		).rejects.toThrow();
	});
});
