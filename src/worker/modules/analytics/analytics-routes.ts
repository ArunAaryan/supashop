import { Hono } from "hono";

import { requirePermission, type AppEnv } from "../../auth/session";
import { StoreRepository } from "../store/store-repository";
import { AnalyticsRepository } from "./analytics-repository";
import { AnalyticsService } from "./analytics-service";

function serviceFor(env: AppEnv["Bindings"]): AnalyticsService {
	return new AnalyticsService(new AnalyticsRepository(env.DB), new StoreRepository(env.DB));
}

export function createAnalyticsRoutes() {
	const routes = new Hono<AppEnv>();
	routes.get("/cms/analytics/overview", requirePermission("analytics:read"), async (c) =>
		c.json(await serviceFor(c.env).overview()),
	);
	return routes;
}
