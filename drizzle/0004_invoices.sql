CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity_milli` integer DEFAULT 1000 NOT NULL,
	`unit_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice_idx` ON `invoice_lines` (`invoice_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`number` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`contact_id` text,
	`company_id` text,
	`deal_id` text,
	`bill_to` text DEFAULT '' NOT NULL,
	`currency` text NOT NULL,
	`issued_on` text NOT NULL,
	`due_on` text,
	`tax_rate_bp` integer DEFAULT 0 NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`footer` text,
	`public_token` text NOT NULL,
	`sent_at` integer,
	`paid_on` text,
	`paid_at` integer,
	`income_id` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`income_id`) REFERENCES `incomes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `invoices_workspace_status_idx` ON `invoices` (`workspace_id`,`status`,`due_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_public_token_uidx` ON `invoices` (`public_token`);--> statement-breakpoint
CREATE INDEX `invoices_contact_idx` ON `invoices` (`contact_id`);--> statement-breakpoint
CREATE INDEX `invoices_company_idx` ON `invoices` (`company_id`);--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `business_name` text;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `business_address` text;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `business_email` text;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `tax_id` text;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `invoice_prefix` text DEFAULT 'INV-' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `next_invoice_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `default_tax_rate_bp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `default_payment_terms_days` integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_settings` ADD `invoice_footer` text;