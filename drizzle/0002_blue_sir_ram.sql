ALTER TABLE "merchants" DROP CONSTRAINT "merchants_xpubFingerprint_unique";--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_xpub_fingerprint_key" UNIQUE("xpub_fingerprint");