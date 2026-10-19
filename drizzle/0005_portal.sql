CREATE TABLE `portal_access` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`email` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_access_contact_uidx` ON `portal_access` (`contact_id`);--> statement-breakpoint
CREATE INDEX `portal_access_workspace_idx` ON `portal_access` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `portal_links` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`access_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`access_id`) REFERENCES `portal_access`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_links_access_idx` ON `portal_links` (`access_id`);--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`access_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`access_id`) REFERENCES `portal_access`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portal_sessions_access_idx` ON `portal_sessions` (`access_id`);--> statement-breakpoint
ALTER TABLE `activities` ADD `shared_to_portal` integer DEFAULT false NOT NULL;