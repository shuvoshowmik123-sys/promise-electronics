-- Migration 0008: Performance indexes (future-proofing audit)
-- 2026-05-31
-- Safe to re-run: all IF NOT EXISTS. Index-only, no data change, reversible (DROP INDEX).
--
-- Source: cross-referenced 161 repository query-column usages against existing
-- indexes. These columns are filtered/sorted in code but had no index — fine on
-- small tables today, seq-scan slow at 10k+ rows. Added before they bite.

-- notifications.user_id — every per-user notification fetch (fastest-growing table).
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications(user_id);

-- drawer_sessions — cash-drawer history list filters by status + sorts by time.
CREATE INDEX IF NOT EXISTS idx_drawer_sessions_status
    ON drawer_sessions(status);
CREATE INDEX IF NOT EXISTS idx_drawer_sessions_opened_at
    ON drawer_sessions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawer_sessions_closed_at
    ON drawer_sessions(closed_at DESC);

-- customer_addresses.customer_id — address lookup per customer (unindexed FK).
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id
    ON customer_addresses(customer_id);

-- order_items.order_id — order detail join (unindexed child FK).
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
    ON order_items(order_id);

-- product_variants.product_id — variant lookup per product (unindexed child FK).
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
    ON product_variants(product_id);

-- service_request_events.service_request_id — request timeline load (unindexed FK).
CREATE INDEX IF NOT EXISTS idx_service_request_events_request_id
    ON service_request_events(service_request_id);

-- inventory_items.item_type — inventory filtering by type.
CREATE INDEX IF NOT EXISTS idx_inventory_items_item_type
    ON inventory_items(item_type);

-- job_tickets.corporate_job_number — corporate job search.
CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_job_number
    ON job_tickets(corporate_job_number);
