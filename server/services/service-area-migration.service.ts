import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function migrateServiceAreaTables(): Promise<void> {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS service_areas (
            id TEXT PRIMARY KEY,
            city TEXT NOT NULL DEFAULT 'Dhaka',
            area_name TEXT NOT NULL,
            subarea_name TEXT,
            block_or_sector TEXT,
            normalized_key TEXT NOT NULL UNIQUE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    `);

    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_service_areas_is_active ON service_areas (is_active)
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_service_areas_city_area ON service_areas (city, area_name)
    `);

    await db.execute(sql`
        ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS service_area_id TEXT
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_service_requests_service_area_id ON service_requests (service_area_id)
    `);

    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS service_area_id TEXT`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_service_area_id ON job_tickets (service_area_id)`);
    await db.execute(sql`ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS service_area_id TEXT`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pos_transactions_service_area_id ON pos_transactions (service_area_id)`);
    await db.execute(sql`ALTER TABLE warranty_claims ADD COLUMN IF NOT EXISTS service_area_id TEXT`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_warranty_claims_service_area_id ON warranty_claims (service_area_id)`);

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pos_transaction_area_allocations (
            id TEXT PRIMARY KEY,
            transaction_id TEXT NOT NULL,
            job_ticket_id TEXT,
            service_area_id TEXT NOT NULL,
            billed_amount REAL NOT NULL CHECK (billed_amount >= 0),
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_area_alloc_transaction_job ON pos_transaction_area_allocations (transaction_id, job_ticket_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pos_area_alloc_transaction_id ON pos_transaction_area_allocations (transaction_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pos_area_alloc_job_ticket_id ON pos_transaction_area_allocations (job_ticket_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pos_area_alloc_service_area_id ON pos_transaction_area_allocations (service_area_id)`);

    // Phase Map-02: broad operational geometry columns — never customer GPS
    await db.execute(sql`
        ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS centroid_latitude DOUBLE PRECISION
    `);
    await db.execute(sql`
        ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS centroid_longitude DOUBLE PRECISION
    `);
    await db.execute(sql`
        ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS boundary_geo_json JSONB
    `);
    await db.execute(sql`
        ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS geometry_updated_at TIMESTAMP
    `);

    // MAP-PUBLIC-SEARCH-PRIVACY-01: explicit publication gate (default false — no auto-publish)
    await db.execute(sql`
        ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_service_areas_is_public ON service_areas (is_public)
    `);

    // Phase Map-02 Security: FK integrity — service_requests.service_area_id → service_areas.id
    // Preflight: count orphaned references before attempting constraint.
    const orphanResult = await db.execute(sql`
        SELECT COUNT(*)::int AS orphan_count
        FROM service_requests sr
        WHERE sr.service_area_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM service_areas sa WHERE sa.id = sr.service_area_id
          )
    `);
    const orphanCount = Number((orphanResult as any).rows[0]?.orphan_count ?? 0);

    if (orphanCount > 0) {
        // Report non-PII orphan IDs (area IDs, not customer data) and halt FK addition.
        const sampleResult = await db.execute(sql`
            SELECT DISTINCT sr.service_area_id
            FROM service_requests sr
            WHERE sr.service_area_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM service_areas sa WHERE sa.id = sr.service_area_id)
            LIMIT 5
        `);
        const sampleIds: string[] = (sampleResult as any).rows.map((r: any) => r.service_area_id as string);
        console.warn(
            `[service-area-migration] FK BLOCKED: ${orphanCount} orphaned service_area_id value(s) found.` +
            ` Sample area IDs: ${sampleIds.join(', ')}. FK not added — awaiting Inspector decision.`,
        );
    } else {
        // No orphans — safe to add FK if it does not already exist.
        // PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS", so we check information_schema first.
        await db.execute(sql`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'fk_service_requests_service_area_id'
                      AND conrelid = 'service_requests'::regclass
                ) THEN
                    ALTER TABLE service_requests
                        ADD CONSTRAINT fk_service_requests_service_area_id
                        FOREIGN KEY (service_area_id) REFERENCES service_areas(id)
                        ON DELETE RESTRICT;
                END IF;
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        `);
    }

    await db.execute(sql`
        UPDATE job_tickets jt
        SET service_area_id = sr.service_area_id
        FROM service_requests sr
        WHERE sr.converted_job_id = jt.id
          AND sr.service_area_id IS NOT NULL
          AND sr.corporate_client_id IS NULL
          AND jt.corporate_client_id IS NULL
          AND jt.corporate_challan_id IS NULL
          AND jt.service_area_id IS NULL
    `);
    await db.execute(sql`
        UPDATE warranty_claims wc
        SET service_area_id = jt.service_area_id
        FROM job_tickets jt
        WHERE wc.original_job_id = jt.id
          AND jt.service_area_id IS NOT NULL
          AND jt.corporate_client_id IS NULL
          AND jt.corporate_challan_id IS NULL
          AND wc.service_area_id IS NULL
    `);

    await db.execute(sql`
        DO $$
        DECLARE
            relation RECORD;
        BEGIN
            FOR relation IN
                SELECT * FROM (VALUES
                    ('job_tickets', 'service_area_id', 'fk_job_tickets_service_area_id', 'service_areas', 'id'),
                    ('pos_transactions', 'service_area_id', 'fk_pos_transactions_service_area_id', 'service_areas', 'id'),
                    ('warranty_claims', 'service_area_id', 'fk_warranty_claims_service_area_id', 'service_areas', 'id'),
                    ('pos_transaction_area_allocations', 'transaction_id', 'fk_pos_area_alloc_transaction_id', 'pos_transactions', 'id'),
                    ('pos_transaction_area_allocations', 'job_ticket_id', 'fk_pos_area_alloc_job_id', 'job_tickets', 'id'),
                    ('pos_transaction_area_allocations', 'service_area_id', 'fk_pos_area_alloc_area_id', 'service_areas', 'id')
                ) AS v(source_table, source_column, constraint_name, target_table, target_column)
            LOOP
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = relation.constraint_name) THEN
                    EXECUTE format(
                        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE RESTRICT',
                        relation.source_table,
                        relation.constraint_name,
                        relation.source_column,
                        relation.target_table,
                        relation.target_column
                    );
                END IF;
            END LOOP;
        END $$;
    `);

    const legacyRowsResult = await db.execute(sql`
        SELECT pt.id, pt.total, pt.linked_jobs
        FROM pos_transactions pt
        WHERE pt.linked_jobs IS NOT NULL
          AND pt.linked_jobs <> ''
          AND NOT EXISTS (
              SELECT 1 FROM pos_transaction_area_allocations allocation
              WHERE allocation.transaction_id = pt.id
          )
    `);
    const legacyRows = (legacyRowsResult as any).rows as Array<{ id: string; total: number; linked_jobs: string }>;
    let failedLegacyRows = 0;
    for (const transaction of legacyRows) {
        try {
            const links = JSON.parse(transaction.linked_jobs) as unknown;
            if (!Array.isArray(links)) throw new Error('not an array');
            const parsedLinks = links.map((link) => {
                if (!link || typeof link !== 'object') throw new Error('invalid link');
                const jobId = (link as Record<string, unknown>).jobId;
                const billedAmount = Number((link as Record<string, unknown>).billedAmount);
                if (typeof jobId !== 'string' || !Number.isFinite(billedAmount) || billedAmount < 0) throw new Error('invalid allocation');
                return { jobId, billedAmount };
            });
            if (parsedLinks.reduce((sum, link) => sum + link.billedAmount, 0) > Number(transaction.total) + 0.01) throw new Error('allocation exceeds total');
            for (const link of parsedLinks) {
                const jobResult = await db.execute(sql`
                    SELECT id, service_area_id
                    FROM job_tickets
                    WHERE id = ${link.jobId}
                      AND service_area_id IS NOT NULL
                      AND corporate_client_id IS NULL
                      AND corporate_challan_id IS NULL
                    LIMIT 1
                `);
                const job = (jobResult as any).rows[0] as { id: string; service_area_id: string } | undefined;
                if (!job) continue;
                await db.execute(sql`
                    INSERT INTO pos_transaction_area_allocations
                        (id, transaction_id, job_ticket_id, service_area_id, billed_amount)
                    VALUES
                        (${randomUUID()}, ${transaction.id}, ${job.id}, ${job.service_area_id}, ${link.billedAmount})
                    ON CONFLICT (transaction_id, job_ticket_id) DO NOTHING
                `);
            }
        } catch {
            failedLegacyRows += 1;
        }
    }
    if (failedLegacyRows > 0) {
        console.warn(`[ServiceAreaMigration] ${failedLegacyRows} legacy POS row(s) could not be safely attributed.`);
    }
}
