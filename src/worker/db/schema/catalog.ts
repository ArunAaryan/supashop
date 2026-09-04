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

import { user } from "./auth";
import { commerceOrder } from "./orders";
import { inventoryMovementTypeValues } from "../../../shared/domain/order";

export const weightUnitValues = ["g", "kg", "ml", "l"] as const;
export const discountTypeValues = ["none", "fixed", "percentage"] as const;
export { inventoryMovementTypeValues };

export const category = sqliteTable(
	"category",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description"),
		active: integer("active", { mode: "boolean" }).default(true).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("categoryNameUnique").on(table.name),
		uniqueIndex("categorySlugUnique").on(table.slug),
	],
);

export const tag = sqliteTable(
	"tag",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		active: integer("active", { mode: "boolean" }).default(true).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("tagNameUnique").on(table.name),
		uniqueIndex("tagSlugUnique").on(table.slug),
	],
);

export const product = sqliteTable(
	"product",
	{
		id: text("id").primaryKey(),
		code: text("code").notNull(),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		description: text("description").notNull(),
		baseWeightValue: integer("base_weight_value"),
		baseWeightUnit: text("base_weight_unit", { enum: weightUnitValues }),
		categoryId: text("category_id")
			.notNull()
			.references(() => category.id, { onDelete: "restrict" }),
		active: integer("active", { mode: "boolean" }).default(true).notNull(),
		version: integer("version").default(1).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("productCodeUnique").on(table.code),
		uniqueIndex("productSlugUnique").on(table.slug),
		index("productCategoryActiveIdx").on(table.categoryId, table.active),
		check(
			"product_base_weight_pair_check",
			sql`(${table.baseWeightValue} is null and ${table.baseWeightUnit} is null) or (${table.baseWeightValue} is not null and ${table.baseWeightUnit} is not null)`,
		),
		check("product_base_weight_value_check", sql`${table.baseWeightValue} is null or ${table.baseWeightValue} > 0`),
		check(
			"product_base_weight_unit_check",
			sql`${table.baseWeightUnit} is null or ${table.baseWeightUnit} in ('g', 'kg', 'ml', 'l')`,
		),
		check("product_version_check", sql`${table.version} != 0`),
	],
);

export const productTag = sqliteTable(
	"product_tag",
	{
		productId: text("product_id")
			.notNull()
			.references(() => product.id, { onDelete: "restrict" }),
		tagId: text("tag_id")
			.notNull()
			.references(() => tag.id, { onDelete: "restrict" }),
	},
	(table) => [
		primaryKey({ columns: [table.productId, table.tagId] }),
		index("productTagTagIdx").on(table.tagId),
	],
);

export const productImage = sqliteTable(
	"product_image",
	{
		id: text("id").primaryKey(),
		productId: text("product_id")
			.notNull()
			.references(() => product.id, { onDelete: "restrict" }),
		objectKey: text("object_key").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: integer("byte_size").notNull(),
		altText: text("alt_text").notNull(),
		displayOrder: integer("display_order").notNull(),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("productImageObjectKeyUnique").on(table.objectKey),
		uniqueIndex("productImageProductOrderUnique").on(table.productId, table.displayOrder),
		check("product_image_byte_size_check", sql`${table.byteSize} > 0`),
		check(
			"product_image_mime_type_check",
			sql`${table.mimeType} in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')`,
		),
	],
);

