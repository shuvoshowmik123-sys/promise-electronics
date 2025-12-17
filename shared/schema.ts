import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (if using connect-sqlite3 or similar, but we might use memorystore for now)
// Keeping it for future proofing or if we switch to sqlite session store
export const sessions = sqliteTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: text("sess", { mode: "json" }).notNull(),
  expire: integer("expire", { mode: "timestamp" }).notNull(),
});

// Enums - SQLite doesn't support native enums, so we define them as const arrays for Zod
export const JOB_STATUSES = ["Pending", "In Progress", "Completed", "Cancelled"] as const;
export const JOB_PRIORITIES = ["Low", "Medium", "High"] as const;
export const CHALLAN_STATUSES = ["Pending", "Delivered", "Received"] as const;
export const CHALLAN_TYPES = ["Corporate", "Customer", "Transfer"] as const;
export const STOCK_STATUSES = ["In Stock", "Low Stock", "Out of Stock"] as const;
export const ITEM_TYPES = ["product", "service"] as const;
export const USER_ROLES = ["Super Admin", "Manager", "Cashier", "Technician", "Customer"] as const;
export const DUE_STATUSES = ["Pending", "Overdue", "Paid"] as const;
export const PAYMENT_METHODS = ["Cash", "Bank", "bKash", "Nagad", "Due"] as const;
export const PAYMENT_STATUSES = ["Paid", "Due"] as const;

// Users Table
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // App should generate UUID
  username: text("username").unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone").unique(),
  password: text("password").notNull(),
  role: text("role", { enum: USER_ROLES }).notNull().default("Customer"),
  status: text("status").notNull().default("Active"),
  permissions: text("permissions").notNull().default("{}"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  lastLogin: integer("last_login", { mode: "timestamp" }),
  // Customer specific fields
  googleSub: text("google_sub").unique(),
  address: text("address"),
  profileImageUrl: text("profile_image_url"),
  avatar: text("avatar"),
  isVerified: integer("is_verified", { mode: "boolean" }).default(0),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  joinedAt: true,
  lastLogin: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
  users?: boolean;
  settings?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  canViewFullJobDetails?: boolean;
  canPrintJobTickets?: boolean;
};

