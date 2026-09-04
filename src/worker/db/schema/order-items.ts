import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { offering, product } from "./catalog";
import { commerceOrder } from "./orders";

export const orderItem = sqliteTable(
	"order_item",
	{
		orderId: text("order_id")
			.notNull()
			.references(() => commerceOrder.id, { onDelete: "cascade" }),
		offeringId: text("offering_id")
			.notNull()
			.references(() => offering.id, { onDelete: "restrict" }),
		productId: text("product_id")
			.notNull()
			.references(() => product.id, { onDelete: "restrict" }),
		productCode: text("product_code").notNull(),
		productName: text("product_name").notNull(),
		offeringSku: text("offering_sku").notNull(),
		offeringLabel: text("offering_label").notNull(),
		packQuantity: integer("pack_quantity"),
		weightValue: integer("weight_value"),
		weightUnit: text("weight_unit", { enum: ["g", "kg", "ml", "l"] as const }),
		listPriceMinor: integer("list_price_minor").notNull(),
		discountType: text("discount_type", { enum: ["none", "fixed", "percentage"] as const }).notNull(),
		discountValue: integer("discount_value").notNull(),
		effectiveUnitPriceMinor: integer("effective_unit_price_minor").notNull(),
		quantity: integer("quantity").notNull(),
		lineTotalMinor: integer("line_total_minor").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.orderId, table.offeringId] }),
		index("orderItemOfferingCreatedIdx").on(table.offeringId, table.createdAt),
		index("orderItemProductCreatedIdx").on(table.productId, table.createdAt),
		check("order_item_pack_quantity_check", sql`${table.packQuantity} is null or ${table.packQuantity} > 0`),
		check("order_item_weight_pair_check", sql`(${table.weightValue} is null and ${table.weightUnit} is null) or (${table.weightValue} is not null and ${table.weightUnit} is not null)`),
		check("order_item_weight_value_check", sql`${table.weightValue} is null or ${table.weightValue} > 0`),
		check("order_item_weight_unit_check", sql`${table.weightUnit} is null or ${table.weightUnit} in ('g', 'kg', 'ml', 'l')`),
		check("order_item_pack_details_check", sql`${table.packQuantity} is not null or ${table.weightValue} is not null`),
		check("order_item_list_price_check", sql`${table.listPriceMinor} > 0`),
		check("order_item_discount_type_check", sql`${table.discountType} in ('none', 'fixed', 'percentage')`),
		check("order_item_discount_value_check", sql`(${table.discountType} = 'none' and ${table.discountValue} = 0) or (${table.discountType} = 'fixed' and ${table.discountValue} >= 0 and ${table.discountValue} < ${table.listPriceMinor}) or (${table.discountType} = 'percentage' and ${table.discountValue} between 1 and 10000)`),
		check("order_item_effective_price_check", sql`${table.effectiveUnitPriceMinor} = CASE ${table.discountType} WHEN 'fixed' THEN ${table.listPriceMinor} - ${table.discountValue} WHEN 'percentage' THEN ${table.listPriceMinor} - CAST(${table.listPriceMinor} * ${table.discountValue} / 10000 AS INTEGER) ELSE ${table.listPriceMinor} END`),
		check("order_item_quantity_check", sql`${table.quantity} between 1 and 99`),
		check("order_item_line_total_check", sql`${table.lineTotalMinor} = ${table.effectiveUnitPriceMinor} * ${table.quantity}`),
	],
);
