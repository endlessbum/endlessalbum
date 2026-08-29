CREATE TABLE "comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"name" text NOT NULL,
	"value" integer DEFAULT 0,
	"target_date" timestamp,
	"is_visible" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "couples" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"main_admin_id" varchar NOT NULL,
	"co_admin_id" varchar,
	"invite_code" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "couples_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"type" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb,
	"current_player" varchar,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"title" text,
	"content" text,
	"type" text NOT NULL,
	"media_url" text,
	"thumbnail_url" text,
	"visibility" jsonb DEFAULT '{}'::jsonb,
	"tags" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"content" text,
	"type" text NOT NULL,
	"media_url" text,
	"is_ephemeral" boolean DEFAULT false,
	"expires_at" timestamp,
	"is_read" boolean DEFAULT false,
	"reactions" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"profile_image_url" text,
	"role" text DEFAULT 'guest' NOT NULL,
	"couple_id" varchar,
	"is_online" boolean DEFAULT false,
	"last_seen" timestamp DEFAULT now(),
	"status" text,
	"wishlist" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
