import { API_BASE_URL, isNative } from "../config";
import { CapacitorHttp, HttpResponse } from '@capacitor/core';

const API_BASE = `${API_BASE_URL}/api`;

export class ApiError extends Error {
    code?: string;
    statusCode?: number;
    constructor(message: string, code?: string, statusCode?: number) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'ApiError';
    }
}

function getCsrfToken(): string | undefined {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
    return match ? match[2] : undefined;
}

export async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = `${API_BASE}${url}`;

    // Use import.meta.env.DEV since Vite handles this
    // In a vanilla TS environment you'd use something else,
    // but this project uses Vite.
    if (import.meta.env?.DEV) {
        console.log(`[API] Fetching: ${fullUrl}`);
    }

    const csrfToken = getCsrfToken();
    const baseHeaders = {
        "Content-Type": "application/json",
        ...options?.headers,
        ...(csrfToken ? { "X-XSRF-TOKEN": csrfToken } : {})
    };

    // Use CapacitorHttp on native platforms to bypass CORS/WebView restrictions
    if (isNative) {
        return nativeFetchApi<T>(fullUrl, { ...options, headers: baseHeaders });
    }

    // Standard browser fetch for web
    const response = await fetch(fullUrl, {
        ...options,
        credentials: 'include',
        headers: baseHeaders,
    });

    if (import.meta.env?.DEV) {
        console.log(`[API] Response status: ${response.status} ${response.statusText}`);
    }

    // Get raw text first for debugging
    const rawText = await response.text();

    if (import.meta.env?.DEV) {
        console.log(`[API] Raw response (first 200 chars): ${rawText.substring(0, 200)}`);
    }

    if (!response.ok) {
        let errorData;
        try {
            errorData = JSON.parse(rawText);
        } catch (parseError) {
            console.error(`[API] Failed to parse error response:`, rawText.substring(0, 500));
            throw new ApiError(`Request failed with status ${response.status}: ${rawText.substring(0, 100)}`, undefined, response.status);
        }

        if (errorData) {
            // Use message from server if available, fallback to error code or default
            const message = errorData.message || errorData.error || "Request failed";
            // Use error code from server (e.g. AI_SERVICE_UNAVAILABLE)
            const code = errorData.error || errorData.code;
            throw new ApiError(message, code, response.status);
        }
    }

    if (response.status === 204 || !rawText) {
        return null as T;
    }

    try {
        return JSON.parse(rawText);
    } catch (parseError) {
        console.error(`[API] Failed to parse JSON response:`, rawText.substring(0, 500));
        throw new ApiError(`Invalid JSON response: ${rawText.substring(0, 100)}`);
    }
}

// Native HTTP implementation using CapacitorHttp
async function nativeFetchApi<T>(fullUrl: string, options?: RequestInit): Promise<T> {
    const method = (options?.method?.toUpperCase() || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    let response: HttpResponse;

    const httpOptions = {
        url: fullUrl,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PromiseNativeApp/1.0',
            ...(options?.headers as Record<string, string> || {}),
        },
        connectTimeout: 15000,
        readTimeout: 15000,
    };

    try {
        if (method === 'GET') {
            response = await CapacitorHttp.get(httpOptions);
        } else if (method === 'POST') {
            response = await CapacitorHttp.post({
                ...httpOptions,
                data: options?.body ? JSON.parse(options.body as string) : undefined,
            });
        } else if (method === 'PUT') {
            response = await CapacitorHttp.put({
                ...httpOptions,
                data: options?.body ? JSON.parse(options.body as string) : undefined,
            });
        } else if (method === 'PATCH') {
            response = await CapacitorHttp.patch({
                ...httpOptions,
                data: options?.body ? JSON.parse(options.body as string) : undefined,
            });
        } else if (method === 'DELETE') {
            response = await CapacitorHttp.delete(httpOptions);
        } else {
            response = await CapacitorHttp.get(httpOptions);
        }
    } catch (err: any) {
        console.error(`[Native API] Request failed:`, err);
        throw new ApiError(err.message || 'Network request failed');
    }

    if (import.meta.env?.DEV) {
        console.log(`[Native API] Response status: ${response.status}`);
        console.log(`[Native API] Response data:`, JSON.stringify(response.data).substring(0, 200));
    }

    if (response.status >= 400) {
        const errorData = response.data;
        throw new ApiError(errorData?.error || `Request failed with status ${response.status}`, errorData?.code, response.status);
    }

    if (response.status === 204 || !response.data) {
        return null as T;
    }

    return response.data as T;
}
