// scripts/reset_db.mjs
// Drops all tables in the public schema and then runs drizzle-kit push
import pg from 'pg';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetDatabase() {
    const client = await pool.connect();
    try {
        console.log('🗑️  Dropping all tables in public schema...');

        // Get all table names
        const result = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);

        console.log(`Found ${result.rows.length} tables to drop.`);

        // Drop each table
        for (const row of result.rows) {
            console.log(`  Dropping: ${row.tablename}`);
            await client.query(`DROP TABLE IF EXISTS public."${row.tablename}" CASCADE`);
        }

        console.log('✅ All tables dropped.');

    } finally {
        client.release();
        await pool.end();
    }

    console.log('');
    console.log('⏳ Running drizzle-kit push to recreate schema...');

    try {
        // Run drizzle-kit push with stdin closed to skip prompts
        execSync('npx drizzle-kit push --force', {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: { ...process.env, CI: 'true' } // CI mode might skip prompts
        });
        console.log('✅ Schema applied successfully!');
    } catch (error) {
        console.error('❌ drizzle-kit push failed:', error.message);
        process.exit(1);
    }
}

resetDatabase();
