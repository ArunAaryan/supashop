import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("store profile singleton", () => {
	it("accepts only the singleton key 1", async () => {
		await expect(
			env.DB.prepare(
				"INSERT INTO store_profile (singleton_key, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
			)
				.bind(1, "SupaShop", Date.now(), Date.now())
				.run(),
		).resolves.toMatchObject({ success: true });

		await expect(
			env.DB.prepare(
				"INSERT INTO store_profile (singleton_key, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
			)
				.bind(1, "Duplicate", Date.now(), Date.now())
				.run(),
		).rejects.toThrow();

		await expect(
			env.DB.prepare(
				"INSERT INTO store_profile (singleton_key, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
			)
				.bind(2, "Second store", Date.now(), Date.now())
				.run(),
		).rejects.toThrow();
	});
});
