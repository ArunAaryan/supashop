import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { signInAs } from "../../test/catalog-fixtures";

function cookieFrom(response: Response): string {
	const cookie = response.headers.get("set-cookie")?.split(";")[0];
	if (!cookie) throw new Error("Expected a cookie");
	return cookie;
}

function request(path: string, cookie = "", method = "GET", body?: unknown) {
	return exports.default.fetch(`http://example.com${path}`, {
		method,
		headers: {
			...(cookie ? { cookie } : {}),
			...(body === undefined ? {} : { "content-type": "application/json" }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

async function guestCookie() {
	return cookieFrom(await request("/api/guest/session", "", "POST"));
}

async function offeringFixture(stockQuantity = 5, discountValue = 1_000) {
	const now = Date.now();
	const suffix = crypto.randomUUID();
	const categoryId = `category-${suffix}`;
	const productId = `product-${suffix}`;
	const offeringId = `offering-${suffix}`;
	await env.DB.batch([
		env.DB.prepare("INSERT INTO category (id, name, slug, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)").bind(categoryId, `Dairy ${suffix}`, `dairy-${suffix}`, now, now),
		env.DB.prepare("INSERT INTO product (id, code, slug, name, description, category_id, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)").bind(productId, `MILK_${suffix}`, `milk-${suffix}`, "Whole milk", "Fresh milk", categoryId, now, now),
		env.DB.prepare("INSERT INTO offering (id, product_id, sku, label, pack_quantity, list_price_minor, discount_type, discount_value, stock_quantity, low_stock_threshold, active, version, created_at, updated_at) VALUES (?, ?, ?, '1 litre', 1, 1000, 'percentage', ?, ?, 1, 1, 1, ?, ?)").bind(offeringId, productId, `MILK_${suffix}`, discountValue, stockQuantity, now, now),
	]);
	return { offeringId, productId };
}

describe("cart routes", () => {
	it("requires a registered or verified guest identity, then creates a guest cart lazily", async () => {
		expect((await request("/api/cart")).status).toBe(401);
		expect((await request("/api/cart", "supashop_guest=not-a-valid-token")).status).toBe(401);
		const cookie = await guestCookie();
		const response = await request("/api/cart", cookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ itemCount: 0, subtotalMinor: 0, requiresReview: false, lines: [] });
	});

	it("increments guest lines, projects current price, and never reserves stock", async () => {
		const { offeringId } = await offeringFixture();
		const cookie = await guestCookie();
		expect((await request("/api/cart/items", cookie, "POST", { offeringId, quantity: 1 })).status).toBe(201);
		const response = await request("/api/cart/items", cookie, "POST", { offeringId, quantity: 2 });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			itemCount: 3,
			subtotalMinor: 2700,
			lines: [{ offeringId, quantity: 3, unitPriceMinorAtAdd: 900, currentUnitPriceMinor: 900, availability: "available", priceChanged: false, availableStock: 5 }],
		});
		expect(await env.DB.prepare("SELECT stock_quantity FROM offering WHERE id = ?").bind(offeringId).first()).toEqual({ stock_quantity: 5 });
	});

	it("adds a free offering and preserves zero-valued cart prices", async () => {
		const { offeringId } = await offeringFixture(5, 10_000);
		const guest = await guestCookie();
		const response = await request("/api/cart/items", guest, "POST", { offeringId, quantity: 2 });
		expect(response.status).toBe(201);
		expect(await response.json()).toMatchObject({
			itemCount: 2,
			subtotalMinor: 0,
			lines: [{ offeringId, quantity: 2, unitPriceMinorAtAdd: 0, currentUnitPriceMinor: 0, lineTotalMinor: 0, priceChanged: false, availability: "available" }],
		});
	});

	it("retains changed catalog lines for review but rejects an increase while unavailable", async () => {
		const { offeringId } = await offeringFixture();
		const cookie = await guestCookie();
		await request("/api/cart/items", cookie, "POST", { offeringId, quantity: 1 });
		await env.DB.prepare("UPDATE offering SET active = 0, list_price_minor = 1200, version = version + 1 WHERE id = ?").bind(offeringId).run();

		const cart = await request("/api/cart", cookie);
		expect(await cart.json()).toMatchObject({
			requiresReview: true,
			lines: [{ offeringId, quantity: 1, availability: "unavailable", priceChanged: true, currentUnitPriceMinor: 1080 }],
		});
		expect((await request(`/api/cart/items/${offeringId}`, cookie, "PUT", { quantity: 2 })).status).toBe(409);
		expect((await request(`/api/cart/items/${offeringId}`, cookie, "DELETE")).status).toBe(204);
	});

	it("distinguishes no stock from insufficient stock and keeps guest carts isolated", async () => {
		const { offeringId } = await offeringFixture();
		const firstGuest = await guestCookie();
		const secondGuest = await guestCookie();
		await request("/api/cart/items", firstGuest, "POST", { offeringId, quantity: 2 });
		expect(await (await request("/api/cart", secondGuest)).json()).toMatchObject({ itemCount: 0, lines: [] });
		const registered = await signInAs("operations");
		expect(await (await request("/api/cart", registered.cookie)).json()).toMatchObject({ itemCount: 0, lines: [] });

		await env.DB.prepare("UPDATE offering SET stock_quantity = 0 WHERE id = ?").bind(offeringId).run();
		expect(await (await request("/api/cart", firstGuest)).json()).toMatchObject({
			lines: [{ offeringId, quantity: 2, availability: "out_of_stock", availableStock: 0 }],
		});
		await env.DB.prepare("UPDATE offering SET stock_quantity = 1 WHERE id = ?").bind(offeringId).run();
		expect(await (await request("/api/cart", firstGuest)).json()).toMatchObject({
			lines: [{ offeringId, quantity: 2, availability: "insufficient_stock", availableStock: 1 }],
		});
	});

	it("rejects malformed and over-limit cart item payloads without creating lines", async () => {
		const { offeringId } = await offeringFixture();
		const guest = await guestCookie();
		for (const body of [undefined, { offeringId, quantity: 0 }, { offeringId, quantity: 100 }, { offeringId, quantity: 1, extra: true }]) {
			expect((await request("/api/cart/items", guest, "POST", body)).status).toBe(422);
		}
		expect(await (await request("/api/cart", guest)).json()).toMatchObject({ itemCount: 0, lines: [] });
	});

	it("merges a verified guest cart into the signed-in cart atomically and clears the guest cookie", async () => {
		const { offeringId } = await offeringFixture();
		const guest = await guestCookie();
		await request("/api/cart/items", guest, "POST", { offeringId, quantity: 2 });
		const registered = await signInAs("operations");
		await request("/api/cart/items", registered.cookie, "POST", { offeringId, quantity: 3 });
		const noGuest = await request("/api/cart/merge", registered.cookie, "POST");
		expect(noGuest.status).toBe(200);
		expect(await noGuest.json()).toMatchObject({ itemCount: 3 });

		const merged = await request("/api/cart/merge", `${registered.cookie}; ${guest}`, "POST");
		expect(merged.status).toBe(200);
		expect(merged.headers.get("set-cookie")).toContain("supashop_guest=");
		expect(merged.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(await merged.json()).toMatchObject({ itemCount: 5, lines: [{ offeringId, quantity: 5 }] });
		expect((await request("/api/cart", `${registered.cookie}; ${guest}`)).status).toBe(200);
		expect(await (await request("/api/cart", registered.cookie)).json()).toMatchObject({ itemCount: 5 });
	});

	it("rolls back an overflowing merge and leaves both owner carts intact", async () => {
		const { offeringId } = await offeringFixture(99);
		const guest = await guestCookie();
		const registered = await signInAs("operations");
		await request("/api/cart/items", guest, "POST", { offeringId, quantity: 99 });
		await request("/api/cart/items", registered.cookie, "POST", { offeringId, quantity: 99 });

		const merged = await request("/api/cart/merge", `${registered.cookie}; ${guest}`, "POST");
		expect(merged.status).toBe(409);
		expect(await merged.json()).toMatchObject({ error: { code: "CONFLICT" } });
		expect(merged.headers.get("set-cookie")).toBeNull();
		expect(await (await request("/api/cart", registered.cookie)).json()).toMatchObject({ itemCount: 99, lines: [{ offeringId, quantity: 99 }] });
		expect(await (await request("/api/cart", guest)).json()).toMatchObject({ itemCount: 99, lines: [{ offeringId, quantity: 99 }] });
	});
});
