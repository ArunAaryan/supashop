import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const auditLog = sqliteTable(
	"audit_log",
	{
		id: text("id").primaryKey(),
		actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
		action: text("action").notNull(),
		entityType: text("entity_type").notNull(),
		entityId: text("entity_id").notNull(),
		metadata: text("metadata"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("auditLogActorCreatedIdx").on(table.actorUserId, table.createdAt),
		index("auditLogEntityCreatedIdx").on(table.entityType, table.entityId, table.createdAt),
	],
);
