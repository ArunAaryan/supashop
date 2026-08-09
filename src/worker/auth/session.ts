import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";

import { createDb } from "../db/client";
import { cmsRole } from "../db/schema";
import { ApiError, apiErrorResponse } from "../http/errors";
import { createAuth, type AuthSession, type AuthUser, type WorkerBindings } from "./create-auth";
import { can, type CmsRole, type Permission } from "./permissions";

export type AppEnv = {
	Bindings: WorkerBindings;
	Variables: {
		cmsRole: CmsRole | null;
		requestId: string;
		session: AuthSession | null;
		user: AuthUser | null;
	};
};

export type PublicSession = Pick<AuthSession, "expiresAt" | "id">;

export function publicSession(session: AuthSession | null): PublicSession | null {
	if (!session) return null;
	return { id: session.id, expiresAt: session.expiresAt };
}

export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
	c.set("user", null);
	c.set("session", null);
	c.set("cmsRole", null);

	const authSession = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
	if (authSession) {
		c.set("user", authSession.user);
		c.set("session", authSession.session);

		const role = await createDb(c.env.DB)
			.select({ role: cmsRole.role })
			.from(cmsRole)
			.where(and(eq(cmsRole.userId, authSession.user.id), eq(cmsRole.active, true)))
			.get();
		c.set("cmsRole", role?.role ?? null);
	}

	await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
	if (!c.get("user")) return apiErrorResponse(new ApiError("UNAUTHENTICATED", "Authentication required"));
	await next();
};

export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		if (!c.get("user")) {
			return apiErrorResponse(new ApiError("UNAUTHENTICATED", "Authentication required"));
		}
		const role = c.get("cmsRole");
		if (!role || !can(role, permission)) {
			return apiErrorResponse(new ApiError("FORBIDDEN", "Permission required"));
		}
		await next();
	};
}
