import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

declare module "cloudflare:workers" {
	// Cloudflare uses this empty interface for ambient Env declaration merging.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}

type CmsRole = "owner" | "admin" | "operations" | "delivery";

function storePayload(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		name: "SupaShop Market",
		description: "Fresh groceries delivered today.",
		contactName: "Asha Patel",
		phone: "+919876543210",
		email: "hello@supashop.example",
		addressLine1: "42 Market Road",
		addressLine2: "Unit 3",
		landmark: "Near the clock tower",
		city: "Bengaluru",
		state: "Karnataka",
		postalCode: "560001",
		directionsUrl: "https://maps.example.com/supashop",
		deliveryInstructions: "Ring the bell once.",
		latitude: 12.9716,
		longitude: 77.5946,
		timezone: "Asia/Kolkata",
		orderCutoffMinutes: 45,
		hours: Array.from({ length: 7 }, (_, weekday) => ({
			weekday,
			opensMinute: 540,
			closesMinute: 1260,
			closed: false,
		})),
		serviceablePostalCodes: ["ab12", " AB12 ", "cd34"],
		...overrides,
	};
}

function cookieFrom(response: Response): string {
	const cookie = response.headers.get("set-cookie");
	if (!cookie) throw new Error("Expected Better Auth to set a session cookie");
	return cookie.split(";")[0] ?? "";
}

async function signInAs(role: CmsRole): Promise<{ cookie: string; userId: string }> {
	const email = `${role}-${crypto.randomUUID()}@example.com`;
	const response = await exports.default.fetch("http://example.com/api/auth/sign-up/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: role, email, password: "a-long-test-password" }),
	});
	expect(response.status).toBe(200);
	const body = (await response.json()) as { user: { id: string } };
	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO cms_role (id, user_id, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
	)
		.bind(crypto.randomUUID(), body.user.id, role, true, now, now)
		.run();
	return { cookie: cookieFrom(response), userId: body.user.id };
}

async function putStore(cookie: string, payload: Record<string, unknown>) {
	return exports.default.fetch("http://example.com/api/cms/store", {
		method: "PUT",
		headers: { "content-type": "application/json", cookie },
		body: JSON.stringify(payload),
	});
}

async function clearStore() {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM store_hours"),
		env.DB.prepare("DELETE FROM serviceable_postal_code"),
		env.DB.prepare("DELETE FROM store_profile WHERE singleton_key = 1"),
	]);
}

