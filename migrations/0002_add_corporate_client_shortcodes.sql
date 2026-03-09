-- Migration: Add corporate client short codes
-- Purpose: Populate shortCode for existing corporate clients that don't have one

-- Step 1: Add shortCode to any existing corporate clients that don't have one
-- We'll use a simple sequential pattern based on the company name
UPDATE corporate_clients
SET shortCode = SUBSTRING(UPPER(companyName) FROM 1 FOR 3) || '-' || LPAD(id::text, 3, '0')
WHERE shortCode IS NULL OR shortCode = '';

-- Step 2: Ensure uniqueness by adding a sequence if there are duplicates
-- This creates unique short codes like "ABC-001", "XYZ-002"
DO $$
DECLARE
    rec record;
    counter integer := 1;
BEGIN
    FOR rec IN 
        SELECT id, shortCode 
        FROM corporate_clients 
        WHERE shortCode IS NOT NULL 
        GROUP BY id, shortCode 
        HAVING COUNT(*) > 1
    LOOP
        UPDATE corporate_clients 
        SET shortCode = rec.shortCode || '-' || LPAD(counter::text, 3, '0')
        WHERE id = rec.id;
        counter := counter + 1;
    END LOOP;
END $$;

-- Step 3: Add a constraint to ensure shortCode is unique going forward
-- Note: This may fail if duplicates exist, so run the cleanup above first
ALTER TABLE corporate_clients ADD CONSTRAINT corporate_clients_shortcode_unique UNIQUE (shortCode);

-- Step 4: Add a constraint to ensure shortCode is not null (optional but recommended)
ALTER TABLE corporate_clients ALTER COLUMN shortCode SET NOT NULL;

-- Step 5: Add a check constraint for format validation (optional)
-- Allow alphanumeric characters and hyphens, 2-10 characters
ALTER TABLE corporate_clients ADD CONSTRAINT corporate_clients_shortcode_format 
CHECK (shortCode ~ '^[A-Z0-9-]{2,10}$');

-- Log completion
INSERT INTO audit_logs (
    id,
    userId,
    action,
    entity,
    entityId,
    details,
    severity,
    createdAt
) VALUES (
    gen_random_uuid()::text,
    'system',
    'MIGRATION',
    'corporate_clients',
    'all',
    'Applied migration 0002: Added corporate client short codes',
    'info',
    CURRENT_TIMESTAMP
);