import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		setupFiles: ["./src/react-app/test/setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
		exclude: ["src/worker/**/*.test.ts"],
	},
});
