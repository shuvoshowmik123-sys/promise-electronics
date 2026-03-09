/**
 * Brain DB Initializer
 * - Enables pgvector extension
 * - Pushes Drizzle schema to Neon Brain DB
 * Run: npx tsx scripts/init-brain.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { neon } from '@neondatabase/serverless';

// Load .env manually so this script works standalone
const envPath = resolve(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');

for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
    }
    process.env[key] = val;
}

const url = process.env.BRAIN_DATABASE_URL;
if (!url) {
    console.error('❌ BRAIN_DATABASE_URL is not set in your .env file!');
    process.exit(1);
}

console.log('🔗 Connecting to Brain DB...');
const sql = neon(url);

async function main() {
    try {
        // Test connection
        await sql`SELECT 1`;
        console.log('✅ Brain DB connected successfully.');

        // Enable pgvector
        console.log('⚙️  Enabling pgvector extension...');
        await sql`CREATE EXTENSION IF NOT EXISTS vector`;
        console.log('✅ pgvector extension ready.');

        console.log('\n📋 Now pushing schema via drizzle-kit...');
    } catch (err: any) {
        console.error('❌ Failed to connect or enable extension:', err?.message || err);
        process.exit(1);
    }
}

main();
