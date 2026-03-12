import type { Request } from "express";

export function logRouteError(scope: string, req: Request, error: unknown): void {
    const correlationId = (req as any).correlationId ?? "unknown";
    console.error(`[${scope}][${correlationId}]`, error);
}
