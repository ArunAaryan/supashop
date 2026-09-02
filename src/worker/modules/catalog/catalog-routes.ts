import { Hono } from "hono";

import type { AppEnv } from "../../auth/session";
import { requirePermission } from "../../auth/session";
import { ApiError } from "../../http/errors";
import { CatalogRepository } from "./catalog-repository";
import { CatalogService } from "./catalog-service";
import { OfferingRepository } from "./offering-repository";
import { OfferingService } from "./offering-service";
import { MediaRepository } from "./media-repository";
import { MediaService } from "./media-service";

function serviceFor(env: AppEnv["Bindings"]): CatalogService {
	return new CatalogService(new CatalogRepository(env.DB));
}

function offeringServiceFor(env: AppEnv["Bindings"]): OfferingService {
	return new OfferingService(new OfferingRepository(env.DB));
}

function mediaServiceFor(env: AppEnv["Bindings"]): MediaService {
	return new MediaService(new MediaRepository(env.DB), env.MEDIA);
}

async function jsonPayload(request: Request): Promise<unknown> {
	return request.json().catch(() => {
		throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON", {
			issues: [{ path: "", message: "Request body must be valid JSON" }],
		});
	});
}

async function multipartPayload(request: Request): Promise<FormData> {
	return request.formData().catch(() => {
		throw new ApiError("VALIDATION_ERROR", "Request body must be valid multipart form data");
	});
}

export function createCatalogRoutes() {
	const routes = new Hono<AppEnv>();

	routes.get("/cms/categories", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).listCategories(c.req.query())),
	);
	routes.post("/cms/categories", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).createCategory(await jsonPayload(c.req.raw)), 201),
	);
	routes.put("/cms/categories/:categoryId", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).updateCategory(c.req.param("categoryId"), await jsonPayload(c.req.raw))),
	);
	routes.get("/cms/tags", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).listTags(c.req.query())),
	);
	routes.post("/cms/tags", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).createTag(await jsonPayload(c.req.raw)), 201),
	);
	routes.put("/cms/tags/:tagId", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).updateTag(c.req.param("tagId"), await jsonPayload(c.req.raw))),
	);
	routes.get("/cms/products", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).listProducts(c.req.query())),
	);
	routes.post("/cms/products", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).createProduct(await jsonPayload(c.req.raw)), 201),
	);
	routes.get("/cms/products/:productId", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).getProduct(c.req.param("productId"))),
	);
	routes.put("/cms/products/:productId", requirePermission("catalog:write"), async (c) =>
		c.json(await serviceFor(c.env).updateProduct(c.req.param("productId"), await jsonPayload(c.req.raw))),
	);
	routes.get("/cms/offerings", requirePermission("catalog:write"), async (c) =>
		c.json(await offeringServiceFor(c.env).listOfferings(c.req.query())),
	);
	routes.post("/cms/offerings", requirePermission("catalog:write"), async (c) =>
		c.json(await offeringServiceFor(c.env).createOffering(await jsonPayload(c.req.raw)), 201),
	);
	routes.get("/cms/offerings/:offeringId", requirePermission("catalog:write"), async (c) =>
		c.json(await offeringServiceFor(c.env).getOffering(c.req.param("offeringId"))),
	);
	routes.put("/cms/offerings/:offeringId", requirePermission("catalog:write"), async (c) =>
		c.json(await offeringServiceFor(c.env).updateOffering(c.req.param("offeringId"), await jsonPayload(c.req.raw))),
	);
	routes.post("/cms/offerings/:offeringId/inventory-adjustments", requirePermission("inventory:write"), async (c) => {
		const user = c.get("user");
		if (!user) throw new Error("Authenticated inventory route has no user");
		return c.json(await offeringServiceFor(c.env).adjustInventory(c.req.param("offeringId"), await jsonPayload(c.req.raw), user.id));
	});
	routes.get("/cms/inventory-movements", requirePermission("inventory:write"), async (c) =>
		c.json(await offeringServiceFor(c.env).listMovements(c.req.query())),
	);
	routes.post("/cms/products/:productId/images", requirePermission("catalog:write"), async (c) =>
		c.json(
			await mediaServiceFor(c.env).upload(
				c.req.param("productId"),
				c.get("user")!.id,
				await multipartPayload(c.req.raw),
			),
			201,
		),
	);
	routes.put("/cms/products/:productId/images/order", requirePermission("catalog:write"), async (c) =>
		c.json(await mediaServiceFor(c.env).reorder(c.req.param("productId"), await jsonPayload(c.req.raw))),
	);
	routes.delete("/cms/products/:productId/images/:imageId", requirePermission("catalog:write"), async (c) => {
		const image = await mediaServiceFor(c.env).remove(c.req.param("productId"), c.req.param("imageId"));
		const requestId = c.get("requestId");
		c.executionCtx.waitUntil(c.env.MEDIA.delete(image.object_key).catch((error: unknown) => {
			console.error("Unable to remove catalog image object", { requestId, error });
		}));
		return c.body(null, 204);
	});
	routes.get("/catalog/images/:imageId", async (c) => mediaServiceFor(c.env).getPublicImage(c.req.param("imageId")));

	return routes;
}
