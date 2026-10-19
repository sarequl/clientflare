CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`pipeline_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`title` text NOT NULL,
	`value_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`expected_close_on` text,
	`contact_id` text,
	`company_id` text,
	`owner_user_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`lost_reason` text,
	`closed_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pipeline_id`) REFERENCES `pipelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deals_workspace_status_idx` ON `deals` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `deals_stage_idx` ON `deals` (`stage_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `deals_contact_idx` ON `deals` (`contact_id`);--> statement-breakpoint
CREATE INDEX `deals_company_idx` ON `deals` (`company_id`);--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pipelines_workspace_idx` ON `pipelines` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`pipeline_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'open' NOT NULL,
	`probability` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT 'gray' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pipeline_id`) REFERENCES `pipelines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stages_pipeline_idx` ON `stages` (`pipeline_id`,`sort_order`);