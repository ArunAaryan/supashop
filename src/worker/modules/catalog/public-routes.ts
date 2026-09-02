import { Hono } from "hono";

import type { AppEnv } from "../../auth/session";
import { PublicCatalogRepository } from "./public-repository";
import { PublicCatalogService } from "./public-service";

function serviceFor(env: AppEnv["Bindings"]) {
	return new PublicCatalogService(new PublicCatalogRepository(env.DB));
}

export function createPublicCatalogRoutes() {
	const routes = new Hono<AppEnv>();
	routes.get("/catalog/categories", async (c) => c.json(await serviceFor(c.env).listCategories()));
	routes.get("/catalog/tags", async (c) => c.json(await serviceFor(c.env).listTags()));
	routes.get("/catalog/products", async (c) => c.json(await serviceFor(c.env).listProducts(c.req.query())));
	routes.get("/catalog/search", async (c) => c.json(await serviceFor(c.env).search(c.req.query())));
	routes.get("/catalog/products/:slug", async (c) => c.json(await serviceFor(c.env).getProduct(c.req.param("slug"))));
	return routes;
}
