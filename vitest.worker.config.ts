import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		include: ["src/worker/**/*.test.ts"],
		passWithNoTests: true,
		poolOptions: {
			workers: {
				wrangler: {
					configPath: "./wrangler.json",
				},
			},
		},
	},
});
