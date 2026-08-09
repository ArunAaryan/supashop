CREATE TABLE `cms_role` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`granted_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "cms_role_role_check" CHECK("cms_role"."role" in ('owner', 'admin', 'operations', 'delivery'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cms_role_user_unique` ON `cms_role` (`user_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_account_unique` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_user_token_unique` ON `session` (`user_id`,`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_identifier_value_unique` ON `verification` (`identifier`,`value`);--> statement-breakpoint
CREATE TABLE `serviceable_postal_code` (
	`postal_code` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`weekday` integer NOT NULL,
	`opens_minute` integer NOT NULL,
	`closes_minute` integer NOT NULL,
	`closed` integer DEFAULT false NOT NULL,
	CONSTRAINT "store_hours_weekday_check" CHECK("store_hours"."weekday" between 0 and 6),
	CONSTRAINT "store_hours_opens_minute_check" CHECK("store_hours"."opens_minute" between 0 and 1439),
	CONSTRAINT "store_hours_closes_minute_check" CHECK("store_hours"."closes_minute" between 0 and 1439),
	CONSTRAINT "store_hours_open_order_check" CHECK("store_hours"."closed" = 1 or "store_hours"."opens_minute" < "store_hours"."closes_minute")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `store_hours_weekday_unique` ON `store_hours` (`weekday`);--> statement-breakpoint
CREATE TABLE `store_profile` (
	`singleton_key` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`owner_user_id` text,
	`contact_name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address_line_1` text DEFAULT '' NOT NULL,
	`address_line_2` text DEFAULT '' NOT NULL,
	`landmark` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`directions_url` text DEFAULT '' NOT NULL,
	`delivery_instructions` text DEFAULT '' NOT NULL,
	`latitude` real,
	`longitude` real,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`order_cutoff_minutes` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "store_profile_singleton_key_check" CHECK("store_profile"."singleton_key" = 1)
);
