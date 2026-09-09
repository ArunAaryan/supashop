import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	real,
	type SQLiteColumn,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth";

const orderStatusValues = [
	"placed",
	"confirmed",
	"preparing",
	"ready",
	"out_for_delivery",
	"delivered",
	"cancelled",
	"rejected",
] as const;

const paymentStatusValues = ["pending", "collected", "exception"] as const;

function addressChecks(table: {
	mobile: SQLiteColumn;
	latitude: SQLiteColumn;
	longitude: SQLiteColumn;
}, prefix: string) {
	return [
		check(
			`${prefix}_e164_check`,
			sql`length(${table.mobile}) between 9 and 16 and ${table.mobile} glob '+[1-9]*' and ${table.mobile} not glob '*[^0-9+]*' and instr(substr(${table.mobile}, 2), '+') = 0`,
		),
		check(
			`${prefix}_latitude_range_check`,
			sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
		),
		check(
			`${prefix}_longitude_range_check`,
			sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
		),
		check(
			`${prefix}_longitude_pair_check`,
			sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`,
		),
	];
}

export const customerAddress = sqliteTable(
	"customer_address",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		label: text("label").notNull().default(""),
		recipientName: text("recipient_name").notNull(),
		mobile: text("mobile").notNull(),
		addressLine1: text("address_line_1").notNull(),
		addressLine2: text("address_line_2").notNull().default(""),
		landmark: text("landmark").notNull().default(""),
		city: text("city").notNull(),
		state: text("state").notNull(),
		postalCode: text("postal_code").notNull(),
		latitude: real("latitude"),
		longitude: real("longitude"),
		deliveryInstructions: text("delivery_instructions").notNull().default(""),
		isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
		version: integer("version").notNull().default(1),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("customerAddressUserUpdatedIdx").on(table.userId, table.updatedAt, table.id),
		uniqueIndex("customerAddressOneDefault").on(table.userId).where(sql`${table.isDefault} = 1`),
		check("customer_address_version_check", sql`${table.version} > 0`),
		...addressChecks(table, "customer_address"),
	],
);

export const commerceOrder = sqliteTable(
	"commerce_order",
	{
		id: text("id").primaryKey(),
		orderNumber: text("order_number").notNull(),
		userId: text("user_id").references(() => user.id, { onDelete: "restrict" }),
		guestId: text("guest_id"),
		status: text("status", { enum: orderStatusValues }).notNull(),
		paymentStatus: text("payment_status", { enum: paymentStatusValues }).notNull().default("pending"),
		currency: text("currency").notNull().default("INR"),
		subtotalMinor: integer("subtotal_minor").notNull(),
		deliveryFeeMinor: integer("delivery_fee_minor").notNull().default(0),
		totalMinor: integer("total_minor").notNull(),
		placedAt: integer("placed_at", { mode: "timestamp_ms" }).notNull(),
		expectedDeliveryAt: integer("expected_delivery_at", { mode: "timestamp_ms" }),
		cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
		version: integer("version").notNull().default(1),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("commerceOrderNumberUnique").on(table.orderNumber),
		index("commerceOrderUserPlacedIdx").on(table.userId, table.placedAt, table.id),
		index("commerceOrderGuestPlacedIdx").on(table.guestId, table.placedAt, table.id),
		index("commerceOrderStatusPlacedIdx").on(table.status, table.placedAt, table.id),
		check(
			"commerce_order_exactly_one_owner_check",
			sql`(${table.userId} is not null and ${table.guestId} is null) or (${table.userId} is null and ${table.guestId} is not null)`,
		),
		check("commerce_order_number_check", sql`${table.orderNumber} glob 'ord_[A-Za-z0-9_-]*' and length(${table.orderNumber}) between 24 and 132`),
		check("commerce_order_status_check", sql`${table.status} in ('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')`),
		check("commerce_order_payment_status_check", sql`${table.paymentStatus} in ('pending', 'collected', 'exception')`),
		check("commerce_order_currency_check", sql`${table.currency} = 'INR'`),
		check("commerce_order_subtotal_check", sql`${table.subtotalMinor} >= 0`),
		check("commerce_order_delivery_fee_check", sql`${table.deliveryFeeMinor} >= 0`),
		check("commerce_order_total_check", sql`${table.totalMinor} = ${table.subtotalMinor} + ${table.deliveryFeeMinor}`),
		check("commerce_order_cancelled_at_check", sql`${table.cancelledAt} is null or ${table.status} = 'cancelled'`),
		check("commerce_order_version_check", sql`${table.version} > 0`),
	],
);

export const orderAddress = sqliteTable(
	"order_address",
	{
		orderId: text("order_id")
			.primaryKey()
			.references(() => commerceOrder.id, { onDelete: "cascade" }),
		recipientName: text("recipient_name").notNull(),
		mobile: text("mobile").notNull(),
		addressLine1: text("address_line_1").notNull(),
		addressLine2: text("address_line_2").notNull().default(""),
		landmark: text("landmark").notNull().default(""),
		city: text("city").notNull(),
		state: text("state").notNull(),
		postalCode: text("postal_code").notNull(),
		latitude: real("latitude"),
		longitude: real("longitude"),
		deliveryInstructions: text("delivery_instructions").notNull().default(""),
	},
	(table) => addressChecks(table, "order_address"),
);

export const orderStatusHistory = sqliteTable(
	"order_status_history",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => commerceOrder.id, { onDelete: "cascade" }),
		fromStatus: text("from_status", { enum: orderStatusValues }),
		toStatus: text("to_status", { enum: orderStatusValues }).notNull(),
		reason: text("reason"),
		actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
		metadata: text("metadata"),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("orderStatusHistoryOrderCreatedIdx").on(table.orderId, table.createdAt, table.id),
		check("order_status_history_to_status_check", sql`${table.toStatus} in ('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')`),
		check("order_status_history_from_status_check", sql`${table.fromStatus} is null or ${table.fromStatus} in ('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')`),
		check("order_status_history_change_check", sql`${table.fromStatus} is null or ${table.fromStatus} <> ${table.toStatus}`),
	],
);

export const checkoutIdempotency = sqliteTable(
	"checkout_idempotency",
	{
		id: text("id").primaryKey(),
		ownerKey: text("owner_key").notNull(),
		idempotencyKey: text("idempotency_key").notNull(),
		requestHash: text("request_hash").notNull(),
		orderId: text("order_id")
			.notNull()
			.references(() => commerceOrder.id, { onDelete: "restrict" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("checkoutIdempotencyOwnerKeyUnique").on(table.ownerKey, table.idempotencyKey),
		uniqueIndex("checkoutIdempotencyOrderUnique").on(table.orderId),
		check("checkout_idempotency_owner_key_check", sql`(${table.ownerKey} glob 'user:*' or ${table.ownerKey} glob 'guest:*') and length(${table.ownerKey}) > 6`),
		check("checkout_idempotency_key_check", sql`length(${table.idempotencyKey}) between 8 and 128`),
		check("checkout_idempotency_request_hash_check", sql`length(${table.requestHash}) = 64 and ${table.requestHash} not glob '*[^0-9a-f]*'`),
	],
);

export const deliveryProof = sqliteTable(
	"delivery_proof",
	{
		orderId: text("order_id").primaryKey().references(() => commerceOrder.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull(),
		pinHash: text("pin_hash").notNull(),
		tokenEnc: text("token_enc").notNull(),
		pinEnc: text("pin_enc").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
		consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		check("delivery_proof_token_hash_check", sql`length(${table.tokenHash}) = 64 and ${table.tokenHash} not glob '*[^0-9a-f]*'`),
		check("delivery_proof_pin_hash_check", sql`length(${table.pinHash}) = 64 and ${table.pinHash} not glob '*[^0-9a-f]*'`),
		check("delivery_proof_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
	],
);
