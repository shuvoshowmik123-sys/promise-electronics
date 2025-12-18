import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums - We'll keep them as const arrays for Zod validation, 
// but in PG we could use native enums. For simplicity in migration, we'll use text columns with checks or just application-level validation.
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
export const users = pgTable("users", {
  id: text("id").primaryKey(), // App should generate UUID
  username: text("username").unique(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone").unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("Customer"), // We could use enum here but text is fine
  status: text("status").notNull().default("Active"),
  permissions: text("permissions").notNull().default("{}"), // Keeping as text for simple JSON parsing or could be jsonb
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
  // Customer specific fields
  googleSub: text("google_sub").unique(),
  address: text("address"),
  profileImageUrl: text("profile_image_url"),
  avatar: text("avatar"),
  isVerified: boolean("is_verified").default(false),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  joinedAt: true,
  lastLogin: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
export const jobTickets = pgTable("job_tickets", {
  id: text("id").primaryKey(),
  corporateJobNumber: text("corporate_job_number"),
  customer: text("customer").notNull(),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  device: text("device").notNull(),
  tvSerialNumber: text("tv_serial_number"),
  issue: text("issue").notNull(),
  status: text("status").notNull().default("Pending"),
  priority: text("priority").notNull().default("Medium"),
  technician: text("technician").default("Unassigned"),
  screenSize: text("screen_size"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  deadline: timestamp("deadline"),
  notes: text("notes"),
  estimatedCost: real("estimated_cost"),
  serviceWarrantyDays: integer("service_warranty_days").default(0),
  serviceExpiryDate: timestamp("service_expiry_date"),
  partsWarrantyDays: integer("parts_warranty_days").default(0),
  partsExpiryDate: timestamp("parts_expiry_date"),
  warrantyTermsAccepted: boolean("warranty_terms_accepted").default(false),
  parentJobId: text("parent_job_id"),
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
  icon: text("icon"),
  estimatedDays: text("estimated_days"),
  displayOrder: integer("display_order").default(0),
  features: text("features"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

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
});

export const insertDueRecordSchema = createInsertSchema(dueRecords).omit({
  id: true,
  createdAt: true,
  paidAt: true,
});
export type InsertDueRecord = z.infer<typeof insertDueRecordSchema>;
export type DueRecord = typeof dueRecords.$inferSelect;

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
  checkInTime: timestamp("check_in_time").notNull().defaultNow(),
  checkOutTime: timestamp("check_out_time"),
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

// Policies Table
export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isPublished: boolean("is_published").notNull().default(true),
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
