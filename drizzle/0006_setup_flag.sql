ALTER TABLE `workspace_settings` ADD `setup_completed_at` integer;--> statement-breakpoint
UPDATE `workspace_settings` SET `setup_completed_at` = `updated_at` WHERE `setup_completed_at` IS NULL;