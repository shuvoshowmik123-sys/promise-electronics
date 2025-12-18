import pg from "pg";
import 'dotenv/config';

// Constructed direct URL (removed -pooler)
const connectionString = "postgresql://neondb_owner:npg_9JuXnwPDZzx3@ep-little-dew-a1uoouda.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

console.log("Testing DIRECT connection to:", connectionString);

const pool = new pg.Pool({
    connectionString,
    ssl: true
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
