import pg from "pg";
import 'dotenv/config';

const connectionString = "postgresql://neondb_owner:npg_9JuXnwPDZzx3@ep-little-dew-a1uoouda-pooler.ap-southeast-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

console.log("Testing connection to:", connectionString);

const pool = new pg.Pool({
    connectionString,
    ssl: true // Force SSL for pg
});

async function main() {
    try {
        const client = await pool.connect();
        console.log("Connected successfully!");
        const res = await client.query("SELECT NOW()");
        console.log("Time from DB:", res.rows[0].now);
        client.release();
    } catch (error) {
        console.error("Connection failed:", error);
    } finally {
        await pool.end();
    }
}

main();
