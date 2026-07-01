CREATE TABLE `chat` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '新的聊天' NOT NULL,
	`agent_id` text,
	`provider_id` text,
	`model_id` text,
	`is_temp` integer DEFAULT 0 NOT NULL,
	`parent_chat_id` text,
	`sub_task` text,
	`tool_features_enabled` integer DEFAULT 1 NOT NULL,
	`compressed_context` text,
	`selected_mcp_resources` text,
	`is_collected` integer DEFAULT 0 NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`last_message_at` integer,
	`last_message_preview` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_updated_at` ON `chat` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_parent` ON `chat` (`parent_chat_id`);--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`seq` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chat`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_message_chat_seq` ON `message` (`chat_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_message_chat_seq` ON `message` (`chat_id`,`seq`);--> statement-breakpoint
CREATE TABLE `part` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`type` text NOT NULL,
	`idx` integer NOT NULL,
	`content` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_part_message_idx` ON `part` (`message_id`,`idx`);--> statement-breakpoint
CREATE INDEX `idx_part_message_idx` ON `part` (`message_id`,`idx`);