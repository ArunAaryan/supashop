import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { signInAs } from "../../test/catalog-fixtures";

function cookieFrom(response: Response): string {
	const cookie = response.headers.get("set-cookie")?.split(";")[0];
	if (!cookie) throw new Error("Expected a cookie");
	return cookie;
}

function request(path: string, cookie = "", method = "GET", body?: unknown, idempotencyKey?: string) {
	return exports.default.fetch(`http://example.com${path}`, {
		method,
		headers: {
			...(cookie ? { cookie } : {}),
			...(body === undefined ? {} : { "content-type": "application/json" }),
			...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

async function guestCookie() {
	return cookieFrom(await request("/api/guest/session", "", "POST"));
}

async function configureCheckoutStore() {
	const now = Date.now();
	await env.DB.batch([
		env.DB.prepare("INSERT OR IGNORE INTO store_profile (singleton_key, name, timezone, created_at, updated_at) VALUES (1, 'SupaShop', 'Asia/Kolkata', ?, ?)").bind(now, now),
		...Array.from({ length: 7 }, (_, weekday) => env.DB.prepare(
			"INSERT OR REPLACE INTO store_hours (id, weekday, opens_minute, closes_minute, closed) VALUES (?, ?, 0, 1439, 0)",
		).bind(`checkout-hours-${weekday}`, weekday)),
		env.DB.prepare("INSERT OR IGNORE INTO serviceable_postal_code (postal_code, active) VALUES ('560001', 1)"),
	]);
}

async function offeringFixture(stockQuantity = 5) {
	const now = Date.now();
	const suffix = crypto.randomUUID();
	const categoryId = `category-${suffix}`;
	const productId = `product-${suffix}`;
	const offeringId = `offering-${suffix}`;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, `Dairy ${suffix}`, `dairy-${suffix}`, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, 'Whole milk', 'Fresh milk', ?, 1, 1, ?, ?)").bind(productId, `MILK_${suffix}`, `milk-${suffix}`, categoryId, now, now),
		env.DB.prepare("INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, '1 litre', 1, 1000, 'percentage', 1000, ?, 1, 1, 1, ?, ?)").bind(offeringId, productId, `MILK_${suffix}`, stockQuantity, now, now),
	]);
	return { offeringId };
}

const address = {
	recipientName: "Arun Kumar",
	mobile: "+919876543210",
	addressLine1: "12 Market Road",
	addressLine2: null,
	landmark: null,
	city: "Bengaluru",
	state: "Karnataka",
	postalCode: "560001",
	latitude: null,
	longitude: null,
	deliveryInstructions: "Ring the bell",
};

async function checkoutPayload(cookie: string, offeringId: string, quantity = 2) {
	const cart = await request("/api/cart", cookie);
	const body = await cart.json() as { updatedAt: number; lines: Array<{ offeringId: string; offeringVersion: number; currentUnitPriceMinor: number; quantity: number }> };
	const line = body.lines.find((item) => item.offeringId === offeringId);
	if (!line) throw new Error("Cart line is missing");
	return {
		deliveryAddress: address,
		expectedLines: [{ offeringId, quantity, expectedUnitPriceMinor: line.currentUnitPriceMinor, offeringVersion: line.offeringVersion }],
		cartUpdatedAt: body.updatedAt,
		saveAddress: false,
	};
}

describe("checkout and customer order routes", () => {
	it("creates an idempotent guest COD order with snapshots, stock movement, and a cleared cart", async () => {
		await configureCheckoutStore();
		const { offeringId } = await offeringFixture();
		const guest = await guestCookie();
		await request("/api/cart/items", guest, "POST", { offeringId, quantity: 2 });
		const payload = await checkoutPayload(guest, offeringId);
		const first = await request("/api/checkout", guest, "POST", payload, "checkout-key-123");
		expect(first.status).toBe(201);
		const order = await first.json() as { orderNumber: string; subtotalMinor: number; items: Array<{ quantity: number; effectiveUnitPriceMinor: number }>; statusHistory: unknown[] };
		expect(order).toMatchObject({ subtotalMinor: 1800, items: [{ quantity: 2, effectiveUnitPriceMinor: 900 }] });
		expect(order.statusHistory).toHaveLength(1);
		const replay = await request("/api/checkout", guest, "POST", payload, "checkout-key-123");
		expect(replay.status).toBe(200);
		expect((await replay.json() as { orderNumber: string }).orderNumber).toBe(order.orderNumber);
		expect((await request("/api/cart", guest)).status).toBe(200);
		expect(await (await request("/api/cart", guest)).json()).toMatchObject({ itemCount: 0 });
		expect(await env.DB.prepare("SELECT stock_quantity FROM offering WHERE id = ?").bind(offeringId).first()).toEqual({ stock_quantity: 3 });
		expect(await env.DB.prepare("SELECT movement_type, quantity_delta FROM inventory_movement WHERE order_id = ?").bind((await env.DB.prepare("SELECT id FROM commerce_order WHERE order_number = ?").bind(order.orderNumber).first<{ id: string }>())?.id).first()).toEqual({ movement_type: "checkout_deduction", quantity_delta: -2 });
		const changed = await request("/api/checkout", guest, "POST", { ...payload, deliveryAddress: { ...address, city: "Mysuru" } }, "checkout-key-123");
		expect(changed.status).toBe(409);
	});

	it("keeps guest orders private, claims them on cart merge, and cancels exactly once", async () => {
		await configureCheckoutStore();
		const { offeringId } = await offeringFixture();
		const guest = await guestCookie();
		const otherGuest = await guestCookie();
		await request("/api/cart/items", guest, "POST", { offeringId, quantity: 2 });
		const placed = await request("/api/checkout", guest, "POST", await checkoutPayload(guest, offeringId), "checkout-key-456");
		const { orderNumber } = await placed.json() as { orderNumber: string };
		expect((await request(`/api/orders/${orderNumber}`, otherGuest)).status).toBe(404);
		const registered = await signInAs("operations");
		expect((await request("/api/cart/merge", `${registered.cookie}; ${guest}`, "POST")).status).toBe(200);
		expect((await request(`/api/orders/${orderNumber}`, registered.cookie)).status).toBe(200);
		const cancelled = await request(`/api/orders/${orderNumber}/cancel`, registered.cookie, "POST", { reason: "Ordered by mistake" });
		expect(cancelled.status).toBe(200);
		expect(await cancelled.json()).toMatchObject({ status: "cancelled", customerCanCancel: false });
		expect((await request(`/api/orders/${orderNumber}/cancel`, registered.cookie, "POST", { reason: "Retry" })).status).toBe(200);
		expect(await env.DB.prepare("SELECT stock_quantity FROM offering WHERE id = ?").bind(offeringId).first()).toEqual({ stock_quantity: 5 });
		expect(await env.DB.prepare("SELECT count(*) AS total FROM inventory_movement WHERE movement_type = 'cancellation_restoration'").first()).toEqual({ total: 1 });
	});

	it("saves a registered customer's first checkout address as the default", async () => {
		await configureCheckoutStore();
		const { offeringId } = await offeringFixture();
		const registered = await signInAs("operations");
		await request("/api/cart/items", registered.cookie, "POST", { offeringId, quantity: 1 });
		const payload = { ...(await checkoutPayload(registered.cookie, offeringId, 1)), saveAddress: true };
		expect((await request("/api/checkout", registered.cookie, "POST", payload, "checkout-key-addr")).status).toBe(201);
		expect(await env.DB.prepare("SELECT is_default FROM customer_address WHERE user_id = ?").bind(registered.userId).first()).toEqual({ is_default: 1 });
	});

	it("allows only one concurrent checkout to purchase the final unit", async () => {
		await configureCheckoutStore();
		const { offeringId } = await offeringFixture(1);
		const firstGuest = await guestCookie();
		const secondGuest = await guestCookie();
		await Promise.all([
			request("/api/cart/items", firstGuest, "POST", { offeringId, quantity: 1 }),
			request("/api/cart/items", secondGuest, "POST", { offeringId, quantity: 1 }),
		]);
		const [firstPayload, secondPayload] = await Promise.all([
			checkoutPayload(firstGuest, offeringId, 1),
			checkoutPayload(secondGuest, offeringId, 1),
		]);
		const outcomes = await Promise.all([
			request("/api/checkout", firstGuest, "POST", firstPayload, "checkout-key-race-1"),
			request("/api/checkout", secondGuest, "POST", secondPayload, "checkout-key-race-2"),
		]);
		expect(outcomes.map((response) => response.status).sort()).toEqual([201, 409]);
		expect(await env.DB.prepare("SELECT stock_quantity FROM offering WHERE id = ?").bind(offeringId).first()).toEqual({ stock_quantity: 0 });
		expect(await env.DB.prepare("SELECT count(*) AS total FROM inventory_movement WHERE offering_id = ? AND movement_type = 'checkout_deduction'").bind(offeringId).first()).toEqual({ total: 1 });
	});

	it("rejects stale cart prices without placing an order and partially reorders at current stock", async () => {
		await configureCheckoutStore();
		const { offeringId } = await offeringFixture();
		const guest = await guestCookie();
		await request("/api/cart/items", guest, "POST", { offeringId, quantity: 2 });
		const stale = await checkoutPayload(guest, offeringId);
		await env.DB.prepare("UPDATE offering SET list_price_minor = 1200, version = version + 1 WHERE id = ?").bind(offeringId).run();
		expect((await request("/api/checkout", guest, "POST", stale, "checkout-key-789")).status).toBe(409);
		expect(await (await request("/api/orders", guest)).json()).toMatchObject({ totalItems: 0 });
		expect(await env.DB.prepare("SELECT stock_quantity FROM offering WHERE id = ?").bind(offeringId).first()).toEqual({ stock_quantity: 5 });

		const current = await checkoutPayload(guest, offeringId);
		const placed = await request("/api/checkout", guest, "POST", current, "checkout-key-790");
		const { orderNumber } = await placed.json() as { orderNumber: string };
		await env.DB.prepare("UPDATE offering SET stock_quantity = 1 WHERE id = ?").bind(offeringId).run();
		const reorder = await request(`/api/orders/${orderNumber}/reorder`, guest, "POST");
		expect(reorder.status).toBe(200);
		expect(await reorder.json()).toMatchObject({ lines: [{ offeringId, requestedQuantity: 2, addedQuantity: 1, status: "added" }] });
		expect(await env.DB.prepare("SELECT stock_quantity FROM offering WHERE id = ?").bind(offeringId).first()).toEqual({ stock_quantity: 1 });
	});
});
