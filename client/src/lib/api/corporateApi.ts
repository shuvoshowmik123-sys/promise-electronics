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

    create: (data: InsertCorporateClient & { portalPassword?: string }) =>
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
        items: {
            corporateJobNumber: string;
            deviceModel: string;
            serialNumber: string;
            initialStatus: "OK" | "NG";
            reportedDefect: string;
        }[];
        receivedBy: string;
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

    parseExcel: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch("/api/corporate/clients/challans/parse-excel", {
            method: "POST",
            body: formData,
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
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || "Failed to parse DOCX");
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

    getCorporateUsers: (clientId: string) => fetchApi<SafeUser[]>(`/admin/users?corporateClientId=${clientId}`),
};

export interface BulkRow {
    corporateJobNumber: string;
    deviceBrand: string;
    model: string;
    serialNumber: string;
    reportedDefect: string;
    initialStatus?: "OK" | "NG";
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
