import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for ES modules path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

async function main() {
    console.log("Connecting to Cloudflare R2...");
    console.log("Endpoint:", process.env.R2_ENDPOINT);

    try {
        const data = await client.send(new ListBucketsCommand({}));
        console.log("\nSuccess! Connected to R2.");
        console.log("Buckets found:");
        if (data.Buckets && data.Buckets.length > 0) {
            data.Buckets.forEach(b => console.log(` - ${b.Name}`));
        } else {
            console.log(" - No buckets found. Please create 'promise-backups-prod' in the Cloudflare dashboard.");
        }
    } catch (err) {
        console.error("\nError connecting to R2:", err);
    }
}

main();
