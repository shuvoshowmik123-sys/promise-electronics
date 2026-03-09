import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class CompressionService {

    /**
     * Compress data using GZIP.
     */
    async compress(data: string | Buffer): Promise<Buffer> {
        const input = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return gzip(input);
    }

    /**
     * Decompress data using GZIP.
     */
    async decompress(data: Buffer): Promise<Buffer> {
        return gunzip(data);
    }
}

export const compressionService = new CompressionService();
