import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";

export type CatalogRole = "owner" | "admin" | "operations" | "delivery";

export async function signInAs(role: CatalogRole) {
	const email = `${role}-${crypto.randomUUID()}@example.com`;
	const response = await exports.default.fetch("http://example.com/api/auth/sign-up/email", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name: role, email, password: "a-long-test-password" }),
	});
	expect(response.status).toBe(200);
	const body = await response.json() as { user: { id: string } };
	const cookie = response.headers.get("set-cookie")?.split(";")[0];
	if (!cookie) throw new Error("Expected a session cookie");
	const now = Date.now();
	await env.DB.prepare(
		"INSERT INTO cms_role (id, user_id, role, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
	).bind(crypto.randomUUID(), body.user.id, role, now, now).run();
	return { cookie, userId: body.user.id };
}

export function request(path: string, cookie = "", method = "GET", body?: unknown) {
	return exports.default.fetch(`http://example.com${path}`, {
		method,
		headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

export async function insertTaxonomyFixture(role: CatalogRole = "operations") {
	const auth = await signInAs(role);
	const suffix = crypto.randomUUID();
	const category = await request("/api/cms/categories", auth.cookie, "POST", {
		name: `Dairy ${suffix}`,
		slug: `dairy-${suffix}`,
		description: "Chilled products",
		active: true,
	});
	expect(category.status).toBe(201);
	const tag = await request("/api/cms/tags", auth.cookie, "POST", {
		name: `Fresh ${suffix}`,
		slug: `fresh-${suffix}`,
		active: true,
	});
	expect(tag.status).toBe(201);
	return {
		...auth,
		categoryId: ((await category.json()) as { id: string }).id,
		tagId: ((await tag.json()) as { id: string }).id,
	};
}
