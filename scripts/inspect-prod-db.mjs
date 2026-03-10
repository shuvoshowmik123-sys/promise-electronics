import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    const client = await pool.connect();
    try {
        // Get all public tables
        const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

        console.log('\n=== PRODUCTION DATABASE TABLES ===');
        const tables = tablesResult.rows.map(r => r.table_name);
        console.log(tables.join('\n'));
        console.log(`\nTotal: ${tables.length} tables`);

        // For each table, get columns
        console.log('\n=== TABLE COLUMNS ===');
        for (const table of tables) {
            const colResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
            const cols = colResult.rows.map(r => `  ${r.column_name} (${r.data_type})`).join('\n');
            console.log(`\n[${table}]`);
            console.log(cols);
        }

    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
