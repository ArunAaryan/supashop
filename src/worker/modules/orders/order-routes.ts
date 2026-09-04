import { Hono } from "hono";

import { resolveCustomerPrincipal } from "../../auth/customer-principal";
import type { AppEnv } from "../../auth/session";
import { ApiError } from "../../http/errors";
import { StoreRepository } from "../store/store-repository";
import { OrderRepository } from "./order-repository";
import { OrderService } from "./order-service";

function serviceFor(env: AppEnv["Bindings"]) {
	return new OrderService(new OrderRepository(env.DB), new StoreRepository(env.DB));
}

async function jsonPayload(request: Request): Promise<unknown> {
	return request.json().catch(() => {
		throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON", {
			issues: [{ path: "", message: "Request body must be valid JSON" }],
		});
	});
}

export function createOrderRoutes() {
	const routes = new Hono<AppEnv>();
	routes.post("/checkout", async (c) => {
		const result = await serviceFor(c.env).checkout(
			resolveCustomerPrincipal(c),
			await jsonPayload(c.req.raw),
			c.req.header("Idempotency-Key") ?? "",
		);
		return c.json(result.order, result.replayed ? 200 : 201);
	});
	routes.get("/orders", async (c) => c.json(await serviceFor(c.env).list(resolveCustomerPrincipal(c), c.req.query())));
	routes.get("/orders/:orderNumber", async (c) => c.json(await serviceFor(c.env).detail(resolveCustomerPrincipal(c), c.req.param("orderNumber"))));
	routes.post("/orders/:orderNumber/cancel", async (c) => c.json(await serviceFor(c.env).cancel(resolveCustomerPrincipal(c), c.req.param("orderNumber"), await jsonPayload(c.req.raw))));
	routes.post("/orders/:orderNumber/reorder", async (c) => c.json(await serviceFor(c.env).reorder(resolveCustomerPrincipal(c), c.req.param("orderNumber"))));
	return routes;
}
