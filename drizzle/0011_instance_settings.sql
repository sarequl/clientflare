CREATE TABLE `instance_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`open_signup` integer DEFAULT true NOT NULL,
	`members_create_workspaces` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
