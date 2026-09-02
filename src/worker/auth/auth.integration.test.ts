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

function containsToken(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(containsToken);
	if (!value || typeof value !== "object") return false;
	return Object.entries(value).some(
		([key, child]) => key === "token" || containsToken(child),
	);
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
		expect(await response.json()).toEqual({ user: null, session: null, cmsRole: null, guest: false });
	});

	it("reports a valid returning guest session without exposing its guest ID", async () => {
		const guest = await exports.default.fetch("http://example.com/api/guest/session", { method: "POST" });
		const cookie = cookieFrom(guest);
		const response = await exports.default.fetch("http://example.com/api/session", { headers: { cookie } });

		expect(await response.json()).toEqual({ user: null, session: null, cmsRole: null, guest: true });
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
		const sessionBody = (await session.json()) as {
			session: { expiresAt: string; id: string };
			user: { id: string; email: string };
		};
		expect(sessionBody).toMatchObject({
			user: { id: signedUp.user.id, email },
			session: { id: expect.any(String), expiresAt: expect.any(String) },
		});
		const storedSession = await env.DB.prepare("SELECT token FROM session WHERE user_id = ?")
			.bind(signedUp.user.id)
			.first<{ token: string }>();
		expect(storedSession).not.toBeNull();
		expect(JSON.stringify(sessionBody)).not.toContain(storedSession?.token ?? "");
		expect(containsToken(sessionBody)).toBe(false);

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
			.bind(crypto.randomUUID(), signedUp.user.id, "delivery", false, now, now)
			.run();
		const inactiveRole = await exports.default.fetch("http://example.com/api/_test/delivery-complete", {
			headers: { cookie },
		});
		expect(inactiveRole.status).toBe(403);
		expect(await inactiveRole.json()).toMatchObject({ error: { code: "FORBIDDEN" } });

		await env.DB.prepare("UPDATE cms_role SET active = ? WHERE user_id = ?")
			.bind(true, signedUp.user.id)
			.run();

		const allowed = await exports.default.fetch("http://example.com/api/_test/delivery-complete", {
			headers: { cookie },
		});
		expect(allowed.status).toBe(200);
		expect(await allowed.json()).toEqual({ status: "ok" });
	});
});
