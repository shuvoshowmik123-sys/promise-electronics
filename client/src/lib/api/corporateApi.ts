import { CorporateClient, InsertCorporateClient, JobTicket, User, ServiceRequest, CorporateMessageThread, CorporateMessage } from "@shared/schema";
import { fetchApi } from "./httpClient";
import { PaginationResult, SafeUser } from "./types";

export const corporateApi = {
    // Client Management
    getAll: () => fetchApi<CorporateClient[]>("/corporate/clients"),
    getOne: (id: string) => fetchApi<CorporateClient>(`/corporate/clients/${id}`),
    update: (id: string, data: Partial<InsertCorporateClient>) =>
        fetchApi<CorporateClient>(`/corporate/clients/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    getBranches: (id: string) => fetchApi<CorporateClient[]>(`/corporate/clients/${id}/branches`),
    getRules: (id: string) => fetchApi<any>(`/corporate/clients/${id}/rules`),
    updateRules: (id: string, data: any) =>
        fetchApi<any>(`/corporate/clients/${id}/rules`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    getBatches: (id: string) => fetchApi<any[]>(`/corporate/clients/${id}/batches`),
    getExtensionRequests: (id: string) => fetchApi<any[]>(`/corporate/clients/${id}/extension-requests`),
    createExtensionRequest: (batchId: string, data: { jobId: string; reason: string; requestedUntil: Date | string }) =>
        fetchApi<any>(`/corporate/batches/${batchId}/extension-requests`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    updateExtensionRequest: (id: string, data: { status: "accepted" | "rejected" | "cancelled"; responseNote?: string }) =>
        fetchApi<any>(`/corporate/extension-requests/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),

    create: (data: InsertCorporateClient & { portalPassword?: string; portalUsers?: Array<{ name?: string; username: string; password: string; email?: string; phone?: string }> }) =>
        fetchApi<CorporateClient>("/corporate/clients", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    getChallanJobs: (id: string) => fetchApi<JobTicket[]>(`/corporate/challans/${id}/jobs`),
    getClientJobs: (clientId: string, page = 1, limit = 50) => fetchApi<{
        jobs: JobTicket[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>(`/corporate/clients/${clientId}/jobs?page=${page}&limit=${limit}`),

    getCorporateClientChallans: (clientId: string, page = 1, limit = 50) => fetchApi<{
        items: any[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            pages: number;
        };
    }>(`/corporate/clients/${clientId}/challans?page=${page}&limit=${limit}`),

    createChallanIn: (data: {
        corporateClientId: string;
        workType?: "full_tv" | "panel" | "panel_batch" | "board" | "parts" | "parts_sale" | "crr";
        items: {
            corporateJobNumber: string;
            deviceModel: string;
            serialNumber: string;
            initialStatus: "OK" | "NG";
            status?: "Received" | "Pending" | "Declared OK" | "Declared NG";
            reportedDefect: string;
            workType?: "full_tv" | "panel" | "panel_batch" | "board" | "parts" | "parts_sale" | "crr";
            ticketType?: "full_device" | "panel_only" | "motherboard_only" | "parts_only";
            jobType?: "standard" | "warranty_claim";
            parentJobId?: string;
            crrReviewStatus?: "new_job" | "crr" | "ignore" | "super_admin_review";
            crrReason?: string;
        }[];
        receivedBy: string;
        receivedAt?: Date;
    }) => fetchApi<{ challanId: string; jobIds: string[] }>("/corporate/challans/in", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    createChallanOut: (data: {
        corporateClientId: string;
        challanInId?: string;
        jobIds: string[];
        receiverName?: string;
        receiverPhone?: string;
        receiverSignature?: string;
    }) => fetchApi<{ challanOutId: string }>("/corporate/challans/out", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    getBills: (clientId: string) => fetchApi<any[]>(`/corporate/clients/${clientId}/bills`),
    getBill: (id: string) => fetchApi<any>(`/corporate/bills/${id}`),

    generateBill: (data: {
        corporateClientId: string;
        jobIds: string[];
        periodStart: Date;
        periodEnd: Date;
    }) => fetchApi<any>("/corporate/bills/generate", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    autoGenerateStatement: (data: {
        corporateClientId: string;
        year: number;
        month: number;
    }) => fetchApi<any>("/corporate/bills/auto-generate", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    updateJobStatus: (id: string, status: string) =>
        fetchApi<void>(`/corporate/jobs/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status })
        }),

    updateJob: (id: string, data: Partial<{
        status: string;
        technician: string | null;
        problemFound: string | null;
        notes: string | null;
        estimatedCost: number | null;
        serviceLines: string | null;
        productLines: string | null;
        warrantyDays: number | null;
        gracePeriodDays: number | null;
        reportedDefect: string | null;
    }>) =>
        fetchApi<JobTicket>(`/job-tickets/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data)
        }),

    parseExcel: async (file: File, options?: { clientId?: string; mappings?: unknown }) => {
        const formData = new FormData();
        formData.append('file', file);
        if (options?.clientId) formData.append('clientId', options.clientId);
        if (options?.mappings) formData.append('mappings', JSON.stringify(options.mappings));

        const res = await fetch("/api/corporate/clients/challans/parse-excel", {
            method: "POST",
            body: formData,
        }).catch(() => {
            throw new Error("Backend is not reachable. Please check the server and try importing again.");
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to parse Excel");
        }
        return res.json();
    },

    parseDocx: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch("/api/corporate/clients/challans/parse-docx", {
            method: "POST",
            body: formData,
        }).catch(() => {
            throw new Error("Backend is not reachable. Please check the server and try importing again.");
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to parse DOCX");
        }
        return res.json();
    },

    parsePptx: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch("/api/corporate/clients/challans/parse-pptx", {
            method: "POST",
            body: formData,
        }).catch(() => {
            throw new Error("Backend is not reachable. Please check the server and try importing again.");
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to parse PPTX");
        }
        return res.json();
    },

    // User Management
    createCorporateUser: (data: {
        corporateClientId: string;
        name: string;
        email: string;
        username: string;
    }) => fetchApi<{ user: User, temporaryPassword?: string }>("/admin/corporate-users", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    resetCorporateUserPassword: (id: string) =>
        fetchApi<{ user: User; temporaryPassword: string }>(`/admin/corporate-users/${id}/reset-password`, {
            method: "POST",
        }),

    generateCorporateUserResetOtp: (id: string) =>
        fetchApi<{
            request: {
                id: string;
                userId: string;
                username?: string | null;
                name?: string | null;
                corporateClientId: string;
                expiresAt: string;
            };
            code: string;
        }>(`/admin/corporate-users/${id}/reset-otp`, {
            method: "POST",
        }),

    getCorporateResetRequests: (clientId: string) =>
        fetchApi<Array<{
            id: string;
            userId: string;
            corporateClientId: string;
            status: string;
            attempts: number;
            maxAttempts: number;
            expiresAt?: string | null;
            usedAt?: string | null;
            createdAt: string;
            user: {
                name?: string | null;
                username?: string | null;
                email?: string | null;
            };
        }>>(`/admin/corporate-users/reset-requests?corporateClientId=${clientId}`),

    getCorporateUsers: (clientId: string) => fetchApi<SafeUser[]>(`/admin/users?corporateClientId=${clientId}`),
};

export const corporatePasswordResetApi = {
    request: (username: string) =>
        fetchApi<{ message: string }>("/corporate/auth/password-reset/request", {
            method: "POST",
            body: JSON.stringify({ username }),
        }),
    complete: (data: { username: string; code: string; password: string; confirmPassword: string }) =>
        fetchApi<{ message: string }>("/corporate/auth/password-reset/complete", {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

export interface BulkRow {
    corporateJobNumber: string;
    deviceBrand: string;
    model: string;
    serialNumber: string;
    reportedDefect: string;
    initialStatus?: "OK" | "NG";
    status?: "Received" | "Pending" | "Declared OK" | "Declared NG";
    customerName?: string;
    externalJobRef?: string;
    challanNumber?: string;
    itemType?: string;
    batchNumber?: string;
    receivedDate?: string;
    physicalCondition?: string;
    accessories?: string;
    notes?: string;
}

export type BulkUploadResult = {
    success: number;
    failed: number;
    errors: string[];
    createdJobs: string[];
};

export const corporatePortalApi = {
    getDashboardStats: () => fetchApi<{
        activeJobs: number;
        pendingApprovals: number;
        totalSpentMonth: number;
        recentActivity: any[];
    }>("/corporate/dashboard"),

    getJobs: (params?: { page?: number; limit?: number; status?: string }) => {
        const query = new URLSearchParams();
        if (params?.page) query.append("page", params.page.toString());
        if (params?.limit) query.append("limit", params.limit.toString());
        if (params?.status) query.append("status", params.status);
        return fetchApi<PaginationResult<JobTicket>>(`/corporate/jobs?${query.toString()}`);
    },

    getJob: (id: string) => fetchApi<JobTicket>(`/corporate/jobs/${id}`),
    getExtensionRequests: () => fetchApi<any[]>("/corporate/extension-requests"),
    respondExtensionRequest: (id: string, data: { status: "accepted" | "rejected"; responseNote?: string }) =>
        fetchApi<any>(`/corporate/extension-requests/${id}/respond`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),

    createServiceRequest: (data: {
        deviceModel: string;
        serialNumber: string;
        description: string;
        priority?: string;
    }) => fetchApi<ServiceRequest>("/corporate/service-requests", {
        method: "POST",
        body: JSON.stringify(data)
    }),

    bulkServiceRequests: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return fetchApi<BulkUploadResult>("/corporate/service-requests/bulk", {
            method: "POST",
            body: formData,
        });
    },

    bulkServiceRequestsJson: (rows: BulkRow[]) => {
        return fetchApi<BulkUploadResult>("/corporate/service-requests/bulk-json", {
            method: "POST",
            body: JSON.stringify({ rows }),
        });
    },

    checkExistingJobs: (jobNumbers: string[]) => {
        return fetchApi<{ existing: string[] }>("/corporate/service-requests/batch-check", {
            method: "POST",
            body: JSON.stringify({ jobNumbers }),
        });
    },
};

export interface CorporateNotification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'repair' | 'shop';
    link?: string;
    read: boolean;
    createdAt: string;
    jobId?: string;
    corporateClientId?: string;
}

export const corporateNotificationsApi = {
    getAll: () => fetchApi<CorporateNotification[]>('/corporate/notifications'),
    getUnreadCount: () => fetchApi<{ count: number }>('/corporate/notifications/unread-count'),
    markAsRead: (id: string) => fetchApi<CorporateNotification>(`/corporate/notifications/${id}/read`, {
        method: 'PATCH',
    }),
    markAllAsRead: () => fetchApi<{ success: boolean; message: string }>('/corporate/notifications/mark-all-read', {
        method: 'POST',
    }),
    getTypes: () => fetchApi<Record<string, { title: string; message: string; type: string }>>('/corporate/notifications/types'),
    createJobCompleted: (data: {
        corporateClientId: string;
        jobId: string;
        device: string;
        message?: string;
        link?: string;
    }) => fetchApi<{ success: boolean; result: CorporateNotification }>('/corporate/notifications/job-completed', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    createJobStatusUpdate: (data: {
        corporateClientId: string;
        jobId: string;
        device: string;
        oldStatus: string;
        newStatus: string;
        link?: string;
    }) => fetchApi<{ success: boolean; result: CorporateNotification }>('/corporate/notifications/job-status-update', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};

export const corporateMessagesApi = {
    getThreads: () => fetchApi<CorporateMessageThread[]>('/corporate/messages/threads'),
    getDefaultThread: () => fetchApi<CorporateMessageThread>('/corporate/messages/default-thread'),
    getMessages: (threadId: string) => fetchApi<CorporateMessage[]>(`/corporate/messages/threads/${threadId}`),
    createThread: (data: { subject: string }) => fetchApi<CorporateMessageThread>('/corporate/messages/threads', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    sendMessage: (threadId: string, data: { content?: string; messageType?: string; attachments?: any[] }) =>
        fetchApi<CorporateMessage>(`/corporate/messages/threads/${threadId}`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    getUnreadCount: () => fetchApi<{ count: number }>('/corporate/messages/unread-count'),

    // Admin endpoints
    adminGetAllThreads: () => fetchApi<Array<CorporateMessageThread & {
        clientName: string;
        unreadCount: number;
        lastMessageSnippet?: string;
    }>>('/admin/corporate-messages/threads'),

    adminGetThread: (threadId: string) => fetchApi<CorporateMessageThread & {
        clientName: string;
        messages: (CorporateMessage & { senderName?: string })[]
    }>(`/admin/corporate-messages/threads/${threadId}`),

    adminSendMessage: (threadId: string, data: {
        content?: string;
        messageType?: string;
        attachments?: any[]
    }) => fetchApi<CorporateMessage>(`/admin/corporate-messages/threads/${threadId}/reply`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    adminMarkAsRead: (threadId: string) => fetchApi<void>(`/admin/corporate-messages/threads/${threadId}/mark-read`, {
        method: 'PATCH',
    }),

    adminUpdateThreadStatus: (threadId: string, status: 'open' | 'closed' | 'archived') =>
        fetchApi<CorporateMessageThread>(`/admin/corporate-messages/threads/${threadId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        }),
};
