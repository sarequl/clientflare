ALTER TABLE `invoices` ADD `emailed_at` integer;--> statement-breakpoint
ALTER TABLE `invoices` ADD `emailed_to` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `email_count` integer DEFAULT 0 NOT NULL;