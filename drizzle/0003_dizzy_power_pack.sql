CREATE TABLE `order_item` (
	`order_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_code` text NOT NULL,
	`product_name` text NOT NULL,
	`offering_sku` text NOT NULL,
	`offering_label` text NOT NULL,
	`pack_quantity` integer,
	`weight_value` integer,
	`weight_unit` text,
	`list_price_minor` integer NOT NULL,
	`discount_type` text NOT NULL,
	`discount_value` integer NOT NULL,
	`effective_unit_price_minor` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`order_id`, `offering_id`),
	FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `offering`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_item_pack_quantity_check" CHECK("order_item"."pack_quantity" is null or "order_item"."pack_quantity" > 0),
	CONSTRAINT "order_item_weight_pair_check" CHECK(("order_item"."weight_value" is null and "order_item"."weight_unit" is null) or ("order_item"."weight_value" is not null and "order_item"."weight_unit" is not null)),
	CONSTRAINT "order_item_weight_value_check" CHECK("order_item"."weight_value" is null or "order_item"."weight_value" > 0),
	CONSTRAINT "order_item_weight_unit_check" CHECK("order_item"."weight_unit" is null or "order_item"."weight_unit" in ('g', 'kg', 'ml', 'l')),
	CONSTRAINT "order_item_pack_details_check" CHECK("order_item"."pack_quantity" is not null or "order_item"."weight_value" is not null),
	CONSTRAINT "order_item_list_price_check" CHECK("order_item"."list_price_minor" > 0),
	CONSTRAINT "order_item_discount_type_check" CHECK("order_item"."discount_type" in ('none', 'fixed', 'percentage')),
	CONSTRAINT "order_item_discount_value_check" CHECK(("order_item"."discount_type" = 'none' and "order_item"."discount_value" = 0) or ("order_item"."discount_type" = 'fixed' and "order_item"."discount_value" >= 0 and "order_item"."discount_value" < "order_item"."list_price_minor") or ("order_item"."discount_type" = 'percentage' and "order_item"."discount_value" between 1 and 10000)),
	CONSTRAINT "order_item_effective_price_check" CHECK("order_item"."effective_unit_price_minor" = CASE "order_item"."discount_type" WHEN 'fixed' THEN "order_item"."list_price_minor" - "order_item"."discount_value" WHEN 'percentage' THEN "order_item"."list_price_minor" - CAST("order_item"."list_price_minor" * "order_item"."discount_value" / 10000 AS INTEGER) ELSE "order_item"."list_price_minor" END),
	CONSTRAINT "order_item_quantity_check" CHECK("order_item"."quantity" between 1 and 99),
	CONSTRAINT "order_item_line_total_check" CHECK("order_item"."line_total_minor" = "order_item"."effective_unit_price_minor" * "order_item"."quantity")
);
--> statement-breakpoint
CREATE INDEX `orderItemOfferingCreatedIdx` ON `order_item` (`offering_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orderItemProductCreatedIdx` ON `order_item` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `checkout_idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`order_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "checkout_idempotency_owner_key_check" CHECK(("checkout_idempotency"."owner_key" glob 'user:*' or "checkout_idempotency"."owner_key" glob 'guest:*') and length("checkout_idempotency"."owner_key") > 6),
	CONSTRAINT "checkout_idempotency_key_check" CHECK(length("checkout_idempotency"."idempotency_key") between 8 and 128),
	CONSTRAINT "checkout_idempotency_request_hash_check" CHECK(length("checkout_idempotency"."request_hash") = 64 and "checkout_idempotency"."request_hash" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkoutIdempotencyOwnerKeyUnique` ON `checkout_idempotency` (`owner_key`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkoutIdempotencyOrderUnique` ON `checkout_idempotency` (`order_id`);--> statement-breakpoint
CREATE TABLE `commerce_order` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`user_id` text,
	`guest_id` text,
	`status` text NOT NULL,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`delivery_fee_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer NOT NULL,
	`placed_at` integer NOT NULL,
	`expected_delivery_at` integer,
	`cancelled_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_order_exactly_one_owner_check" CHECK(("commerce_order"."user_id" is not null and "commerce_order"."guest_id" is null) or ("commerce_order"."user_id" is null and "commerce_order"."guest_id" is not null)),
	CONSTRAINT "commerce_order_number_check" CHECK("commerce_order"."order_number" glob 'ord_[A-Za-z0-9_-]*' and length("commerce_order"."order_number") between 24 and 132),
	CONSTRAINT "commerce_order_status_check" CHECK("commerce_order"."status" in ('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')),
	CONSTRAINT "commerce_order_payment_status_check" CHECK("commerce_order"."payment_status" in ('pending', 'collected', 'exception')),
	CONSTRAINT "commerce_order_currency_check" CHECK("commerce_order"."currency" = 'INR'),
	CONSTRAINT "commerce_order_subtotal_check" CHECK("commerce_order"."subtotal_minor" >= 0),
	CONSTRAINT "commerce_order_delivery_fee_check" CHECK("commerce_order"."delivery_fee_minor" >= 0),
	CONSTRAINT "commerce_order_total_check" CHECK("commerce_order"."total_minor" = "commerce_order"."subtotal_minor" + "commerce_order"."delivery_fee_minor"),
	CONSTRAINT "commerce_order_cancelled_at_check" CHECK("commerce_order"."cancelled_at" is null or "commerce_order"."status" = 'cancelled'),
	CONSTRAINT "commerce_order_version_check" CHECK("commerce_order"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerceOrderNumberUnique` ON `commerce_order` (`order_number`);--> statement-breakpoint
CREATE INDEX `commerceOrderUserPlacedIdx` ON `commerce_order` (`user_id`,`placed_at`,`id`);--> statement-breakpoint
CREATE INDEX `commerceOrderGuestPlacedIdx` ON `commerce_order` (`guest_id`,`placed_at`,`id`);--> statement-breakpoint
CREATE INDEX `commerceOrderStatusPlacedIdx` ON `commerce_order` (`status`,`placed_at`,`id`);--> statement-breakpoint
CREATE TABLE `customer_address` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`recipient_name` text NOT NULL,
	`mobile` text NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text DEFAULT '' NOT NULL,
	`landmark` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`postal_code` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`delivery_instructions` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "customer_address_version_check" CHECK("customer_address"."version" > 0),
	CONSTRAINT "customer_address_e164_check" CHECK(length("customer_address"."mobile") between 9 and 16 and "customer_address"."mobile" glob '+[1-9]*' and "customer_address"."mobile" not glob '*[^0-9+]*' and instr(substr("customer_address"."mobile", 2), '+') = 0),
	CONSTRAINT "customer_address_latitude_range_check" CHECK("customer_address"."latitude" is null or "customer_address"."latitude" between -90 and 90),
	CONSTRAINT "customer_address_longitude_range_check" CHECK("customer_address"."longitude" is null or "customer_address"."longitude" between -180 and 180),
	CONSTRAINT "customer_address_longitude_pair_check" CHECK(("customer_address"."latitude" is null and "customer_address"."longitude" is null) or ("customer_address"."latitude" is not null and "customer_address"."longitude" is not null))
);
--> statement-breakpoint
CREATE INDEX `customerAddressUserUpdatedIdx` ON `customer_address` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customerAddressOneDefault` ON `customer_address` (`user_id`) WHERE "customer_address"."is_default" = 1;--> statement-breakpoint
CREATE TABLE `order_address` (
	`order_id` text PRIMARY KEY NOT NULL,
	`recipient_name` text NOT NULL,
	`mobile` text NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text DEFAULT '' NOT NULL,
	`landmark` text DEFAULT '' NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`postal_code` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`delivery_instructions` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_address_e164_check" CHECK(length("order_address"."mobile") between 9 and 16 and "order_address"."mobile" glob '+[1-9]*' and "order_address"."mobile" not glob '*[^0-9+]*' and instr(substr("order_address"."mobile", 2), '+') = 0),
	CONSTRAINT "order_address_latitude_range_check" CHECK("order_address"."latitude" is null or "order_address"."latitude" between -90 and 90),
	CONSTRAINT "order_address_longitude_range_check" CHECK("order_address"."longitude" is null or "order_address"."longitude" between -180 and 180),
	CONSTRAINT "order_address_longitude_pair_check" CHECK(("order_address"."latitude" is null and "order_address"."longitude" is null) or ("order_address"."latitude" is not null and "order_address"."longitude" is not null))
);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`reason` text,
	`actor_user_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_status_history_to_status_check" CHECK("order_status_history"."to_status" in ('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')),
	CONSTRAINT "order_status_history_from_status_check" CHECK("order_status_history"."from_status" is null or "order_status_history"."from_status" in ('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected')),
	CONSTRAINT "order_status_history_change_check" CHECK("order_status_history"."from_status" is null or "order_status_history"."from_status" <> "order_status_history"."to_status")
);
--> statement-breakpoint
CREATE INDEX `orderStatusHistoryOrderCreatedIdx` ON `order_status_history` (`order_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `store_closure` (
	`id` text PRIMARY KEY NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "store_closure_date_format_check" CHECK("store_closure"."starts_on" glob '????-??-??' and "store_closure"."ends_on" glob '????-??-??'),
	CONSTRAINT "store_closure_date_range_check" CHECK("store_closure"."starts_on" <= "store_closure"."ends_on")
);
--> statement-breakpoint
CREATE INDEX `storeClosureDateRangeIdx` ON `store_closure` (`starts_on`,`ends_on`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inventory_movement` (
	`id` text PRIMARY KEY NOT NULL,
	`offering_id` text NOT NULL,
	`previous_quantity` integer NOT NULL,
	`quantity_delta` integer NOT NULL,
	`resulting_quantity` integer NOT NULL,
	`reason` text NOT NULL,
	`movement_type` text NOT NULL,
	`actor_user_id` text,
	`order_id` text,
	`offering_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`offering_id`) REFERENCES `offering`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_movement_previous_quantity_check" CHECK("__new_inventory_movement"."previous_quantity" >= 0),
	CONSTRAINT "inventory_movement_resulting_quantity_check" CHECK("__new_inventory_movement"."resulting_quantity" >= 0),
	CONSTRAINT "inventory_movement_quantity_delta_check" CHECK("__new_inventory_movement"."quantity_delta" != 0),
	CONSTRAINT "inventory_movement_balance_check" CHECK("__new_inventory_movement"."previous_quantity" + "__new_inventory_movement"."quantity_delta" = "__new_inventory_movement"."resulting_quantity"),
	CONSTRAINT "inventory_movement_type_check" CHECK("__new_inventory_movement"."movement_type" in ('manual_adjustment', 'checkout_deduction', 'cancellation_restoration')),
	CONSTRAINT "inventory_movement_offering_version_check" CHECK("__new_inventory_movement"."offering_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_inventory_movement`("id", "offering_id", "previous_quantity", "quantity_delta", "resulting_quantity", "reason", "movement_type", "actor_user_id", "order_id", "offering_version", "created_at") SELECT "id", "offering_id", "previous_quantity", "quantity_delta", "resulting_quantity", "reason", "movement_type", "actor_user_id", NULL, "offering_version", "created_at" FROM `inventory_movement`;--> statement-breakpoint
DROP TABLE `inventory_movement`;--> statement-breakpoint
ALTER TABLE `__new_inventory_movement` RENAME TO `inventory_movement`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `inventoryMovementOfferingCreatedIdx` ON `inventory_movement` (`offering_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `inventoryMovementActorCreatedIdx` ON `inventory_movement` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `inventoryMovementOrderCreatedIdx` ON `inventory_movement` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventoryMovementOrderOfferingTypeUnique` ON `inventory_movement` (`order_id`,`offering_id`,`movement_type`) WHERE "inventory_movement"."order_id" is not null;
