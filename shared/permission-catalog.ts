export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PermissionDef {
  key: string;
  label: string;
  module: string;
  action: string;
  risk: RiskLevel;
  description: string;
  consequence: string;
  suggestedRoles: string[];
  coverageCritical: boolean;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  // ── Dashboard ──
  { key: "dashboard.view", label: "View dashboard", module: "dashboard", action: "view", risk: "low", description: "See the admin dashboard with KPIs and summaries.", consequence: "Read-only overview; no data modification.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Service Requests ──
  { key: "serviceRequests.view", label: "View service requests", module: "serviceRequests", action: "view", risk: "low", description: "See incoming customer repair requests.", consequence: "Read-only access to customer intake data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "serviceRequests.reply", label: "Reply to requests", module: "serviceRequests", action: "reply", risk: "medium", description: "Answer customer intake messages.", consequence: "Customer-facing communication; bad replies can damage trust.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "serviceRequests.logCall", label: "Log phone calls", module: "serviceRequests", action: "logCall", risk: "low", description: "Record notes from phone calls with customers.", consequence: "Internal notes only; not customer-visible.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "serviceRequests.quote", label: "Send repair quote", module: "serviceRequests", action: "quote", risk: "high", description: "Create and send price quotes to customers.", consequence: "Financial commitment; customer sees the price and can accept.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "serviceRequests.transitionStage", label: "Change request stage", module: "serviceRequests", action: "transitionStage", risk: "high", description: "Move a request between stages (Authorized, Pickup Scheduled, In Repair, etc.).", consequence: "Affects workflow and customer-visible status.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "serviceRequests.convertToJob", label: "Convert to job ticket", module: "serviceRequests", action: "convertToJob", risk: "high", description: "Create a job ticket from a service request.", consequence: "Starts the repair workflow; assigns resources.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "serviceRequests.edit", label: "Edit service requests", module: "serviceRequests", action: "edit", risk: "high", description: "Edit service request fields and customer intake details.", consequence: "Can alter customer-facing/request workflow data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },

  // ── Jobs ──
  { key: "jobs.view", label: "View assigned / own jobs", module: "jobs", action: "view", risk: "low", description: "See jobs assigned to you and jobs you created (creator view is read-only until assigned to you).", consequence: "Scoped repair visibility.", suggestedRoles: ["Manager", "Technician", "Super Admin"], coverageCritical: false },
  { key: "jobs.viewAll", label: "See all jobs", module: "jobs", action: "viewAll", risk: "medium", description: "See every job ticket in the shop, not only assigned or self-created jobs.", consequence: "Full jobs list visibility; pair with assign rights for lead technicians.", suggestedRoles: ["Manager", "Super Admin", "Technician"], coverageCritical: true },
  { key: "jobs.create", label: "Create job ticket", module: "jobs", action: "create", risk: "medium", description: "Create a new job ticket (walk-in or converted).", consequence: "Starts repair workflow; assigns shop resources.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.assignTechnician", label: "Assign technician", module: "jobs", action: "assignTechnician", risk: "high", description: "Assign or reassign a technician to a job.", consequence: "Determines who works on the repair; affects workload.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "jobs.reportOutcome", label: "Report repair outcome", module: "jobs", action: "reportOutcome", risk: "medium", description: "Set outcome: Repair OK, Needs Parts, Not Repairable, Customer Declined.", consequence: "Determines next step; customer is notified.", suggestedRoles: ["Technician", "Manager", "Super Admin"], coverageCritical: true },
  { key: "jobs.advanceStatus", label: "Advance job status", module: "jobs", action: "advanceStatus", risk: "medium", description: "Move job through non-work statuses (Pending → Diagnosed → Ready, etc.).", consequence: "Progresses the workflow; customer-visible.", suggestedRoles: ["Manager", "Technician", "Super Admin"], coverageCritical: false },
  { key: "jobs.edit", label: "Edit job details", module: "jobs", action: "edit", risk: "medium", description: "Update device, model, serial, notes, priority, deadline.", consequence: "Changes repair context; affects technician work.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.writeOff", label: "Write off job", module: "jobs", action: "writeOff", risk: "critical", description: "Write off a job as irrecoverable loss.", consequence: "Financial impact; removes job from active workflow.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.recordPayment", label: "Record job payment", module: "jobs", action: "recordPayment", risk: "high", description: "Record a payment against a job ticket.", consequence: "Financial transaction; updates billing history.", suggestedRoles: ["Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.delete", label: "Delete job ticket", module: "jobs", action: "delete", risk: "critical", description: "Permanently delete a job ticket.", consequence: "Data loss; repair history removed.", suggestedRoles: ["Super Admin"], coverageCritical: false },

  // ── Repair Journey ──
  { key: "repairJourney.view", label: "View repair journeys", module: "repairJourney", action: "view", risk: "low", description: "See customer repair journey timelines.", consequence: "Read-only access to journey history.", suggestedRoles: ["Manager", "Technician", "Super Admin"], coverageCritical: false },
  { key: "repairJourney.customerUpdate", label: "Send customer update", module: "repairJourney", action: "customerUpdate", risk: "high", description: "Post a status update visible to the customer.", consequence: "Customer-facing; affects satisfaction.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },

  // ── Pickup & Delivery ──
  { key: "pickup.viewAssigned", label: "View assigned tasks", module: "pickup", action: "viewAssigned", risk: "low", description: "See only pickup/delivery tasks assigned to you.", consequence: "Scoped to own work; no access to other drivers' tasks.", suggestedRoles: ["Driver"], coverageCritical: false },
  { key: "pickup.viewAll", label: "View all tasks", module: "pickup", action: "viewAll", risk: "low", description: "See all pickup and delivery tasks.", consequence: "Full logistics visibility.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "pickup.assignDriver", label: "Assign driver", module: "pickup", action: "assignDriver", risk: "high", description: "Assign or reassign a driver to a pickup/delivery task.", consequence: "Determines who handles customer handover.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "pickup.reschedule", label: "Reschedule task", module: "pickup", action: "reschedule", risk: "medium", description: "Change the scheduled date/time of a pickup or delivery.", consequence: "Customer may need to be informed.", suggestedRoles: ["Manager", "Driver", "Super Admin"], coverageCritical: true },
  { key: "pickup.cancel", label: "Cancel task", module: "pickup", action: "cancel", risk: "high", description: "Cancel a pickup or delivery task.", consequence: "Customer handover blocked until rescheduled.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "pickup.routePlan", label: "Manage route plan", module: "pickup", action: "routePlan", risk: "medium", description: "Reorder and batch-assign driver routes.", consequence: "Affects delivery efficiency and driver workload.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── POS ──
  { key: "pos.view", label: "View POS register", module: "pos", action: "view", risk: "low", description: "See the point-of-sale screen and product catalog.", consequence: "Read-only; cannot process transactions.", suggestedRoles: ["Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "pos.processPayment", label: "Process payment", module: "pos", action: "processPayment", risk: "high", description: "Complete a sale and collect payment.", consequence: "Financial transaction; generates receipt.", suggestedRoles: ["Cashier", "Manager", "Super Admin"], coverageCritical: true },
  { key: "pos.openRegister", label: "Open cash register", module: "pos", action: "openRegister", risk: "medium", description: "Open a new register session with starting float.", consequence: "Starts cash accountability window.", suggestedRoles: ["Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "pos.closeRegister", label: "Close cash register", module: "pos", action: "closeRegister", risk: "high", description: "Close register and reconcile cash.", consequence: "Financial reconciliation; variance flagging.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "pos.refund", label: "Process refund", module: "pos", action: "refund", risk: "critical", description: "Issue a refund for a completed sale.", consequence: "Money leaves the business; potential abuse vector.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Finance ──
  { key: "finance.view", label: "View financial records", module: "finance", action: "view", risk: "medium", description: "See revenue, expenses, cash flow, and due records.", consequence: "Access to sensitive business financials.", suggestedRoles: ["Manager", "Cashier", "Super Admin"], coverageCritical: false },
  { key: "finance.createRecord", label: "Create financial record", module: "finance", action: "createRecord", risk: "high", description: "Add manual payments, due records, or petty cash entries.", consequence: "Affects financial reporting.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "finance.editRecord", label: "Edit financial record", module: "finance", action: "editRecord", risk: "high", description: "Modify existing financial entries.", consequence: "Can alter financial history.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "finance.deleteRecord", label: "Delete financial record", module: "finance", action: "deleteRecord", risk: "critical", description: "Remove a financial record.", consequence: "Data loss; audit trail gap.", suggestedRoles: ["Super Admin"], coverageCritical: false },
  { key: "finance.export", label: "Export financial data", module: "finance", action: "export", risk: "medium", description: "Download financial reports.", consequence: "Sensitive data leaves the system.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Corporate ──
  { key: "corporate.view", label: "View corporate clients", module: "corporate", action: "view", risk: "low", description: "See managed corporate client list and details.", consequence: "Read-only B2B client data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporate.manageClients", label: "Manage corporate clients", module: "corporate", action: "manageClients", risk: "high", description: "Create, edit, and configure corporate client accounts.", consequence: "Affects B2B relationships and billing.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporate.billing", label: "Corporate billing", module: "corporate", action: "billing", risk: "high", description: "Create and manage corporate bills and invoices.", consequence: "Financial commitment to corporate clients.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Corporate Messages ──
  { key: "corporateMessages.view", label: "View corporate messages", module: "corporateMessages", action: "view", risk: "low", description: "Read message threads with corporate clients.", consequence: "Read-only access to B2B communications.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporateMessages.reply", label: "Reply to corporate messages", module: "corporateMessages", action: "reply", risk: "high", description: "Send messages to corporate clients on behalf of the shop.", consequence: "Customer-facing B2B communication.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },

  // ── Challans ──
  { key: "challans.view", label: "View challans", module: "challans", action: "view", risk: "low", description: "See delivery challans list.", consequence: "Read-only financial document access.", suggestedRoles: ["Manager", "Technician", "Super Admin"], coverageCritical: false },
  { key: "challans.manage", label: "Create/edit challans", module: "challans", action: "manage", risk: "high", description: "Create, edit, and delete delivery challans.", consequence: "Modifies financial documents.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Customers ──
  { key: "customers.view", label: "View customers", module: "customers", action: "view", risk: "low", description: "See customer directory and profiles.", consequence: "Access to customer PII.", suggestedRoles: ["Manager", "Cashier", "Super Admin"], coverageCritical: false },
  { key: "customers.edit", label: "Edit customer records", module: "customers", action: "edit", risk: "medium", description: "Update customer contact info and notes.", consequence: "Modifies customer data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Inventory ──
  { key: "inventory.view", label: "View inventory", module: "inventory", action: "view", risk: "low", description: "See stock levels, products, and categories.", consequence: "Read-only warehouse data.", suggestedRoles: ["Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "inventory.addItem", label: "Add inventory item", module: "inventory", action: "addItem", risk: "medium", description: "Create new products or spare parts.", consequence: "Adds to product catalog.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "inventory.editItem", label: "Edit inventory item", module: "inventory", action: "editItem", risk: "medium", description: "Update product details, pricing, and categories.", consequence: "Changes product data and pricing.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "inventory.adjustStock", label: "Adjust stock levels", module: "inventory", action: "adjustStock", risk: "high", description: "Manually adjust quantity in stock.", consequence: "Affects inventory accuracy; potential shrinkage hiding.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "inventory.deleteItem", label: "Delete inventory item", module: "inventory", action: "deleteItem", risk: "critical", description: "Remove a product from the catalog.", consequence: "Data loss; affects linked jobs and POS.", suggestedRoles: ["Super Admin"], coverageCritical: false },
  { key: "inventory.export", label: "Export inventory", module: "inventory", action: "export", risk: "medium", description: "Download inventory reports.", consequence: "Business data leaves the system.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Warranty ──
  { key: "warranty.view", label: "View warranty claims", module: "warranty", action: "view", risk: "low", description: "See warranty claim list and details.", consequence: "Read-only.", suggestedRoles: ["Manager", "Technician", "Super Admin"], coverageCritical: false },
  { key: "warranty.create", label: "Create warranty claim", module: "warranty", action: "create", risk: "high", description: "File a new warranty claim.", consequence: "Financial commitment; may require manufacturer follow-up.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "warranty.approve", label: "Approve/reject warranty", module: "warranty", action: "approve", risk: "critical", description: "Approve or reject a warranty claim.", consequence: "Financial decision; affects customer obligation.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Reports ──
  { key: "reports.view", label: "View reports", module: "reports", action: "view", risk: "medium", description: "Access business reports and charts.", consequence: "Sensitive business performance data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "reports.export", label: "Export reports", module: "reports", action: "export", risk: "medium", description: "Download report data.", consequence: "Business data leaves the system.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Analytics ──
  { key: "analytics.view", label: "View analytics", module: "analytics", action: "view", risk: "medium", description: "See revenue analytics, trends, and business metrics.", consequence: "Sensitive financial summaries.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── AI Brain ──
  { key: "aiBrain.view", label: "View AI knowledge", module: "aiBrain", action: "view", risk: "low", description: "Browse knowledge graph and AI context.", consequence: "Read-only AI data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "aiBrain.manage", label: "Manage AI knowledge", module: "aiBrain", action: "manage", risk: "high", description: "Add, edit, or delete knowledge graph facts.", consequence: "Affects AI-generated responses.", suggestedRoles: ["Super Admin"], coverageCritical: false },

  // ── Users ──
  { key: "users.viewStaff", label: "View staff directory", module: "users", action: "viewStaff", risk: "low", description: "See the staff list with names and roles.", consequence: "Organizational visibility.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "users.inviteStaff", label: "Create setup links", module: "users", action: "inviteStaff", risk: "critical", description: "Generate one-time setup links for new staff.", consequence: "Creates new accounts with permissions.", suggestedRoles: ["Super Admin"], coverageCritical: true },
  { key: "users.editPermissions", label: "Edit staff permissions", module: "users", action: "editPermissions", risk: "critical", description: "Change another user's role or permission set.", consequence: "Privilege escalation vector.", suggestedRoles: ["Super Admin"], coverageCritical: false },
  { key: "users.deactivate", label: "Deactivate staff account", module: "users", action: "deactivate", risk: "critical", description: "Disable a staff member's account.", consequence: "Locks user out; may block coverage.", suggestedRoles: ["Super Admin"], coverageCritical: false },
  { key: "users.viewCustomers", label: "View customer accounts", module: "users", action: "viewCustomers", risk: "medium", description: "Access the customer account list.", consequence: "Customer PII access.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Settings ──
  { key: "settings.manage", label: "Manage system settings", module: "settings", action: "manage", risk: "critical", description: "Change shop configuration, modules, and system behavior.", consequence: "System-wide impact; can break workflows.", suggestedRoles: ["Super Admin"], coverageCritical: false },

  // ── Attendance ──
  { key: "attendance.view", label: "View attendance", module: "attendance", action: "view", risk: "low", description: "See staff attendance records.", consequence: "Read-only HR data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "attendance.checkIn", label: "Check in/out", module: "attendance", action: "checkIn", risk: "low", description: "Record own check-in and check-out.", consequence: "Self-service; own record only.", suggestedRoles: ["Driver", "Technician", "Cashier", "Manager", "Super Admin"], coverageCritical: false },

  // ── Notifications ──
  { key: "notifications.view", label: "View notifications", module: "notifications", action: "view", risk: "low", description: "See system notifications and alerts.", consequence: "Read-only.", suggestedRoles: ["Driver", "Technician", "Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "notifications.manage", label: "Manage notifications", module: "notifications", action: "manage", risk: "medium", description: "Configure notification settings and overrides.", consequence: "Affects alert routing.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Map / Service Areas ──
  { key: "map.viewAreaAnalytics", label: "View area analytics", module: "map", action: "viewAreaAnalytics", risk: "medium", description: "View aggregated service analytics grouped by geographic area.", consequence: "Access to area-level service counts and revenue totals — no customer PII.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "map.manageAreas", label: "Manage service areas", module: "map", action: "manageAreas", risk: "medium", description: "Create, update, and deactivate service area taxonomy entries.", consequence: "Affects area-based filtering and analytics grouping.", suggestedRoles: ["Super Admin"], coverageCritical: false },
];

// ── Old → New Compatibility Map ──

export const LEGACY_TO_GRANULAR: Record<string, string[]> = {
  dashboard: ["dashboard.view"],
  serviceRequests: ["serviceRequests.view", "serviceRequests.reply", "serviceRequests.logCall", "serviceRequests.quote", "serviceRequests.transitionStage", "serviceRequests.convertToJob", "serviceRequests.edit"],
  jobs: ["jobs.view", "jobs.viewAll", "jobs.create", "jobs.assignTechnician", "jobs.reportOutcome", "jobs.advanceStatus", "jobs.edit"],
  pickup: ["pickup.viewAssigned"],
  pos: ["pos.view", "pos.processPayment", "pos.openRegister"],
  finance: ["finance.view", "finance.createRecord", "finance.editRecord"],
  corporate: ["corporate.view", "corporate.manageClients", "corporate.billing"],
  challans: ["challans.view", "challans.manage"],
  inventory: ["inventory.view", "inventory.addItem", "inventory.editItem", "inventory.adjustStock"],
  users: ["users.viewStaff"],
  settings: ["settings.manage"],
  attendance: ["attendance.view", "attendance.checkIn"],
  reports: ["reports.view", "reports.export"],
  technician: ["jobs.view", "jobs.reportOutcome", "jobs.advanceStatus"],
  warrantyClaims: ["warranty.view", "warranty.create"],
  refunds: ["pos.refund"],
  inquiries: ["serviceRequests.view"],
  notifications: ["notifications.view"],
  systemHealth: ["settings.manage"],
  auditLogs: ["settings.manage"],

  canCreate: [],
  canEdit: [],
  canDelete: [],
  canExport: ["reports.export", "inventory.export", "finance.export"],
  canAssignTechnician: ["jobs.assignTechnician"],
  canViewCustomerPhone: ["customers.view"],
  canViewFullJobDetails: ["jobs.view"],
  canPrintJobTickets: ["jobs.view"],
  canAddAssistedBy: ["jobs.assignTechnician"],
  canSetPriority: ["jobs.edit"],
  canSetDeadline: ["jobs.edit"],
  canSetWarranty: ["jobs.edit"],
  process_payment: ["pos.processPayment", "jobs.recordPayment"],
  view_financials: ["finance.view"],
};

// ── Role Presets ──

export const ROLE_PRESETS: Record<string, string[]> = {
  "Driver Basic": [
    "pickup.viewAssigned", "attendance.checkIn", "notifications.view",
  ],
  "Technician Basic": [
    "jobs.view", "jobs.reportOutcome", "jobs.advanceStatus",
    "repairJourney.view",
    "attendance.checkIn", "notifications.view",
  ],
  "Cashier Basic": [
    "pos.view", "pos.processPayment", "pos.openRegister",
    "inventory.view", "finance.view",
    "attendance.checkIn", "notifications.view",
  ],
  "Manager Basic": [
    "dashboard.view",
    "serviceRequests.view", "serviceRequests.reply", "serviceRequests.logCall", "serviceRequests.quote", "serviceRequests.transitionStage", "serviceRequests.convertToJob", "serviceRequests.edit",
    "jobs.view", "jobs.create", "jobs.assignTechnician", "jobs.reportOutcome", "jobs.advanceStatus", "jobs.edit", "jobs.recordPayment",
    "repairJourney.view", "repairJourney.customerUpdate",
    "pickup.viewAll", "pickup.assignDriver", "pickup.reschedule", "pickup.cancel", "pickup.routePlan",
    "pos.view", "pos.processPayment", "pos.openRegister", "pos.closeRegister",
    "finance.view", "finance.createRecord", "finance.editRecord", "finance.export",
    "corporate.view", "corporate.manageClients", "corporate.billing",
    "corporateMessages.view", "corporateMessages.reply",
    "challans.view", "challans.manage",
    "customers.view", "customers.edit",
    "inventory.view", "inventory.addItem", "inventory.editItem", "inventory.adjustStock", "inventory.export",
    "warranty.view", "warranty.create", "warranty.approve",
    "reports.view", "reports.export",
    "analytics.view",
    "users.viewStaff",
    "attendance.view", "attendance.checkIn",
    "notifications.view", "notifications.manage",
    "map.viewAreaAnalytics",
  ],
  "Super Admin": ["*"],
};

export const CUSTOM_PACKS: Record<string, { label: string; description: string; permissions: string[] }> = {
  "driver-service-reply": {
    label: "Driver + Service Reply",
    description: "Driver who can respond to customer pickup inquiries.",
    permissions: ["serviceRequests.view", "serviceRequests.reply"],
  },
  "tech-journey-view": {
    label: "Technician + Journey View",
    description: "Technician who can see customer repair journey.",
    permissions: ["repairJourney.view"],
  },
  "cashier-job-detail": {
    label: "Cashier + Job Details",
    description: "Cashier who can view full job details when billing.",
    permissions: ["jobs.view"],
  },
  "manager-corporate-msg": {
    label: "Manager + Corporate Messages",
    description: "Manager who handles B2B client communication.",
    permissions: ["corporateMessages.view", "corporateMessages.reply"],
  },
  "senior-tech": {
    label: "Senior Technician",
    description: "Technician with parts authority and job editing.",
    permissions: ["jobs.edit", "inventory.view", "serviceRequests.reply"],
  },
};

export const COVERAGE_CRITICAL_PERMISSIONS = [
  "serviceRequests.reply",
  "serviceRequests.quote",
  "serviceRequests.edit",
  "jobs.assignTechnician",
  "jobs.reportOutcome",
  "pickup.assignDriver",
  "pickup.reschedule",
  "pos.processPayment",
  "corporateMessages.reply",
  "repairJourney.customerUpdate",
  "users.inviteStaff",
] as const;

export const DEPRECATED_BROAD_PERMISSIONS = [
  "canCreate",
  "canEdit",
  "canDelete",
  "jobs",
  "serviceRequests",
  "finance",
  "users",
  "settings",
  "pickup",
  "pos",
  "corporate",
  "inventory",
  "challans",
  "technician",
] as const;

export function getModules(): string[] {
  const modules: Record<string, true> = {};
  for (const p of PERMISSION_CATALOG) modules[p.module] = true;
  return Object.keys(modules);
}

export function getPermissionsByModule(module: string): PermissionDef[] {
  return PERMISSION_CATALOG.filter((p) => p.module === module);
}

export function getPermissionsByRisk(risk: RiskLevel): PermissionDef[] {
  return PERMISSION_CATALOG.filter((p) => p.risk === risk);
}
