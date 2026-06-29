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

async function ensureCsrfToken(method: string): Promise<string | undefined> {
    const upperMethod = method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS", "TRACE"].includes(upperMethod)) return undefined;

    const existing = getCsrfToken();
    if (existing) return existing;
    if (typeof window === "undefined") return undefined;

    const response = await fetch(`${API_BASE}/admin/csrf-token`, {
        credentials: "include",
        headers: { "Accept": "application/json" },
    });
    if (!response.ok) return undefined;

    const data = await response.json().catch(() => null);
    return data?.csrfToken || getCsrfToken();
}

type FetchApiOptions = RequestInit & { timeoutMs?: number };

export async function fetchApi<T>(url: string, options?: FetchApiOptions): Promise<T> {
    const fullUrl = `${API_BASE}${url}`;

    const { timeoutMs, ...requestOptions } = options || {};
    const method = requestOptions.method || "GET";
    const csrfToken = await ensureCsrfToken(method);
    const baseHeaders = {
        "Content-Type": "application/json",
        ...requestOptions.headers,
        ...(csrfToken ? { "X-XSRF-TOKEN": csrfToken } : {})
    };

    // Use CapacitorHttp on native platforms to bypass CORS/WebView restrictions
    if (isNative) {
        return nativeFetchApi<T>(fullUrl, { ...requestOptions, timeoutMs, headers: baseHeaders });
    }

    const controller = requestOptions.signal ? null : new AbortController();
    const timeout = controller
        ? setTimeout(() => controller.abort(), timeoutMs ?? 30000)
        : null;

    // Standard browser fetch for web
    let response: Response;
    try {
        response = await fetch(fullUrl, {
            ...requestOptions,
            credentials: 'include',
            headers: baseHeaders,
            signal: requestOptions.signal || controller?.signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new ApiError("Request timed out. Please try again.", "REQUEST_TIMEOUT", 408);
        }
        throw error;
    } finally {
        if (timeout) clearTimeout(timeout);
    }
    const contentType = response.headers.get("content-type") || "";

    const rawText = await response.text();

    if (!response.ok) {
        let errorData;
        try {
            errorData = JSON.parse(rawText);
        } catch {
            throw new ApiError(`Request failed with status ${response.status}`, "NON_JSON_ERROR_RESPONSE", response.status);
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

    if (!contentType.includes("application/json")) {
        throw new ApiError("Invalid JSON response", "NON_JSON_RESPONSE", response.status);
    }

    try {
        return JSON.parse(rawText);
    } catch {
        throw new ApiError("Invalid JSON response", "INVALID_JSON_RESPONSE", response.status);
    }
}

// Native HTTP implementation using CapacitorHttp
async function nativeFetchApi<T>(fullUrl: string, options?: FetchApiOptions): Promise<T> {
    const method = (options?.method?.toUpperCase() || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    let response: HttpResponse;

    const httpOptions = {
        url: fullUrl,
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PromiseNativeApp/1.0',
            ...(options?.headers as Record<string, string> || {}),
        },
        connectTimeout: options?.timeoutMs ?? 15000,
        readTimeout: options?.timeoutMs ?? 15000,
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
    } catch (err: unknown) {
        console.error(`[Native API] Request failed`);
        throw new ApiError(err instanceof Error ? err.message : 'Network request failed');
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
