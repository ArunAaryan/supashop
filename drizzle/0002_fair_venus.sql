CREATE TABLE `cart` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`guest_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cart_exactly_one_owner_check" CHECK(("cart"."user_id" is not null and "cart"."guest_id" is null) or ("cart"."user_id" is null and "cart"."guest_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cartUserUnique` ON `cart` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cartGuestUnique` ON `cart` (`guest_id`);--> statement-breakpoint
CREATE TABLE `cart_item` (
	`cart_id` text NOT NULL,
	`offering_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`effective_price_minor_at_add` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`cart_id`, `offering_id`),
	FOREIGN KEY (`cart_id`) REFERENCES `cart`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`offering_id`) REFERENCES `offering`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cart_item_quantity_check" CHECK("cart_item"."quantity" between 1 and 99),
	CONSTRAINT "cart_item_effective_price_at_add_check" CHECK("cart_item"."effective_price_minor_at_add" >= 0),
	CONSTRAINT "cart_item_version_check" CHECK("cart_item"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `cartItemOfferingIdx` ON `cart_item` (`offering_id`);
