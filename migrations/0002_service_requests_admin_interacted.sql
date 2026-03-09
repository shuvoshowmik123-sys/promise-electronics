ALTER TABLE "service_requests"
ADD COLUMN IF NOT EXISTS "admin_interacted" boolean DEFAULT false;

ALTER TABLE "service_requests"
ADD COLUMN IF NOT EXISTS "admin_interacted_at" timestamp;

ALTER TABLE "service_requests"
ADD COLUMN IF NOT EXISTS "admin_interacted_by" text;

CREATE INDEX IF NOT EXISTS "idx_service_requests_admin_interacted"
ON "service_requests" USING btree ("admin_interacted");
