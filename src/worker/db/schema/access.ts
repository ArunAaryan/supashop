import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const cmsRoleValues = ["owner", "admin", "operations", "delivery"] as const;

export const cmsRole = sqliteTable(
	"cms_role",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role", { enum: cmsRoleValues }).notNull(),
		active: integer("active", { mode: "boolean" }).default(true).notNull(),
		grantedBy: text("granted_by").references(() => user.id),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [uniqueIndex("cms_role_user_unique").on(table.userId)],
);
