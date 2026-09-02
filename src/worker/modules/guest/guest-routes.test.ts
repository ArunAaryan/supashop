import { exports } from "cloudflare:workers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createGuestRoutes } from "./guest-routes";
declare module "cloudflare:workers" {
	// Cloudflare uses this empty interface for ambient Env declaration merging.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}

describe("guest session route", () => {
	it("creates a signed HttpOnly guest cookie without exposing its UUID", async () => {
		const response = await exports.default.fetch("http://example.com/api/guest/session", {
			method: "POST",
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ guest: true });

		const cookie = response.headers.get("set-cookie");
		expect(cookie).toMatch(/^supashop_guest=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+;/);
		expect(cookie).toContain("; HttpOnly");
		expect(cookie).toContain("; SameSite=Lax");
		expect(cookie).toContain("; Path=/");
		expect(cookie).toContain("; Max-Age=2592000");
		expect(cookie).not.toContain("; Secure");
	});

	it("marks the cookie Secure in production", async () => {
		const app = new Hono();
		app.route("/api/guest", createGuestRoutes());

		const response = await app.fetch(
			new Request("http://example.com/api/guest/session", { method: "POST" }),
			{
				APP_ENV: "production",
				BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-to-securely-sign-guest-cookies",
			},
		);

		expect(response.headers.get("set-cookie")).toContain("; Secure");
	});

	it("does not replace an existing valid guest cookie", async () => {
		const created = await exports.default.fetch("http://example.com/api/guest/session", {
			method: "POST",
		});
		const cookie = created.headers.get("set-cookie")?.split(";")[0];
		if (!cookie) throw new Error("Expected a guest cookie");

		const response = await exports.default.fetch("http://example.com/api/guest/session", {
			method: "POST",
			headers: { cookie },
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ guest: true });
		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
