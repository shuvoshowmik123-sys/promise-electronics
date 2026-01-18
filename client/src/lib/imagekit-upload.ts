/**
 * ImageKit Upload Utility
 * 
 * Provides a programmatic way to upload files to ImageKit
 * without using the React component wrapper.
 */

import { getApiUrl } from "./config";

export interface ImageKitUploadResult {
    url: string;
    fileId: string;
    thumbnailUrl?: string;
    name: string;
    size?: number;
    fileType?: string;
}

const urlEndpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT || "";
const publicKey = import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY || "";

/**
 * Get authentication parameters from the backend
 */
async function getAuthParams(): Promise<{
    token: string;
    expire: number;
    signature: string;
}> {
    const response = await fetch(getApiUrl("/api/upload/imagekit-auth"), {
        credentials: "include",
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 503) {
            throw new Error("ImageKit not configured. Please contact support.");
        }
        throw new Error(error.message || "Failed to get upload authentication");
    }

    return response.json();
}

/**
 * Upload a file to ImageKit
 * 
 * @param file - File to upload
 * @param options - Upload options
 * @returns Upload result with URL and fileId
 */
export async function uploadToImageKit(
    file: File,
    options: {
        folder?: string;
        fileName?: string;
        tags?: string[];
    } = {}
): Promise<ImageKitUploadResult> {
    if (!urlEndpoint || !publicKey) {
        throw new Error(
            "ImageKit not configured. Please set VITE_IMAGEKIT_URL_ENDPOINT and VITE_IMAGEKIT_PUBLIC_KEY"
        );
    }

    const authParams = await getAuthParams();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", options.fileName || file.name);
    formData.append("publicKey", publicKey);
    formData.append("signature", authParams.signature);
    formData.append("expire", authParams.expire.toString());
    formData.append("token", authParams.token);

    if (options.folder) {
        formData.append("folder", options.folder);
    }

    if (options.tags && options.tags.length > 0) {
        formData.append("tags", options.tags.join(","));
    }

    const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to upload file to ImageKit");
    }

    const result = await response.json();

    return {
        url: result.url,
        fileId: result.fileId,
        thumbnailUrl: result.thumbnailUrl,
        name: result.name,
        size: result.size,
        fileType: result.fileType,
    };
}

/**
 * Check if ImageKit is configured
 */
export function isImageKitConfigured(): boolean {
    return !!(urlEndpoint && publicKey);
}
