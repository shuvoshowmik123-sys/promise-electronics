import type {
    JobTicket, InsertJobTicket, InventoryItem, InsertInventoryItem, Challan,
    PettyCashRecord, InsertPettyCashRecord, DueRecord, InsertDueRecord,
    Product, InsertProduct, Setting, InsertSetting, PosTransaction,
    InsertPosTransaction, User, InsertUser, ServiceRequest, InsertServiceRequest,
    AttendanceRecord, ServiceCatalog, InsertServiceCatalog, PurchaseOrder,
    InsertPurchaseOrder, PurchaseOrderItem, InsertPurchaseOrderItem,
    LocalPurchase, InsertLocalPurchase, PickupSchedule, CustomerReview,
    Notification, Refund, InsertRefund, RollbackRequest, WastageLog, InsertWastageLog,
    DrawerSession, InsertDrawerSession, SystemModule, CorporateClient, InsertCorporateClient,
    CorporateMessageThread, CorporateMessage, Quotation, InsertQuotation, QuotationItem, InsertQuotationItem
} from "@shared/schema";
import { fetchApi } from "./httpClient";
import { PaginationResult, Order, ProductVariant, AdminCustomer, CustomerDetails, SafeUser } from "./types";

// Audit Logs API
export const auditLogsApi = {
    getAll: (filters?: { userId?: string, entity?: string, limit?: number, startDate?: string, endDate?: string }) => {
        const params = new URLSearchParams();
        if (filters?.userId) params.append('userId', filters.userId);
        if (filters?.entity) params.append('entity', filters.entity);
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.startDate) params.append('startDate', filters.startDate);
        if (filters?.endDate) params.append('endDate', filters.endDate);
        const query = params.toString();
        return fetchApi<any[]>(`/audit-logs${query ? `?${query}` : ''}`);
    }
};

