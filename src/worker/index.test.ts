import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

declare module "cloudflare:workers" {
	// Cloudflare uses this empty interface for ambient Env declaration merging.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}

describe("Worker API", () => {
	it("serves the health response through workerd", async () => {
		const response = await exports.default.fetch("http://example.com/api/health");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
	});
});
