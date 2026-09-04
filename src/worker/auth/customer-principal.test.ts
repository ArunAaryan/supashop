import { describe, expect, it } from "vitest";

import { ApiError } from "../http/errors";
import { resolveCustomerPrincipal } from "./customer-principal";

function context(userId: string | null, guestId: string | null) {
	return {
		get(key: "user" | "guestId") {
			if (key === "user") return userId ? { id: userId } : null;
			return guestId;
		},
	};
}

describe("resolveCustomerPrincipal", () => {
	it("uses the registered user before an accompanying signed guest session", () => {
		expect(resolveCustomerPrincipal(context("user-1", "guest-1"))).toEqual({
			kind: "user",
			id: "user-1",
			ownerKey: "user:user-1",
		});
	});

	it("preserves the existing guest cart identifier semantics", () => {
		expect(resolveCustomerPrincipal(context(null, "guest-1"))).toEqual({
			kind: "guest",
			id: "guest-1",
			ownerKey: "guest:guest-1",
		});
	});

	it("rejects callers with neither a user nor a verified guest identity", () => {
		try {
			resolveCustomerPrincipal(context(null, null));
			expect.unreachable("Expected an unauthenticated error");
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect((error as ApiError).code).toBe("UNAUTHENTICATED");
		}
	});
});
