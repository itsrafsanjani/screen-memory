CREATE TABLE `app_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bundle_id` text NOT NULL,
	`app_name` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_app_usage_started` ON `app_usage` (`started_at`);