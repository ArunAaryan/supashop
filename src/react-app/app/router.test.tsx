import { afterEach, describe, expect, it, vi } from "vitest";

import { createGuestSession } from "./router";

describe("createGuestSession", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("creates the guest session with included credentials", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ guest: true }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		await createGuestSession();

		expect(fetchMock).toHaveBeenCalledWith("/api/guest/session", {
			credentials: "include",
			method: "POST",
		});
	});

	it("rejects a malformed successful guest response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(JSON.stringify({ guest: false }), { status: 200 })),
		);

		await expect(createGuestSession()).rejects.toThrow(
			"We could not start a guest session. Please try again.",
		);
	});
});
