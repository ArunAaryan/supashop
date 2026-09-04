import { Hono } from "hono";
import { setCookie } from "hono/cookie";

import {
	createCustomerPrincipal,
	resolveCustomerPrincipal,
} from "../../auth/customer-principal";
import type { AppEnv } from "../../auth/session";
import { ApiError } from "../../http/errors";
import { OrderRepository } from "../orders/order-repository";
import { CartRepository } from "./cart-repository";
import { CartService } from "./cart-service";

function serviceFor(env: AppEnv["Bindings"]) {
	return new CartService(new CartRepository(env.DB));
}

async function jsonPayload(request: Request): Promise<unknown> {
	return request.json().catch(() => {
		throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON", { issues: [{ path: "", message: "Request body must be valid JSON" }] });
	});
}

export function createCartRoutes() {
	const routes = new Hono<AppEnv>();
	routes.get("/cart", async (c) => c.json(await serviceFor(c.env).getCart(resolveCustomerPrincipal(c))));
	routes.post("/cart/items", async (c) => {
		const result = await serviceFor(c.env).addItem(resolveCustomerPrincipal(c), await jsonPayload(c.req.raw));
		return c.json(result.cart, result.created ? 201 : 200);
	});
	routes.put("/cart/items/:offeringId", async (c) => c.json(await serviceFor(c.env).setItem(resolveCustomerPrincipal(c), c.req.param("offeringId"), await jsonPayload(c.req.raw))));
	routes.delete("/cart/items/:offeringId", async (c) => {
		await serviceFor(c.env).removeItem(resolveCustomerPrincipal(c), c.req.param("offeringId"));
		return c.body(null, 204);
	});
	routes.post("/cart/merge", async (c) => {
		const user = c.get("user");
		const guestId = c.get("guestId");
		if (!user) throw new ApiError("UNAUTHENTICATED", "Authentication required");
		const registered = createCustomerPrincipal("user", user.id);
		if (!guestId) return c.json(await serviceFor(c.env).getCart(registered));
		const guest = createCustomerPrincipal("guest", guestId);
		const cart = await serviceFor(c.env).merge(registered, guest);
		await new OrderRepository(c.env.DB).claimGuestOrders(registered, guest);
		setCookie(c, "supashop_guest", "", { httpOnly: true, maxAge: 0, path: "/", sameSite: "Lax", secure: c.env.APP_ENV === "production" });
		return c.json(cart);
	});
	return routes;
}
