CREATE TABLE `varsity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`game_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`command_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`input` text NOT NULL,
	`accepted_at` text NOT NULL,
	`actor` text NOT NULL,
	`result_status` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `varsity_games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `varsity_event_sequence` ON `varsity_events` (`game_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `varsity_event_command` ON `varsity_events` (`game_id`,`command_id`);--> statement-breakpoint
CREATE TABLE `varsity_games` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`creation_id` text NOT NULL,
	`creation_hash` text NOT NULL,
	`opponent` text NOT NULL,
	`tracked_side` text NOT NULL,
	`scheduled_at` text,
	`venue` text NOT NULL,
	`source_url` text NOT NULL,
	`practice` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`state` text NOT NULL,
	`last_command` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `varsity_workspace`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "varsity_game_revision" CHECK("varsity_games"."revision" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `varsity_game_creation` ON `varsity_games` (`workspace_id`,`creation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `varsity_game_scope` ON `varsity_games` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `varsity_lines` (
	`workspace_id` text NOT NULL,
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`name` text NOT NULL,
	`jersey` text NOT NULL,
	`tracked` integer NOT NULL,
	`appeared` integer NOT NULL,
	`points` integer NOT NULL,
	`ones` integer NOT NULL,
	`twos` integer NOT NULL,
	`threes` integer NOT NULL,
	`fouls` integer NOT NULL,
	`milliseconds` integer NOT NULL,
	`minutes_quality` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `game_id`, `player_id`),
	FOREIGN KEY (`game_id`) REFERENCES `varsity_games`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "varsity_line_points" CHECK("varsity_lines"."points" = "varsity_lines"."ones" + 2 * "varsity_lines"."twos" + 3 * "varsity_lines"."threes"),
	CONSTRAINT "varsity_line_nonnegative" CHECK("varsity_lines"."ones" >= 0 AND "varsity_lines"."twos" >= 0 AND "varsity_lines"."threes" >= 0 AND "varsity_lines"."fouls" >= 0 AND "varsity_lines"."milliseconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE `varsity_roster_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor` text NOT NULL,
	`accepted_at` text NOT NULL,
	`player_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `varsity_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`roster_revision` integer DEFAULT 0 NOT NULL,
	`roster` text DEFAULT '[]' NOT NULL,
	`last_command` text
);