// Job Tickets API
export const jobTicketsApi = {
    getAll: (type: "all" | "walk-in" | "corporate" = "all") => fetchApi<{ items: JobTicket[]; pagination: { total: number; page: number; limit: number; pages: number } }>(`/job-tickets?type=${type}`),
    getReadyForBilling: () => fetchApi<JobTicket[]>("/job-tickets/ready-for-billing"),
    getPendingRollbacks: () => fetchApi<RollbackRequest[]>("/job-tickets/pending-rollbacks"),
    getOne: (id: string) => fetchApi<JobTicket>(`/job-tickets/${id}`),
    getHistory: (id: string) => fetchApi<any[]>(`/job-tickets/${id}/history`),
    getNextNumber: () => fetchApi<{ nextNumber: string }>("/job-tickets/next-number"),
    create: (data: Partial<InsertJobTicket>) =>
        fetchApi<JobTicket>("/job-tickets", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, updates: Partial<InsertJobTicket>) =>
        fetchApi<JobTicket>(`/job-tickets/${id}`, {
            method: "PATCH",
            body: JSON.stringify(updates),
        }),
    bulkUpdate: (payload: { jobIds: string[], updates: Partial<InsertJobTicket> }) =>
        fetchApi<{ success: boolean; count: number; updated: JobTicket[] }>(`/job-tickets/bulk-update`, {
            method: "POST",
            body: JSON.stringify(payload),
        }),
    advanceStatus: (id: string) =>
        fetchApi<JobTicket>(`/job-tickets/${id}/advance-status`, {
            method: "POST",
        }),
    requestRollback: (id: string, reason: string, targetStatus: string) =>
        fetchApi<any>(`/job-tickets/${id}/request-rollback`, {
            method: "POST",
            body: JSON.stringify({ reason, targetStatus }),
        }),
    verifyRollback: (id: string, rollbackId: number, approved: boolean, rejectionReason?: string) =>
        fetchApi<any>(`/job-tickets/${id}/verify-rollback`, {
            method: "POST",
            body: JSON.stringify({ rollbackId, approved, rejectionReason }),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/job-tickets/${id}`, {
            method: "DELETE",
        }),
    generateInvoice: (id: string) =>
        fetchApi<JobTicket>(`/job-tickets/${id}/generate-invoice`, {
            method: "POST",
        }),
    markIncomplete: (id: string, reason?: string) =>
        fetchApi<JobTicket>(`/job-tickets/${id}/mark-incomplete`, {
            method: "POST",
            body: JSON.stringify({ reason }),
        }),
    recordPayment: (id: string, data: { paymentId: string; amount: number; method: string }) =>
        fetchApi<JobTicket>(`/job-tickets/${id}/record-payment`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    writeOff: (id: string, reason: string) =>
        fetchApi<JobTicket>(`/job-tickets/${id}/write-off`, {
            method: "POST",
            body: JSON.stringify({ reason }),
        }),
};

// System Modules API
export const modulesApi = {
    getAll: () => fetchApi<SystemModule[]>("/modules"),
    getOne: (id: string) => fetchApi<SystemModule>(`/modules/${id}`),
    toggle: (id: string, portal: "admin" | "customer" | "corporate" | "technician", enabled: boolean) =>
        fetchApi<SystemModule>(`/modules/${id}/toggle`, {
            method: "PUT",
            body: JSON.stringify({ portal, enabled }),
        }),
    applyPreset: (preset: "admin_only" | "retail" | "b2b" | "full_business" | "max_power") =>
        fetchApi<SystemModule[]>("/modules/bulk-preset", {
            method: "POST",
            body: JSON.stringify({ preset }),
        }),
};

// Inventory API
export const inventoryApi = {
    getAll: () => fetchApi<InventoryItem[]>("/inventory"),
    getOne: (id: string) => fetchApi<InventoryItem>(`/inventory/${id}`),
    create: (data: InsertInventoryItem) =>
        fetchApi<InventoryItem>("/inventory", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<InsertInventoryItem>) =>
        fetchApi<InventoryItem>(`/inventory/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    updateStock: (id: string, quantity: number) =>
        fetchApi<InventoryItem>(`/inventory/${id}/stock`, {
            method: "PATCH",
            body: JSON.stringify({ quantity }),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/inventory/${id}`, {
            method: "DELETE",
        }),
    getSerials: (id: string) => fetchApi<any[]>(`/inventory/${id}/serials`),
    addSerials: (id: string, serials: string[]) =>
        fetchApi<any[]>(`/inventory/${id}/serials`, {
            method: "POST",
            body: JSON.stringify({ serials }),
        }),
    getWebsiteItems: () => fetchApi<InventoryItem[]>("/shop/inventory"),
    bulkImport: (items: Partial<InsertInventoryItem>[]) =>
        fetchApi<{ imported: number; errors: string[] }>("/inventory/bulk-import", {
            method: "POST",
            body: JSON.stringify({ items }),
        }),
};

// Purchase Orders API
export const purchaseOrdersApi = {
    getAll: () => fetchApi<PurchaseOrder[]>("/purchase-orders"),
    getById: (id: string) => fetchApi<PurchaseOrder>(`/purchase-orders/${id}`),
    getItems: (id: string) => fetchApi<PurchaseOrderItem[]>(`/purchase-orders/${id}/items`),
    create: (data: { order: InsertPurchaseOrder; items: InsertPurchaseOrderItem[] }) =>
        fetchApi<PurchaseOrder>("/purchase-orders", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    updateStatus: (id: string, status: string) =>
        fetchApi<PurchaseOrder>(`/purchase-orders/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
};

// Challans API
export const challansApi = {
    getAll: (type?: "IN" | "OUT") => fetchApi<Challan[]>(type ? `/challans?type=${type}` : "/challans"),
    getOne: (id: string) => fetchApi<Challan>(`/challans/${id}`),
    create: (data: any) =>
        fetchApi<Challan>("/challans", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    updateStatus: (id: string, status: string) =>
        fetchApi<Challan>(`/challans/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
    print: (id: string) => fetchApi<Challan>(`/challans/${id}/print`),
};

// Petty Cash API
export const pettyCashApi = {
    getAll: (filters?: { page?: number; limit?: number; search?: string; from?: string; to?: string; type?: string }) => {
        const params = new URLSearchParams();
        if (filters?.page) params.append('page', filters.page.toString());
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.search) params.append('search', filters.search);
        if (filters?.from) params.append('from', filters.from);
        if (filters?.to) params.append('to', filters.to);
        if (filters?.type) params.append('type', filters.type);
        const query = params.toString();
        return fetchApi<PaginationResult<PettyCashRecord>>(`/petty-cash${query ? `?${query}` : ''}`);
    },
    getSummary: (filters?: { from?: string; to?: string }) => {
        const params = new URLSearchParams();
        if (filters?.from) params.append('from', filters.from);
        if (filters?.to) params.append('to', filters.to);
        const query = params.toString();
        return fetchApi<{ totalIncome: number; totalExpense: number; count: number }>(`/petty-cash/summary${query ? `?${query}` : ''}`);
    },
    create: (data: InsertPettyCashRecord) =>
        fetchApi<PettyCashRecord>("/petty-cash", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/petty-cash/${id}`, {
            method: "DELETE",
        }),
};

// Due Records API
export const dueRecordsApi = {
    getAll: (filters?: { page?: number; limit?: number; search?: string; status?: string; from?: string; to?: string }) => {
        const params = new URLSearchParams();
        if (filters?.page) params.append('page', filters.page.toString());
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.search) params.append('search', filters.search);
        if (filters?.status) params.append('status', filters.status);
        if (filters?.from) params.append('from', filters.from);
        if (filters?.to) params.append('to', filters.to);
        const query = params.toString();
        return fetchApi<PaginationResult<DueRecord>>(`/due-records${query ? `?${query}` : ''}`);
    },
    getSummary: (filters?: { from?: string; to?: string }) => {
        const params = new URLSearchParams();
        if (filters?.from) params.append('from', filters.from);
        if (filters?.to) params.append('to', filters.to);
        const query = params.toString();
        return fetchApi<{ totalDueAmount: number; overdueCount: number; pendingCount: number }>(`/due-records/summary${query ? `?${query}` : ''}`);
    },
    create: (data: InsertDueRecord) =>
        fetchApi<DueRecord>("/due-records", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<InsertDueRecord>) =>
        fetchApi<DueRecord>(`/due-records/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/due-records/${id}`, {
            method: "DELETE",
        }),
};

// Drawer API
export interface DrawerDayCloseRunResult {
    executed: boolean;
    reason?: string;
    sessionId?: string;
    updatedStatus?: string;
    closedAt?: string;
    outcome?: string;
    notes?: string;
}

export type DrawerOpeningVarianceStatus = "balanced" | "surplus" | "shortage";

export type DrawerSessionWithOpeningVariance = DrawerSession & {
    openingBaselineFloat?: number;
    openingDifference?: number;
    openingVarianceStatus?: DrawerOpeningVarianceStatus;
};

export const drawerApi = {
    getActive: () => fetchApi<DrawerSessionWithOpeningVariance | null>('/drawer/active'),
    getHistory: (query?: string) => fetchApi<PaginationResult<DrawerSession>>(`/drawer/history${query || ''}`),
    open: (data: Partial<InsertDrawerSession>) => fetchApi<DrawerSessionWithOpeningVariance>('/drawer/open', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    drop: (id: string, declaredCash: number) => fetchApi<any>(`/drawer/${id}/drop`, {
        method: 'POST',
        body: JSON.stringify({ declaredCash }),
    }),
    reconcile: (id: string, data: { status: string; notes?: string; closedBy: string; closedByName: string }) => fetchApi<DrawerSession>(`/drawer/${id}/reconcile`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    getSummary: (id: string) => fetchApi<any>(`/drawer/${id}/summary`),
    justify: (id: string, data: { amount: number; description: string; justifiedBy: string; justifiedByName: string }) => fetchApi<any>(`/drawer/${id}/justify`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    closeDay: (id: string, data: { mode: "reconciled" | "under_review"; note?: string }) => fetchApi<DrawerDayCloseRunResult>(`/drawer/${id}/close-day`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    runDayCloseNow: () => fetchApi<DrawerDayCloseRunResult>('/drawer/day-close/run-now', {
        method: 'POST',
    }),
};

// Refunds API
export const refundsApi = {
    getAll: (filters?: { status?: string; page?: number; limit?: number }) => {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.page) params.append('page', filters.page.toString());
        if (filters?.limit) params.append('limit', filters.limit.toString());
        const query = params.toString();
        return fetchApi<{ items: Refund[]; pagination: { total: number; page: number; limit: number; pages: number } }>(`/refunds${query ? `?${query}` : ''}`);
    },
    getOne: (id: string) => fetchApi<Refund>(`/refunds/${id}`),
    create: (data: Partial<InsertRefund>) =>
        fetchApi<Refund>("/refunds", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    approve: (id: string, data: { approvedBy: string; approvedByName: string; approvedByRole: string }) =>
        fetchApi<Refund>(`/refunds/${id}/approve`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    reject: (id: string, data: { approvedBy: string; approvedByName: string; approvedByRole: string; rejectionReason: string }) =>
        fetchApi<Refund>(`/refunds/${id}/reject`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    process: (id: string, data: { processedBy: string; processedByName: string; processedByRole: string; refundMethod: string }) =>
        fetchApi<{ refund: Refund; pettyCashEntry: any }>(`/refunds/${id}/process`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
};

// Products API
export const productsApi = {
    getAll: () => fetchApi<Product[]>("/products"),
    getOne: (id: string) => fetchApi<Product>(`/products/${id}`),
    create: (data: InsertProduct) =>
        fetchApi<Product>("/products", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<InsertProduct>) =>
        fetchApi<Product>(`/products/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/products/${id}`, {
            method: "DELETE",
        }),
};

export const searchApi = {
    global: (query: string) =>
        fetchApi<{
            jobs: any[];
            customers: any[];
            serviceRequests: any[];
            posTransactions: any[];
            inventory: any[];
            challans: any[];
            counts: {
                jobs: number;
                customers: number;
                serviceRequests: number;
                posTransactions: number;
                inventory: number;
                challans: number;
            };
        }>(`/admin/search?q=${encodeURIComponent(query)}`),
};

// Settings API
export const settingsApi = {
    getAll: () => fetchApi<Setting[]>("/settings"),
    getOne: (key: string) => fetchApi<Setting>(`/settings/${key}`),
    upsert: (data: InsertSetting) =>
        fetchApi<Setting>("/settings", {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

// POS Transactions API
export const posTransactionsApi = {
    getAll: (filters?: { page?: number; limit?: number; search?: string; paymentMethod?: string; from?: string; to?: string }) => {
        const params = new URLSearchParams();
        if (filters?.page) params.append('page', filters.page.toString());
        if (filters?.limit) params.append('limit', filters.limit.toString());
        if (filters?.search) params.append('search', filters.search);
        if (filters?.paymentMethod) params.append('paymentMethod', filters.paymentMethod);
        if (filters?.from) params.append('from', filters.from);
        if (filters?.to) params.append('to', filters.to);
        const query = params.toString();
        return fetchApi<PaginationResult<PosTransaction>>(`/pos-transactions${query ? `?${query}` : ''}`);
    },
    getSummary: (filters?: { from?: string; to?: string }) => {
        const params = new URLSearchParams();
        if (filters?.from) params.append('from', filters.from);
        if (filters?.to) params.append('to', filters.to);
        const query = params.toString();
        return fetchApi<{ totalSales: number; count: number; byMethod: Record<string, number> }>(`/pos-transactions/summary${query ? `?${query}` : ''}`);
    },
    getOne: (id: string) => fetchApi<PosTransaction>(`/pos-transactions/${id}`),
    create: (data: InsertPosTransaction) =>
        fetchApi<PosTransaction>("/pos-transactions", {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

// Users API
export const usersApi = {
    getAll: () => fetchApi<User[]>("/users"),
    getOne: (id: string) => fetchApi<User>(`/users/${id}`),
    create: (data: InsertUser) =>
        fetchApi<User>("/users", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<InsertUser>) =>
        fetchApi<User>(`/users/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
};

// Service Requests API
export const serviceRequestsApi = {
    getAll: () => fetchApi<{ items: ServiceRequest[]; pagination: { total: number; page: number; limit: number; pages: number } }>("/service-requests"),
    getOne: (id: string) => fetchApi<ServiceRequest>(`/service-requests/${id}`),
    create: (data: InsertServiceRequest) =>
        fetchApi<ServiceRequest>("/service-requests", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<InsertServiceRequest>) =>
        fetchApi<ServiceRequest>(`/service-requests/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/service-requests/${id}`, {
            method: "DELETE",
        }),
    markInteracted: (id: string) =>
        fetchApi<ServiceRequest>(`/admin/service-requests/${id}/mark-interacted`, {
            method: "POST",
        }),
    verifyAndConvert: (id: string, data: { verificationNotes?: string; priority?: string }) =>
        fetchApi<{ serviceRequest: ServiceRequest; jobTicket: JobTicket }>(`/admin/service-requests/${id}/verify-and-convert`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

export interface AdminDashboardRevenuePoint {
    name: string;
    value: number;
}

export interface AdminDashboardJobStatusPoint {
    name: string;
    value: number;
}

export interface AdminDashboardTechLoad {
    name: string;
    jobs: number;
}

export interface AdminDashboardJobSummary {
    id: string;
    ticketNumber: string;
    deviceModel: string;
    problemDescription: string;
    technician: string | null;
    status: string;
    customerName: string;
    createdAt: string | Date | null;
    updatedAt: string | Date | null;
}

export interface AdminAggregatedDashboard {
    revenueData: AdminDashboardRevenuePoint[];
    jobStatusData: AdminDashboardJobStatusPoint[];
    techData: AdminDashboardTechLoad[];
    lowStockItems: InventoryItem[];
    activeJobsList: AdminDashboardJobSummary[];
    pendingJobsList: AdminDashboardJobSummary[];
    recentJobs: AdminDashboardJobSummary[];
    totalRevenue: number;
    posRevenueThisMonth: number;
    corporateRevenueThisMonth: number;
    totalWastageLoss: number;
    activeCount: number;
    pendingCount: number;
    lowStockCount: number;
    wastageCount: number;
}

// Admin Authentication API
export const adminAuthApi = {
    login: (data: { username?: string; password?: string }) =>
        fetchApi<Omit<User, "password">>("/admin/login", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    logout: () =>
        fetchApi<{ message: string }>("/admin/logout", {
            method: "POST",
        }),
    me: () => fetchApi<Omit<User, "password">>("/admin/me"),
    wipeData: () => fetchApi<{ message: string }>("/admin/data/all", { method: "DELETE", body: JSON.stringify({ confirmation: 'DELETE ALL' }) }),
    getAggregatedDashboard: () => fetchApi<AdminAggregatedDashboard>("/admin/dashboard"),
};

// Admin Users API
export const adminUsersApi = {
    getAll: () => fetchApi<SafeUser[]>("/admin/users"),
    lookup: () => fetchApi<{ items: SafeUser[] }>("/users/lookup").then(res => res.items),
    create: (data: {
        username: string;
        name: string;
        email: string;
        password: string;
        role: "Super Admin" | "Manager" | "Cashier" | "Technician";
        permissions?: string;
    }) =>
        fetchApi<SafeUser>("/admin/users", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<{
        username: string;
        name: string;
        email: string;
        password: string;
        role: "Super Admin" | "Manager" | "Cashier" | "Technician";
        status: "Active" | "Inactive";
        permissions: string;
    }>) =>
        fetchApi<SafeUser>(`/admin/users/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/admin/users/${id}`, {
            method: "DELETE",
        }),
};

// Attendance API
export const attendanceApi = {
    getAll: () => fetchApi<AttendanceRecord[]>("/admin/attendance"),
    getByDate: (date: string) => fetchApi<AttendanceRecord[]>(`/admin/attendance/date/${date}`),
    getByUser: (userId: string) => fetchApi<AttendanceRecord[]>(`/admin/attendance/user/${userId}`),
    getToday: () => fetchApi<AttendanceRecord | null>("/admin/attendance/today"),
    checkIn: (notes?: string) =>
        fetchApi<AttendanceRecord>("/admin/attendance/check-in", {
            method: "POST",
            body: JSON.stringify({ notes }),
        }),
    checkOut: () =>
        fetchApi<AttendanceRecord>("/admin/attendance/check-out", {
            method: "POST",
        }),
    getJobsByTechnician: (name: string) => fetchApi<JobTicket[]>(`/admin/jobs/technician/${encodeURIComponent(name)}`),
};

// Technician Personal Dashboard API
export interface TechnicianStats {
    assigned: number;
    completed: number;
    pending: number;
    inProgress: number;
}
export interface TechnicianJob extends JobTicket {
    pendingDays: number;
}
export const technicianApi = {
    getStats: () => fetchApi<TechnicianStats>("/technician/stats"),
    getJobs: (status?: 'all' | 'pending' | 'completed') =>
        fetchApi<TechnicianJob[]>(`/technician/jobs${status ? `?status=${status}` : ''}`),
};

// Product Variants API
export const productVariantsApi = {
    getByProduct: (productId: string) => fetchApi<ProductVariant[]>(`/products/${productId}/variants`),
    create: (productId: string, data: { variantName: string; price: string; stock: number; sku?: string }) =>
        fetchApi<ProductVariant>(`/admin/products/${productId}/variants`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (productId: string, variantId: string, data: Partial<{ variantName: string; price: string; stock: number; sku?: string }>) =>
        fetchApi<ProductVariant>(`/admin/products/${productId}/variants/${variantId}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (productId: string, variantId: string) =>
        fetchApi<void>(`/admin/products/${productId}/variants/${variantId}`, {
            method: "DELETE",
        }),
    deleteAll: (productId: string) =>
        fetchApi<void>(`/admin/products/${productId}/variants`, {
            method: "DELETE",
        }),
};

// Admin Orders API
export const adminOrdersApi = {
    getAll: () => fetchApi<Order[]>("/admin/orders"),
    getOne: (id: string) => fetchApi<Order>(`/admin/orders/${id}`),
    update: (id: string, data: { status?: string; declineReason?: string; notes?: string }) =>
        fetchApi<Order>(`/admin/orders/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    accept: (id: string) =>
        fetchApi<Order>(`/admin/orders/${id}/accept`, {
            method: "POST",
        }),
    decline: (id: string, reason?: string) =>
        fetchApi<Order>(`/admin/orders/${id}/decline`, {
            method: "POST",
            body: JSON.stringify({ reason }),
        }),
};

export const adminCustomersApi = {
    getAll: () => fetchApi<AdminCustomer[]>("/admin/customers"),
    getOne: (id: string) => fetchApi<CustomerDetails>(`/admin/customers/${id}`),
    create: (data: { name: string; email?: string; phone: string; address?: string }) =>
        fetchApi<AdminCustomer>("/admin/customers", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: { name?: string; email?: string; phone?: string; address?: string; isVerified?: boolean }) =>
        fetchApi<AdminCustomer>(`/admin/customers/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/admin/customers/${id}`, {
            method: "DELETE",
        }),
};

export const adminServiceCatalogApi = {
    getAll: () => fetchApi<ServiceCatalog[]>("/admin/services"),
    create: (data: InsertServiceCatalog) =>
        fetchApi<ServiceCatalog>("/admin/services", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<InsertServiceCatalog>) =>
        fetchApi<ServiceCatalog>(`/admin/services/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/admin/services/${id}`, {
            method: "DELETE",
        }),
};

export const adminQuotesApi = {
    getAll: () => fetchApi<ServiceRequest[]>("/admin/quotes"),
    updatePrice: (id: string, data: { quoteAmount: number; quoteNotes?: string }) =>
        fetchApi<ServiceRequest>(`/admin/quotes/${id}/price`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
};

export const adminStageApi = {
    getNextStages: (id: string) =>
        fetchApi<{ currentStage: string; validNextStages: string[]; stageFlow: string[] }>(`/admin/service-requests/${id}/next-stages`),
    transitionStage: (id: string, data: { stage: string; actorName?: string }) =>
        fetchApi<any>(`/admin/service-requests/${id}/transition-stage`, {
            method: "POST",
            body: JSON.stringify(data),
        }).then(res => res.serviceRequest || res),
    updateExpectedDates: (id: string, data: {
        expectedPickupDate?: string | null;
        expectedReturnDate?: string | null;
        expectedReadyDate?: string | null;
    }) =>
        fetchApi<ServiceRequest>(`/admin/service-requests/${id}/expected-dates`, {
            method: "PUT",
            body: JSON.stringify(data),
        }),
};

export interface ServiceCategory {
    id: string;
    name: string;
    displayOrder: number | null;
    createdAt: string;
}

export const serviceCategoriesApi = {
    getAll: () => fetchApi<ServiceCategory[]>("/service-categories"),
    create: (data: { name: string; displayOrder?: number }) =>
        fetchApi<ServiceCategory>("/admin/service-categories", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: { name?: string; displayOrder?: number }) =>
        fetchApi<ServiceCategory>(`/admin/service-categories/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/admin/service-categories/${id}`, {
            method: "DELETE",
        }),
};

export const adminPickupsApi = {
    getAll: (status?: string) => fetchApi<PickupSchedule[]>(status ? `/admin/pickups?status=${status}` : "/admin/pickups"),
    getPending: () => fetchApi<PickupSchedule[]>("/admin/pickups/pending"),
    update: (id: string, data: Partial<PickupSchedule>) =>
        fetchApi<PickupSchedule>(`/admin/pickups/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    updateStatus: (id: string, status: string) =>
        fetchApi<PickupSchedule>(`/admin/pickups/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
};

export interface Policy {
    slug: string;
    title: string;
    content: string;
    isPublished: boolean;
    isPublishedApp: boolean;
    lastUpdated: string | null;
}

export const policiesApi = {
    getAll: () => fetchApi<Policy[]>("/admin/policies"),
    save: (data: { slug: string; title: string; content: string; isPublished: boolean; isPublishedApp: boolean }) =>
        fetchApi<Policy>("/admin/policies", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    delete: (slug: string) =>
        fetchApi<void>(`/admin/policies/${slug}`, {
            method: "DELETE",
        }),
};

export const adminReviewsApi = {
    getAll: () => fetchApi<CustomerReview[]>("/admin/reviews"),
    toggleApproval: (id: string, isApproved: boolean) =>
        fetchApi<CustomerReview>(`/admin/reviews/${id}/approval`, {
            method: "PATCH",
            body: JSON.stringify({ isApproved }),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/admin/reviews/${id}`, {
            method: "DELETE",
        }),
};

export const adminNotificationsApi = {
    getAll: () => fetchApi<Notification[]>('/admin/notifications'),
    getUnreadCount: () => fetchApi<{ count: number }>('/admin/notifications/unread-count'),
    getOverrides: () => fetchApi<Notification[]>('/admin/notifications/overrides'),
    approveOverrideRequest: (id: string) => fetchApi<{ success: boolean }>(`/admin/notifications/override/${id}/approve`, {
        method: 'POST',
    }),
};

export interface ReportData {
    summary: {
        totalRevenue: number;
        totalRepairs: number;
        totalStaff: number;
    };
    monthlyFinancials: {
        name: string;
        income: number;
        expense: number;
        repairs: number;
    }[];
    technicianPerformance: {
        name: string;
        tasks: number;
        efficiency: number;
    }[];
    activityLogs: {
        action: string;
        user: string;
        time: string;
        type: string;
    }[];
}

export const reportsApi = {
    getData: async (period: string = "this_month"): Promise<ReportData> => {
        let startDate = new Date();
        const endDate = new Date();

        if (period === 'this_month') {
            startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        } else if (period === 'last_month') {
            startDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
            endDate.setMonth(endDate.getMonth());
            endDate.setDate(0);
        } else if (period === 'this_year') {
            startDate = new Date(new Date().getFullYear(), 0, 1);
        } else {
            startDate.setDate(startDate.getDate() - 7);
        }

        const query = `?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`;
        return fetchApi<ReportData>(`/analytics/dashboard${query}`);
    },

    exportExcel: async () => {
        window.open(`/api/analytics/export/excel`, '_blank');
    }
};

export const localPurchasesApi = {
    getAll: (jobTicketId?: string) =>
        fetchApi<LocalPurchase[]>(`/inventory/local-purchases${jobTicketId ? `?jobTicketId=${jobTicketId}` : ''}`),
    create: (data: Omit<InsertLocalPurchase, 'purchasedBy'>) =>
        fetchApi<LocalPurchase>('/inventory/local-purchases', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

export const wastageApi = {
    getAll: (startDate?: string, endDate?: string) => {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        const query = params.toString() ? `?${params.toString()}` : '';
        return fetchApi<WastageLog[]>(`/inventory/wastage${query}`);
    },
    report: (itemId: string, data: InsertWastageLog) =>
        fetchApi<WastageLog>(`/inventory/${itemId}/wastage`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
};

export const warrantyApi = {
    checkBySerial: (serial: string) =>
        fetchApi<{ hasWarranty: boolean; jobs: any[] }>(
            `/warranty-claims/check-serial/${encodeURIComponent(serial)}`
        ),
    checkByJobId: (jobId: string) =>
        fetchApi<{ job: any; warranty: { valid: boolean; expiryDate: string | null; daysRemaining: number } }>(
            `/warranty-claims/check/${encodeURIComponent(jobId)}`
        ),
};

export const analyticsApi = {
    getDashboard: (startDate?: string, endDate?: string) => {
        const q = new URLSearchParams();
        if (startDate) q.set('startDate', startDate);
        if (endDate) q.set('endDate', endDate);
        const qs = q.toString() ? `?${q.toString()}` : '';
        return fetchApi<{
            summary: { totalRevenue: number; totalRepairs: number; totalStaff: number; totalWastageLoss: number };
            monthlyFinancials: { name: string; income: number }[];
            technicianPerformance: { name: string; tasks: number; efficiency: number }[];
            activityLogs: { action: string; user: string; time: string; type: string }[];
        }>(`/analytics/dashboard${qs}`);
    },
    getRevenue: (startDate?: string, endDate?: string) => {
        const q = new URLSearchParams();
        if (startDate) q.set('startDate', startDate);
        if (endDate) q.set('endDate', endDate);
        const qs = q.toString() ? `?${q.toString()}` : '';
        return fetchApi<{ date: string; service: number; retail: number; corporate: number }[]>(`/analytics/revenue${qs}`);
    },
};

export const quotationsApi = {
    getAll: () => fetchApi<Quotation[]>("/admin/quotations"),
    getOne: (id: string) => fetchApi<Quotation & { items: QuotationItem[] }>(`/admin/quotations/${id}`),
    getByCustomer: (customerId: string) => fetchApi<Quotation[]>(`/admin/quotations/by-customer/${customerId}`),
    create: (data: Partial<InsertQuotation> & { items?: Partial<InsertQuotationItem>[] }) =>
        fetchApi<{ id: string; quotationNumber: string }>("/admin/quotations", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: string, data: Partial<InsertQuotation> & { items?: Partial<InsertQuotationItem>[] }) =>
        fetchApi<{ success: boolean; id: string }>(`/admin/quotations/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    updateStatus: (id: string, status: string) =>
        fetchApi<Quotation>(`/admin/quotations/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
        }),
    delete: (id: string) =>
        fetchApi<void>(`/admin/quotations/${id}`, {
            method: "DELETE",
        }),
};
