import { Hono } from "hono";

import { requireUser, type AppEnv } from "../../auth/session";
import { ApiError } from "../../http/errors";
import { AddressRepository } from "./address-repository";
import { AddressService } from "./address-service";

function serviceFor(env: AppEnv["Bindings"]): AddressService {
	return new AddressService(new AddressRepository(env.DB));
}

async function jsonPayload(request: Request): Promise<unknown> {
	return request.json().catch(() => {
		throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON", {
			issues: [{ path: "", message: "Request body must be valid JSON" }],
		});
	});
}

function userId(c: { get(key: "user"): { id: string } | null }) {
	const user = c.get("user");
	if (!user) throw new Error("Authenticated route has no user");
	return user.id;
}

export function createAddressRoutes() {
	const routes = new Hono<AppEnv>();
	routes.use("/addresses/*", requireUser);
	routes.use("/addresses", requireUser);
	routes.get("/addresses", async (c) => c.json(await serviceFor(c.env).list(userId(c))));
	routes.post("/addresses", async (c) => c.json(await serviceFor(c.env).create(userId(c), await jsonPayload(c.req.raw)), 201));
	routes.get("/addresses/:addressId", async (c) => c.json(await serviceFor(c.env).get(userId(c), c.req.param("addressId"))));
	routes.put("/addresses/:addressId", async (c) => c.json(await serviceFor(c.env).update(userId(c), c.req.param("addressId"), await jsonPayload(c.req.raw))));
	routes.delete("/addresses/:addressId", async (c) => {
		await serviceFor(c.env).delete(userId(c), c.req.param("addressId"), await jsonPayload(c.req.raw));
		return c.body(null, 204);
	});
	return routes;
}
