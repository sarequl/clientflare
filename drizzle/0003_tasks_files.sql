CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`uploaded_by_user_id` text,
	`shared_to_portal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `files_record_idx` ON `files` (`record_type`,`record_id`);--> statement-breakpoint
CREATE INDEX `files_workspace_idx` ON `files` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `task_digests` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`sent_on` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`, `sent_on`),
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_on` text,
	`assignee_user_id` text,
	`contact_id` text,
	`company_id` text,
	`deal_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` integer,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_workspace_status_due_idx` ON `tasks` (`workspace_id`,`status`,`due_on`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_contact_idx` ON `tasks` (`contact_id`);--> statement-breakpoint
CREATE INDEX `tasks_deal_idx` ON `tasks` (`deal_id`);