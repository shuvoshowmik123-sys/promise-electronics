import { pgTable, text, serial, integer, boolean, timestamp, date, jsonb, real, doublePrecision, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums - We'll keep them as const arrays for Zod validation, 
// but in PG we could use native enums. For simplicity in migration, we'll use text columns with checks or just application-level validation.
export * from "./constants";

// ----------------------------------------------------------------------------
// ENUMS (Application Level Validation)
// ----------------------------------------------------------------------------

export const SERVICE_STATUSES = [
  'submitted',        // Customer/Admin creates request
  'triaged',          // Admin reviews, decides action
  'quoted',           // Price estimate provided
  'customer_decision',// Waiting for approval
  'scheduled',        // Pickup/dropoff scheduled
  'device_received',  // Device at service center
  'assigned',         // Technician assigned
  'in_repair',        // Work in progress
  'quality_check',    // QC pending
  'ready',            // Ready for return
  'out_for_delivery', // In transit
  'closed',           // Completed & Archived
] as const;

export const FRAUD_ALERT_SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
export const FRAUD_ALERT_STATUS = ['open', 'investigating', 'resolved', 'false_positive'] as const;


// Session Table (Managed by connect-pg-simple, but defined here to prevent Drizzle from dropping it)
export const userSessions = pgTable("user_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// Users Table
export const users = pgTable("users", {
  id: text("id").primaryKey(), // App should generate UUID
  username: text("username").unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone").unique(),
  phoneNormalized: text("phone_normalized"), // Last 10 digits
  password: text("password").notNull(),
  role: text("role").notNull().default("Customer"), // We could use enum here but text is fine
  status: text("status").notNull().default("Active"),
  permissions: text("permissions").notNull().default("{}"), // Keeping as text for simple JSON parsing or could be jsonb

  // Technician Specific Fields (Added for Skill Matching)
  skills: text("skills"), // Comma-separated or JSON string of skills
  seniorityLevel: text("seniority_level").default("Junior"), // 'Junior', 'Mid', 'Senior', 'Expert'
  performanceScore: real("performance_score").default(0),

  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
  // Customer specific fields
  googleSub: text("google_sub").unique(),
  storeId: text("store_id"), // Franchise-Ready column
  address: text("address"),
  profileImageUrl: text("profile_image_url"),
  avatar: text("avatar"),
  isVerified: boolean("is_verified").default(false),
  preferences: text("preferences").default("{}"), // Stores JSON string of user preferences
  corporateClientId: text("corporate_client_id"), // FK to corporate_clients.id logic handled in app
  defaultWorkLocationId: text("default_work_location_id"),
}, (table) => {
  return {
    roleIdx: index("idx_users_role").on(table.role),
    emailIdx: index("idx_users_email").on(table.email),
    phoneIdx: index("idx_users_phone").on(table.phone),
    phoneNormalizedIdx: index("idx_users_phone_normalized").on(table.phoneNormalized),
    googleSubIdx: index("idx_users_google_sub").on(table.googleSub),
  };
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  joinedAt: true,
  lastLogin: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Customer = User;

export const workLocations = pgTable("work_locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  storeId: text("store_id"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radiusMeters: integer("radius_meters").notNull().default(150),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => {
  return {
    statusIdx: index("idx_work_locations_status").on(table.status),
    storeIdx: index("idx_work_locations_store").on(table.storeId),
  };
});

export const insertWorkLocationSchema = createInsertSchema(workLocations).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertWorkLocation = z.infer<typeof insertWorkLocationSchema>;
export type WorkLocation = typeof workLocations.$inferSelect;

export type UpsertCustomerFromGoogle = {
  googleSub: string;
  email?: string | null;
  name: string;
  profileImageUrl?: string | null;
};

export type UserPermissions = {
  dashboard?: boolean;
  jobs?: boolean;
  inventory?: boolean;
  pos?: boolean;
  challans?: boolean;
  finance?: boolean;
  attendance?: boolean;
  reports?: boolean;
  serviceRequests?: boolean;
  orders?: boolean;           // Shop Orders
  technician?: boolean;       // Technician View
  inquiries?: boolean;        // Inquiries / Contact Messages
  systemHealth?: boolean;     // System Health / Server Status
  warrantyClaims?: boolean;   // Warranty Claims Management
  refunds?: boolean;          // Refund Management
  users?: boolean;
  settings?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  canViewFullJobDetails?: boolean;
  canPrintJobTickets?: boolean;
  process_payment?: boolean;

  // New Permissions for missing tabs
  corporate?: boolean;        // Managed Clients / Corporate
  notifications?: boolean;    // Notifications
  knowledgeBase?: boolean;    // Knowledge Base
  quality?: boolean;          // Quality Control / Assurance
  salary?: boolean;           // Salary & HR
  purchasing?: boolean;       // Purchasing
  wastage?: boolean;          // Wastage Management
  auditLogs?: boolean;        // Audit Logs
  brain?: boolean;            // System Brain / AI Analytics

  // Action / Lookup Permissions
  canViewUsers?: boolean;     // Narrow permission to view basic user list for dropdowns
  canAssignTechnician?: boolean;   // Can assign/reassign technicians to jobs
  canSetPriority?: boolean;        // Can set job priority level
  canSetDeadline?: boolean;        // Can set job deadline
  canSetWarranty?: boolean;        // Can set warranty terms
  canViewCustomerPhone?: boolean;  // Can see customer phone numbers
  canAddAssistedBy?: boolean;      // Can add helper technicians
};


// Job Tickets Table
export const jobTickets = pgTable("job_tickets", {
  id: text("id").primaryKey(),
  customer: text("customer"),
  customerPhone: text("customer_phone"),
  customerPhoneNormalized: text("customer_phone_normalized"),
  customerAddress: text("customer_address"),
  device: text("device"),
  tvSerialNumber: text("tv_serial_number"),
  issue: text("issue"),
  status: text("status").notNull().default("Pending"),
  technician: text("technician"),
  priority: text("priority"), // Nullable by default now ("Not Set")
  assistedBy: text("assisted_by"), // New field for assist team notation
  screenSize: text("screen_size"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  deadline: timestamp("deadline"), // Direct user-selected deadline
  slaDeadline: timestamp("sla_deadline"), // System-calculated corporate strict SLA
  notes: text("notes"),
  receivedAccessories: text("received_accessories"),
  aiDiagnosis: jsonb("ai_diagnosis"),
  estimatedCost: real("estimated_cost"),
  assignedTechnicianId: text("assigned_technician_id"), // FK to users.id
  corporateChallanId: text("corporate_challan_id"),
  corporateJobNumber: text("corporate_job_number"),
  corporateClientId: text("corporate_client_id"),
  jobType: text("job_type").default("standard"),
  parentJobId: text("parent_job_id"),
  charges: jsonb("charges"), // Array of { description, amount, type }
  warrantyNotes: text("warranty_notes"), // Specific warranty terms for this job

  // Payment & Billing Refinement
  paymentStatus: text("payment_status").notNull().default("unpaid"), // 'unpaid' | 'paid' | 'partial' | 'incomplete' | 'written_off'
  paymentId: text("payment_id"), // Primary POS transaction ID
  paidAmount: real("paid_amount").default(0),
  remainingAmount: real("remaining_amount").default(0),
  paidAt: timestamp("paid_at"),
  lastPaymentAt: timestamp("last_payment_at"),

  billingStatus: text("billing_status").notNull().default("pending"), // 'pending' | 'billed' | 'invoiced' | 'delivered'
  invoicePrintedAt: timestamp("invoice_printed_at"),

  // Corporate B2B Fields (Phase 5)
  // corporateChallanId and corporateJobNumber are already defined above
  initialStatus: text("initial_status"), // 'OK' | 'NG' for intake condition via Challan
  reportedDefect: text("reported_defect"), // Client's specific defect description from Challan (Company Claim)
  problemFound: text("problem_found"), // Technician's diagnosis - what was actually found wrong
  corporateBillId: text("corporate_bill_id"), // Links to master invoice (Challan Invoice)
  invoicePrintedBy: text("invoice_printed_by"),
  invoicePrintCount: integer("invoice_print_count").default(0),

  writeOffReason: text("write_off_reason"),
  writeOffBy: text("write_off_by"),
  writeOffAt: timestamp("write_off_at"),

  // Collaborative Repair Tracking
  assistedByIds: text("assisted_by_ids").default("[]"), // JSON array of helper technician user IDs
  assistedByNames: text("assisted_by_names"),           // Comma-separated names for display

  // Enhanced Job Details (Corporate)
  serviceLines: text("service_lines"), // JSON array of service types applied with custom pricing
  productLines: text("product_lines"), // JSON array of products/parts used

  // Unified Warranty System (Revised)
  warrantyDays: integer("warranty_days").default(30), // Standard 30 days
  gracePeriodDays: integer("grace_period_days").default(7), // Standard 7 days
  warrantyExpiryDate: timestamp("warranty_expiry_date"), // Calculated end date
  warrantyTermsAccepted: boolean("warranty_terms_accepted").default(false),
  mobileMedia: text("mobile_media").default("[]"),
  lastMobileUpdateAt: timestamp("last_mobile_update_at"),
  storeId: text("store_id"), // Franchise-Ready column
}, (table) => {
  return {
    statusIdx: index("idx_job_tickets_status").on(table.status),
    customerIdx: index("idx_job_tickets_customer").on(table.customer),
    customerPhoneNormalizedIdx: index("idx_job_tickets_customer_phone_normalized").on(table.customerPhoneNormalized),
    technicianIdx: index("idx_job_tickets_technician").on(table.technician),
    createdAtIdx: index("idx_job_tickets_created_at").on(table.createdAt),
    corporateChallanIdx: index("idx_job_tickets_corporate_challan_id").on(table.corporateChallanId),
    corporateClientIdx: index("idx_job_tickets_corporate_client_id").on(table.corporateClientId),
    paymentStatusIdx: index("idx_job_tickets_payment_status").on(table.paymentStatus),
    statusDeadlineIdx: index("idx_job_tickets_status_deadline").on(table.status, table.deadline),
    statusCreatedIdx: index("idx_job_tickets_status_created_at").on(table.status, table.createdAt),
  };
});

export const insertJobTicketSchema = createInsertSchema(jobTickets).omit({
  createdAt: true,
  completedAt: true,
});
export type InsertJobTicket = z.infer<typeof insertJobTicketSchema>;
export type JobTicket = typeof jobTickets.$inferSelect;

// Inventory Items Table
export const inventoryItems = pgTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  itemType: text("item_type").notNull().default("product"),
  stock: integer("stock").notNull().default(0),
  price: real("price").notNull(),
  minPrice: real("min_price"),
  maxPrice: real("max_price"),
  status: text("status").notNull().default("In Stock"),
  lowStockThreshold: integer("low_stock_threshold").default(5),
  images: text("images"),
  showOnWebsite: boolean("show_on_website").default(false),
  showOnAndroidApp: boolean("show_on_android_app").default(true),
  showOnHotDeals: boolean("show_on_hot_deals").default(false),
  hotDealPrice: real("hot_deal_price"),
  icon: text("icon"),
  estimatedDays: text("estimated_days"),
  displayOrder: integer("display_order").default(0),
  features: text("features"),
  isSparePart: boolean("is_spare_part").default(false),
  storeId: text("store_id"), // Franchise-Ready column
  isSerialized: boolean("is_serialized").default(false),
  reorderQuantity: integer("reorder_quantity"),
  preferredSupplier: text("preferred_supplier"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => {
  return {
    categoryIdx: index("idx_inventory_category").on(table.category),
    showOnWebsiteIdx: index("idx_inventory_show_on_website").on(table.showOnWebsite),
    statusIdx: index("idx_inventory_status").on(table.status),
  };
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  createdAt: true,
  updatedAt: true,
}).partial({
  id: true,
});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

// Inventory Serials Table (Phase 4.1)
export const inventorySerials = pgTable("inventory_serials", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id").notNull().references(() => inventoryItems.id),
  serialNumber: text("serial_number").notNull(),
  status: text("status").notNull().default("In Stock"), // In Stock | Reserved | Consumed | Defective | Wasted
  jobTicketId: text("job_ticket_id"),        // Linked when consumed
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  consumedAt: timestamp("consumed_at"),
  notes: text("notes"),
  storeId: text("store_id"),
});

export const insertInventorySerialSchema = createInsertSchema(inventorySerials).omit({
  receivedAt: true,
  consumedAt: true,
});
export type InsertInventorySerial = z.infer<typeof insertInventorySerialSchema>;
export type InventorySerial = typeof inventorySerials.$inferSelect;

// Purchase Orders Table (Phase 4.3)
export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplierName: text("supplier_name").notNull(),
  status: text("status").notNull().default("Draft"), // Draft | Pending | Received | Cancelled
  totalAmount: real("total_amount").notNull().default(0),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  notes: text("notes"),
  storeId: text("store_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

// Purchase Order Items Table (Phase 4.3)
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: text("id").primaryKey(),
  purchaseOrderId: text("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  inventoryItemId: text("inventory_item_id").notNull().references(() => inventoryItems.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
});

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems);
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

// Local Purchases Table (Phase 4.4)
export const localPurchases = pgTable("local_purchases", {
  id: text("id").primaryKey(),
  jobTicketId: text("job_ticket_id").notNull(),
  partName: text("part_name").notNull(),
  supplierName: text("supplier_name"),
  costPrice: real("cost_price").notNull(),       // What was actually paid
  sellingPrice: real("selling_price").notNull(),  // What goes on the invoice
  quantity: integer("quantity").notNull().default(1),
  receiptImageUrl: text("receipt_image_url"),     // Mandatory receipt photo
  purchasedBy: text("purchased_by").notNull(),    // Username who sourced it
  status: text("status").notNull().default("Consumed"), // Consumed | Returned
  createdAt: timestamp("created_at").notNull().defaultNow(),
  storeId: text("store_id"),
});

export const insertLocalPurchaseSchema = createInsertSchema(localPurchases).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertLocalPurchase = z.infer<typeof insertLocalPurchaseSchema>;
export type LocalPurchase = typeof localPurchases.$inferSelect;

// Wastage Logs Table (Phase 4.5)
export const wastageLogs = pgTable("wastage_logs", {
  id: text("id").primaryKey(),
  inventoryItemId: text("inventory_item_id").notNull(),
  serialId: text("serial_id"),               // If tracking a specific serial
  quantity: integer("quantity").notNull().default(1),
  reason: text("reason").notNull(),          // "DOA/Factory Defect" | "Installation Fault" | "Transit Damage" | "Water Damage" | "Other"
  jobTicketId: text("job_ticket_id"),        // If damaged during a specific repair
  financialLoss: real("financial_loss"),      // Cost price × quantity
  reportedBy: text("reported_by").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  storeId: text("store_id"),
}, (table) => {
  return {
    createdAtIdx: index("idx_wastage_logs_created_at").on(table.createdAt),
  };
});

export const insertWastageLogSchema = createInsertSchema(wastageLogs).omit({
  id: true,
  createdAt: true,
  reportedBy: true,
  storeId: true,
});
export type InsertWastageLog = z.infer<typeof insertWastageLogSchema>;
export type WastageLog = typeof wastageLogs.$inferSelect;

// Service Categories Table
export const serviceCategories = pgTable("service_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({
  id: true,
  createdAt: true,
});
export type InsertServiceCategory = z.infer<typeof insertServiceCategorySchema>;
export type ServiceCategory = typeof serviceCategories.$inferSelect;

// Challans Table
export const challans = pgTable("challans", {
  id: text("id").primaryKey(),
  receiver: text("receiver").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("Pending"),
  items: integer("items").notNull().default(1),
  lineItems: text("line_items"), // JSON string
  receiverAddress: text("receiver_address"),
  receiverPhone: text("receiver_phone"),
  vehicleNo: text("vehicle_no"),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  gatePassNo: text("gate_pass_no"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  notes: text("notes"),
}, (table) => {
  return {
    statusIdx: index("idx_challans_status").on(table.status),
    typeIdx: index("idx_challans_type").on(table.type),
    createdAtIndex: index("idx_challans_created_at").on(table.createdAt),
  };
});

export const insertChallanSchema = createInsertSchema(challans).omit({
  createdAt: true,
  deliveredAt: true,
});
export type InsertChallan = z.infer<typeof insertChallanSchema>;
export type Challan = typeof challans.$inferSelect;

// Petty Cash Records Table
export const pettyCashRecords = pgTable("petty_cash_records", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  amount: real("amount").notNull(),
  type: text("type").notNull(),
  dueRecordId: text("due_record_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  drawerSessionId: text("drawer_session_id").references(() => drawerSessions.id), // Phase 7
}, (table) => {
  return {
    createdAtIdx: index("idx_petty_cash_records_created_at").on(table.createdAt),
  };
});

export const insertPettyCashRecordSchema = createInsertSchema(pettyCashRecords).omit({
  id: true,
  createdAt: true,
});
export type InsertPettyCashRecord = z.infer<typeof insertPettyCashRecordSchema>;
export type PettyCashRecord = typeof pettyCashRecords.$inferSelect;

// Due Records Table
export const dueRecords = pgTable("due_records", {
  id: text("id").primaryKey(),
  customer: text("customer").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("Pending"),
  invoice: text("invoice").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  dueDate: timestamp("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  paidAmount: real("paid_amount").default(0),
}, (table) => {
  return {
    createdAtIdx: index("idx_due_records_created_at").on(table.createdAt),
  };
});

export const insertDueRecordSchema = createInsertSchema(dueRecords).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});
export type InsertDueRecord = z.infer<typeof insertDueRecordSchema>;
export type DueRecord = typeof dueRecords.$inferSelect;

// Approval Requests Table (For Super Admin verification of sensitive changes)
export const APPROVAL_REQUEST_TYPES = ['company_claim_change', 'status_override', 'refund_request'] as const;
export const APPROVAL_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const;

export const approvalRequests = pgTable("approval_requests", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'company_claim_change', etc.
  requestedBy: text("requested_by").notNull(), // User ID who initiated
  requestedByName: text("requested_by_name"), // User name for display
  jobId: text("job_id"), // Related job if applicable
  jobNumber: text("job_number"), // Job number for display
  oldValue: text("old_value"), // Original value
  newValue: text("new_value"), // Proposed new value
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  reviewedBy: text("reviewed_by"), // Super Admin who reviewed
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => {
  return {
    statusIdx: index("idx_approval_requests_status").on(table.status),
    typeIdx: index("idx_approval_requests_type").on(table.type),
  };
});

export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;

// Products Table
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  price: text("price").notNull(),
  category: text("category").notNull(),
  image: text("image").notNull(),
  rating: real("rating").default(0.0),
  reviews: integer("reviews").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Settings Table
export const settings = pgTable("settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// System Modules Table (Feature Toggles)
export const systemModules = pgTable("system_modules", {
  id: text("id").primaryKey(),                          // e.g., 'jobs', 'pos', 'corporate'
  name: text("name").notNull(),                         // Display name: 'Job Tickets'
  description: text("description"),                     // What this module does
  category: text("category").notNull().default("general"), // 'core', 'operations', 'finance', 'b2b', 'people', 'system'

  // Portal visibility toggles
  enabledAdmin: boolean("enabled_admin").notNull().default(true),
  enabledCustomer: boolean("enabled_customer").notNull().default(false),
  enabledCorporate: boolean("enabled_corporate").notNull().default(false),
  enabledTechnician: boolean("enabled_technician").notNull().default(false),

  // Metadata
  isCore: boolean("is_core").notNull().default(false),       // Core modules can't be fully disabled
  displayOrder: integer("display_order").default(0),
  icon: text("icon"),                                   // Lucide icon name
  dependencies: text("dependencies").default("[]"),           // JSON array of module IDs this depends on
  portalScope: text("portal_scope").default("admin"),         // Comma-separated portals: "admin", "admin,customer", etc.
  offlineCapability: text("offline_capability").default("locked"), // 'write', 'read-only', 'locked'

  // Audit
  toggledBy: text("toggled_by"),                        // User who last changed the state
  toggledAt: timestamp("toggled_at").defaultNow(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSystemModuleSchema = createInsertSchema(systemModules).omit({
  createdAt: true,
  toggledAt: true,
});
export type InsertSystemModule = z.infer<typeof insertSystemModuleSchema>;
export type SystemModule = typeof systemModules.$inferSelect;

// Corporate Clients Table
export const corporateClients = pgTable("corporate_clients", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  shortCode: text("short_code").notNull().unique(), // e.g., '1KF'
  pricingType: text("pricing_type").default("standard"), // 'standard' | 'custom_matrix'
  customPricing: jsonb("custom_pricing"), // Custom pricing logic/matrix
  discountPercentage: real("discount_percentage").default(0),
  billingCycle: text("billing_cycle").default("monthly"), // 'weekly' | 'monthly'
  paymentTerms: integer("payment_terms").default(30), // Net days
  defaultSlaHours: integer("default_sla_hours").default(48), // Default SLA timeline
  outstandingBalance: real("outstanding_balance").default(0),

  // Hierarchy Fields
  parentClientId: text("parent_client_id"), // Self-reference for Branch -> Master
  branchName: text("branch_name"), // e.g. "Gulshan Branch"

  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  address: text("address"), // Company Address
  phone: text("phone"), // General Company Phone
  portalUsername: text("portal_username").unique(),
  portalPasswordHash: text("portal_password_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});


export const corporateClientsRelations = relations(corporateClients, ({ one, many }) => ({
  parentClient: one(corporateClients, {
    fields: [corporateClients.parentClientId],
    references: [corporateClients.id],
    relationName: "branch_parent"
  }),
  branches: many(corporateClients, {
    relationName: "branch_parent"
  })
}));

export const insertCorporateClientSchema = createInsertSchema(corporateClients).omit({
  id: true,
  createdAt: true,
  outstandingBalance: true,
});
export type InsertCorporateClient = z.infer<typeof insertCorporateClientSchema>;
export type CorporateClient = typeof corporateClients.$inferSelect;

// Corporate Trusted Devices Table
export const trustedCorporateDevices = pgTable("trusted_corporate_devices", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 hashed 32-byte secret
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  trustedUntil: timestamp("trusted_until").notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
}, (table) => {
  return {
    tokenHashIdx: index("idx_trusted_devices_token_hash").on(table.tokenHash),
    userValidDeviceIdx: index("idx_trusted_devices_user_valid").on(table.userId, table.revokedAt, table.trustedUntil),
  };
});

export const insertTrustedCorporateDeviceSchema = createInsertSchema(trustedCorporateDevices).omit({
  id: true,
  createdAt: true,
});
export type InsertTrustedCorporateDevice = z.infer<typeof insertTrustedCorporateDeviceSchema>;
export type TrustedDevice = typeof trustedCorporateDevices.$inferSelect;

// Corporate Challans Table
export const corporateChallans = pgTable("corporate_challans", {
  id: text("id").primaryKey(),
  challanNumber: text("challan_number").unique(), // {ClientCode}-C-{Seq}
  type: text("type").notNull(), // 'incoming' | 'outgoing'
  corporateClientId: text("corporate_client_id").references(() => corporateClients.id),

  items: jsonb("items"), // Array of devices or Job IDs
  totalItems: integer("total_items").notNull(),

  receivedDate: timestamp("received_date"),
  returnedDate: timestamp("returned_date"),
  receiverName: text("receiver_name"),
  receiverPhone: text("receiver_phone"),
  receiverSignature: text("receiver_signature"),

  status: text("status").notNull().default("received"), // 'received' | 'in_progress' | 'completed' | 'delivered'
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => {
  return {
    corporateClientIdx: index("idx_corporate_challans_client_id").on(table.corporateClientId),
    typeIdx: index("idx_corporate_challans_type").on(table.type),
    statusIdx: index("idx_corporate_challans_status").on(table.status),
  };
});

export const insertCorporateChallanSchema = createInsertSchema(corporateChallans).omit({
  id: true,
  createdAt: true,
});
export type InsertCorporateChallan = z.infer<typeof insertCorporateChallanSchema>;
export type CorporateChallan = typeof corporateChallans.$inferSelect;

// Corporate Bills Table
export const corporateBills = pgTable("corporate_bills", {
  id: text("id").primaryKey(),
  billNumber: text("bill_number").unique(), // {ClientCode}-B-{Seq}
  corporateClientId: text("corporate_client_id").references(() => corporateClients.id),

  billingPeriodStart: timestamp("billing_period_start"),
  billingPeriodEnd: timestamp("billing_period_end"),

  lineItems: jsonb("line_items"),
  subtotal: real("subtotal").notNull(),
  discount: real("discount").default(0),
  vatAmount: real("vat_amount").default(0),
  grandTotal: real("grand_total").notNull(),

  paymentStatus: text("payment_status").default("unpaid"), // 'unpaid' | 'partial' | 'paid'
  paidAmount: real("paid_amount").default(0),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),
  dueRecordId: text("due_record_id"), // Link to Finance
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => {
  return {
    corporateClientIdx: index("idx_corporate_bills_client_id").on(table.corporateClientId),
    paymentStatusIdx: index("idx_corporate_bills_payment_status").on(table.paymentStatus),
  };
});

export const insertCorporateBillSchema = createInsertSchema(corporateBills).omit({
  id: true,
  createdAt: true,
});
export type InsertCorporateBill = z.infer<typeof insertCorporateBillSchema>;
export type CorporateBill = typeof corporateBills.$inferSelect;

// ==========================================
// Phase 7: Financial Engine
// ==========================================

export const drawerSessions = pgTable("drawer_sessions", {
  id: text("id").primaryKey(),

  // Who opened the register
  openedBy: text("opened_by").notNull(),
  openedByName: text("opened_by_name").notNull(),
  openedAt: timestamp("opened_at").notNull().defaultNow(),

  // Financial snapshot
  startingFloat: real("starting_float").notNull(), // Pre-counted cash in drawer
  expectedCash: real("expected_cash"),             // System calculated (float + cash sales - cash refunds - petty cash)
  declaredCash: real("declared_cash"),             // Cashier's blind drop count
  discrepancy: real("discrepancy"),                // Math (declaredCash - expectedCash)

  // Drawer state
  status: text("status").notNull().default('open'), // 'open' | 'counting' | 'reconciled'

  // Manager override/approval
  closedBy: text("closed_by"),
  closedByName: text("closed_by_name"),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),                            // Manager justification for variance

  storeId: text("store_id"),                       // Franchise-Ready
});

export const insertDrawerSessionSchema = createInsertSchema(drawerSessions).omit({
  id: true,
  openedAt: true,
});
export type InsertDrawerSession = z.infer<typeof insertDrawerSessionSchema>;
export type DrawerSession = typeof drawerSessions.$inferSelect;

// ==========================================
// Phase 5: Corporate Portal (B2B Hub)
// ==========================================

// Corporate Portal Urgencies
export const corporatePortalUrgencies = pgTable("corporate_portal_urgencies", {
  id: text("id").primaryKey(),
  corpClientId: text("corp_client_id").notNull(),
  jobId: text("job_id").references(() => jobTickets.id),
  reason: text("reason").notNull(),
  urgencyLevel: text("urgency_level").notNull(), // 'high', 'critical'
  status: text("status").default("pending"), // 'pending', 'acknowledged', 'resolved'
  requestedBy: text("requested_by"), // User ID
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCorporatePortalUrgencySchema = createInsertSchema(corporatePortalUrgencies).omit({
  id: true,
  createdAt: true,
});
export type InsertCorporatePortalUrgency = z.infer<typeof insertCorporatePortalUrgencySchema>;
export type CorporatePortalUrgency = typeof corporatePortalUrgencies.$inferSelect;

// Fraud Alerts Table
export const fraudAlerts = pgTable("fraud_alerts", {
  id: text("id").primaryKey(),
  alertType: text("alert_type").notNull(), // 'phantom_parts', 'fast_job', 'high_refund'
  severity: text("severity").notNull(),   // 'low', 'medium', 'high', 'critical'
  entityType: text("entity_type"),        // 'technician', 'customer', 'job'
  entityId: text("entity_id"),
  description: text("description"),
  ruleTriggered: text("rule_triggered"),      // e.g., 'job_completed_under_50_percent_time'
  status: text("status").notNull().default("open"), // 'open', 'investigating', 'resolved', 'false_positive'
  metadata: jsonb("metadata"), // Extra context snapshot
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
});

export const insertFraudAlertSchema = createInsertSchema(fraudAlerts).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  resolvedBy: true,
});
export type InsertFraudAlert = z.infer<typeof insertFraudAlertSchema>;
export type FraudAlert = typeof fraudAlerts.$inferSelect;

// POS Transactions Table
export const posTransactions = pgTable("pos_transactions", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").unique(),
  customer: text("customer"),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  items: text("items").notNull(), // JSON string
  linkedJobs: text("linked_jobs"), // JSON string
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull(),
  taxRate: real("tax_rate").default(5),
  discount: real("discount").default(0),
  total: real("total").notNull(),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("Paid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  drawerSessionId: text("drawer_session_id").references(() => drawerSessions.id), // Phase 7
}, (table) => {
  return {
    customerPhoneIdx: index("idx_pos_transactions_phone").on(table.customerPhone),
    createdAtIdx: index("idx_pos_transactions_created_at").on(table.createdAt),
    paymentMethodCreatedIdx: index("idx_pos_txn_method_created").on(table.paymentMethod, table.createdAt),
  };
});

export const insertPosTransactionSchema = createInsertSchema(posTransactions).omit({
  invoiceNumber: true,
  createdAt: true,
});
export type InsertPosTransaction = z.infer<typeof insertPosTransactionSchema>;
export type PosTransaction = typeof posTransactions.$inferSelect;

// Enums for Service Requests


// Service Catalog Table
export const serviceCatalog = pgTable("service_catalog", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  minPrice: real("min_price").notNull(),
  maxPrice: real("max_price").notNull(),
  estimatedDays: text("estimated_days"),
  icon: text("icon"),
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  features: text("features"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertServiceCatalogSchema = createInsertSchema(serviceCatalog).omit({
  id: true,
  createdAt: true,
});
export type InsertServiceCatalog = z.infer<typeof insertServiceCatalogSchema>;
export type ServiceCatalog = typeof serviceCatalog.$inferSelect;

// Service Requests Table
export const serviceRequests = pgTable("service_requests", {
  id: text("id").primaryKey(),
  ticketNumber: text("ticket_number").unique(),
  customerId: text("customer_id"),
  brand: text("brand").notNull(),
  screenSize: text("screen_size"),
  modelNumber: text("model_number"),
  primaryIssue: text("primary_issue").notNull(),
  symptoms: text("symptoms"),
  description: text("description"),
  mediaUrls: text("media_urls"),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  servicePreference: text("service_preference"),
  status: text("status").notNull().default("Pending"),
  trackingStatus: text("tracking_status").notNull().default("Request Received"),
  estimatedDelivery: timestamp("estimated_delivery"),
  paymentStatus: text("payment_status").default("Due"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  convertedJobId: text("converted_job_id"),

  requestIntent: text("request_intent"),
  serviceMode: text("service_mode"),
  stage: text("stage").default("intake"),

  isQuote: boolean("is_quote").default(false),
  serviceId: text("service_id"),
  quoteStatus: text("quote_status"),
  quoteAmount: real("quote_amount"),
  quoteNotes: text("quote_notes"),
  quotedAt: timestamp("quoted_at"),
  quoteExpiresAt: timestamp("quote_expires_at"),
  acceptedAt: timestamp("accepted_at"),

  pickupTier: text("pickup_tier"),
  pickupCost: real("pickup_cost"),
  totalAmount: real("total_amount"),

  scheduledPickupDate: timestamp("scheduled_pickup_date"),
  expectedPickupDate: timestamp("expected_pickup_date"),
  expectedReturnDate: timestamp("expected_return_date"),
  expectedReadyDate: timestamp("expected_ready_date"),

  // Proof of Work & Intake Data
  intakeLocation: jsonb("intake_location"), // {lat: number, lng: number}
  physicalCondition: text("physical_condition"), // Notes on scratches/dents
  customerSignatureUrl: text("customer_signature_url"),

  // Warranty & Purchase Tracking
  proofOfPurchase: text("proof_of_purchase"), // URL to receipt/invoice image
  warrantyStatus: text("warranty_status"), // 'in_warranty' | 'out_of_warranty' | 'unknown'

  // Verification flags
  agreedToPickup: boolean("agreed_to_pickup").default(false),
  pickupAgreedAt: timestamp("pickup_agreed_at"),
  adminInteracted: boolean("admin_interacted").default(false),
  adminInteractedAt: timestamp("admin_interacted_at"),
  adminInteractedBy: text("admin_interacted_by"),
  storeId: text("store_id"), // Franchise-Ready column

  // B2B Linkage
  corporateClientId: text("corporate_client_id").references(() => corporateClients.id),
  corporateChallanId: text("corporate_challan_id").references(() => challans.id),
}, (table) => {
  return {
    customerIdIdx: index("idx_service_requests_customer_id").on(table.customerId),
    statusIdx: index("idx_service_requests_status").on(table.status),
    stageIdx: index("idx_service_requests_stage").on(table.stage),
    ticketNumberIdx: index("idx_service_requests_ticket_number").on(table.ticketNumber),
    createdAtIdx: index("idx_service_requests_created_at").on(table.createdAt),
    adminInteractedIdx: index("idx_service_requests_admin_interacted").on(table.adminInteracted),
  };
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({
  id: true,
  ticketNumber: true,
  customerId: true,
  createdAt: true,
  expiresAt: true,
  convertedJobId: true,
  trackingStatus: true,
  stage: true,
  quoteAmount: true,
  quoteNotes: true,
  quotedAt: true,
  quoteExpiresAt: true,
  acceptedAt: true,
  pickupTier: true,
  pickupCost: true,
  totalAmount: true,
  expectedPickupDate: true,
  expectedReturnDate: true,
  expectedReadyDate: true,
  adminInteracted: true,
  adminInteractedAt: true,
  adminInteractedBy: true,
}).extend({
  scheduledPickupDate: z.union([z.date(), z.string(), z.null()]).optional().transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  estimatedDelivery: z.union([z.date(), z.string(), z.null()]).optional().transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
});
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;

export const insertQuoteRequestSchema = z.object({
  serviceId: z.string().min(1, "Service selection is required"),
  brand: z.string().min(1, "Brand is required"),
  screenSize: z.string().optional(),
  modelNumber: z.string().optional(),
  primaryIssue: z.string().min(1, "Issue description is required"),
  symptoms: z.string().optional(),
  description: z.string().optional(),
  customerName: z.string().min(2, "Name is required"),
  phone: z.string().min(10, "Phone number is required"),
  servicePreference: z.enum(["home_pickup", "service_center", "both"]).optional(),
  address: z.string().optional(),
  requestIntent: z.enum(["quote", "repair"]).optional(),
  serviceMode: z.enum(["pickup", "service_center"]).optional(),
});
export type InsertQuoteRequest = z.infer<typeof insertQuoteRequestSchema>;

// Service Request Events Table
export const serviceRequestEvents = pgTable("service_request_events", {
  id: text("id").primaryKey(),
  serviceRequestId: text("service_request_id").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  actor: text("actor"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

export const insertServiceRequestEventSchema = createInsertSchema(serviceRequestEvents).omit({
  id: true,
  occurredAt: true,
});
export type InsertServiceRequestEvent = z.infer<typeof insertServiceRequestEventSchema>;
export type ServiceRequestEvent = typeof serviceRequestEvents.$inferSelect;

// Pickup Schedules Table
export const pickupSchedules = pgTable("pickup_schedules", {
  id: text("id").primaryKey(),
  serviceRequestId: text("service_request_id").notNull(),
  tier: text("tier").notNull().default("Regular"),
  tierCost: real("tier_cost").notNull().default(0),
  status: text("status").notNull().default("Pending"),
  scheduledDate: timestamp("scheduled_date"),
  pickupAddress: text("pickup_address"),
  assignedStaff: text("assigned_staff"),
  pickupNotes: text("pickup_notes"),
  pickupProofUrl: text("pickup_proof_url"), // Photo of device at pickup
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPickupScheduleSchema = createInsertSchema(pickupSchedules).omit({
  id: true,
  createdAt: true,
  pickedUpAt: true,
  deliveredAt: true,
});
export type InsertPickupSchedule = z.infer<typeof insertPickupScheduleSchema>;
export type PickupSchedule = typeof pickupSchedules.$inferSelect;

// Attendance Records Table
export const attendanceRecords = pgTable("attendance_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  userRole: text("user_role").notNull(),
  workLocationId: text("work_location_id"),
  checkInTime: timestamp("check_in_time").notNull().defaultNow(),
  checkOutTime: timestamp("check_out_time"),
  checkInLat: doublePrecision("check_in_lat"),
  checkInLng: doublePrecision("check_in_lng"),
  checkOutLat: doublePrecision("check_out_lat"),
  checkOutLng: doublePrecision("check_out_lng"),
  checkInAccuracy: real("check_in_accuracy"),
  checkOutAccuracy: real("check_out_accuracy"),
  checkInDistanceMeters: real("check_in_distance_meters"),
  checkOutDistanceMeters: real("check_out_distance_meters"),
  checkInGeofenceStatus: text("check_in_geofence_status"),
  checkOutGeofenceStatus: text("check_out_geofence_status"),
  checkInReason: text("check_in_reason"),
  checkOutReason: text("check_out_reason"),
  devicePlatform: text("device_platform"),
  deviceId: text("device_id"),
  date: text("date").notNull(),
  notes: text("notes"),
}, (table) => {
  return {
    userDateIdx: index("idx_attendance_user_date").on(table.userId, table.date),
    workLocationIdx: index("idx_attendance_work_location").on(table.workLocationId),
  };
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
  checkInTime: true,
  checkOutTime: true,
});
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;

// Product Variants Table
export const productVariants = pgTable("product_variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  variantName: text("variant_name").notNull(),
  price: real("price").notNull(),
  stock: integer("stock").notNull().default(0),
  sku: text("sku"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductVariantSchema = createInsertSchema(productVariants).omit({
  id: true,
  createdAt: true,
});
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariants.$inferSelect;

// Orders Table
export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").unique(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerAddress: text("customer_address").notNull(),
  status: text("status").notNull().default("Pending"),
  paymentMethod: text("payment_method").notNull().default("COD"),
  subtotal: real("subtotal").notNull(),
  total: real("total").notNull(),
  declineReason: text("decline_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Order Items Table
export const orderItems = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id").notNull(),
  productName: text("product_name").notNull(),
  variantId: text("variant_id"),
  variantName: text("variant_name"),
  quantity: integer("quantity").notNull().default(1),
  price: real("price").notNull(),
  total: real("total").notNull(),
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  orderId: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItems.$inferSelect;

// Spare Part Orders Table
export const sparePartOrders = pgTable("spare_part_orders", {
  id: text("id").primaryKey(),

  // Link to main orders table
  orderId: text("order_id").notNull().references(() => orders.id),

  // Device Info (same as service_requests)
  brand: text("brand").notNull(),
  screenSize: text("screen_size"),
  modelNumber: text("model_number"),
  primaryIssue: text("primary_issue"),
  symptoms: text("symptoms"), // JSON array
  description: text("description"),
  images: text("images"), // JSON array of image URLs

  // Fulfillment
  fulfillmentType: text("fulfillment_type").notNull(), // 'pickup' | 'service_center'
  pickupTier: text("pickup_tier"), // 'Regular' | 'Priority' | 'Emergency'
  pickupAddress: text("pickup_address"),
  scheduledDate: timestamp("scheduled_date"),

  // Verification & Quote
  verificationStatus: text("verification_status").default("pending"),
  // 'pending' | 'verified' | 'incompatible' | 'quoted'
  isCompatible: boolean("is_compatible"),
  quotedServiceCharge: real("quoted_service_charge"),
  quotedAt: timestamp("quoted_at"),
  quoteAccepted: boolean("quote_accepted"),
  quoteAcceptedAt: timestamp("quote_accepted_at"),

  // Token System
  tokenNumber: text("token_number").unique(),
  tokenExpiresAt: timestamp("token_expires_at"),
  tokenStatus: text("token_status").default("pending"),
  // 'pending' | 'active' | 'used' | 'expired'
  tokenRedeemedAt: timestamp("token_redeemed_at"),

  // Service Assignment
  technicianId: text("technician_id"),
  installationNotes: text("installation_notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSparePartOrderSchema = createInsertSchema(sparePartOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSparePartOrder = z.infer<typeof insertSparePartOrderSchema>;
export type SparePartOrder = typeof sparePartOrders.$inferSelect;

// Policies Table
export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isPublished: boolean("is_published").notNull().default(true),
  isPublishedApp: boolean("is_published_app").notNull().default(true),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
});

export const insertPolicySchema = createInsertSchema(policies).omit({
  id: true,
  lastUpdated: true,
});
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policies.$inferSelect;

// Customer Reviews Table
export const customerReviews = pgTable("customer_reviews", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  rating: integer("rating").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerReviewSchema = createInsertSchema(customerReviews).omit({
  id: true,
  isApproved: true,
  createdAt: true,
});
export type InsertCustomerReview = z.infer<typeof insertCustomerReviewSchema>;
export type CustomerReview = typeof customerReviews.$inferSelect;

// Inquiries Table
export const inquiries = pgTable("inquiries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("Pending"),
  reply: text("reply"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInquirySchema = createInsertSchema(inquiries).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;

// Customer Addresses Table
export const customerAddresses = pgTable("customer_addresses", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  label: text("label").notNull(), // e.g., "Home", "Office"
  address: text("address").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerAddressSchema = createInsertSchema(customerAddresses).omit({
  id: true,
  createdAt: true,
});
export type InsertCustomerAddress = z.infer<typeof insertCustomerAddressSchema>;
export type CustomerAddress = typeof customerAddresses.$inferSelect;

// Notifications Table
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"), // info, success, warning, repair, shop
  link: text("link"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  corporateClientId: text("corporate_client_id").references(() => corporateClients.id),
  jobId: text("job_id").references(() => jobTickets.id),
  contextType: text("context_type").default("corporate"),
}, (table) => {
  return {
    corporateClientIdx: index("idx_notifications_corporate_client").on(table.corporateClientId),
    jobIdx: index("idx_notifications_job").on(table.jobId),
    contextTypeIdx: index("idx_notifications_context_type").on(table.contextType),
  };
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  read: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Device Tokens Table (for Push Notifications)
export const deviceTokens = pgTable("device_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull().default("android"), // android, ios, web
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
});

export const insertDeviceTokenSchema = createInsertSchema(deviceTokens).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});
export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;
export type DeviceToken = typeof deviceTokens.$inferSelect;

// AI Insights Table
export const aiInsights = pgTable("ai_insights", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'red', 'green', 'blue'
  title: text("title").notNull(),
  content: text("content").notNull(),
  actionableStep: text("actionable_step"),
  category: text("category"),
  severity: text("severity"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  createdAt: true,
});
export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

// Diagnosis Training Data
export const diagnosisTrainingData = pgTable("diagnosis_training_data", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").references(() => jobTickets.id),
  customerChatSummary: text("customer_chat_summary"),
  aiPrediction: text("ai_prediction"),
  actualIssue: text("actual_issue"),
  wasAccurate: boolean("was_accurate"),
  feedbackNotes: text("feedback_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});



export const aiDebugSuggestions = pgTable("ai_debug_suggestions", {
  id: serial("id").primaryKey(),
  error: text("error").notNull(),
  stackTrace: text("stack_trace"),
  suggestion: text("suggestion"),
  status: text("status").default("NEEDS_REVIEW"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const insertDiagnosisTrainingDataSchema = createInsertSchema(diagnosisTrainingData).omit({
  id: true,
  createdAt: true,
});
export type InsertDiagnosisTrainingData = z.infer<typeof insertDiagnosisTrainingDataSchema>;
export type DiagnosisTrainingData = typeof diagnosisTrainingData.$inferSelect;

// AI Query Log (lightweight)
export const aiQueryLog = pgTable("ai_query_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  queryType: text("query_type"),
  wasSuccessful: boolean("was_successful").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiQueryLogSchema = createInsertSchema(aiQueryLog).omit({
  id: true,
  createdAt: true,
});
export type InsertAiQueryLog = z.infer<typeof insertAiQueryLogSchema>;
export type AiQueryLog = typeof aiQueryLog.$inferSelect;

// Audit Logs Table
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),     // e.g., UPDATE, DELETE, CREATE, LOGIN
  entity: text("entity").notNull(),     // e.g., JobTicket, InventoryItem
  entityId: text("entity_id").notNull(),
  details: text("details"),             // Human readable summary
  metadata: jsonb("metadata"),          // { ip, ua, location }
  changes: jsonb("changes"),            // { old: {}, new: {} }
  severity: text("severity").default("info"), // info, warning, critical
  storeId: text("store_id"),            // Franchise-Ready column
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Rollback Requests Table (For Strict Linear Progression)
export const rollbackRequests = pgTable("rollback_requests", {
  id: serial("id").primaryKey(),
  jobTicketId: text("job_ticket_id").references(() => jobTickets.id),
  requestedBy: text("requested_by").notNull(),
  reason: text("reason").notNull(),
  targetStatus: text("target_status").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  resolvedBy: text("resolved_by"),
  storeId: text("store_id"), // Franchise-Ready column
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRollbackRequestSchema = createInsertSchema(rollbackRequests).omit({
  id: true,
  createdAt: true,
});
export type InsertRollbackRequest = z.infer<typeof insertRollbackRequestSchema>;
export type RollbackRequest = typeof rollbackRequests.$inferSelect;

// OTP Codes Table (Phone Verification)
export const otpCodes = pgTable("otp_codes", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  purpose: text("purpose").notNull().default("request_verification"), // 'request_verification' | 'login' | 'password_reset'
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => {
  return {
    phoneIdx: index("idx_otp_codes_phone").on(table.phone),
    expiresAtIdx: index("idx_otp_codes_expires_at").on(table.expiresAt),
  };
});

export const insertOtpCodeSchema = createInsertSchema(otpCodes).omit({
  id: true,
  createdAt: true,
  verifiedAt: true,
});
export type InsertOtpCode = z.infer<typeof insertOtpCodeSchema>;
export type OtpCode = typeof otpCodes.$inferSelect;

// Fraud Blocklist Table (Anti-Fraud)
export const fraudBlocklist = pgTable("fraud_blocklist", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'phone' | 'ip' | 'fingerprint'
  value: text("value").notNull(),
  reason: text("reason"),
  blockedBy: text("blocked_by"), // admin user ID
  blockedAt: timestamp("blocked_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // null = permanent
}, (table) => {
  return {
    typeValueIdx: index("idx_fraud_blocklist_type_value").on(table.type, table.value),
  };
});

export const insertFraudBlocklistSchema = createInsertSchema(fraudBlocklist).omit({
  id: true,
  blockedAt: true,
});
export type InsertFraudBlocklist = z.infer<typeof insertFraudBlocklistSchema>;
export type FraudBlocklist = typeof fraudBlocklist.$inferSelect;

// Warranty Claims Table
export const warrantyClaims = pgTable("warranty_claims", {
  id: text("id").primaryKey(),

  // Job Linkage
  originalJobId: text("original_job_id").notNull(),
  newJobId: text("new_job_id"),

  // Customer Info snapshot at claim time
  customer: text("customer").notNull(),
  customerPhone: text("customer_phone"),
  device: text("device"),

  // Claim Details
  claimType: text("claim_type").notNull(), // 'service' | 'parts'
  claimReason: text("claim_reason").notNull(),
  warrantyValid: boolean("warranty_valid").notNull(), // Auto-computed on creation
  warrantyExpiryDate: timestamp("warranty_expiry_date"), // Snapshot of the relevant expiry date

  // 2-Step Audit Trail
  claimedBy: text("claimed_by").notNull(), // Staff user ID
  claimedByName: text("claimed_by_name").notNull(), // Snapshot of staff name
  claimedByRole: text("claimed_by_role").notNull(), // Snapshot of role at claim time
  claimedAt: timestamp("claimed_at").notNull().defaultNow(),

  approvedBy: text("approved_by"),
  approvedByName: text("approved_by_name"),
  approvedByRole: text("approved_by_role"),
  approvedAt: timestamp("approved_at"),

  // Status & Resolution
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'in_repair' | 'completed'
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  originalJobIdx: index("idx_warranty_claims_original_job").on(table.originalJobId),
  statusIdx: index("idx_warranty_claims_status").on(table.status),
  customerPhoneIdx: index("idx_warranty_claims_phone").on(table.customerPhone),
}));

export const insertWarrantyClaimSchema = createInsertSchema(warrantyClaims).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWarrantyClaim = z.infer<typeof insertWarrantyClaimSchema>;
export type WarrantyClaim = typeof warrantyClaims.$inferSelect;

// Refunds Table
export const refunds = pgTable("refunds", {
  id: text("id").primaryKey(),

  // Reference
  type: text("type").notNull(), // 'job' | 'pos' | 'warranty'
  referenceId: text("reference_id").notNull(), // job_id or pos_transaction_id
  referenceInvoice: text("reference_invoice"), // Original invoice number for quick lookup

  // Customer Info
  customer: text("customer").notNull(),
  customerPhone: text("customer_phone"),

  // Financial Details
  originalAmount: real("original_amount").notNull(),
  refundAmount: real("refund_amount").notNull(),
  refundMethod: text("refund_method"), // 'cash' | 'bank' | 'bkash' | 'nagad' | 'adjustment'
  reason: text("reason").notNull(),

  // 3-Step Audit Trail
  requestedBy: text("requested_by").notNull(), // Staff user ID
  requestedByName: text("requested_by_name").notNull(),
  requestedByRole: text("requested_by_role").notNull(),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),

  approvedBy: text("approved_by"),
  approvedByName: text("approved_by_name"),
  approvedByRole: text("approved_by_role"),
  approvedAt: timestamp("approved_at"),

  processedBy: text("processed_by"),
  processedByName: text("processed_by_name"),
  processedByRole: text("processed_by_role"),
  processedAt: timestamp("processed_at"),

  // Status
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected' | 'processed' | 'cancelled'
  rejectionReason: text("rejection_reason"),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),

  // Linked records created during processing
  pettyCashRecordId: text("petty_cash_record_id"), // Auto-created negative entry
  fraudAlertId: text("fraud_alert_id"), // If triggered

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  referenceIdx: index("idx_refunds_reference").on(table.referenceId),
  statusIdx: index("idx_refunds_status").on(table.status),
  customerPhoneIdx: index("idx_refunds_phone").on(table.customerPhone),
  createdAtIdx: index("idx_refunds_created_at").on(table.createdAt),
}));

export const insertRefundSchema = createInsertSchema(refunds).omit({
  id: true,
  createdAt: true,
});
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refunds.$inferSelect;
// Corporate Messaging System
export const corporateMessageThreads = pgTable("corporate_message_threads", {
  id: text("id").primaryKey(),
  corporateClientId: text("corporate_client_id").references(() => corporateClients.id).notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"), // open, closed, archived
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  clientIdx: index("idx_corporate_threads_client").on(table.corporateClientId),
  statusIdx: index("idx_corporate_threads_status").on(table.status),
}));

export const corporateMessages = pgTable("corporate_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").references(() => corporateMessageThreads.id).notNull(),
  senderId: text("sender_id").notNull(), // User ID
  senderType: text("sender_type").notNull(), // 'corporate' | 'admin'
  messageType: text("message_type").notNull().default("text"), // 'text' | 'image' | 'video' | 'file'
  content: text("content"),
  attachments: jsonb("attachments"), // Array of { url, fileId, name, thumbnailUrl }
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  threadIdx: index("idx_corporate_messages_thread").on(table.threadId),
  isReadIdx: index("idx_corporate_messages_read").on(table.isRead),
  createdAtIdx: index("idx_corporate_messages_created").on(table.createdAt),
}));

export const insertCorporateMessageThreadSchema = createInsertSchema(corporateMessageThreads).omit({
  id: true,
  createdAt: true,
  lastMessageAt: true,
});

export const insertCorporateMessageSchema = createInsertSchema(corporateMessages).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export type InsertCorporateMessageThread = z.infer<typeof insertCorporateMessageThreadSchema>;
export type InsertCorporateMessage = z.infer<typeof insertCorporateMessageSchema>;
export type CorporateMessage = typeof corporateMessages.$inferSelect;
export type CorporateMessageThread = typeof corporateMessageThreads.$inferSelect;

// ----------------------------------------------------------------------------
// Backup System Tables
// ----------------------------------------------------------------------------

export const backupMetadata = pgTable("backup_metadata", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  googleDriveFileId: text("google_drive_file_id").notNull(),

  // Backup Information
  backupType: text("backup_type").notNull(), // 'manual' | 'scheduled'
  scheduleId: text("schedule_id"),
  description: text("description"),

  // Encryption Metadata
  encryptionVersion: text("encryption_version").notNull(),
  salt: text("salt").notNull(),
  iv: text("iv").notNull(),
  authTag: text("auth_tag").notNull(),
  iterations: integer("iterations").notNull(),

  // Data Metadata
  totalRecords: integer("total_records").notNull(),
  tablesIncluded: jsonb("tables_included").notNull(),
  checksum: text("checksum").notNull(),

  // System Information
  systemVersion: text("system_version").notNull(),
  databaseVersion: text("database_version").notNull(),

  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  expiresAt: timestamp("expires_at"),

  // Status
  status: text("status").notNull().default("active"), // 'active' | 'expired' | 'deleted'
  verified: boolean("verified").default(false),
  lastVerifiedAt: timestamp("last_verified_at"),
});

export const backupSchedules = pgTable("backup_schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'daily' | 'weekly' | 'monthly' | 'custom'
  cronExpression: text("cron_expression").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  retentionDays: integer("retention_days").notNull(),
  notifyOnSuccess: boolean("notify_on_success").default(true),
  notifyOnFailure: boolean("notify_on_failure").default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const backupAuditLogs = pgTable("backup_audit_logs", {
  id: text("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  backupId: text("backup_id"),
  backupName: text("backup_name"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
});

// Zod Schemas/Types for Backup Tables
export const insertBackupMetadataSchema = createInsertSchema(backupMetadata);
export type InsertBackupMetadata = z.infer<typeof insertBackupMetadataSchema>;
export type BackupMetadata = typeof backupMetadata.$inferSelect;

export const insertBackupScheduleSchema = createInsertSchema(backupSchedules);
export type InsertBackupSchedule = z.infer<typeof insertBackupScheduleSchema>;
export type BackupSchedule = typeof backupSchedules.$inferSelect;

export const insertBackupAuditLogSchema = createInsertSchema(backupAuditLogs);
export type InsertBackupAuditLog = z.infer<typeof insertBackupAuditLogSchema>;
export type BackupAuditLog = typeof backupAuditLogs.$inferSelect;

// ----------------------------------------------------------------------------
// HR & Payroll System Tables
// ----------------------------------------------------------------------------

// Staff Salary Configuration (per-employee, created from Users edit page by Super Admin)
export const staffSalaryConfig = pgTable("staff_salary_config", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),

  // Salary Components (monthly BDT)
  basicSalary: real("basic_salary").notNull(),
  houseRentAllowance: real("house_rent_allowance"),        // Default: 50% of basic
  medicalAllowance: real("medical_allowance"),              // Default: 10% of basic
  conveyanceAllowance: real("conveyance_allowance"),        // Default: 10% of basic
  otherAllowances: real("other_allowances").default(0),

  // Deductions
  incomeTaxPercent: real("income_tax_percent").default(0),

  // Leave Balances (per calendar year, reset annually)
  casualLeaveBalance: integer("casual_leave_balance").default(10),
  sickLeaveBalance: integer("sick_leave_balance").default(14),
  earnedLeaveBalance: real("earned_leave_balance").default(0),  // Accumulates (1 day / 18 working days)

  // Increment tracking
  lastIncrementDate: timestamp("last_increment_date"),
  incrementBlockedReason: text("increment_blocked_reason"),  // Null if not blocked

  // Effective date (for salary revision tracking)
  effectiveFrom: timestamp("effective_from").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userIdx: index("idx_salary_config_user").on(table.userId),
}));

export const insertStaffSalaryConfigSchema = createInsertSchema(staffSalaryConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStaffSalaryConfig = z.infer<typeof insertStaffSalaryConfigSchema>;
export type StaffSalaryConfig = typeof staffSalaryConfig.$inferSelect;

// Leave Applications (submitted by staff, approved/rejected by Super Admin)
export const leaveApplications = pgTable("leave_applications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  userRole: text("user_role").notNull(),

  // Leave Details
  leaveType: text("leave_type").notNull(),   // 'casual' | 'sick' | 'earned'
  startDate: text("start_date").notNull(),   // 'YYYY-MM-DD'
  endDate: text("end_date").notNull(),       // 'YYYY-MM-DD'
  totalDays: integer("total_days").notNull(),
  reason: text("reason").notNull(),
  medicalCertificateUrl: text("medical_certificate_url"),  // Required for sick leave

  // Approval (Super Admin only)
  status: text("status").notNull().default("pending"),  // 'pending' | 'approved' | 'rejected'
  reviewedBy: text("reviewed_by"),            // Super Admin user ID
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("idx_leave_app_user").on(table.userId),
  statusIdx: index("idx_leave_app_status").on(table.status),
  dateIdx: index("idx_leave_app_dates").on(table.startDate, table.endDate),
}));

export const insertLeaveApplicationSchema = createInsertSchema(leaveApplications).omit({
  id: true,
  createdAt: true,
  reviewedBy: true,
  reviewedAt: true,
  rejectionReason: true,
  status: true,
});
export type InsertLeaveApplication = z.infer<typeof insertLeaveApplicationSchema>;
export type LeaveApplication = typeof leaveApplications.$inferSelect;

// Payroll Records (monthly salary sheet, auto-calculated from attendance)
export const payrollRecords = pgTable("payroll_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  month: text("month").notNull(),             // 'YYYY-MM'
  assignmentId: text("assignment_id"),
  runType: text("run_type").notNull().default("regular"),       // 'regular' | 'final_settlement' | 'arrear'
  calcSnapshotJson: text("calc_snapshot_json"),
  calcHash: text("calc_hash"),
  isLocked: boolean("is_locked").notNull().default(false),
  userRole: text("user_role"),

  // Attendance Summary (auto-counted from attendance_records)
  totalWorkingDays: integer("total_working_days").notNull(),
  daysPresent: integer("days_present").notNull(),
  daysAbsent: integer("days_absent").notNull(),
  daysLate: integer("days_late").notNull(),
  consecutiveLatePenalties: integer("consecutive_late_penalties").default(0),
  approvedLeaves: integer("approved_leaves").notNull(),
  unapprovedAbsences: integer("unapproved_absences").notNull(),
  totalOvertimeHours: real("total_overtime_hours").default(0),

  // Earnings
  basicSalary: real("basic_salary").notNull(),
  houseRentAllowance: real("house_rent_allowance").notNull(),
  medicalAllowance: real("medical_allowance").notNull(),
  conveyanceAllowance: real("conveyance_allowance").notNull(),
  otherAllowances: real("other_allowances").default(0),
  overtimePay: real("overtime_pay").default(0),
  grossSalary: real("gross_salary").notNull(),

  // Deductions (require Super Admin approval before applying)
  absentDeduction: real("absent_deduction").notNull(),
  lateDeduction: real("late_deduction").default(0),
  incomeTax: real("income_tax").default(0),
  otherDeductions: real("other_deductions").default(0),
  deductionApproved: boolean("deduction_approved").default(false),
  deductionApprovedBy: text("deduction_approved_by"),
  deductionApprovedAt: timestamp("deduction_approved_at"),
  totalDeductions: real("total_deductions").notNull(),

  // Net Pay
  netSalary: real("net_salary").notNull(),

  // Status: draft → pending_approval → finalized → paid
  status: text("status").notNull().default("draft"),
  generatedBy: text("generated_by"),
  clearedBy: text("cleared_by"),              // Manager or Super Admin who marked as paid
  paidAt: timestamp("paid_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userMonthIdx: index("idx_payroll_user_month").on(table.userId, table.month),
  statusIdx: index("idx_payroll_status").on(table.status),
  monthIdx: index("idx_payroll_month").on(table.month),
}));

export const insertPayrollRecordSchema = createInsertSchema(payrollRecords).omit({
  id: true,
  createdAt: true,
  deductionApproved: true,
  deductionApprovedBy: true,
  deductionApprovedAt: true,
  clearedBy: true,
  paidAt: true,
});
export type InsertPayrollRecord = z.infer<typeof insertPayrollRecordSchema>;
export type PayrollRecord = typeof payrollRecords.$inferSelect;

// Bonus Records (biannual Eid festival bonuses)
export const bonusRecords = pgTable("bonus_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),

  // Bonus Period
  bonusType: text("bonus_type").notNull(),    // 'eid_ul_fitr' | 'eid_ul_adha'
  year: integer("year").notNull(),

  // Calculation
  fullBonusAmount: real("full_bonus_amount").notNull(),   // = 1 month basic salary
  unapprovedAbsences: integer("unapproved_absences").notNull(),  // In the 6-month window
  deductionPercent: real("deduction_percent").notNull(),
  deductionAmount: real("deduction_amount").notNull(),
  finalBonusAmount: real("final_bonus_amount").notNull(),

  // Approval & Payment
  status: text("status").notNull().default("calculated"),  // 'calculated' | 'approved' | 'paid'
  approvedBy: text("approved_by"),
  paidAt: timestamp("paid_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userYearIdx: index("idx_bonus_user_year").on(table.userId, table.year),
  typeIdx: index("idx_bonus_type").on(table.bonusType),
}));

export const insertBonusRecordSchema = createInsertSchema(bonusRecords).omit({
  id: true,
  createdAt: true,
  approvedBy: true,
  paidAt: true,
});
export type InsertBonusRecord = z.infer<typeof insertBonusRecordSchema>;
export type BonusRecord = typeof bonusRecords.$inferSelect;

// Holiday Calendar (flexible government holiday management)
export const holidayCalendar = pgTable("holiday_calendar", {
  id: text("id").primaryKey(),
  year: integer("year").notNull(),
  date: text("date").notNull(),               // 'YYYY-MM-DD'
  name: text("name").notNull(),               // e.g., 'Eid ul-Fitr Day 1'
  type: text("type").notNull(),               // 'government' | 'religious' | 'custom'

  // Flexible status for real-world situations
  status: text("status").notNull().default("active"),
  // 'active'    → Normal holiday, staff is off
  // 'dismissed' → Too much work, holiday cancelled — staff must work
  // 'forced'    → Emergency/sudden holiday (hartal, flood, etc.)

  dismissedReason: text("dismissed_reason"),   // Why holiday was cancelled
  forcedReason: text("forced_reason"),         // Why forced holiday was added
  modifiedBy: text("modified_by"),             // Who changed the status
  modifiedAt: timestamp("modified_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  yearDateIdx: index("idx_holiday_year_date").on(table.year, table.date),
  yearIdx: index("idx_holiday_year").on(table.year),
  statusIdx: index("idx_holiday_status").on(table.status),
}));

export const insertHolidayCalendarSchema = createInsertSchema(holidayCalendar).omit({
  id: true,
  createdAt: true,
  modifiedBy: true,
  modifiedAt: true,
  dismissedReason: true,
  forcedReason: true,
});
export type InsertHolidayCalendar = z.infer<typeof insertHolidayCalendarSchema>;
export type HolidayCalendar = typeof holidayCalendar.$inferSelect;

// --- New HR Re-Architecture Tables ---

export const employmentProfiles = pgTable("employment_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(), // references users.id
  employeeCode: text("employee_code").unique(),
  employmentType: text("employment_type").notNull().default("full_time"), // 'full_time' | 'part_time' | 'contract'
  payrollEligible: boolean("payroll_eligible").notNull().default(true),
  employmentStatus: text("employment_status").notNull().default("active"), // 'pending_compensation' | 'active' | 'on_notice' | 'resigned' | 'terminated'
  joinDate: date("join_date"),
  noticePeriodDays: integer("notice_period_days").default(30),
  resignationDate: date("resignation_date"),
  lastWorkingDate: date("last_working_date"),
  separationReason: text("separation_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userIdx: index("idx_emp_profile_user").on(table.userId),
  statusIdx: index("idx_emp_profile_status").on(table.employmentStatus),
}));
export const insertEmploymentProfileSchema = createInsertSchema(employmentProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmploymentProfile = z.infer<typeof insertEmploymentProfileSchema>;
export type EmploymentProfile = typeof employmentProfiles.$inferSelect;

export const salaryComponents = pgTable("salary_components", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // 'BASIC', 'HRA', etc.
  name: text("name").notNull(),
  componentType: text("component_type").notNull().default("earning"), // 'earning' | 'deduction'
  calcMode: text("calc_mode").notNull().default("fixed"), // 'fixed' | 'percent_of_basic'
  defaultPercent: real("default_percent"),
  isProratable: boolean("is_proratable").notNull().default(true),
  isTaxable: boolean("is_taxable").notNull().default(true),
  appliesTo: text("applies_to").notNull().default("both"), // 'regular' | 'final_settlement' | 'both'
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const insertSalaryComponentSchema = createInsertSchema(salaryComponents).omit({ id: true, createdAt: true });
export type InsertSalaryComponent = z.infer<typeof insertSalaryComponentSchema>;
export type SalaryComponent = typeof salaryComponents.$inferSelect;

export const salaryStructures = pgTable("salary_structures", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});
export const insertSalaryStructureSchema = createInsertSchema(salaryStructures).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalaryStructure = z.infer<typeof insertSalaryStructureSchema>;
export type SalaryStructure = typeof salaryStructures.$inferSelect;

export const salaryStructureLines = pgTable("salary_structure_lines", {
  id: text("id").primaryKey(),
  structureId: text("structure_id").notNull(), // references salary_structures.id
  componentId: text("component_id").notNull(), // references salary_components.id
  sequence: integer("sequence").notNull().default(0),
  isMandatory: boolean("is_mandatory").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  structureIdx: index("idx_struct_lines_structure").on(table.structureId),
}));
export type SalaryStructureLine = typeof salaryStructureLines.$inferSelect;

export const employeeSalaryAssignments = pgTable("employee_salary_assignments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // references users.id
  employmentProfileId: text("employment_profile_id").notNull(), // references employment_profiles.id
  structureId: text("structure_id").notNull(), // references salary_structures.id
  baseAmount: real("base_amount").notNull(),
  hraAmount: real("hra_amount"),
  medicalAmount: real("medical_amount"),
  conveyanceAmount: real("conveyance_amount"),
  otherAmount: real("other_amount").default(0),
  incomeTaxPercent: real("income_tax_percent").default(0),
  currency: text("currency").notNull().default("BDT"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  changeReason: text("change_reason").notNull().default("new_hire"), // 'new_hire' | 'increment' | 'promotion' | 'correction'
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("idx_assign_user").on(table.userId),
  effectiveIdx: index("idx_assign_effective").on(table.userId, table.effectiveFrom, table.effectiveTo),
}));
export const insertSalaryAssignmentSchema = createInsertSchema(employeeSalaryAssignments).omit({ id: true, createdAt: true });
export type InsertSalaryAssignment = z.infer<typeof insertSalaryAssignmentSchema>;
export type EmployeeSalaryAssignment = typeof employeeSalaryAssignments.$inferSelect;

export const incrementSuggestions = pgTable("increment_suggestions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // references users.id
  currentAssignmentId: text("current_assignment_id").notNull(), // references employee_salary_assignments.id
  currentBaseAmount: real("current_base_amount").notNull(),
  suggestedBaseAmount: real("suggested_base_amount").notNull(),
  suggestedIncreasePercent: real("suggested_increase_percent").notNull(),
  suggestionReason: text("suggestion_reason").notNull(), // 'annual_review' | 'performance' | 'market_adjustment' | 'promotion'
  reasoningJson: text("reasoning_json"),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'modified' | 'dismissed'
  adminDecisionAmount: real("admin_decision_amount"),
  adminNotes: text("admin_notes"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at"),
  effectiveFrom: date("effective_from"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("idx_incr_sugg_user").on(table.userId),
  statusIdx: index("idx_incr_sugg_status").on(table.status),
}));
export const insertIncrementSuggestionSchema = createInsertSchema(incrementSuggestions).omit({ id: true, createdAt: true });
export type InsertIncrementSuggestion = z.infer<typeof insertIncrementSuggestionSchema>;
export type IncrementSuggestion = typeof incrementSuggestions.$inferSelect;

export const deductionProposals = pgTable("deduction_proposals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // references users.id
  payrollRecordId: text("payroll_record_id"), // references payroll_records.id
  month: text("month").notNull(), // 'YYYY-MM'
  proposalType: text("proposal_type").notNull(), // 'absent' | 'late_streak' | 'performance' | 'other'
  description: text("description").notNull(),
  calculatedAmount: real("calculated_amount").notNull(),
  supportingDataJson: text("supporting_data_json"),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'modified' | 'dismissed'
  approvedAmount: real("approved_amount"),
  adminNotes: text("admin_notes"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("idx_deduct_prop_user").on(table.userId),
  monthIdx: index("idx_deduct_prop_month").on(table.month),
  statusIdx: index("idx_deduct_prop_status").on(table.status),
}));
export const insertDeductionProposalSchema = createInsertSchema(deductionProposals).omit({ id: true, createdAt: true });
export type InsertDeductionProposal = z.infer<typeof insertDeductionProposalSchema>;
export type DeductionProposal = typeof deductionProposals.$inferSelect;

export const offboardingCases = pgTable("offboarding_cases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // references users.id
  employmentProfileId: text("employment_profile_id").notNull(), // references employment_profiles.id
  offboardingType: text("offboarding_type").notNull(), // 'resignation' | 'termination' | 'retirement'
  status: text("status").notNull().default("draft"), // 'draft' | 'approved' | 'settlement_generated' | 'paid' | 'closed'
  noticeServedDays: integer("notice_served_days").default(0),
  lastWorkingDate: date("last_working_date"),
  settlementDueDate: date("settlement_due_date"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
}, (table) => ({
  userIdx: index("idx_offboard_user").on(table.userId),
}));
export const insertOffboardingCaseSchema = createInsertSchema(offboardingCases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOffboardingCase = z.infer<typeof insertOffboardingCaseSchema>;
export type OffboardingCase = typeof offboardingCases.$inferSelect;

export const finalSettlementRecords = pgTable("final_settlement_records", {
  id: text("id").primaryKey(),
  offboardingCaseId: text("offboarding_case_id").notNull(), // references offboarding_cases.id
  userId: text("user_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  grossTotal: real("gross_total").notNull(),
  deductionTotal: real("deduction_total").notNull(),
  netTotal: real("net_total").notNull(),
  componentBreakdownJson: text("component_breakdown_json"),
  status: text("status").notNull().default("draft"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  caseIdx: index("idx_settlement_case").on(table.offboardingCaseId),
}));
export type FinalSettlementRecord = typeof finalSettlementRecords.$inferSelect;

// ============================================
// Quotations Module
// ============================================

export const quotations = pgTable("quotations", {
  id: text("id").primaryKey(),
  quotationNumber: text("quotation_number").unique().notNull(),
  customerId: text("customer_id").references(() => users.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  customerAddress: text("customer_address"),
  status: text("status").notNull().default("Draft"), // Draft, Sent, Accepted, Rejected, Expired
  subtotal: real("subtotal").notNull().default(0),
  discount: real("discount").notNull().default(0),
  taxRate: real("tax_rate").notNull().default(0),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),
  notes: text("notes"),
  validUntil: timestamp("valid_until"),
  createdBy: text("created_by").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => {
  return {
    customerIdIdx: index("idx_quotations_customer_id").on(table.customerId),
    quotationNumberIdx: index("idx_quotations_number").on(table.quotationNumber),
    createdAtIdx: index("idx_quotations_created_at").on(table.createdAt),
  };
});

export const insertQuotationSchema = createInsertSchema(quotations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type Quotation = typeof quotations.$inferSelect;

export const quotationItems = pgTable("quotation_items", {
  id: text("id").primaryKey(),
  quotationId: text("quotation_id").references(() => quotations.id).notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  total: real("total").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertQuotationItemSchema = createInsertSchema(quotationItems).omit({
  id: true,
});
export type InsertQuotationItem = z.infer<typeof insertQuotationItemSchema>;
export type QuotationItem = typeof quotationItems.$inferSelect;
