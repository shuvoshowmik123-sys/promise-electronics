import {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const REQUIRED_VARS = [
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ENDPOINT",
    "R2_BUCKET_NAME",
] as const;

export class StorageService {
    private client: S3Client;
    private bucket: string;
    private configured: boolean;

    constructor() {
        const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
        if (missing.length > 0) {
            console.warn(`[StorageService] Missing required R2 environment variables (${missing.length}). Storage operations will fail.`);
            this.configured = false;
            this.bucket = "";
            this.client = new S3Client({ region: "auto" });
            return;
        }

        this.configured = true;
        this.bucket = process.env.R2_BUCKET_NAME!;
        this.client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_ENDPOINT!,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        });
        console.log("[StorageService] R2 storage initialized.");
    }

    isConfigured(): boolean {
        return this.configured;
    }

    private assertConfigured(): void {
        if (!this.configured) {
            throw new Error("R2 storage is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, and R2_BUCKET_NAME.");
        }
    }

    /** Upload a file. Returns the R2 object key. */
    async uploadFile(key: string, content: Buffer, contentType: string): Promise<string> {
        this.assertConfigured();

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: content,
            ContentType: contentType,
        });

        try {
            await this.client.send(command);
            return key;
        } catch (error) {
            console.error("[StorageService] Upload failed:", (error as Error).message);
            throw new Error("Failed to upload file to storage.");
        }
    }

    /** List objects under the given prefix. Prefix is required to prevent bucket enumeration. */
    async listFiles(prefix: string, continuationToken?: string) {
        this.assertConfigured();

        if (!prefix) {
            throw new Error("A storage prefix is required for listing.");
        }

        const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        });

        try {
            const data = await this.client.send(command);
            return {
                items: (data.Contents || []).map((item) => ({
                    key: item.Key ?? "",
                    name: item.Key?.split("/").pop() ?? item.Key ?? "",
                    size: item.Size,
                    lastModified: item.LastModified?.toISOString(),
                })),
                isTruncated: data.IsTruncated ?? false,
                nextContinuationToken: data.NextContinuationToken,
            };
        } catch (error) {
            console.error("[StorageService] List failed:", (error as Error).message);
            throw new Error("Failed to list files from storage.");
        }
    }

    /** Download a file by its exact object key. */
    async downloadFile(key: string): Promise<Buffer> {
        this.assertConfigured();

        if (!key) {
            throw new Error("Object key is required for download.");
        }

        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        try {
            const response = await this.client.send(command);
            const byteArray = await response.Body?.transformToByteArray();
            return Buffer.from(byteArray ?? []);
        } catch (error) {
            console.error("[StorageService] Download failed:", (error as Error).message);
            throw new Error("Failed to download file from storage.");
        }
    }

    /** Delete an object by its exact key. Used for QA cleanup only. */
    async deleteFile(key: string): Promise<void> {
        this.assertConfigured();

        if (!key) {
            throw new Error("Object key is required for deletion.");
        }

        const command = new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        try {
            await this.client.send(command);
        } catch (error) {
            console.error("[StorageService] Delete failed:", (error as Error).message);
            throw new Error("Failed to delete file from storage.");
        }
    }
}

export const storageService = new StorageService();
