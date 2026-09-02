import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { offering } from "./catalog";
import { user } from "./auth";

export const cart = sqliteTable(
	"cart",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		guestId: text("guest_id"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("cartUserUnique").on(table.userId),
		uniqueIndex("cartGuestUnique").on(table.guestId),
		check(
			"cart_exactly_one_owner_check",
			sql`(${table.userId} is not null and ${table.guestId} is null) or (${table.userId} is null and ${table.guestId} is not null)`,
		),
	],
);

export const cartItem = sqliteTable(
	"cart_item",
	{
		cartId: text("cart_id")
			.notNull()
			.references(() => cart.id, { onDelete: "cascade" }),
		offeringId: text("offering_id")
			.notNull()
			.references(() => offering.id, { onDelete: "restrict" }),
		quantity: integer("quantity").notNull(),
		effectivePriceMinorAtAdd: integer("effective_price_minor_at_add").notNull(),
		version: integer("version").default(1).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.cartId, table.offeringId] }),
		index("cartItemOfferingIdx").on(table.offeringId),
		check("cart_item_quantity_check", sql`${table.quantity} between 1 and 99`),
		check(
			"cart_item_effective_price_at_add_check",
			sql`${table.effectivePriceMinorAtAdd} >= 0`,
		),
		check("cart_item_version_check", sql`${table.version} > 0`),
	],
);
