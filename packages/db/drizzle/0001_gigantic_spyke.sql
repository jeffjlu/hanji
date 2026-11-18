CREATE TABLE "card" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"entry_id" uuid,
	"kanji_id" uuid,
	"unit_id" uuid NOT NULL,
	CONSTRAINT "card_unit_id_position_uq" UNIQUE("unit_id","position"),
	CONSTRAINT "card_kind_entry_uq" UNIQUE("kind","entry_id"),
	CONSTRAINT "card_kind_kanji_uq" UNIQUE("kind","kanji_id"),
	CONSTRAINT "card_one_target_chk" CHECK (("card"."entry_id" IS NULL) <> ("card"."kanji_id" IS NULL)),
	CONSTRAINT "card_kind_target_chk" CHECK (("card"."kind" = 'kanji') = ("card"."kanji_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "content_version" (
	"version_hash" text PRIMARY KEY NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"script" text NOT NULL,
	"reading" text NOT NULL,
	"gloss" text[] NOT NULL,
	"pos" text NOT NULL,
	"freq_rank" integer NOT NULL,
	"unit_id" uuid NOT NULL,
	CONSTRAINT "entry_gloss_chk" CHECK (CARDINALITY("entry"."gloss") >= 1)
);
--> statement-breakpoint
CREATE TABLE "kanji" (
	"id" uuid PRIMARY KEY NOT NULL,
	"glyph" text NOT NULL,
	"on_readings" text[] NOT NULL,
	"kun_readings" text[] NOT NULL,
	"gloss" text[] NOT NULL,
	"freq_rank" integer NOT NULL,
	CONSTRAINT "kanji_glyph_unique" UNIQUE("glyph"),
	CONSTRAINT "kanji_gloss_chk" CHECK (CARDINALITY("kanji"."gloss") >= 1)
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"language" text DEFAULT 'ja' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "unit_slug_unique" UNIQUE("slug"),
	CONSTRAINT "unit_position_unique" UNIQUE("position")
);
--> statement-breakpoint
CREATE TABLE "review_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"tz" text NOT NULL,
	"retention" double precision NOT NULL,
	"rating" integer NOT NULL,
	"response_ms" integer NOT NULL,
	"correct" boolean NOT NULL,
	"hint_used" boolean NOT NULL,
	"user_seq" integer NOT NULL,
	"local_day" date NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_event_user_seq_uq" UNIQUE("user_id","user_seq"),
	CONSTRAINT "review_event_rating_chk" CHECK ("review_event"."rating" between 1 and 4),
	CONSTRAINT "review_event_retention_chk" CHECK ("review_event"."retention" between 0.70 and 0.97),
	CONSTRAINT "review_event_response_ms_chk" CHECK ("review_event"."response_ms" >= 0),
	CONSTRAINT "review_event_correct_chk" CHECK (("review_event"."rating" = 1) = (NOT "review_event"."correct"))
);
--> statement-breakpoint
CREATE TABLE "user_card" (
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"state" text NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision NOT NULL,
	"difficulty" double precision NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"last_review" timestamp with time zone NOT NULL,
	"last_seq" integer NOT NULL,
	"correct_reps" integer NOT NULL,
	"first_review" timestamp with time zone NOT NULL,
	"scheduled_days" integer NOT NULL,
	"learning_step" integer NOT NULL,
	CONSTRAINT "user_card_user_id_card_id_pk" PRIMARY KEY("user_id","card_id"),
	CONSTRAINT "user_card_stability_chk" CHECK ("user_card"."stability" >= 0),
	CONSTRAINT "user_card_difficulty_chk" CHECK ("user_card"."difficulty" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_entry_id_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_kanji_id_kanji_id_fk" FOREIGN KEY ("kanji_id") REFERENCES "public"."kanji"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_card" ADD CONSTRAINT "user_card_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_card" ADD CONSTRAINT "user_card_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_entry_id_idx" ON "card" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "card_kanji_id_idx" ON "card" USING btree ("kanji_id");--> statement-breakpoint
CREATE INDEX "entry_unit_id_idx" ON "entry" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "review_event_user_card_idx" ON "review_event" USING btree ("user_id","card_id","reviewed_at","id");--> statement-breakpoint
CREATE INDEX "review_event_user_day_idx" ON "review_event" USING btree ("user_id","local_day");--> statement-breakpoint
CREATE INDEX "user_card_user_seq_idx" ON "user_card" USING btree ("user_id","last_seq");