
import { pool } from "../server/db";

async function checkConnection() {
    try {
        const client = await pool.connect();
        console.log("Successfully connected to the database!");
        const res = await client.query('SELECT NOW()');
        console.log("Database time:", res.rows[0].now);
        client.release();
        process.exit(0);
    } catch (err) {
        console.error("Failed to connect to the database:", err);
        process.exit(1);
    }
}

checkConnection();
