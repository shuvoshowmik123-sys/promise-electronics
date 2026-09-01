import { API_BASE_URL, isNative } from "../config";
import { CapacitorHttp, HttpResponse } from '@capacitor/core';

const API_BASE = `${API_BASE_URL}/api`;

export class ApiError extends Error {
    code?: string;
    statusCode?: number;
    data?: unknown;
    constructor(message: string, code?: string, statusCode?: number, data?: unknown) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.data = data;
        this.name = 'ApiError';
    }
}

function getCsrfToken(): string | undefined {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
    return match ? match[2] : undefined;
}

function clearCsrfCookie(): void {
    if (typeof document === 'undefined') return;
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
}

/**
 * The CSRF token, on native, must be fetched the same way the request is sent.
 *
 * This is what broke every write in the app — "Session validation failed" when
 * creating a job, and on anything else that was not a GET.
 *
 * The cause is SameSite, not two cookie stores; Capacitor shares one, installing
 * its CookieManager over the WebView's own. What differs is who enforces
 * SameSite. The app's WebView reports https://localhost, so a request to
 * promiseelectronics.com is cross-site, and the session cookie is SameSite=lax
 * — a browser withholds it. CapacitorHttp goes through Java's CookieHandler,
 * which does not implement SameSite at all, and sends it.
 *
 * So the two paths saw two different sessions. Mutations went out through
 * CapacitorHttp carrying the real session. The token was fetched with a plain
 * fetch(), which arrived anonymous, and the server did the reasonable thing:
 * started a session for it and handed back that session's token. The app then
 * presented session A's cookie with session B's token and was refused —
 * correctly.
 *
 * Login was unaffected because login is the one route with no CSRF guard, which
 * is why the app worked right up until the first thing anyone tried to save.
 *
 * document.cookie could never have helped either. It reads cookies for the
 * document's origin, which is https://localhost; XSRF-TOKEN is set on the API's
 * domain and is not visible there at all.
 *
 * Asking through CapacitorHttp puts the question and the answer in one session,
 * and the token comes back in the response body rather than off a cookie.
 *
 * Note this fixes writes only. Anything that must use the WebView's own stack —
 * EventSource for the live admin stream, above all — is still handed an
 * anonymous session, and no client change can fix that. The server's own note
 * in app.ts names the remedy: SESSION_COOKIE_SAMESITE=none in the deployment.
 */
let nativeCsrfToken: string | undefined;

async function fetchNativeCsrfToken(): Promise<string | undefined> {
    try {
        const res = await CapacitorHttp.get({
            url: `${API_BASE}/admin/csrf-token`,
            headers: { Accept: "application/json" },
        });
        if (res.status !== 200) return undefined;
        nativeCsrfToken = res.data?.csrfToken;
        return nativeCsrfToken;
    } catch {
        return undefined;
    }
}

/** Forget it, so the next write fetches a fresh one. */
export function clearNativeCsrfToken(): void {
    nativeCsrfToken = undefined;
}

async function fetchFreshCsrfToken(): Promise<string | undefined> {
    if (typeof window === "undefined") return undefined;
    const response = await fetch(`${API_BASE}/admin/csrf-token`, {
        credentials: "include",
        headers: { "Accept": "application/json" },
    });
    if (!response.ok) return undefined;
    const data = await response.json().catch(() => null);
    return data?.csrfToken || getCsrfToken();
}

async function ensureCsrfToken(method: string): Promise<string | undefined> {
    const upperMethod = method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS", "TRACE"].includes(upperMethod)) return undefined;

    /**
     * Never document.cookie on native — that is the WebView's jar, and the
     * request is about to leave through a different one.
     */
    if (isNative) {
        return nativeCsrfToken ?? (await fetchNativeCsrfToken());
    }

    const existing = getCsrfToken();
    if (existing) return existing;

    return fetchFreshCsrfToken();
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
        try {
            return await nativeFetchApi<T>(fullUrl, { ...requestOptions, timeoutMs, headers: baseHeaders });
        } catch (error) {
            /**
             * One retry with a fresh token.
             *
             * A session that was replaced — the server restarted, or the
             * session rotated — leaves the cached token pointing at a session
             * that no longer exists. The web path has always recovered from
             * this; the native path threw straight out of nativeFetchApi and
             * never reached that code, so the app stayed broken until it was
             * force-closed.
             */
            const failed =
                error instanceof ApiError &&
                error.statusCode === 403 &&
                (error.code === "CSRF_FAILED" || /session validation/i.test(error.message));

            if (failed && !(options as any)?._csrfRetry) {
                clearNativeCsrfToken();
                const fresh = await fetchNativeCsrfToken();
                if (fresh) {
                    return fetchApi<T>(url, { ...options, _csrfRetry: true } as FetchApiOptions);
                }
            }
            throw error;
        }
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
            // Stale CSRF cookie after server restart — clear and retry once with a fresh token
            if (response.status === 403 && (errorData.code === 'CSRF_FAILED' || errorData.error === 'CSRF_FAILED') && !(options as any)?._csrfRetry) {
                clearCsrfCookie();
                const freshToken = await fetchFreshCsrfToken();
                if (freshToken) {
                    return fetchApi<T>(url, { ...options, headers: { ...(options?.headers || {}), "X-XSRF-TOKEN": freshToken }, _csrfRetry: true } as any);
                }
            }
            // Use message from server if available, fallback to error code or default
            const message = errorData.message || errorData.error || "Request failed";
            // Use error code from server (e.g. AI_SERVICE_UNAVAILABLE)
            const code = errorData.code || errorData.error;
            throw new ApiError(message, code, response.status, errorData);
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
