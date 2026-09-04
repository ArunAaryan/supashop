import { ApiError } from "../http/errors";

export type CustomerPrincipalKind = "user" | "guest";

export type CustomerPrincipal = {
	kind: CustomerPrincipalKind;
	id: string;
	/**
	 * Stable ownership key shared with the existing cart row identifier format.
	 * It can safely be used as an owner scope in future customer-domain tables.
	 */
	ownerKey: string;
};

export function createCustomerPrincipal(
	kind: CustomerPrincipalKind,
	id: string,
): CustomerPrincipal {
	return { kind, id, ownerKey: `${kind}:${id}` };
}

type CustomerPrincipalSource = {
	get: (key: "user" | "guestId") => unknown;
};

/**
 * Resolves the customer identity attached by session middleware. A signed-in
 * account deliberately wins when a valid guest cookie accompanies it.
 */
export function resolveCustomerPrincipal(
	source: CustomerPrincipalSource,
): CustomerPrincipal {
	const user = source.get("user");
	if (user && typeof user === "object" && "id" in user && typeof user.id === "string") {
		return createCustomerPrincipal("user", user.id);
	}

	const guestId = source.get("guestId");
	if (typeof guestId === "string") {
		return createCustomerPrincipal("guest", guestId);
	}

	throw new ApiError(
		"UNAUTHENTICATED",
		"A signed-in or guest session is required",
	);
}
