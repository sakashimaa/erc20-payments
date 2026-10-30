CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'detected', 'paid', 'underpaid', 'overpaid', 'expired');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('seen', 'confirmed', 'orphaned');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_status" AS ENUM('pending', 'delivered', 'dead');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"merchant_order_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"amount_received" numeric(78, 0) DEFAULT '0' NOT NULL,
	"address" text NOT NULL,
	"derivation_index" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"webhook_url" text NOT NULL,
	"webhook_secret_enc" "bytea" NOT NULL,
	"webhook_secret_enc_version" integer NOT NULL,
	"xpub_enc" "bytea" NOT NULL,
	"xpub_enc_version" integer NOT NULL,
	"next_derivation_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"chain_id" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_hash" text NOT NULL,
	"from_address" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"status" "transfer_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invoices_merchant_id_merchant_order_id" ON "invoices" USING btree ("merchant_id","merchant_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invoices_merchant_id_derivation_index" ON "invoices" USING btree ("merchant_id","derivation_index");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invoices_chain_id_address" ON "invoices" USING btree ("chain_id","address");--> statement-breakpoint
CREATE INDEX "idx_transfers_invoice_id" ON "transfers" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_transfers_chain_id_block_number" ON "transfers" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transfers_chain_id_tx_hash_log_index" ON "transfers" USING btree ("chain_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "idx_pending_events" ON "webhook_events" USING btree ("status","next_attempt_at") WHERE "webhook_events"."status" = 'pending';