export const offering = sqliteTable(
	"offering",
	{
		id: text("id").primaryKey(),
		productId: text("product_id")
			.notNull()
			.references(() => product.id, { onDelete: "restrict" }),
		sku: text("sku").notNull(),
		label: text("label").notNull(),
		packQuantity: integer("pack_quantity"),
		weightValue: integer("weight_value"),
		weightUnit: text("weight_unit", { enum: weightUnitValues }),
		listPriceMinor: integer("list_price_minor").notNull(),
		discountType: text("discount_type", { enum: discountTypeValues }).notNull(),
		discountValue: integer("discount_value").notNull(),
		stockQuantity: integer("stock_quantity").default(0).notNull(),
		lowStockThreshold: integer("low_stock_threshold").default(0).notNull(),
		active: integer("active", { mode: "boolean" }).default(true).notNull(),
		version: integer("version").default(1).notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		uniqueIndex("offeringSkuUnique").on(table.sku),
		index("offeringProductActiveIdx").on(table.productId, table.active),
		check("offering_pack_quantity_check", sql`${table.packQuantity} is null or ${table.packQuantity} > 0`),
		check(
			"offering_weight_pair_check",
			sql`(${table.weightValue} is null and ${table.weightUnit} is null) or (${table.weightValue} is not null and ${table.weightUnit} is not null)`,
		),
		check("offering_weight_value_check", sql`${table.weightValue} is null or ${table.weightValue} > 0`),
		check(
			"offering_weight_unit_check",
			sql`${table.weightUnit} is null or ${table.weightUnit} in ('g', 'kg', 'ml', 'l')`,
		),
		check(
			"offering_pack_details_check",
			sql`${table.packQuantity} is not null or ${table.weightValue} is not null`,
		),
		check("offering_list_price_check", sql`${table.listPriceMinor} > 0`),
		check(
			"offering_discount_type_check",
			sql`${table.discountType} in ('none', 'fixed', 'percentage')`,
		),
		check(
			"offering_discount_value_check",
			sql`(${table.discountType} = 'none' and ${table.discountValue} = 0) or (${table.discountType} = 'fixed' and ${table.discountValue} >= 0 and ${table.discountValue} < ${table.listPriceMinor}) or (${table.discountType} = 'percentage' and ${table.discountValue} between 1 and 10000)`,
		),
		check("offering_stock_quantity_check", sql`${table.stockQuantity} >= 0`),
		check("offering_low_stock_threshold_check", sql`${table.lowStockThreshold} >= 0`),
		check("offering_version_check", sql`${table.version} > 0`),
	],
);

export const inventoryMovement = sqliteTable(
	"inventory_movement",
	{
		id: text("id").primaryKey(),
		offeringId: text("offering_id")
			.notNull()
			.references(() => offering.id, { onDelete: "restrict" }),
		previousQuantity: integer("previous_quantity").notNull(),
		quantityDelta: integer("quantity_delta").notNull(),
		resultingQuantity: integer("resulting_quantity").notNull(),
		reason: text("reason").notNull(),
		movementType: text("movement_type", { enum: inventoryMovementTypeValues }).notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
		orderId: text("order_id").references(() => commerceOrder.id, { onDelete: "restrict" }),
		offeringVersion: integer("offering_version").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		index("inventoryMovementOfferingCreatedIdx").on(table.offeringId, table.createdAt),
		index("inventoryMovementActorCreatedIdx").on(table.actorUserId, table.createdAt),
		index("inventoryMovementOrderCreatedIdx").on(table.orderId, table.createdAt),
		uniqueIndex("inventoryMovementOrderOfferingTypeUnique")
			.on(table.orderId, table.offeringId, table.movementType)
			.where(sql`${table.orderId} is not null`),
		check("inventory_movement_previous_quantity_check", sql`${table.previousQuantity} >= 0`),
		check("inventory_movement_resulting_quantity_check", sql`${table.resultingQuantity} >= 0`),
		check("inventory_movement_quantity_delta_check", sql`${table.quantityDelta} != 0`),
		check(
			"inventory_movement_balance_check",
			sql`${table.previousQuantity} + ${table.quantityDelta} = ${table.resultingQuantity}`,
		),
		check(
			"inventory_movement_type_check",
			sql`${table.movementType} in ('manual_adjustment', 'checkout_deduction', 'cancellation_restoration')`,
		),
		check("inventory_movement_offering_version_check", sql`${table.offeringVersion} > 0`),
	],
);
