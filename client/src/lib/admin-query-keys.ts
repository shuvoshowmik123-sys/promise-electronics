import type { AdminRealtimeQueryTag } from "@shared/types/admin-realtime";

/**
 * A central registry for all Admin React Query keys.
 * Used to ensure queries use consistent keys, simplifying targeted invalidation and caching.
 */
export const AdminQueryKeys = {
    // Jobs
    jobTickets: (type?: string) => ["jobTickets", type ?? "walk-in"],
    jobTicketDetail: (id: string) => ["jobTicket", id],
    jobOverview: () => ["jobOverview"],
    pendingRollbacks: () => ["pendingRollbacks"],
    readyForBillingJobs: () => ["readyForBillingJobs"],
    cashierJobs: () => ["cashierJobs"],

    // Service Requests
    serviceRequests: () => ["serviceRequests"],
    serviceRequestDetail: (id: string) => ["serviceRequest", id],

    // Customers
    customers: () => ["customers"],
    customerDetail: (id: string) => ["customer", id],
    customerActivity: (id: string) => ["customerActivity", id],

    // Dashboard & Overviews
    dashboardStats: () => ["dashboardStats"],

    // Notifications
    notifications: () => ["adminNotifications"],
    notificationCount: () => ["adminNotificationCount"],

    // Inventory
    inventory: () => ["inventory"],
    inventoryAlerts: () => ["inventoryAlerts"],

    // POS
    posBootstrap: () => ["posBootstrap"],
    posTransactions: () => ["posTransactions"],
    drawerActive: () => ["drawerActive"],

    // Settings & Core
    settings: () => ["settings"],
    users: () => ["users"],
    auditLogs: () => ["auditLogs"],
    systemHealth: () => ["systemHealth"],
    brainStats: () => ["brainStats"],

    // HR / Payroll / Workforce
    attendance: () => ["attendance"],
    payroll: () => ["payroll"],
    technicianWorkload: () => ["technicianWorkload"],

    // Quotes / Orders / Comm
    quotations: () => ["quotations"],
    inquiries: () => ["inquiries"],
    orders: () => ["orders"],
    corporateThreads: () => ["corporateThreads"],
    corporateThreadDetails: (id: string) => ["corporateThread", id],

    // Finance / Legal
    financeSummaries: () => ["financeSummaries"],
    dueRecords: () => ["dueRecords"],
    pettyCash: () => ["pettyCash"],
    refunds: () => ["refunds"],
    warrantyClaims: () => ["warrantyClaims"],
    approvals: () => ["approvals"]
} as const;
