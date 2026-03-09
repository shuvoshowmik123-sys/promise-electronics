import { google } from 'googleapis';



export class GoogleDriveService {
    private drive: any;
    private folderId: string | undefined;

    constructor() {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

        this.folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;

        if (!clientId || !clientSecret || !refreshToken) {
            console.warn('WARNING: Google Drive OAuth credentials (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) are missing. Backups to Drive will fail.');
            // We initialize a dummy drive object or null to prevent crash on startup, 
            // but methods will throw if called.
            return;
        }

        const auth = new google.auth.OAuth2(clientId, clientSecret);
        auth.setCredentials({ refresh_token: refreshToken });

        this.drive = google.drive({ version: 'v3', auth });
    }

    /**
     * Upload a file to Google Drive.
     */
    async uploadFile(fileName: string, mimeType: string, content: Buffer): Promise<string> {
        if (!this.drive) {
            throw new Error('Google Drive not configured. Please check .env credentials.');
        }
        if (!this.folderId) {
            throw new Error('GOOGLE_DRIVE_BACKUP_FOLDER_ID is not set in environment variables.');
        }

        // Convert Buffer to Stream for upload
        const { Readable } = await import('stream');
        const media = {
            mimeType,
            body: Readable.from(content),
        };

        try {
            const response = await this.drive.files.create({
                requestBody: {
                    name: fileName,
                    parents: [this.folderId],
                },
                media: media,
                fields: 'id',
            });

            if (!response.data.id) {
                throw new Error('Failed to upload file to Google Drive.');
            }

            return response.data.id;
        } catch (error: any) {
            console.error('Google Drive Upload Error:', error);
            throw error;
        }
    }

    /**
     * List backup files from the configured Google Drive folder.
     */
    async listFiles() {
        if (!this.drive) {
            return [];
        }
        if (!this.folderId) {
            return [];
        }

        try {
            const response = await this.drive.files.list({
                q: `'${this.folderId}' in parents and trashed = false`,
                fields: 'files(id, name, createdTime, size, mimeType)',
                orderBy: 'createdTime desc',
                pageSize: 20,
            });

            return response.data.files || [];
        } catch (error: any) {
            console.error('Google Drive List Error:', error);
            // If error is due to invalid grant/token, we might want to alert
            throw new Error(`Failed to list files from Google Drive: ${error.message}`);
        }
    }
}

export const googleDriveService = new GoogleDriveService();
