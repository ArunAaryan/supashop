import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(__dirname, "drizzle"));

			return {
				wrangler: { configPath: "./wrangler.test.json" },
				miniflare: {
					bindings: {
						APP_ENV: "test",
						BETTER_AUTH_SECRET: "test-only-secret-that-is-long-enough-for-better-auth",
						TEST_MIGRATIONS: migrations,
					},
				},
			};
		}),
	],
	test: {
		include: ["src/worker/**/*.test.ts"],
		setupFiles: ["./src/worker/test/apply-migrations.ts"],
	},
});
