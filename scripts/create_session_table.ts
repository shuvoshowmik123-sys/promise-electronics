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
        console.log("Creating session table...");

        await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      )
      WITH (OIDS=FALSE);
    `);

        await client.query(`
      ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    `).catch(err => {
            // Ignore if constraint already exists
            if (!err.message.includes("already exists")) {
                throw err;
            }
        });

        await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

        console.log("Session table created successfully!");

    } catch (error) {
        console.error("Error creating session table:", error);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
