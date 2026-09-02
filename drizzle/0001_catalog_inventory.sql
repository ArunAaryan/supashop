CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categoryNameUnique` ON `category` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categorySlugUnique` ON `category` (`slug`);--> statement-breakpoint
CREATE TABLE `inventory_movement` (
	`id` text PRIMARY KEY NOT NULL,
	`offering_id` text NOT NULL,
	`previous_quantity` integer NOT NULL,
	`quantity_delta` integer NOT NULL,
	`resulting_quantity` integer NOT NULL,
	`reason` text NOT NULL,
	`movement_type` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`offering_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`offering_id`) REFERENCES `offering`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_movement_previous_quantity_check" CHECK("inventory_movement"."previous_quantity" >= 0),
	CONSTRAINT "inventory_movement_resulting_quantity_check" CHECK("inventory_movement"."resulting_quantity" >= 0),
	CONSTRAINT "inventory_movement_quantity_delta_check" CHECK("inventory_movement"."quantity_delta" != 0),
	CONSTRAINT "inventory_movement_balance_check" CHECK("inventory_movement"."previous_quantity" + "inventory_movement"."quantity_delta" = "inventory_movement"."resulting_quantity"),
	CONSTRAINT "inventory_movement_type_check" CHECK("inventory_movement"."movement_type" in ('manual_adjustment')),
	CONSTRAINT "inventory_movement_offering_version_check" CHECK("inventory_movement"."offering_version" > 0)
);
--> statement-breakpoint
CREATE INDEX `inventoryMovementOfferingCreatedIdx` ON `inventory_movement` (`offering_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `inventoryMovementActorCreatedIdx` ON `inventory_movement` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `offering` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`label` text NOT NULL,
	`pack_quantity` integer,
	`weight_value` integer,
	`weight_unit` text,
	`list_price_minor` integer NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "offering_pack_quantity_check" CHECK("offering"."pack_quantity" is null or "offering"."pack_quantity" > 0),
	CONSTRAINT "offering_weight_pair_check" CHECK(("offering"."weight_value" is null and "offering"."weight_unit" is null) or ("offering"."weight_value" is not null and "offering"."weight_unit" is not null)),
	CONSTRAINT "offering_weight_value_check" CHECK("offering"."weight_value" is null or "offering"."weight_value" > 0),
	CONSTRAINT "offering_weight_unit_check" CHECK("offering"."weight_unit" is null or "offering"."weight_unit" in ('g', 'kg', 'ml', 'l')),
	CONSTRAINT "offering_pack_details_check" CHECK("offering"."pack_quantity" is not null or "offering"."weight_value" is not null),
	CONSTRAINT "offering_list_price_check" CHECK("offering"."list_price_minor" > 0),
	CONSTRAINT "offering_discount_type_check" CHECK("offering"."discount_type" in ('none', 'fixed', 'percentage')),
	CONSTRAINT "offering_discount_value_check" CHECK(("offering"."discount_type" = 'none' and "offering"."discount_value" = 0) or ("offering"."discount_type" = 'fixed' and "offering"."discount_value" >= 0 and "offering"."discount_value" < "offering"."list_price_minor") or ("offering"."discount_type" = 'percentage' and "offering"."discount_value" between 1 and 10000)),
	CONSTRAINT "offering_stock_quantity_check" CHECK("offering"."stock_quantity" >= 0),
	CONSTRAINT "offering_low_stock_threshold_check" CHECK("offering"."low_stock_threshold" >= 0),
	CONSTRAINT "offering_version_check" CHECK("offering"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offeringSkuUnique` ON `offering` (`sku`);--> statement-breakpoint
CREATE INDEX `offeringProductActiveIdx` ON `offering` (`product_id`,`active`);--> statement-breakpoint
CREATE TABLE `product` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`base_weight_value` integer,
	`base_weight_unit` text,
	`category_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_base_weight_pair_check" CHECK(("product"."base_weight_value" is null and "product"."base_weight_unit" is null) or ("product"."base_weight_value" is not null and "product"."base_weight_unit" is not null)),
	CONSTRAINT "product_base_weight_value_check" CHECK("product"."base_weight_value" is null or "product"."base_weight_value" > 0),
	CONSTRAINT "product_base_weight_unit_check" CHECK("product"."base_weight_unit" is null or "product"."base_weight_unit" in ('g', 'kg', 'ml', 'l')),
	CONSTRAINT "product_version_check" CHECK("product"."version" != 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productCodeUnique` ON `product` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `productSlugUnique` ON `product` (`slug`);--> statement-breakpoint
CREATE INDEX `productCategoryActiveIdx` ON `product` (`category_id`,`active`);--> statement-breakpoint
CREATE TABLE `product_image` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`alt_text` text NOT NULL,
	`display_order` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "product_image_byte_size_check" CHECK("product_image"."byte_size" > 0),
	CONSTRAINT "product_image_mime_type_check" CHECK("product_image"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productImageObjectKeyUnique` ON `product_image` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `productImageProductOrderUnique` ON `product_image` (`product_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `product_tag` (
	`product_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `tag_id`),
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `productTagTagIdx` ON `product_tag` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tagNameUnique` ON `tag` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tagSlugUnique` ON `tag` (`slug`);