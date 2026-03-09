export type AdminRealtimeTopic =
  | "job_ticket"
  | "service_request"
  | "dashboard"
  | "notification"
  | "inventory"
  | "pos"
  | "finance"
  | "corporate"
  | "orders";

export type AdminRealtimeAction =
  | "created"
  | "updated"
  | "deleted"
  | "status_changed"
  | "count_changed";

export type AdminRealtimeQueryTag =
  | "jobTickets"
  | "jobTicketDetails"
  | "jobOverview"
  | "dashboardStats"
  | "pendingRollbacks"
  | "serviceRequests"
  | "serviceRequestDetails"
  | "customers"
  | "customerDetails"
  | "adminNotifications"
  | "adminNotificationCount"
  | "notifications"
  | "notificationCount"
  | "inventory"
  | "inventoryAlerts"
  | "posBootstrap"
  | "posTransactions"
  | "pos"
  | "cashDrawer"
  | "readyForBillingJobs"
  | "cashierJobs"
  | "drawerActive"
  | "quotations"
  | "inquiries"
  | "orders"
  | "corporateThreads"
  | "corporateThreadDetails"
  | "financeSummaries"
  | "dueRecords"
  | "pettyCash"
  | "refunds"
  | "warrantyClaims"
  | "approvals"
  | "attendance"
  | "payroll"
  | "technicianWorkload"
  | "auditLogs"
  | "systemHealth"
  | "brainStats";

export interface AdminRealtimeToast {
  level: "info" | "success" | "warning" | "error";
  title: string;
  message?: string;
  sound?: boolean;
}

export interface AdminRealtimePayload {
  status?: string;
  ticketNumber?: string;
  jobId?: string;
  serviceRequestId?: string;
  sessionId?: string;
  notificationId?: string;
  trigger?: string;
}

export interface AdminRealtimeEvent {
  id: string;
  channel: "admin";
  topic: AdminRealtimeTopic;
  action: AdminRealtimeAction;
  entityId?: string;
  occurredAt: string;
  permissions?: string[];
  invalidate: AdminRealtimeQueryTag[];
  toast?: AdminRealtimeToast;
  payload?: AdminRealtimePayload;
  priority?: "immediate" | "summary";
  scope?: "row" | "detail" | "list" | "summary";
}
