import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { request, signInAs } from "../../test/catalog-fixtures";

function addressPayload(overrides: Record<string, unknown> = {}) {
	return {
		label: " Home ",
		recipientName: " Arun Kumar ",
		mobile: " +919876543210 ",
		addressLine1: " 10 Market Street ",
		addressLine2: "",
		landmark: "Near the park",
		city: " Bengaluru ",
		state: " Karnataka ",
		postalCode: " 560001 ",
		latitude: null,
		longitude: null,
		deliveryInstructions: " Leave with security ",
		isDefault: false,
		...overrides,
	};
}

async function createAddress(cookie: string, overrides: Record<string, unknown> = {}) {
	return request("/api/addresses", cookie, "POST", addressPayload(overrides));
}

describe("saved address routes", () => {
	it("requires a registered account, not an anonymous or guest session", async () => {
		expect((await request("/api/addresses")).status).toBe(401);
		const guest = await exports.default.fetch("http://example.com/api/guest/session", { method: "POST" });
		const cookie = guest.headers.get("set-cookie")?.split(";")[0] ?? "";
		expect((await request("/api/addresses", cookie)).status).toBe(401);
	});

	it("normalizes addresses and keeps exactly one default as records are created", async () => {
		const account = await signInAs("operations");
		const firstResponse = await createAddress(account.cookie);
		expect(firstResponse.status).toBe(201);
		const first = await firstResponse.json() as { id: string; isDefault: boolean; label: string | null; recipientName: string; mobile: string; postalCode: string; version: number };
		expect(first).toMatchObject({ label: "Home", recipientName: "Arun Kumar", mobile: "+919876543210", postalCode: "560001", isDefault: true, version: 1 });

		const secondResponse = await createAddress(account.cookie, { label: "Work", isDefault: true });
		expect(secondResponse.status).toBe(201);
		const second = await secondResponse.json() as { id: string; isDefault: boolean };
		expect(second.isDefault).toBe(true);

		const list = await request("/api/addresses", account.cookie);
		expect(list.status).toBe(200);
		expect(await list.json()).toEqual([
			expect.objectContaining({ id: second.id, isDefault: true }),
			expect.objectContaining({ id: first.id, isDefault: false }),
		]);
	});

	it("masks another customer's address as missing", async () => {
		const owner = await signInAs("operations");
		const other = await signInAs("delivery");
		const created = await createAddress(owner.cookie);
		const address = await created.json() as { id: string; version: number };

		for (const response of [
			await request(`/api/addresses/${address.id}`, other.cookie),
			await request(`/api/addresses/${address.id}`, other.cookie, "PUT", { ...addressPayload(), version: address.version }),
			await request(`/api/addresses/${address.id}`, other.cookie, "DELETE", { version: address.version }),
		]) {
			expect(response.status).toBe(404);
			expect(await response.json()).toEqual({ error: { code: "NOT_FOUND", message: "Address not found" } });
		}
	});

	it("uses optimistic versions and safely promotes a new default when the current one changes", async () => {
		const account = await signInAs("operations");
		const first = await (await createAddress(account.cookie, { label: "Home" })).json() as { id: string; version: number };
		const second = await (await createAddress(account.cookie, { label: "Work" })).json() as { id: string; version: number };

		const makeDefault = await request(`/api/addresses/${second.id}`, account.cookie, "PUT", {
			...addressPayload({ label: "Work", isDefault: true }), version: second.version,
		});
		expect(makeDefault.status).toBe(200);
		const current = await makeDefault.json() as { version: number; isDefault: boolean };
		expect(current).toMatchObject({ version: 2, isDefault: true });

		const stale = await request(`/api/addresses/${second.id}`, account.cookie, "PUT", {
			...addressPayload({ label: "Stale", isDefault: false }), version: second.version,
		});
		expect(stale.status).toBe(409);
		const list = await request("/api/addresses", account.cookie);
		expect(await list.json()).toEqual([
			expect.objectContaining({ id: second.id, label: "Work", isDefault: true, version: 2 }),
			expect.objectContaining({ id: first.id, isDefault: false }),
		]);
	});

	it("deletes only at the supplied version and promotes a remaining address", async () => {
		const account = await signInAs("operations");
		const first = await (await createAddress(account.cookie, { label: "Home" })).json() as { id: string; version: number };
		const second = await (await createAddress(account.cookie, { label: "Work" })).json() as { id: string; version: number };

		const stale = await request(`/api/addresses/${first.id}`, account.cookie, "DELETE", { version: first.version + 1 });
		expect(stale.status).toBe(409);
		const deleted = await request(`/api/addresses/${first.id}`, account.cookie, "DELETE", { version: first.version });
		expect(deleted.status).toBe(204);
		const list = await request("/api/addresses", account.cookie);
		expect(await list.json()).toEqual([expect.objectContaining({ id: second.id, isDefault: true, version: 2 })]);
	});

	it("returns stable validation errors without writing malformed input", async () => {
		const account = await signInAs("operations");
		for (const payload of [
			addressPayload({ mobile: "9876543210" }),
			addressPayload({ latitude: 12.9, longitude: null }),
			{ ...addressPayload(), unknown: true },
		]) {
			expect((await request("/api/addresses", account.cookie, "POST", payload)).status).toBe(422);
		}
		const malformed = await exports.default.fetch("http://example.com/api/addresses", {
			method: "POST", headers: { cookie: account.cookie, "content-type": "application/json" }, body: "{",
		});
		expect(malformed.status).toBe(422);
		expect(await malformed.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
		expect(await (await request("/api/addresses", account.cookie)).json()).toEqual([]);
	});
});
