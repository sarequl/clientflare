CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text,
	`meta` text,
	`user_id` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activities_target_idx` ON `activities` (`target_type`,`target_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`website` text,
	`phone` text,
	`address` text,
	`notes` text,
	`owner_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `companies_workspace_name_idx` ON `companies` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`company_id` text,
	`first_name` text NOT NULL,
	`last_name` text,
	`email` text,
	`phone` text,
	`job_title` text,
	`notes` text,
	`owner_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `contacts_workspace_name_idx` ON `contacts` (`workspace_id`,`last_name`,`first_name`);--> statement-breakpoint
CREATE INDEX `contacts_workspace_email_idx` ON `contacts` (`workspace_id`,`email`);--> statement-breakpoint
CREATE INDEX `contacts_company_idx` ON `contacts` (`company_id`);--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`record_type` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`options` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_fields_workspace_type_name_uidx` ON `custom_fields` (`workspace_id`,`record_type`,`name`);--> statement-breakpoint
CREATE TABLE `field_values` (
	`field_id` text NOT NULL,
	`record_id` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`field_id`, `record_id`),
	FOREIGN KEY (`field_id`) REFERENCES `custom_fields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `field_values_record_idx` ON `field_values` (`record_id`);--> statement-breakpoint
CREATE TABLE `taggings` (
	`tag_id` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	PRIMARY KEY(`tag_id`, `record_type`, `record_id`),
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `taggings_record_idx` ON `taggings` (`record_type`,`record_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'gray' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_workspace_name_uidx` ON `tags` (`workspace_id`,`name`);