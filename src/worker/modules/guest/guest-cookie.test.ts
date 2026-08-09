import { describe, expect, it } from "vitest";

import { createGuestToken, verifyGuestToken } from "./guest-cookie";

const secret = "test-secret-that-is-long-enough-to-securely-sign-guest-cookies";

describe("guest cookie", () => {
	it("round-trips a signed opaque id", async () => {
		const token = await createGuestToken("guest-123", secret);

		expect(await verifyGuestToken(token, secret)).toBe("guest-123");
	});

	it("rejects tampering", async () => {
		const token = await createGuestToken("guest-123", secret);

		expect(await verifyGuestToken(`${token}x`, secret)).toBeNull();
	});

	it.each([
		"",
		"not-a-token",
		".signature",
		"guest.",
		"guest.signature.extra",
		"guest+.signature",
		"Z3Vlc3QtMTIz.abc=",
	])("rejects malformed tokens without throwing: %s", async (token) => {
		await expect(verifyGuestToken(token, secret)).resolves.toBeNull();
	});

	it("rejects an unsafe signing secret", async () => {
		await expect(createGuestToken("guest-123", "short-secret")).rejects.toThrow(
			"guest signing secret must be at least 32 characters",
		);
	});
});
