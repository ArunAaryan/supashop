import { Hono } from "hono";

import type { AppEnv } from "../../auth/session";
import { requirePermission } from "../../auth/session";
import { ApiError } from "../../http/errors";
import { StoreRepository } from "./store-repository";
import { StoreService } from "./store-service";

function serviceFor(env: AppEnv["Bindings"]): StoreService {
	return new StoreService(new StoreRepository(env.DB));
}

export function createStoreRoutes() {
	const routes = new Hono<AppEnv>();

	routes.get("/store", async (c) => c.json(await serviceFor(c.env).getPublicStore()));
	routes.get("/cms/store", requirePermission("store:read"), async (c) =>
		c.json(await serviceFor(c.env).getCmsStore()),
	);
	routes.put("/cms/store", requirePermission("store:update"), async (c) => {
		const payload = await c.req.json<unknown>().catch(() => {
			throw new ApiError("VALIDATION_ERROR", "Store settings are invalid", {
				issues: [{ path: "", message: "Request body must be valid JSON" }],
			});
		});
		const user = c.get("user");
		if (!user) throw new Error("Authenticated route has no user");
		return c.json(await serviceFor(c.env).updateStore(payload, user.id));
	});

	return routes;
}
