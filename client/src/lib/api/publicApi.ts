import { ServiceCatalog, Setting, CustomerReview } from "@shared/schema";
import { fetchApi } from "./httpClient";

// Service Catalog API (public)
export const serviceCatalogApi = {
    getAll: () => fetchApi<ServiceCatalog[]>("/services"),
    getActiveServiceCatalog: () => fetchApi<ServiceCatalog[]>("/services?active=true"),
    getOne: (id: string) => fetchApi<ServiceCatalog>(`/services/${id}`),
};

// Public Settings API (no auth required - for customer portal)
export const publicSettingsApi = {
    getAll: () => fetchApi<Setting[]>("/public/settings"),
};

// Customer Reviews API (public)
export const reviewsApi = {
    getApproved: () => fetchApi<CustomerReview[]>("/reviews"),
    submit: (data: { rating: number; title?: string; content: string }) =>
        fetchApi<CustomerReview>("/reviews", {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

// Camera Lens API
export const lensApi = {
    identifyPart: (image: string) =>
        fetchApi<{ label: string; confidence: number; partInfo?: any; rawText?: string }>("/lens/identify", {
            method: "POST",
            body: JSON.stringify({ image }),
        }),
    assessDamage: (image: string) =>
        fetchApi<{ damage: string[]; rawText?: string }>("/lens/assess", {
            method: "POST",
            body: JSON.stringify({ image }),
        }),
    readBarcode: (image: string) =>
        fetchApi<{ barcode: string; partInfo?: any }>("/lens/barcode", {
            method: "POST",
            body: JSON.stringify({ image }),
        }),
};

// AI API
export const aiApi = {
    transliterate: (text: string) =>
        fetchApi<{ text: string }>("/ai/transliterate", {
            method: "POST",
            body: JSON.stringify({ text }),
        }),
    suggestTechnician: (jobDescription: string) =>
        fetchApi<{ technicianId: string; reason: string } | null>("/ai/suggest-tech", {
            method: "POST",
            body: JSON.stringify({ jobDescription }),
        }),
    inspectImage: (base64Image: string) =>
        fetchApi<{ component: string; damage: string[]; likelyCause: string; severity: string } | null>("/ai/inspect", {
            method: "POST",
            body: JSON.stringify({ image: base64Image }),
        }),
    chat: (message: string, history: any[], image?: string, modelType: 'customer' | 'admin' = 'customer') =>
        fetchApi<{ text: string; visual?: any; settingsAction?: any; booking?: any; ticketData?: any; error?: boolean; errorCode?: string }>("/ai/chat", {
            method: "POST",
            body: JSON.stringify({ message, history, image, modelType }),
        }),
    applySettings: (changes: any[]) =>
        fetchApi<void>("/ai/apply-settings", {
            method: "POST",
            body: JSON.stringify({ changes }),
        }),
    getSuggestions: () => fetchApi<any>("/ai/suggestions"),
    getDebugSuggestions: () => fetchApi<any[]>("/ai/debug-suggestions"),
    updateDebugStatus: (id: number, status: string) =>
        fetchApi<void>(`/ai/debug-suggestions/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
    saveFeedback: (messageId: string, rating: 'positive' | 'negative', comment?: string) =>
        fetchApi<void>("/ai/feedback", {
            method: "POST",
            body: JSON.stringify({ messageId, rating, comment }),
        }),
};
