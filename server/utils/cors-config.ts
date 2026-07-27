import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === "production" ? ".env.production" : ".env") });

const PROD_CANONICAL_ORIGINS = [
    "https://promiseelectronics.com",
    "https://www.promiseelectronics.com",
];

const DEV_LOCAL_ORIGINS = [
    "http://localhost:5083",
    "http://localhost:5173",
    "http://localhost:4173",
    "http://127.0.0.1:5083",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
    "capacitor://localhost",
    "http://localhost",
];

function parseList(env: string | undefined): string[] {
    return (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function getAllowedOrigins(): string[] {
    const isProd = process.env.NODE_ENV === "production";

    const fromEnv = parseList(process.env.FRONTEND_URL);
    const extras = parseList(process.env.EXTRA_ALLOWED_ORIGINS);

    if (isProd) {
        return [...PROD_CANONICAL_ORIGINS, ...fromEnv, ...extras];
    }

    return [...DEV_LOCAL_ORIGINS, ...fromEnv, ...extras, ...PROD_CANONICAL_ORIGINS];
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
    if (!origin) return false;
    return allowed.includes(origin);
}

export function assertProductionCorsConfig(): void {
    if (process.env.NODE_ENV !== "production") return;

    const fromEnv = parseList(process.env.FRONTEND_URL);
    const extras = parseList(process.env.EXTRA_ALLOWED_ORIGINS);
    const total = [...PROD_CANONICAL_ORIGINS, ...fromEnv, ...extras].filter(Boolean);

    if (total.length === 0 || fromEnv.length === 0) {
        const msg =
            "Missing FRONTEND_URL in production. Credentialed CORS cannot safely open to a wildcard. " +
            "Set FRONTEND_URL to the exact frontend origin (e.g. https://www.promiseelectronics.com) " +
            "before starting the server.";
        console.error(`❌ Startup Error: ${msg}`);
        throw new Error(msg);
    }

    const wildcardPattern = /\*/;
    const bad = total.find((o) => wildcardPattern.test(o));
    if (bad) {
        const msg =
            `Refusing to start with wildcard origin in production allowlist: "${bad}". ` +
            "Use exact origins only; wildcards allow credentialed access from untrusted hosts.";
        console.error(`❌ Startup Error: ${msg}`);
        throw new Error(msg);
    }
}