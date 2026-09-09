import { z } from "zod";
import { Hono } from "hono";

import { requirePermission, type AppEnv } from "../../auth/session";

const auditListQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const auditEntrySchema = z.object({
	id: z.string(),
	actorUserId: z.string().nullable(),
	action: z.string(),
	entityType: z.string(),
	entityId: z.string(),
	metadata: z.string().nullable(),
	createdAt: z.number(),
});

export function createAuditRoutes() {
	const routes = new Hono<AppEnv>();
	routes.get("/cms/audit", requirePermission("analytics:read"), async (c) => {
		const query = auditListQuerySchema.parse(c.req.query());
		const [items, count] = await c.env.DB.batch([
			c.env.DB.prepare("SELECT id, actor_user_id, action, entity_type, entity_id, metadata, created_at FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?").bind(query.pageSize, (query.page - 1) * query.pageSize),
			c.env.DB.prepare("SELECT count(*) AS total FROM audit_log"),
		]);
		const rows = items.results as Array<{ id: string; actor_user_id: string | null; action: string; entity_type: string; entity_id: string; metadata: string | null; created_at: number }>;
		return c.json({
			items: rows.map((row) => auditEntrySchema.parse({
				id: row.id,
				actorUserId: row.actor_user_id,
				action: row.action,
				entityType: row.entity_type,
				entityId: row.entity_id,
				metadata: row.metadata,
				createdAt: row.created_at,
			})),
			page: query.page,
			pageSize: query.pageSize,
			totalItems: Number((count.results[0] as { total?: number } | undefined)?.total ?? 0),
			totalPages: Math.ceil(Number((count.results[0] as { total?: number } | undefined)?.total ?? 0) / query.pageSize),
		});
	});
	return routes;
}
