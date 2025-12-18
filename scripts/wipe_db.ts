import pg from "pg";
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in your environment variables.");
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    console.log("Connecting to database...");
    const client = await pool.connect();

    try {
        console.log("WIPING DATABASE (Dropping public schema)...");

        await client.query(`DROP SCHEMA public CASCADE;`);
        await client.query(`CREATE SCHEMA public;`);
        await client.query(`GRANT ALL ON SCHEMA public TO public;`);
        await client.query(`COMMENT ON SCHEMA public IS 'standard public schema';`);

        console.log("Database wiped successfully!");

    } catch (error) {
        console.error("Error wiping database:", error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
