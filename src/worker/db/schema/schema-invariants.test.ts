import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function uniqueId(prefix: string) {
	return `${prefix}-${crypto.randomUUID()}`;
}

async function insertUser(id: string) {
	await env.DB.prepare(
		"INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(id, id, `${id}@example.com`, Date.now(), Date.now())
		.run();
}

describe("database schema invariants", () => {
	it("rejects a cms role that is outside the allowed set", async () => {
		const userId = uniqueId("role-user");
		await insertUser(userId);

		await expect(
			env.DB.prepare(
				"INSERT INTO cms_role (id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			)
				.bind(uniqueId("role"), userId, "manager", Date.now(), Date.now())
				.run(),
		).rejects.toThrow();
	});

	it("creates a non-unique account user ID index", async () => {
		const indexes = await env.DB.prepare("PRAGMA index_list('account')").all<{
			name: string;
			unique: number;
		}>();

		expect(indexes.results).toContainEqual(
			expect.objectContaining({ name: "account_user_id_idx", unique: 0 }),
		);
	});

	it("clears cms role grantedBy when the granting user is deleted", async () => {
		const grantingUserId = uniqueId("granter");
		const roleUserId = uniqueId("role-user");
		await insertUser(grantingUserId);
		await insertUser(roleUserId);

		const roleId = uniqueId("role");
		await env.DB.prepare(
			"INSERT INTO cms_role (id, user_id, role, granted_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(roleId, roleUserId, "operations", grantingUserId, Date.now(), Date.now())
			.run();
		await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(grantingUserId).run();

		const row = await env.DB.prepare(
			"SELECT id, granted_by FROM cms_role WHERE id = ?",
		)
			.bind(roleId)
			.first<{ id: string; granted_by: string | null }>();
		expect(row).toEqual({ id: roleId, granted_by: null });
	});

	it("clears store profile ownerUserId when its owner is deleted", async () => {
		const ownerUserId = uniqueId("owner");
		await insertUser(ownerUserId);

		await env.DB.prepare(
			"INSERT INTO store_profile (singleton_key, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		)
			.bind(1, "SupaShop", ownerUserId, Date.now(), Date.now())
			.run();
		await env.DB.prepare("DELETE FROM user WHERE id = ?").bind(ownerUserId).run();

		const row = await env.DB.prepare(
			"SELECT singleton_key, owner_user_id FROM store_profile WHERE singleton_key = 1",
		).first<{ singleton_key: number; owner_user_id: string | null }>();
		expect(row).toEqual({ singleton_key: 1, owner_user_id: null });
	});

	it("rejects store hours whose weekday is outside the seven-day range", async () => {
		await expect(
			env.DB.prepare(
				"INSERT INTO store_hours (id, weekday, opens_minute, closes_minute, closed) VALUES (?, ?, ?, ?, ?)",
			)
				.bind(uniqueId("hours-weekday"), 7, 600, 900, false)
				.run(),
		).rejects.toThrow();
	});

	it("rejects store hours whose opening or closing minute is outside a day", async () => {
		await expect(
			env.DB.prepare(
				"INSERT INTO store_hours (id, weekday, opens_minute, closes_minute, closed) VALUES (?, ?, ?, ?, ?)",
			)
				.bind(uniqueId("hours-open"), 1, -1, 900, false)
				.run(),
		).rejects.toThrow();
		await expect(
			env.DB.prepare(
				"INSERT INTO store_hours (id, weekday, opens_minute, closes_minute, closed) VALUES (?, ?, ?, ?, ?)",
			)
				.bind(uniqueId("hours-close"), 2, 600, 1440, false)
				.run(),
		).rejects.toThrow();
	});

	it("rejects an open day whose closing minute is not after its opening minute", async () => {
		await expect(
			env.DB.prepare(
				"INSERT INTO store_hours (id, weekday, opens_minute, closes_minute, closed) VALUES (?, ?, ?, ?, ?)",
			)
				.bind(uniqueId("hours-order"), 3, 900, 900, false)
				.run(),
		).rejects.toThrow();
	});
});
