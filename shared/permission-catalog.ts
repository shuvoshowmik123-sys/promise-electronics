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
  { key: "jobs.reportOutcome", label: "Report repair outcome", module: "jobs", action: "reportOutcome", risk: "medium", description: "Set outcome: Repair OK, Needs Parts; submit NG report for not-repairable cases.", consequence: "Determines next step; NG requires manager review before customer decision.", suggestedRoles: ["Technician", "Manager", "Super Admin"], coverageCritical: true },
  { key: "jobs.reviewOutcome", label: "Review NG / repair outcome", module: "jobs", action: "reviewOutcome", risk: "high", description: "Verify or return technician NG reports (manager review).", consequence: "Moves job to customer decision or back to workbench; staff-facing only.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "jobs.advanceStatus", label: "Advance job status", module: "jobs", action: "advanceStatus", risk: "medium", description: "Move job through non-work statuses (Pending → Diagnosed → Ready, etc.).", consequence: "Progresses the workflow; customer-visible.", suggestedRoles: ["Manager", "Technician", "Super Admin"], coverageCritical: false },
  { key: "jobs.edit", label: "Edit job details", module: "jobs", action: "edit", risk: "medium", description: "Update device, model, serial, notes, priority, deadline.", consequence: "Changes repair context; affects technician work.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.manageWorkHolds", label: "Manage work holds", module: "jobs", action: "manageWorkHolds", risk: "medium", description: "Enter or resume generic non-NG work holds (e.g. Awaiting Quote Approval). Workflow visibility only.", consequence: "Moves jobs into/out of blocked hold; does not grant quote price, payment, supplier, or inventory authority.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.writeOff", label: "Write off job", module: "jobs", action: "writeOff", risk: "critical", description: "Write off a job as irrecoverable loss.", consequence: "Financial impact; removes job from active workflow.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.recordPayment", label: "Record job payment", module: "jobs", action: "recordPayment", risk: "high", description: "Record a payment against a job ticket.", consequence: "Financial transaction; updates billing history.", suggestedRoles: ["Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "jobs.delete", label: "Delete job ticket", module: "jobs", action: "delete", risk: "critical", description: "Permanently delete a job ticket.", consequence: "Data loss; repair history removed.", suggestedRoles: ["Super Admin"], coverageCritical: false },
  { key: "jobs.rollback", label: "Request job rollback", module: "jobs", action: "rollback", risk: "critical", description: "Request a job status rollback for approval.", consequence: "Reverses workflow progress and can affect customer-visible state.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },

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
  { key: "pickup.confirmHandover", label: "Confirm customer handover", module: "pickup", action: "confirmHandover", risk: "high", description: "Send or verify a customer custody code (or record an audited no-code handover) when a device changes hands.", consequence: "Advances custody stage; does not grant arbitrary service-request stage control.", suggestedRoles: ["Driver", "Manager", "Super Admin"], coverageCritical: true },

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

  // ── Corporate (ops vs workspace vs billing — UNIFIED-OPS-01A) ──
  { key: "corporate.jobsOperate", label: "Operate corporate jobs (in Jobs tab)", module: "corporate", action: "jobsOperate", risk: "medium", description: "See and work corporate jobs inside the ordinary Jobs tab (badge + client name). Does not open the B2B Area.", consequence: "Staff handle B2B repairs in daily Jobs without full client/billing access.", suggestedRoles: ["Manager", "Technician", "Super Admin"], coverageCritical: true },
  { key: "corporate.challansOperate", label: "Operate corporate challans (in Challans tab)", module: "corporate", action: "challansOperate", risk: "medium", description: "See and create corporate IN/OUT challans from the Challans hub. Does not open the B2B Area or billing.", consequence: "Custody handovers for corporate clients without full B2B workspace.", suggestedRoles: ["Manager", "Driver", "Super Admin"], coverageCritical: true },
  { key: "corporate.workspace", label: "B2B workspace tab", module: "corporate", action: "workspace", risk: "high", description: "Open the full B2B Area (clients, batches, statements, messages shell). Separate from Corporate Operations.", consequence: "Full B2B cockpit visibility; pair carefully with billing and client manage.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "corporate.view", label: "View corporate clients", module: "corporate", action: "view", risk: "low", description: "See managed corporate client list and details inside B2B.", consequence: "Read-only B2B client data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporate.manageClients", label: "Manage corporate clients", module: "corporate", action: "manageClients", risk: "high", description: "Create, edit, and configure corporate client accounts.", consequence: "Affects B2B relationships and billing.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporate.billing", label: "Corporate billing", module: "corporate", action: "billing", risk: "high", description: "Create and manage corporate bills, invoices, and payment records.", consequence: "Financial commitment to corporate clients.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },

  // Distinct capabilities split from the legacy corporate.billing umbrella.
  { key: "corporate.bills.view", label: "View corporate bills", module: "corporate", action: "bills.view", risk: "low", description: "See corporate bill/invoice records and their line items.", consequence: "Read-only B2B billing visibility.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporate.bills.create", label: "Create and preview corporate bills", module: "corporate", action: "bills.create", risk: "high", description: "Select eligible jobs and generate or preview a corporate bill.", consequence: "Financial document creation.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporate.bills.print", label: "Print and issue corporate bills", module: "corporate", action: "bills.print", risk: "medium", description: "Print or issue a corporate bill document.", consequence: "Customer-facing financial document.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporate.bills.recordPayment", label: "Record corporate bill payment", module: "corporate", action: "bills.recordPayment", risk: "high", description: "Record a payment against a corporate bill. Capability only — no payment route exists yet.", consequence: "Financial receipt recording.", suggestedRoles: ["Manager", "Cashier", "Super Admin"], coverageCritical: false },
  { key: "corporate.bills.configureTemplates", label: "Configure Corporate Ltd. billing preset", module: "corporate", action: "bills.configureTemplates", risk: "high", description: "Configure a Corporate Ltd. client's saved billing preset (header fields, recipient style, row columns).", consequence: "Controls future Corporate Ltd. bill layout.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Corporate Messages ──
  { key: "corporateMessages.view", label: "View corporate messages", module: "corporateMessages", action: "view", risk: "low", description: "Read message threads with corporate clients.", consequence: "Read-only access to B2B communications.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "corporateMessages.reply", label: "Reply to corporate messages", module: "corporateMessages", action: "reply", risk: "high", description: "Send messages to corporate clients on behalf of the shop.", consequence: "Customer-facing B2B communication.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },

  // ── Challans ──
  { key: "challans.view", label: "View all operational challans", module: "challans", action: "view", risk: "low", description: "See the full operational challans list (shop-wide).", consequence: "Read-only ops handover documents.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "challans.viewOwn", label: "View own / assigned challans", module: "challans", action: "viewOwn", risk: "low", description: "See only operational challans you created or are assigned to as driver.", consequence: "Scoped handover visibility for drivers.", suggestedRoles: ["Driver", "Manager", "Super Admin"], coverageCritical: true },
  { key: "challans.create", label: "Create operational challans", module: "challans", action: "create", risk: "medium", description: "Create operational delivery/handover challans.", consequence: "Adds ops custody documents.", suggestedRoles: ["Manager", "Driver", "Super Admin"], coverageCritical: true },
  { key: "challans.edit", label: "Edit operational challans", module: "challans", action: "edit", risk: "medium", description: "Edit operational challans within allowed scope (all or own/assigned).", consequence: "Modifies ops custody documents.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "challans.assignDriver", label: "Assign challan driver", module: "challans", action: "assignDriver", risk: "high", description: "Assign or reassign the driver on an operational challan.", consequence: "Changes who is responsible for handover.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "challans.delete", label: "Delete operational challans", module: "challans", action: "delete", risk: "critical", description: "Permanently delete operational challans. Explicit grant only.", consequence: "Data loss; custody trail gap.", suggestedRoles: ["Super Admin"], coverageCritical: true },
  { key: "challans.manage", label: "Create/edit operational challans (deprecated)", module: "challans", action: "manage", risk: "high", description: "DEPRECATED: use challans.create + challans.edit. Grants create/edit only — never delete.", consequence: "Compatibility for older grants; does not grant delete.", suggestedRoles: ["Manager", "Driver", "Super Admin"], coverageCritical: false },

  // ── Customers ──
  { key: "customers.view", label: "View customers", module: "customers", action: "view", risk: "low", description: "See customer directory and profiles.", consequence: "Access to customer PII.", suggestedRoles: ["Manager", "Cashier", "Super Admin"], coverageCritical: false },
  { key: "customers.edit", label: "Edit customer records", module: "customers", action: "edit", risk: "medium", description: "Update customer contact info and notes.", consequence: "Modifies customer data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "customers.create", label: "Create customer records", module: "customers", action: "create", risk: "high", description: "Create a customer account or record.", consequence: "Adds customer data and PII to the system.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "customers.delete", label: "Delete customer records", module: "customers", action: "delete", risk: "critical", description: "Delete a customer account or record.", consequence: "Can remove customer data and interrupt linked history.", suggestedRoles: ["Super Admin"], coverageCritical: true },

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

  // ── Disputes (Aftercare — Ticket 04) ──
  { key: "disputes.view", label: "View disputes", module: "disputes", action: "view", risk: "low", description: "See dispute case list and details.", consequence: "Read-only aftercare dispute data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "disputes.create", label: "Create dispute case", module: "disputes", action: "create", risk: "medium", description: "Open a new customer dispute case linked to a POS transaction, refund, or warranty claim.", consequence: "Creates aftercare record; no financial mutation.", suggestedRoles: ["Manager", "Cashier", "Super Admin"], coverageCritical: false },
  { key: "disputes.resolve", label: "Resolve/update dispute status", module: "disputes", action: "resolve", risk: "high", description: "Transition dispute lifecycle (under_review, resolved, closed) and add resolution notes.", consequence: "Affects dispute resolution state; append-only notes.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

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
  { key: "users.editStaff", label: "Edit staff accounts", module: "users", action: "editStaff", risk: "critical", description: "Edit staff account details and administration fields.", consequence: "Can change staff access and account state.", suggestedRoles: ["Super Admin"], coverageCritical: true },
  { key: "users.inviteStaff", label: "Create setup links", module: "users", action: "inviteStaff", risk: "critical", description: "Generate one-time setup links for new staff.", consequence: "Creates new accounts with permissions.", suggestedRoles: ["Super Admin"], coverageCritical: true },
  { key: "users.editPermissions", label: "Edit staff permissions", module: "users", action: "editPermissions", risk: "critical", description: "Change another user's role or permission set.", consequence: "Privilege escalation vector.", suggestedRoles: ["Super Admin"], coverageCritical: false },
  { key: "users.deactivate", label: "Deactivate staff account", module: "users", action: "deactivate", risk: "critical", description: "Disable a staff member's account.", consequence: "Locks user out; may block coverage.", suggestedRoles: ["Super Admin"], coverageCritical: false },
  { key: "users.viewCustomers", label: "View customer accounts", module: "users", action: "viewCustomers", risk: "medium", description: "Access the customer account list.", consequence: "Customer PII access.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Settings ──
  { key: "settings.manage", label: "Manage system settings", module: "settings", action: "manage", risk: "critical", description: "Change shop configuration, modules, and system behavior.", consequence: "System-wide impact; can break workflows.", suggestedRoles: ["Super Admin"], coverageCritical: false },

  // ── Attendance ──
  { key: "attendance.view", label: "View attendance", module: "attendance", action: "view", risk: "low", description: "See staff attendance records.", consequence: "Read-only HR data.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "attendance.checkIn", label: "Check in/out", module: "attendance", action: "checkIn", risk: "low", description: "Record own check-in and check-out.", consequence: "Self-service; own record only.", suggestedRoles: ["Driver", "Technician", "Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "attendance.manageCorrections", label: "Manage attendance corrections", module: "attendance", action: "manageCorrections", risk: "high", description: "Approve or reject staff attendance correction requests. Does not change live GPS check-in rules.", consequence: "Publishes effective report times while preserving raw GPS evidence.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Notifications ──
  { key: "notifications.view", label: "View notifications", module: "notifications", action: "view", risk: "low", description: "See system notifications and alerts.", consequence: "Read-only.", suggestedRoles: ["Driver", "Technician", "Cashier", "Manager", "Super Admin"], coverageCritical: false },
  { key: "notifications.manage", label: "Manage notifications", module: "notifications", action: "manage", risk: "medium", description: "Configure notification settings and overrides.", consequence: "Affects alert routing.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },

  // ── Map / Service Areas ──
  { key: "map.viewAreaAnalytics", label: "View area analytics", module: "map", action: "viewAreaAnalytics", risk: "medium", description: "View aggregated service analytics grouped by geographic area.", consequence: "Access to area-level service counts and revenue totals — no customer PII.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: false },
  { key: "map.manageAreas", label: "Manage service areas", module: "map", action: "manageAreas", risk: "medium", description: "Create, update, and deactivate service area taxonomy entries.", consequence: "Affects area-based filtering and analytics grouping.", suggestedRoles: ["Super Admin"], coverageCritical: false },

  // ── Service Feedback (CUSTOMER-FEEDBACK-01A) — explicit keys only; Super Admin has * ──
  { key: "feedback.recovery.viewAssigned", label: "View assigned recovery cases", module: "feedback", action: "recovery.viewAssigned", risk: "low", description: "See only service-recovery cases assigned to you (e.g. driver delivery recovery).", consequence: "Scoped recovery visibility; no shop-wide feedback browse.", suggestedRoles: ["Driver", "Manager", "Super Admin"], coverageCritical: true },
  { key: "feedback.recovery.viewAll", label: "View all recovery cases", module: "feedback", action: "recovery.viewAll", risk: "medium", description: "See every open/closed post-service recovery case.", consequence: "Full recovery queue visibility including low ratings and customer comments.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "feedback.recovery.updateAssigned", label: "Update assigned recovery cases", module: "feedback", action: "recovery.updateAssigned", risk: "medium", description: "Add notes or progress on recovery cases assigned to you.", consequence: "Staff notes on service recovery; never changes customer rating/comment.", suggestedRoles: ["Driver", "Manager", "Super Admin"], coverageCritical: true },
  { key: "feedback.recovery.resolve", label: "Resolve recovery cases", module: "feedback", action: "recovery.resolve", risk: "high", description: "Mark a recovery case resolved/closed.", consequence: "Closes service-recovery work; does not reopen jobs or alter money.", suggestedRoles: ["Manager", "Super Admin"], coverageCritical: true },
  { key: "feedback.public.moderate", label: "Moderate public reviews", module: "feedback", action: "public.moderate", risk: "high", description: "Publish or hide consented customer feedback for public/homepage use.", consequence: "Controls public reputation content; requires explicit grant (not role name alone).", suggestedRoles: ["Super Admin"], coverageCritical: true },
  { key: "feedback.public.feature", label: "Feature homepage reviews", module: "feedback", action: "public.feature", risk: "high", description: "Mark published reviews as featured for homepage selection.", consequence: "Homepage placement control; separate from basic publish.", suggestedRoles: ["Super Admin"], coverageCritical: true },
  { key: "feedback.retention.review", label: "Annual public retention review", module: "feedback", action: "retention.review", risk: "high", description: "Renew, hide, or archive/anonymize public display after the 12-month cycle.", consequence: "Changes public visibility retention; private feedback source is preserved unless archive path chosen.", suggestedRoles: ["Super Admin"], coverageCritical: true },
];

// ── Old → New Compatibility Map ──

export const LEGACY_TO_GRANULAR: Record<string, string[]> = {
  dashboard: ["dashboard.view"],
  serviceRequests: ["serviceRequests.view", "serviceRequests.reply", "serviceRequests.logCall", "serviceRequests.quote", "serviceRequests.transitionStage", "serviceRequests.convertToJob", "serviceRequests.edit"],
  jobs: ["jobs.view", "jobs.viewAll", "jobs.create", "jobs.assignTechnician", "jobs.reportOutcome", "jobs.reviewOutcome", "jobs.advanceStatus", "jobs.edit", "jobs.manageWorkHolds", "jobs.delete"],
  pickup: ["pickup.viewAssigned", "pickup.confirmHandover"],
  pos: ["pos.view", "pos.processPayment", "pos.openRegister"],
  finance: ["finance.view", "finance.createRecord", "finance.editRecord", "finance.deleteRecord"],
  // Legacy corporate:true = full B2B + ops keys (backward compatible). One granular key must NOT satisfy every corporate route — routes use narrow guards.
  corporate: [
    "corporate.workspace",
    "corporate.view",
    "corporate.manageClients",
    "corporate.jobsOperate",
    "corporate.challansOperate",
    "corporate.billing",
    "corporate.bills.view",
    "corporate.bills.create",
    "corporate.bills.print",
    "corporate.bills.recordPayment",
    "corporate.bills.configureTemplates",
  ],
  challans: [
    "challans.view",
    "challans.viewOwn",
    "challans.create",
    "challans.edit",
    "challans.assignDriver",
  ],
  inventory: ["inventory.view", "inventory.addItem", "inventory.editItem", "inventory.adjustStock", "inventory.deleteItem"],
  users: ["users.viewStaff", "users.inviteStaff", "customers.edit"],
  settings: ["settings.manage"],
  attendance: ["attendance.view", "attendance.checkIn", "attendance.manageCorrections"],
  reports: ["reports.view", "reports.export"],
  technician: ["jobs.view", "jobs.reportOutcome", "jobs.advanceStatus"],
  warrantyClaims: ["warranty.view", "warranty.create"],
  disputes: ["disputes.view", "disputes.create", "disputes.resolve"],
  refunds: ["pos.refund"],
  inquiries: ["serviceRequests.view", "serviceRequests.transitionStage"],
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
    "pickup.viewAssigned", "pickup.confirmHandover", "attendance.checkIn", "notifications.view",
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
    "jobs.view", "jobs.create", "jobs.assignTechnician", "jobs.reportOutcome", "jobs.reviewOutcome", "jobs.advanceStatus", "jobs.edit", "jobs.manageWorkHolds", "jobs.recordPayment",
    "repairJourney.view", "repairJourney.customerUpdate",
    "pickup.viewAll", "pickup.assignDriver", "pickup.reschedule", "pickup.cancel", "pickup.routePlan", "pickup.confirmHandover",
    "pos.view", "pos.processPayment", "pos.openRegister", "pos.closeRegister", "pos.refund",
    "finance.view", "finance.createRecord", "finance.editRecord", "finance.export",
    // New Managers: shop ops only — no corporate ops / B2B / billing by default
    "challans.view", "challans.create", "challans.edit", "challans.assignDriver",
    "customers.view", "customers.edit",
    "corporate.bills.configureTemplates",
    "inventory.view", "inventory.addItem", "inventory.editItem", "inventory.adjustStock", "inventory.export",
    "warranty.view", "warranty.create", "warranty.approve",
    "disputes.view", "disputes.create", "disputes.resolve",
    "reports.view", "reports.export",
    "analytics.view",
    "users.viewStaff",
    "attendance.view", "attendance.checkIn", "attendance.manageCorrections",
    "notifications.view", "notifications.manage",
    "map.viewAreaAnalytics",
    // Recovery work only — public moderate/feature/retention remain Super Admin / explicit grant
    "feedback.recovery.viewAll", "feedback.recovery.viewAssigned",
    "feedback.recovery.updateAssigned", "feedback.recovery.resolve",
  ],
  "Super Admin": ["*"],
};

/** One-click work packs for Permission Designer (primary simple UI) */
export const SIMPLE_WORK_PACKS: Record<string, {
  label: string;
  description: string;
  permissions: string[];
  primary: boolean;
}> = {
  "pack-jobs": {
    label: "Jobs",
    description: "Daily retail job work: view, create, assign, report outcomes, advance.",
    primary: true,
    permissions: [
      "jobs.view", "jobs.create", "jobs.assignTechnician",
      "jobs.reportOutcome", "jobs.reviewOutcome", "jobs.advanceStatus", "jobs.edit",
    ],
  },
  "pack-challans": {
    label: "Challans",
    description: "Operational challans: shop-wide view, create, edit, assign driver. No delete.",
    primary: true,
    permissions: ["challans.view", "challans.create", "challans.edit", "challans.assignDriver"],
  },
  "pack-challans-driver": {
    label: "Challans (Driver own)",
    description: "Driver can create challans and see only own/assigned operational challans.",
    primary: true,
    permissions: ["challans.viewOwn", "challans.create"],
  },
  "pack-corporate-operations": {
    label: "Corporate Operations",
    description: "One-click ops: Jobs + own Challans tabs, corporate work in those tabs. Does NOT open B2B Area, billing, client manage, or messages.",
    primary: true,
    permissions: [
      "jobs.view",
      "challans.viewOwn",
      "corporate.jobsOperate",
      "corporate.challansOperate",
    ],
  },
  "pack-b2b-workspace": {
    label: "B2B Workspace",
    description: "Full B2B Area tab: clients, batches, admin. Does not include billing by itself.",
    primary: true,
    permissions: [
      "corporate.workspace", "corporate.view", "corporate.manageClients",
      "corporateMessages.view", "corporateMessages.reply",
    ],
  },
  "pack-corporate-billing": {
    label: "Corporate Billing",
    description: "Corporate bills, invoices, and payment endpoints only.",
    primary: true,
    permissions: ["corporate.billing"],
  },
};

export const CUSTOM_PACKS: Record<string, { label: string; description: string; permissions: string[] }> = {
  ...Object.fromEntries(
    Object.entries(SIMPLE_WORK_PACKS).map(([id, pack]) => [
      id,
      { label: pack.label, description: pack.description, permissions: pack.permissions },
    ]),
  ),
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

/** Technical keys shown only under Advanced in Permission Designer */
export const ADVANCED_CORPORATE_KEYS = [
  "corporate.jobsOperate",
  "corporate.challansOperate",
  "corporate.workspace",
  "corporate.view",
  "corporate.manageClients",
  "corporate.billing",
  "corporate.bills.view",
  "corporate.bills.create",
  "corporate.bills.print",
  "corporate.bills.recordPayment",
  "corporate.bills.configureTemplates",
] as const;

export const COVERAGE_CRITICAL_PERMISSIONS = [
  "serviceRequests.reply",
  "serviceRequests.quote",
  "serviceRequests.edit",
  "jobs.assignTechnician",
  "jobs.reportOutcome",
  "jobs.reviewOutcome",
  "pickup.assignDriver",
  "pickup.reschedule",
  "pos.processPayment",
  "corporateMessages.reply",
  "repairJourney.customerUpdate",
  "users.inviteStaff",
  "corporate.jobsOperate",
  "corporate.challansOperate",
  "corporate.workspace",
  "corporate.billing",
  "challans.viewOwn",
  "challans.create",
  "challans.edit",
  "challans.assignDriver",
  "challans.delete",
] as const;

/**
 * Deprecated granular keys that still grant a subset of modern keys.
 * challans.manage → create+edit only (never delete, never assignDriver).
 */
export const DEPRECATED_GRANULAR_EXPANSIONS: Record<string, string[]> = {
  "challans.manage": ["challans.create", "challans.edit"],
  "corporate.billing": [
    "corporate.bills.view",
    "corporate.bills.create",
    "corporate.bills.print",
    "corporate.bills.recordPayment",
    "corporate.bills.configureTemplates",
  ],
};

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

/** Map ROLE_PRESETS key list → stored permission object for new staff. */
export function rolePresetToPermissionMap(presetName: string): Record<string, boolean> {
  const keys = ROLE_PRESETS[presetName] || [];
  const map: Record<string, boolean> = {};
  for (const k of keys) {
    if (k === "*") {
      map["*"] = true;
      continue;
    }
    map[k] = true;
  }
  return map;
}

const ROLE_TO_PRESET: Record<string, string> = {
  Manager: "Manager Basic",
  Driver: "Driver Basic",
  Technician: "Technician Basic",
  Cashier: "Cashier Basic",
  "Super Admin": "Super Admin",
};

/**
 * Explicit stored permissions for newly created staff.
 * New Managers get Manager Basic (corporate-free). Does not affect null/empty legacy accounts.
 */
export function getNewStaffPermissionMap(role: string): Record<string, boolean> {
  const preset = ROLE_TO_PRESET[role];
  if (preset && ROLE_PRESETS[preset]) {
    return rolePresetToPermissionMap(preset);
  }
  return {};
}

/** Resolve direct, legacy, and deprecated granular permission grants consistently. */
export function resolveGranularPermission(
  effectivePermissions: Record<string, any>,
  granularKey: string,
): boolean {
  if (effectivePermissions["*"]) return true;
  if (effectivePermissions[granularKey]) return true;
  for (const [deprecatedKey, expansions] of Object.entries(DEPRECATED_GRANULAR_EXPANSIONS)) {
    if (expansions.includes(granularKey) && effectivePermissions[deprecatedKey]) return true;
  }
  for (const [legacyKey, granularKeys] of Object.entries(LEGACY_TO_GRANULAR)) {
    if (granularKeys.includes(granularKey) && effectivePermissions[legacyKey]) return true;
  }
  return false;
}
