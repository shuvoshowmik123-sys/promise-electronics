export interface ApiErrorPayload {
    error: string;
    code?: string;
    details?: Array<{ field: string; message: string; code?: string }>;
    requestId?: string;
}
