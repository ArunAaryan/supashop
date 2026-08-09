import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const storeProfile = sqliteTable(
	"store_profile",
	{
		singletonKey: integer("singleton_key").primaryKey(),
		name: text("name").notNull(),
		description: text("description").default("").notNull(),
		ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
		contactName: text("contact_name").default("").notNull(),
		phone: text("phone").default("").notNull(),
		email: text("email").default("").notNull(),
		addressLine1: text("address_line_1").default("").notNull(),
		addressLine2: text("address_line_2").default("").notNull(),
		landmark: text("landmark").default("").notNull(),
		city: text("city").default("").notNull(),
		state: text("state").default("").notNull(),
		postalCode: text("postal_code").default("").notNull(),
		directionsUrl: text("directions_url").default("").notNull(),
		deliveryInstructions: text("delivery_instructions").default("").notNull(),
		latitude: real("latitude"),
		longitude: real("longitude"),
		timezone: text("timezone").default("Asia/Kolkata").notNull(),
		orderCutoffMinutes: integer("order_cutoff_minutes"),
		version: integer("version").default(1).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		check("store_profile_singleton_key_check", sql`${table.singletonKey} = 1`),
	],
);

export const storeHours = sqliteTable(
	"store_hours",
	{
		id: text("id").primaryKey(),
		weekday: integer("weekday").notNull(),
		opensMinute: integer("opens_minute").notNull(),
		closesMinute: integer("closes_minute").notNull(),
		closed: integer("closed", { mode: "boolean" }).default(false).notNull(),
	},
	(table) => [
		uniqueIndex("store_hours_weekday_unique").on(table.weekday),
		check("store_hours_weekday_check", sql`${table.weekday} between 0 and 6`),
		check("store_hours_opens_minute_check", sql`${table.opensMinute} between 0 and 1439`),
		check("store_hours_closes_minute_check", sql`${table.closesMinute} between 0 and 1439`),
		check(
			"store_hours_open_order_check",
			sql`${table.closed} = 1 or ${table.opensMinute} < ${table.closesMinute}`,
		),
	],
);

export const serviceablePostalCode = sqliteTable("serviceable_postal_code", {
	postalCode: text("postal_code").primaryKey(),
	active: integer("active", { mode: "boolean" }).default(true).notNull(),
});
