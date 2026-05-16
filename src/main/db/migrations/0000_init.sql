CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `git_commits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo_path` text NOT NULL,
	`repo_name` text NOT NULL,
	`commit_hash` text NOT NULL,
	`timestamp` integer NOT NULL,
	`author_name` text,
	`author_email` text,
	`message` text NOT NULL,
	`files_changed` integer DEFAULT 0 NOT NULL,
	`insertions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_commits_commit_hash_unique` ON `git_commits` (`commit_hash`);--> statement-breakpoint
CREATE INDEX `idx_git_commits_timestamp` ON `git_commits` (`timestamp`);--> statement-breakpoint
CREATE TABLE `git_repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`is_excluded` integer DEFAULT 0 NOT NULL,
	`last_scanned` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `git_repos_path_unique` ON `git_repos` (`path`);--> statement-breakpoint
CREATE TABLE `ocr_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`screenshot_id` integer,
	`timestamp` integer NOT NULL,
	`display_id` text NOT NULL,
	`is_idle` integer DEFAULT 0 NOT NULL,
	`text` text NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ocr_screenshot` ON `ocr_results` (`screenshot_id`);--> statement-breakpoint
CREATE INDEX `idx_ocr_timestamp` ON `ocr_results` (`timestamp`);--> statement-breakpoint
CREATE TABLE `screenshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`display_id` text NOT NULL,
	`file_path` text NOT NULL,
	`width` integer,
	`height` integer,
	`file_size` integer,
	`is_idle` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_screenshots_timestamp` ON `screenshots` (`timestamp`);