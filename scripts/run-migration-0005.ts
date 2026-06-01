/**
 * One-shot migration runner for 0005_client_class_system.sql
 * Run: npx tsx scripts/run-migration-0005.ts
 */
import { config } from 'dotenv';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || '0005_client_class_system.sql';
const sql = await readFile(join(__dirname, '../migrations', file), 'utf-8');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log('[Migration] Connected. Applying 0005_client_class_system.sql...');

try {
    await client.query(sql);
    console.log('[Migration] ✓ 0005_client_class_system.sql applied successfully.');
} catch (err: any) {
    console.error('[Migration] ✗ Failed:', err.message);
    process.exit(1);
} finally {
    await client.end();
}
