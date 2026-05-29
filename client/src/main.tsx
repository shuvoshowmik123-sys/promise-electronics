import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./lib/i18n";

// ── API URL interceptor for frontend/backend separation ───────────────────────
// When VITE_API_URL is set (e.g. Render backend, Vercel frontend), all relative
// /api/* fetch calls are automatically rewritten to the absolute backend URL.
// In same-origin deploys (VITE_API_URL not set), this is a no-op.
const API_PREFIX = import.meta.env.VITE_API_URL || '';
if (API_PREFIX) {
    const _fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        if (typeof input === 'string' && input.startsWith('/')) {
            input = `${API_PREFIX}${input}`;
        } else if (input instanceof Request && input.url.startsWith('/')) {
            input = new Request(`${API_PREFIX}${input.url}`, input);
        }
        return _fetch(input, init);
    };
}

createRoot(document.getElementById("root")!).render(<App />);
