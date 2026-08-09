import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

declare module "cloudflare:workers" {
	// Cloudflare uses this empty interface for ambient Env declaration merging.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}

function cookieFrom(response: Response): string {
	const cookie = response.headers.get("set-cookie");
	if (!cookie) throw new Error("Expected Better Auth to set a session cookie");
	return cookie.split(";")[0] ?? "";
}

describe("Better Auth in the Worker", () => {
	it("reports that the Better Auth handler is available", async () => {
		const response = await exports.default.fetch("http://example.com/api/auth/ok");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it("returns an anonymous session envelope", async () => {
		const response = await exports.default.fetch("http://example.com/api/session");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ user: null, session: null, cmsRole: null });
	});

	it("persists an email/password session in migrated D1", async () => {
		const email = `auth-${crypto.randomUUID()}@example.com`;
		const signUp = await exports.default.fetch("http://example.com/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Worker Test", email, password: "a-long-test-password" }),
		});

		expect(signUp.status).toBe(200);
		const cookie = cookieFrom(signUp);
		const signedUp = (await signUp.json()) as { user: { id: string; email: string } };
		expect(signedUp.user.email).toBe(email);

		const session = await exports.default.fetch("http://example.com/api/session", {
			headers: { cookie },
		});
		expect(await session.json()).toMatchObject({
			user: { id: signedUp.user.id, email },
			cmsRole: null,
		});

		const signIn = await exports.default.fetch("http://example.com/api/auth/sign-in/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email, password: "a-long-test-password" }),
		});
		expect(signIn.status).toBe(200);
		const signInCookie = cookieFrom(signIn);
		const signedInSession = await exports.default.fetch("http://example.com/api/session", {
			headers: { cookie: signInCookie },
		});
		expect(await signedInSession.json()).toMatchObject({ user: { id: signedUp.user.id, email } });
	});

	it("enforces CMS roles without providing a role grant endpoint", async () => {
		const anonymous = await exports.default.fetch(
			"http://example.com/api/_test/delivery-complete",
		);
		expect(anonymous.status).toBe(401);
		expect(await anonymous.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });

		const email = `role-${crypto.randomUUID()}@example.com`;
		const signUp = await exports.default.fetch("http://example.com/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Role Test", email, password: "a-long-test-password" }),
		});
		const cookie = cookieFrom(signUp);
		const signedUp = (await signUp.json()) as { user: { id: string } };

		const wrongRole = await exports.default.fetch("http://example.com/api/_test/delivery-complete", {
			headers: { cookie },
		});
		expect(wrongRole.status).toBe(403);
		expect(await wrongRole.json()).toMatchObject({ error: { code: "FORBIDDEN" } });

		const now = Date.now();
		await env.DB.prepare(
			"INSERT INTO cms_role (id, user_id, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(crypto.randomUUID(), signedUp.user.id, "delivery", true, now, now)
			.run();

		const allowed = await exports.default.fetch("http://example.com/api/_test/delivery-complete", {
			headers: { cookie },
		});
		expect(allowed.status).toBe(200);
		expect(await allowed.json()).toEqual({ status: "ok" });
	});
});
