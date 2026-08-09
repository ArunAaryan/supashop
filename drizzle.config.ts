import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "sqlite",
	schema: "./src/worker/db/schema/index.ts",
	out: "./drizzle",
});
