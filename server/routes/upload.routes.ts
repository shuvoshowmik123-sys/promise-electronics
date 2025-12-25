/**
 * Upload Routes
 * 
 * Handles file uploads (Cloudinary, Object Storage) and media cleanup.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { v2 as cloudinary } from 'cloudinary';
import { ObjectStorageService, ObjectNotFoundError } from '../objectStorage.js';
import ImageKit from 'imagekit';

const router = Router();

// ============================================
// ImageKit Configuration
// ============================================

const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
});

/**
 * GET /api/upload/imagekit-auth - Returns auth params for client-side uploads
 */
router.get('/api/upload/imagekit-auth', (req: Request, res: Response) => {
    try {
        if (!process.env.IMAGEKIT_PRIVATE_KEY) {
            return res.status(503).json({
                error: 'ImageKit not configured',
                message: 'Please configure IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT'
            });
        }
        const result = imagekit.getAuthenticationParameters();
        res.json(result);
    } catch (error: any) {
        console.error('ImageKit auth error:', error);
        res.status(500).json({ error: 'Failed to generate auth parameters' });
    }
});

// ============================================
// Object Storage API (Legacy)
// ============================================

/**
 * POST /api/objects/upload - Get upload URL (legacy)
 */
router.post('/api/objects/upload', async (req: Request, res: Response) => {
    try {
        const objectStorageService = new ObjectStorageService();
        const uploadURL = await objectStorageService.getObjectEntityUploadURL();
        res.json({ uploadURL });
    } catch (error: any) {
        console.error('Failed to get upload URL:', error.message);
        res.status(500).json({ error: 'Failed to generate upload URL. Object storage may not be configured.' });
    }
});

/**
 * GET /objects/:objectPath - Serve objects
 */
router.get('/objects/:objectPath(*)', async (req: Request, res: Response) => {
    try {
        const objectStorageService = new ObjectStorageService();
        const objectFile = await objectStorageService.getObjectEntityFile(req.path);
        objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
        if (error instanceof ObjectNotFoundError) {
            return res.status(404).json({ error: 'File not found' });
        }
        console.error('Error serving object:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

// ============================================
// Cloudinary API
// ============================================

/**
 * POST /api/cloudinary/upload-params - Get signed upload parameters
 */
router.post('/api/cloudinary/upload-params', async (req: Request, res: Response) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!cloudName || !apiKey || !apiSecret) {
            return res.status(503).json({
                error: 'Cloudinary not configured',
                message: 'Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET'
            });
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
        });

        const { resourceType = 'auto' } = req.body;
        const timestamp = Math.round(new Date().getTime() / 1000);
        const folder = 'service-requests';
        const transformation = 'q_auto:good,f_auto';

        const paramsToSign: Record<string, any> = {
            timestamp,
            folder,
            transformation,
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            apiSecret
        );

        res.json({
            signature,
            timestamp,
            cloudName,
            apiKey,
            folder,
            transformation,
            resourceType,
        });
    } catch (error: any) {
        console.error('Cloudinary upload params error:', error);
        res.status(500).json({ error: 'Failed to generate upload parameters' });
    }
});

/**
 * POST /api/cloudinary/upload - Server-side upload
 */
router.post('/api/cloudinary/upload', async (req: Request, res: Response) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (!cloudName || !apiKey || !apiSecret) {
            return res.status(503).json({
                error: 'Cloudinary not configured',
                message: 'Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET'
            });
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
        });

        const { file, resourceType = 'auto' } = req.body;

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const result = await cloudinary.uploader.upload(file, {
            folder: 'service-requests',
            resource_type: resourceType,
            transformation: [
                { quality: 'auto:good' },
                { fetch_format: 'auto' }
            ],
            eager: resourceType === 'video' ? [
                { quality: 'auto', fetch_format: 'auto' }
            ] : undefined,
        });

        res.json({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            resourceType: result.resource_type,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
        });
    } catch (error: any) {
        console.error('Cloudinary upload error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload file' });
    }
});

// ============================================
// Media Cleanup API
// ============================================

/**
 * POST /api/cleanup/expired-media - Cleanup expired media files
 */
router.post('/api/cleanup/expired-media', async (req: Request, res: Response) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        const cloudinaryConfigured = cloudName && apiKey && apiSecret;

        if (cloudinaryConfigured) {
            cloudinary.config({
                cloud_name: cloudName,
                api_key: apiKey,
                api_secret: apiSecret,
            });
        }

        const expired = await storage.getExpiredServiceRequests();
        let deletedMediaCount = 0;
        let updatedRequestCount = 0;
        let skippedLegacy = 0;
        const errors: string[] = [];

        for (const request of expired) {
            if (request.mediaUrls) {
                try {
                    const mediaItems = JSON.parse(request.mediaUrls);
                    const successfullyDeleted: number[] = [];
                    let hasFailures = false;

                    for (let i = 0; i < mediaItems.length; i++) {
                        const item = mediaItems[i];
                        try {
                            const isNewFormat = typeof item === 'object' && item.publicId;

                            if (isNewFormat && cloudinaryConfigured) {
                                await cloudinary.uploader.destroy(item.publicId, {
                                    resource_type: item.resourceType || 'image'
                                });
                                successfullyDeleted.push(i);
                                deletedMediaCount++;
                            } else if (typeof item === 'string') {
                                try {
                                    const objectStorageService = new ObjectStorageService();
                                    await objectStorageService.deleteObject(item);
                                    successfullyDeleted.push(i);
                                    deletedMediaCount++;
                                } catch (e: any) {
                                    if (e.message?.includes('not configured') || e.message?.includes('not found')) {
                                        skippedLegacy++;
                                        successfullyDeleted.push(i);
                                    } else {
                                        hasFailures = true;
                                        errors.push(`Legacy file deletion failed: ${item}: ${e.message}`);
                                    }
                                }
                            } else if (!cloudinaryConfigured) {
                                errors.push(`Cloudinary not configured, cannot delete: ${item.publicId || item}`);
                                hasFailures = true;
                            }
                        } catch (e: any) {
                            hasFailures = true;
                            errors.push(`Failed to delete ${typeof item === 'object' ? item.publicId : item}: ${e.message}`);
                        }
                    }

                    if (!hasFailures || successfullyDeleted.length === mediaItems.length) {
                        await storage.updateServiceRequest(request.id, {
                            mediaUrls: null,
                            expiresAt: null
                        });
                        updatedRequestCount++;
                    } else if (successfullyDeleted.length > 0) {
                        const remainingItems = mediaItems.filter((_: any, i: number) => !successfullyDeleted.includes(i));
                        await storage.updateServiceRequest(request.id, {
                            mediaUrls: JSON.stringify(remainingItems)
                        });
                    }
                } catch (e: any) {
                    errors.push(`Failed to process request ${request.id}: ${e.message}`);
                }
            }
        }

        res.json({
            deletedMedia: deletedMediaCount,
            updatedRequests: updatedRequestCount,
            skippedLegacy,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error: any) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Failed to cleanup expired media' });
    }
});

export default router;