describe("store settings routes", () => {
	it("rejects unauthenticated updates", async () => {
		const response = await putStore("", storePayload());

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: { code: "UNAUTHENTICATED", message: "Authentication required" },
		});
	});

	it.each(["delivery", "operations"] as const)("rejects %s updates", async (role) => {
		const { cookie } = await signInAs(role);
		const response = await putStore(cookie, storePayload());

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
	});

	it("creates the first profile for an owner, increments its version, and projects it publicly", async () => {
		const { cookie, userId } = await signInAs("owner");
		const saved = await putStore(cookie, storePayload());

		expect(saved.status).toBe(200);
		expect(await saved.json()).toMatchObject({
			version: 2,
			ownerUserId: userId,
			serviceablePostalCodes: ["AB12", "CD34"],
		});

		const publicResponse = await exports.default.fetch("http://example.com/api/store");
		expect(publicResponse.status).toBe(200);
		const publicStore = (await publicResponse.json()) as Record<string, unknown>;
		expect(publicStore).toMatchObject({ name: "SupaShop Market", serviceablePostalCodes: ["AB12", "CD34"] });
		expect(publicStore).not.toHaveProperty("ownerUserId");
		expect(publicStore).not.toHaveProperty("version");
	});

	it("allows operations to read the CMS profile but not to update it", async () => {
		const { cookie: ownerCookie } = await signInAs("owner");
		await putStore(ownerCookie, storePayload());
		const { cookie } = await signInAs("operations");

		const response = await exports.default.fetch("http://example.com/api/cms/store", {
			headers: { cookie },
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ version: 2, name: "SupaShop Market" });
	});

	it("returns a stale-write conflict without changing the profile or either child collection", async () => {
		const { cookie } = await signInAs("owner");
		await putStore(cookie, storePayload());
		const updated = await putStore(
			cookie,
			storePayload({
				version: 2,
				name: "Updated Market",
				serviceablePostalCodes: ["560003"],
				hours: Array.from({ length: 7 }, (_, weekday) => ({
					weekday,
					opensMinute: weekday === 0 ? 0 : 600,
					closesMinute: weekday === 0 ? 0 : 1200,
					closed: weekday === 0,
				})),
			}),
		);
		expect(updated.status).toBe(200);

		const stale = await putStore(cookie, storePayload({ version: 1, name: "Stale Market", serviceablePostalCodes: ["999999"] }));
		expect(stale.status).toBe(409);
		expect(await stale.json()).toEqual({
			error: { code: "CONFLICT", message: "Store settings changed; reload and retry" },
		});

		const profile = await env.DB.prepare(
			"SELECT name, version FROM store_profile WHERE singleton_key = 1",
		).first<{ name: string; version: number }>();
		expect(profile).toEqual({ name: "Updated Market", version: 3 });
		const hours = await env.DB.prepare(
			"SELECT weekday, opens_minute, closes_minute, closed FROM store_hours ORDER BY weekday",
		).all();
		expect(hours.results).toHaveLength(7);
		expect(hours.results[0]).toMatchObject({ weekday: 0, opens_minute: 0, closes_minute: 0, closed: 1 });
		const postalCodes = await env.DB.prepare(
			"SELECT postal_code FROM serviceable_postal_code ORDER BY postal_code",
		).all<{ postal_code: string }>();
		expect(postalCodes.results).toEqual([{ postal_code: "560003" }]);
	});

	it("returns an editable first-run profile to authorized CMS readers and a public 404 before configuration", async () => {
		await clearStore();
		const { cookie } = await signInAs("admin");

		const cms = await exports.default.fetch("http://example.com/api/cms/store", { headers: { cookie } });
		expect(cms.status).toBe(200);
		expect(await cms.json()).toMatchObject({
			configured: false,
			version: 1,
			hours: expect.any(Array),
			serviceablePostalCodes: [],
		});

		const publicResponse = await exports.default.fetch("http://example.com/api/store");
		expect(publicResponse.status).toBe(404);
		expect(await publicResponse.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
	});

	it("rejects malformed or incomplete store settings", async () => {
		const { cookie } = await signInAs("owner");
		const response = await putStore(
			cookie,
			storePayload({
				phone: "9876543210",
				timezone: "Not/A_Timezone",
				directionsUrl: "http://maps.example.com/supashop",
				latitude: 91,
				hours: [{ weekday: 0, opensMinute: 600, closesMinute: 500, closed: false }],
			}),
		);

		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
	});

	it("returns the stable validation envelope for malformed JSON", async () => {
		const { cookie } = await signInAs("owner");
		const response = await exports.default.fetch("http://example.com/api/cms/store", {
			method: "PUT",
			headers: { "content-type": "application/json", cookie },
			body: "{",
		});

		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
	});

	it("allows an admin to create store settings", async () => {
		await clearStore();
		const { cookie } = await signInAs("admin");
		const response = await putStore(cookie, storePayload({ name: "Admin Market" }));

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ name: "Admin Market", version: 2 });
	});

	it("normalizes empty optional fields to null on initial and subsequent saves", async () => {
		await clearStore();
		const { cookie } = await signInAs("owner");
		const firstSave = await putStore(
			cookie,
			storePayload({ directionsUrl: null, deliveryInstructions: null }),
		);
		expect(firstSave.status).toBe(200);
		expect(await firstSave.json()).toMatchObject({ directionsUrl: null, deliveryInstructions: null, version: 2 });

		const secondSave = await putStore(
			cookie,
			storePayload({ version: 2, directionsUrl: null, deliveryInstructions: null }),
		);
		expect(secondSave.status).toBe(200);
		expect(await secondSave.json()).toMatchObject({ directionsUrl: null, deliveryInstructions: null, version: 3 });
	});

	it("replaces the maximum number of serviceable postal codes within D1 batch limits", async () => {
		await clearStore();
		const { cookie } = await signInAs("owner");
		const serviceablePostalCodes = Array.from(
			{ length: 500 },
			(_, index) => `P${String(index).padStart(3, "0")}`,
		);
		const response = await putStore(cookie, storePayload({ serviceablePostalCodes }));

		expect(response.status).toBe(200);
		expect((await response.json() as { serviceablePostalCodes: string[] }).serviceablePostalCodes).toHaveLength(500);
		expect(
			await env.DB.prepare("SELECT COUNT(*) AS count FROM serviceable_postal_code").first<{ count: number }>(),
		).toEqual({ count: 500 });
	});

	it("allows exactly one concurrent first write", async () => {
		await clearStore();
		const [{ cookie: ownerCookie }, { cookie: adminCookie }] = await Promise.all([
			signInAs("owner"),
			signInAs("admin"),
		]);
		const [ownerResponse, adminResponse] = await Promise.all([
			putStore(ownerCookie, storePayload({ name: "Owner Market" })),
			putStore(adminCookie, storePayload({ name: "Admin Market" })),
		]);

		expect([ownerResponse.status, adminResponse.status].sort()).toEqual([200, 409]);
		const profile = await env.DB.prepare(
			"SELECT name, version FROM store_profile WHERE singleton_key = 1",
		).first<{ name: string; version: number }>();
		expect(profile).toMatchObject({ name: expect.stringMatching(/^(Owner|Admin) Market$/), version: 2 });
		expect(
			await env.DB.prepare("SELECT COUNT(*) AS count FROM store_hours").first<{ count: number }>(),
		).toEqual({ count: 7 });
	});
});
