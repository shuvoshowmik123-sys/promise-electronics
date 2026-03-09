import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";


export class StorageService {
    private client: S3Client;
    private bucket: string;

    constructor() {
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const endpoint = process.env.R2_ENDPOINT;
        const bucket = process.env.R2_BUCKET_NAME;

        if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
            console.warn("WARNING: R2/S3 credentials missing. StorageService will fail.");
            // Throwing here might crash server on startup if env is missing, 
            // but for a critical service, maybe that's better?
            // For now, allow partial init but methods will fail.
        }

        this.bucket = bucket || "";
        this.client = new S3Client({
            region: "auto",
            endpoint: endpoint,
            credentials: {
                accessKeyId: accessKeyId || "",
                secretAccessKey: secretAccessKey || "",
            },
        });
    }

    /**
     * Upload a file to R2
     */
    async uploadFile(key: string, content: Buffer, contentType: string): Promise<void> {
        if (!this.bucket) throw new Error("R2_BUCKET_NAME not configured");

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: content,
            ContentType: contentType,
        });

        try {
            await this.client.send(command);
        } catch (error) {
            console.error("R2 Upload Error:", error);
            throw new Error("Failed to upload file to Cloudflare R2");
        }
    }

    /**
     * List files in the bucket
     */
    async listFiles(prefix?: string) {
        if (!this.bucket) throw new Error("R2_BUCKET_NAME not configured");

        const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
        });

        try {
            const data = await this.client.send(command);
            return (data.Contents || []).map(item => ({
                id: item.Key, // S3 uses Key as ID
                name: item.Key,
                size: item.Size,
                createdTime: item.LastModified?.toISOString(),
                mimeType: "application/octet-stream" // S3 list doesn't return mime
            }));
        } catch (error) {
            console.error("R2 List Error:", error);
            throw new Error("Failed to list files from Cloudflare R2");
        }
    }

    /**
     * Download a file from R2
     * Returns a Buffer
     */
    async downloadFile(key: string): Promise<Buffer> {
        if (!this.bucket) throw new Error("R2_BUCKET_NAME not configured");

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        try {
            const response = await this.client.send(command);
            // S3 Body is a stream
            const byteArray = await response.Body?.transformToByteArray();
            return Buffer.from(byteArray || []);
        } catch (error) {
            console.error("R2 Download Error:", error);
            throw new Error("Failed to download file from Cloudflare R2");
        }
    }
}

export const storageService = new StorageService();
