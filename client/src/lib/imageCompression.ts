/**
 * Image Compression Utility for Native App
 * 
 * Compresses images before AI analysis and upload to:
 * 1. Reduce memory usage (prevent app freezing)
 * 2. Speed up network uploads
 * 3. Improve AI processing times
 */

export interface CompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'jpeg' | 'webp' | 'png';
}

export interface CompressionResult {
    blob: Blob;
    base64: string;
    width: number;
    height: number;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.8,
    format: 'jpeg',
};

/**
 * Compress an image file or blob
 * 
 * @param input - File, Blob, or base64 string
 * @param options - Compression options
 * @returns Compressed image as blob and base64
 */
export async function compressImage(
    input: File | Blob | string,
    options: CompressionOptions = {}
): Promise<CompressionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Get original size
    let originalSize: number;
    let imageUrl: string;

    if (typeof input === 'string') {
        // Base64 string
        originalSize = Math.ceil((input.length * 3) / 4); // Approximate size
        imageUrl = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
    } else {
        // File or Blob
        originalSize = input.size;
        imageUrl = URL.createObjectURL(input);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            try {
                // Calculate new dimensions while maintaining aspect ratio
                let { width, height } = img;

                if (width > opts.maxWidth) {
                    height = (height * opts.maxWidth) / width;
                    width = opts.maxWidth;
                }

                if (height > opts.maxHeight) {
                    width = (width * opts.maxHeight) / height;
                    height = opts.maxHeight;
                }

                // Round dimensions
                width = Math.round(width);
                height = Math.round(height);

                // Create canvas and draw
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // Use better image smoothing for quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw image
                ctx.drawImage(img, 0, 0, width, height);

                // Get mime type
                const mimeType = `image/${opts.format}`;

                // Convert to blob
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Failed to compress image'));
                            return;
                        }

                        // Convert to base64
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const base64 = reader.result as string;

                            // Clean up object URL if we created one
                            if (typeof input !== 'string') {
                                URL.revokeObjectURL(imageUrl);
                            }

                            resolve({
                                blob,
                                base64,
                                width,
                                height,
                                originalSize,
                                compressedSize: blob.size,
                                compressionRatio: originalSize / blob.size,
                            });
                        };
                        reader.onerror = () => reject(new Error('Failed to read compressed image'));
                        reader.readAsDataURL(blob);
                    },
                    mimeType,
                    opts.quality
                );
            } catch (error) {
                reject(error);
            }
        };

        img.onerror = () => {
            // Clean up
            if (typeof input !== 'string') {
                URL.revokeObjectURL(imageUrl);
            }
            reject(new Error('Failed to load image'));
        };

        img.src = imageUrl;
    });
}

/**
 * Compress image from a Blob URL (object URL)
 */
export async function compressFromObjectUrl(
    objectUrl: string,
    options: CompressionOptions = {}
): Promise<CompressionResult> {
    const response = await fetch(objectUrl);
    const blob = await response.blob();
    return compressImage(blob, options);
}

/**
 * Check if an image needs compression
 */
export function needsCompression(
    sizeInBytes: number,
    threshold: number = 500 * 1024 // 500KB default threshold
): boolean {
    return sizeInBytes > threshold;
}

/**
 * Get optimal compression settings based on intended use
 */
export function getCompressionPreset(
    use: 'ai-analysis' | 'upload' | 'thumbnail'
): CompressionOptions {
    switch (use) {
        case 'ai-analysis':
            // Balanced for AI - good quality but manageable size
            return { maxWidth: 1024, maxHeight: 1024, quality: 0.85, format: 'jpeg' };
        case 'upload':
            // Higher quality for storage
            return { maxWidth: 2048, maxHeight: 2048, quality: 0.9, format: 'jpeg' };
        case 'thumbnail':
            // Small and fast
            return { maxWidth: 256, maxHeight: 256, quality: 0.7, format: 'webp' };
        default:
            return DEFAULT_OPTIONS;
    }
}

/**
 * Format bytes to human readable string
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
