import { Hono } from "hono";

import { createAuth } from "./auth/create-auth";
import {
	publicSession,
	requirePermission,
	requireUser,
	sessionMiddleware,
	type AppEnv,
} from "./auth/session";
import { apiErrorResponse } from "./http/errors";
import { createGuestRoutes } from "./modules/guest/guest-routes";
import { createStoreRoutes } from "./modules/store/store-routes";

export function createApp() {
	const app = new Hono<AppEnv>();

	app.use("*", async (c, next) => {
		const requestId = crypto.randomUUID();
		c.set("requestId", requestId);
		c.header("x-request-id", requestId);
		await next();
	});
	app.onError((error, c) => apiErrorResponse(error, c.get("requestId")));

	app.get("/api/health", (c) => c.json({ status: "ok" }));
	app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
	app.route("/api/guest", createGuestRoutes());

	app.use("/api/*", sessionMiddleware);
	app.route("/api", createStoreRoutes());
	app.get("/api/session", (c) =>
		c.json({ user: c.get("user"), session: publicSession(c.get("session")), cmsRole: c.get("cmsRole") }),
	);

	app.get(
		"/api/_test/delivery-complete",
		(c, next) => (c.env.APP_ENV === "test" ? next() : c.notFound()),
		requireUser,
		requirePermission("delivery:complete"),
		(c) => c.json({ status: "ok" }),
	);

	return app;
}
