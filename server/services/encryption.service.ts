import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes for GCM
const SALT_LENGTH = 32; // 32 bytes
const KEY_LENGTH = 32; // 32 bytes (256 bits)
const ITERATIONS = 100000;
const DIGEST = 'sha256';

export interface EncryptedData {
    content: string;      // Base64 encoded encrypted data
    iv: string;           // Base64 encoded IV
    salt: string;         // Base64 encoded salt
    authTag: string;      // Base64 encoded auth tag
    version: string;      // Encryption version (e.g., 'v1')
}

export class EncryptionService {
    private masterKey: string;

    constructor() {
        this.masterKey = process.env.BACKUP_MASTER_KEY || '';
        if (!this.masterKey) {
            console.warn('WARNING: BACKUP_MASTER_KEY is not set. Backups will not be secure against system compromise.');
        }
    }

    /**
     * Derive a secure key from the user password and system master key.
     * Uses PBKDF2 with a random salt.
     */
    private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
        // Combine password and master key for system-dependent security
        const secret = `${password}:${this.masterKey}`;

        return new Promise((resolve, reject) => {
            crypto.pbkdf2(secret, salt, ITERATIONS, KEY_LENGTH, DIGEST, (err, key) => {
                if (err) reject(err);
                else resolve(key);
            });
        });
    }

    /**
     * Encrypt data using AES-256-GCM.
     */
    async encrypt(data: Buffer | string, password: string): Promise<EncryptedData> {
        const salt = crypto.randomBytes(SALT_LENGTH);
        const iv = crypto.randomBytes(IV_LENGTH);

        const key = await this.deriveKey(password, salt);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        const input = Buffer.isBuffer(data) ? data : Buffer.from(data);

        const encrypted = Buffer.concat([
            cipher.update(input),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return {
            content: encrypted.toString('base64'),
            iv: iv.toString('base64'),
            salt: salt.toString('base64'),
            authTag: authTag.toString('base64'),
            version: 'v1'
        };
    }

    /**
     * Decrypt data using AES-256-GCM.
     */
    async decrypt(encryptedData: EncryptedData, password: string): Promise<Buffer> {
        const salt = Buffer.from(encryptedData.salt, 'base64');
        const iv = Buffer.from(encryptedData.iv, 'base64');
        const authTag = Buffer.from(encryptedData.authTag, 'base64');
        const content = Buffer.from(encryptedData.content, 'base64');

        const key = await this.deriveKey(password, salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(content),
            decipher.final()
        ]);

        return decrypted;
    }
}

export const encryptionService = new EncryptionService();