// Job Tickets Table
export const jobTickets = sqliteTable("job_tickets", {
  id: text("id").primaryKey(),
  corporateJobNumber: text("corporate_job_number"),
  customer: text("customer").notNull(),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  device: text("device").notNull(),
  tvSerialNumber: text("tv_serial_number"),
  issue: text("issue").notNull(),
  status: text("status", { enum: JOB_STATUSES }).notNull().default("Pending"),
  priority: text("priority", { enum: JOB_PRIORITIES }).notNull().default("Medium"),
  technician: text("technician").default("Unassigned"),
  screenSize: text("screen_size"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  deadline: integer("deadline", { mode: "timestamp" }),
  notes: text("notes"),
  estimatedCost: real("estimated_cost"), // Using real for money
  serviceWarrantyDays: integer("service_warranty_days").default(0),
  serviceExpiryDate: integer("service_expiry_date", { mode: "timestamp" }),
  partsWarrantyDays: integer("parts_warranty_days").default(0),
  partsExpiryDate: integer("parts_expiry_date", { mode: "timestamp" }),
  warrantyTermsAccepted: integer("warranty_terms_accepted", { mode: "boolean" }).default(0),
  parentJobId: text("parent_job_id"),
});

export const insertJobTicketSchema = createInsertSchema(jobTickets).omit({
  createdAt: true,
  completedAt: true,
});
export type InsertJobTicket = z.infer<typeof insertJobTicketSchema>;
export type JobTicket = typeof jobTickets.$inferSelect;

// Inventory Items Table
export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  itemType: text("item_type", { enum: ITEM_TYPES }).notNull().default("product"),
  stock: integer("stock").notNull().default(0),
  price: real("price").notNull(),
  minPrice: real("min_price"),
  maxPrice: real("max_price"),
  status: text("status", { enum: STOCK_STATUSES }).notNull().default("In Stock"),
  lowStockThreshold: integer("low_stock_threshold").default(5),
  images: text("images"),
  showOnWebsite: integer("show_on_website", { mode: "boolean" }).default(0),
  icon: text("icon"),
  estimatedDays: text("estimated_days"),
  displayOrder: integer("display_order").default(0),
  features: text("features"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

// Service Categories Table
export const serviceCategories = sqliteTable("service_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayOrder: integer("display_order").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({
  id: true,
  createdAt: true,
});
export type InsertServiceCategory = z.infer<typeof insertServiceCategorySchema>;
export type ServiceCategory = typeof serviceCategories.$inferSelect;

// Challans Table
export const challans = sqliteTable("challans", {
  id: text("id").primaryKey(),
  receiver: text("receiver").notNull(),
  type: text("type", { enum: CHALLAN_TYPES }).notNull(),
  status: text("status", { enum: CHALLAN_STATUSES }).notNull().default("Pending"),
  items: integer("items").notNull().default(1),
  lineItems: text("line_items"), // JSON string
  receiverAddress: text("receiver_address"),
  receiverPhone: text("receiver_phone"),
  vehicleNo: text("vehicle_no"),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  gatePassNo: text("gate_pass_no"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  notes: text("notes"),
});

export const insertChallanSchema = createInsertSchema(challans).omit({
  createdAt: true,
  deliveredAt: true,
});
export type InsertChallan = z.infer<typeof insertChallanSchema>;
export type Challan = typeof challans.$inferSelect;

// Petty Cash Records Table
export const pettyCashRecords = sqliteTable("petty_cash_records", {
  id: text("id").primaryKey(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  amount: real("amount").notNull(),
  type: text("type").notNull(),
  dueRecordId: text("due_record_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertPettyCashRecordSchema = createInsertSchema(pettyCashRecords).omit({
  id: true,
  createdAt: true,
});
export type InsertPettyCashRecord = z.infer<typeof insertPettyCashRecordSchema>;
export type PettyCashRecord = typeof pettyCashRecords.$inferSelect;

// Due Records Table
export const dueRecords = sqliteTable("due_records", {
  id: text("id").primaryKey(),
  customer: text("customer").notNull(),
  amount: real("amount").notNull(),
  status: text("status", { enum: DUE_STATUSES }).notNull().default("Pending"),
  invoice: text("invoice").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  paidAmount: real("paid_amount").default(0),
});

export const insertDueRecordSchema = createInsertSchema(dueRecords).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});
export type InsertDueRecord = z.infer<typeof insertDueRecordSchema>;
export type DueRecord = typeof dueRecords.$inferSelect;

// Products Table
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  price: text("price").notNull(),
  category: text("category").notNull(),
  image: text("image").notNull(),
  rating: real("rating").default(0.0),
  reviews: integer("reviews").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// Settings Table
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// POS Transactions Table
export const posTransactions = sqliteTable("pos_transactions", {
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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertPosTransactionSchema = createInsertSchema(posTransactions).omit({
  invoiceNumber: true,
  createdAt: true,
});
export type InsertPosTransaction = z.infer<typeof insertPosTransactionSchema>;
export type PosTransaction = typeof posTransactions.$inferSelect;

// Enums for Service Requests
export const SERVICE_REQUEST_STATUSES = ["Pending", "Reviewed", "Converted", "Closed"] as const;
export const QUOTE_STATUSES = ["Pending", "Quoted", "Accepted", "Declined", "Converted", "Expired"] as const;
export const REQUEST_INTENTS = ["quote", "repair"] as const;
export const SERVICE_MODES = ["pickup", "service_center"] as const;
export const REQUEST_STAGES = [
  "intake", "assessment", "awaiting_customer", "authorized",
  "pickup_scheduled", "picked_up", "awaiting_dropoff", "device_received",
  "in_repair", "ready", "out_for_delivery", "completed", "closed"
] as const;
export const PICKUP_TIERS = ["Regular", "Priority", "Emergency"] as const;
export const PICKUP_STATUSES = ["Pending", "Scheduled", "PickedUp", "Delivered"] as const;
export const TRACKING_STATUSES = [
  "Request Received", "Arriving to Receive", "Awaiting Drop-off", "Queued",
  "Received", "Technician Assigned", "Diagnosis Completed", "Parts Pending",
  "Repairing", "Ready for Delivery", "Delivered", "Cancelled"
] as const;
export const POLICY_SLUGS = ["privacy", "warranty", "terms"] as const;
export const ORDER_STATUSES = ["Pending", "Accepted", "Processing", "Shipped", "Delivered", "Declined", "Cancelled"] as const;

// Status flows
export const PICKUP_STATUS_FLOW = [
  "Request Received", "Arriving to Receive", "Received", "Technician Assigned",
  "Diagnosis Completed", "Parts Pending", "Repairing", "Ready for Delivery", "Delivered"
] as const;

export const SERVICE_CENTER_STATUS_FLOW = [
  "Awaiting Drop-off", "Queued", "Technician Assigned", "Diagnosis Completed",
  "Parts Pending", "Repairing", "Ready for Delivery", "Delivered"
] as const;

export const INTERNAL_STATUS_FLOW = ["Pending", "Reviewed", "Converted", "Closed"] as const;

export const QUOTE_PICKUP_STAGE_FLOW = [
  "intake", "assessment", "awaiting_customer", "authorized", "pickup_scheduled",
  "picked_up", "in_repair", "ready", "out_for_delivery", "completed", "closed"
] as const;

export const QUOTE_SERVICE_CENTER_STAGE_FLOW = [
  "intake", "assessment", "awaiting_customer", "authorized", "awaiting_dropoff",
  "device_received", "in_repair", "ready", "completed", "closed"
] as const;

export const REPAIR_PICKUP_STAGE_FLOW = [
  "intake", "assessment", "authorized", "pickup_scheduled", "picked_up",
  "in_repair", "ready", "out_for_delivery", "completed", "closed"
] as const;

export const REPAIR_SERVICE_CENTER_STAGE_FLOW = [
  "intake", "assessment", "authorized", "awaiting_dropoff", "device_received",
  "in_repair", "ready", "completed", "closed"
] as const;

export function getStageFlow(requestIntent: string | null, serviceMode: string | null): readonly string[] {
  const isQuote = requestIntent === "quote";
  const isPickup = serviceMode === "pickup";

  if (isQuote && isPickup) return QUOTE_PICKUP_STAGE_FLOW;
  if (isQuote && !isPickup) return QUOTE_SERVICE_CENTER_STAGE_FLOW;
  if (!isQuote && isPickup) return REPAIR_PICKUP_STAGE_FLOW;
  return REPAIR_SERVICE_CENTER_STAGE_FLOW;
}

export const JOB_CREATION_STAGES = ["picked_up", "device_received"] as const;

// Service Catalog Table
export const serviceCatalog = sqliteTable("service_catalog", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  minPrice: real("min_price").notNull(),
  maxPrice: real("max_price").notNull(),
  estimatedDays: text("estimated_days"),
  icon: text("icon"),
  isActive: integer("is_active", { mode: "boolean" }).default(1),
  displayOrder: integer("display_order").default(0),
  features: text("features"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertServiceCatalogSchema = createInsertSchema(serviceCatalog).omit({
  id: true,
  createdAt: true,
});
export type InsertServiceCatalog = z.infer<typeof insertServiceCatalogSchema>;
export type ServiceCatalog = typeof serviceCatalog.$inferSelect;

// Customers Table removed (merged into users)

// Service Requests Table
export const serviceRequests = sqliteTable("service_requests", {
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
  status: text("status", { enum: SERVICE_REQUEST_STATUSES }).notNull().default("Pending"),
  trackingStatus: text("tracking_status", { enum: TRACKING_STATUSES }).notNull().default("Request Received"),
  estimatedDelivery: integer("estimated_delivery", { mode: "timestamp" }),
  paymentStatus: text("payment_status").default("Due"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  convertedJobId: text("converted_job_id"),

  requestIntent: text("request_intent", { enum: REQUEST_INTENTS }),
  serviceMode: text("service_mode", { enum: SERVICE_MODES }),
  stage: text("stage", { enum: REQUEST_STAGES }).default("intake"),

  isQuote: integer("is_quote", { mode: "boolean" }).default(0),
  serviceId: text("service_id"),
  quoteStatus: text("quote_status", { enum: QUOTE_STATUSES }),
  quoteAmount: real("quote_amount"),
  quoteNotes: text("quote_notes"),
  quotedAt: integer("quoted_at", { mode: "timestamp" }),
  quoteExpiresAt: integer("quote_expires_at", { mode: "timestamp" }),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),

  pickupTier: text("pickup_tier", { enum: PICKUP_TIERS }),
  pickupCost: real("pickup_cost"),
  totalAmount: real("total_amount"),

  scheduledPickupDate: integer("scheduled_pickup_date", { mode: "timestamp" }),
  expectedPickupDate: integer("expected_pickup_date", { mode: "timestamp" }),
  expectedReturnDate: integer("expected_return_date", { mode: "timestamp" }),
  expectedReadyDate: integer("expected_ready_date", { mode: "timestamp" }),
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
export const serviceRequestEvents = sqliteTable("service_request_events", {
  id: text("id").primaryKey(),
  serviceRequestId: text("service_request_id").notNull(),
  status: text("status", { enum: TRACKING_STATUSES }).notNull(),
  message: text("message"),
  actor: text("actor"),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertServiceRequestEventSchema = createInsertSchema(serviceRequestEvents).omit({
  id: true,
  occurredAt: true,
});
export type InsertServiceRequestEvent = z.infer<typeof insertServiceRequestEventSchema>;
export type ServiceRequestEvent = typeof serviceRequestEvents.$inferSelect;

// Pickup Schedules Table
export const pickupSchedules = sqliteTable("pickup_schedules", {
  id: text("id").primaryKey(),
  serviceRequestId: text("service_request_id").notNull(),
  tier: text("tier", { enum: PICKUP_TIERS }).notNull().default("Regular"),
  tierCost: real("tier_cost").notNull().default(0),
  status: text("status", { enum: PICKUP_STATUSES }).notNull().default("Pending"),
  scheduledDate: integer("scheduled_date", { mode: "timestamp" }),
  pickupAddress: text("pickup_address"),
  assignedStaff: text("assigned_staff"),
  pickupNotes: text("pickup_notes"),
  pickedUpAt: integer("picked_up_at", { mode: "timestamp" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
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
export const attendanceRecords = sqliteTable("attendance_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  userRole: text("user_role").notNull(),
  checkInTime: integer("check_in_time", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  checkOutTime: integer("check_out_time", { mode: "timestamp" }),
  date: text("date").notNull(),
  notes: text("notes"),
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords).omit({
  id: true,
  checkInTime: true,
  checkOutTime: true,
});
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;

// Product Variants Table
export const productVariants = sqliteTable("product_variants", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  variantName: text("variant_name").notNull(),
  price: real("price").notNull(),
  stock: integer("stock").notNull().default(0),
  sku: text("sku"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertProductVariantSchema = createInsertSchema(productVariants).omit({
  id: true,
  createdAt: true,
});
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariants.$inferSelect;

// Orders Table
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").unique(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerAddress: text("customer_address").notNull(),
  status: text("status", { enum: ORDER_STATUSES }).notNull().default("Pending"),
  paymentMethod: text("payment_method").notNull().default("COD"),
  subtotal: real("subtotal").notNull(),
  total: real("total").notNull(),
  declineReason: text("decline_reason"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
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
export const orderItems = sqliteTable("order_items", {
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

// Policies Table
export const policies = sqliteTable("policies", {
  id: text("id").primaryKey(),
  slug: text("slug", { enum: POLICY_SLUGS }).notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(1),
  lastUpdated: integer("last_updated", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertPolicySchema = createInsertSchema(policies).omit({
  id: true,
  lastUpdated: true,
});
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policies.$inferSelect;

// Customer Reviews Table
export const customerReviews = sqliteTable("customer_reviews", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  rating: integer("rating").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  isApproved: integer("is_approved", { mode: "boolean" }).notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertCustomerReviewSchema = createInsertSchema(customerReviews).omit({
  id: true,
  isApproved: true,
  createdAt: true,
});
export type InsertCustomerReview = z.infer<typeof insertCustomerReviewSchema>;
export type CustomerReview = typeof customerReviews.$inferSelect;

// Inquiries Table
export const inquiries = sqliteTable("inquiries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  message: text("message").notNull(),
  status: text("status", { enum: ["Pending", "Read", "Replied"] }).notNull().default("Pending"),
  reply: text("reply"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const insertInquirySchema = createInsertSchema(inquiries).omit({
  id: true,
  createdAt: true,
  status: true,
});
export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiries.$inferSelect;
