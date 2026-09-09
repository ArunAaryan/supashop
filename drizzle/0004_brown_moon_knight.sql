CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `auditLogActorCreatedIdx` ON `audit_log` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `auditLogEntityCreatedIdx` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `delivery_proof` (
	`order_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`pin_hash` text NOT NULL,
	`token_enc` text NOT NULL,
	`pin_enc` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_order`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "delivery_proof_token_hash_check" CHECK(length("delivery_proof"."token_hash") = 64 and "delivery_proof"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "delivery_proof_pin_hash_check" CHECK(length("delivery_proof"."pin_hash") = 64 and "delivery_proof"."pin_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "delivery_proof_expiry_check" CHECK("delivery_proof"."expires_at" > "delivery_proof"."created_at")
);
