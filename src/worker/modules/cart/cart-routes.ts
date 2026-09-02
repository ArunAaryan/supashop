import { Hono } from "hono";
import { setCookie } from "hono/cookie";

import type { AppEnv } from "../../auth/session";
import { ApiError } from "../../http/errors";
import { CartRepository, type CartOwner } from "./cart-repository";
import { CartService } from "./cart-service";

function serviceFor(env: AppEnv["Bindings"]) {
	return new CartService(new CartRepository(env.DB));
}

function ownerFor(c: { get: (key: "user" | "guestId") => AppEnv["Variables"]["user"] | AppEnv["Variables"]["guestId"] }): CartOwner {
	const user = c.get("user");
	if (user && typeof user === "object" && "id" in user) return { kind: "user", id: user.id };
	const guestId = c.get("guestId");
	if (typeof guestId === "string") return { kind: "guest", id: guestId };
	throw new ApiError("UNAUTHENTICATED", "A signed-in or guest session is required");
}

async function jsonPayload(request: Request): Promise<unknown> {
	return request.json().catch(() => {
		throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON", { issues: [{ path: "", message: "Request body must be valid JSON" }] });
	});
}

export function createCartRoutes() {
	const routes = new Hono<AppEnv>();
	routes.get("/cart", async (c) => c.json(await serviceFor(c.env).getCart(ownerFor(c))));
	routes.post("/cart/items", async (c) => {
		const result = await serviceFor(c.env).addItem(ownerFor(c), await jsonPayload(c.req.raw));
		return c.json(result.cart, result.created ? 201 : 200);
	});
	routes.put("/cart/items/:offeringId", async (c) => c.json(await serviceFor(c.env).setItem(ownerFor(c), c.req.param("offeringId"), await jsonPayload(c.req.raw))));
	routes.delete("/cart/items/:offeringId", async (c) => {
		await serviceFor(c.env).removeItem(ownerFor(c), c.req.param("offeringId"));
		return c.body(null, 204);
	});
	routes.post("/cart/merge", async (c) => {
		const user = c.get("user");
		const guestId = c.get("guestId");
		if (!user) throw new ApiError("UNAUTHENTICATED", "Authentication required");
		const registered = { kind: "user", id: user.id } as const;
		if (!guestId) return c.json(await serviceFor(c.env).getCart(registered));
		const cart = await serviceFor(c.env).merge(registered, { kind: "guest", id: guestId });
		setCookie(c, "supashop_guest", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "Lax", secure: c.env.APP_ENV === "production" });
		return c.json(cart);
	});
	return routes;
}
