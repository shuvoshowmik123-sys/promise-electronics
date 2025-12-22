import { db } from "./db.js";
import { eq, desc, lt, or, and, like, asc, sql, isNull, count, sum, gte, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../shared/schema.js";
import type {
  User,
  InsertUser,
  JobTicket,
  InsertJobTicket,
  InventoryItem,
  InsertInventoryItem,
  Challan,
  InsertChallan,
  PettyCashRecord,
  InsertPettyCashRecord,
  DueRecord,
  InsertDueRecord,
  Product,
  InsertProduct,
  Setting,
  InsertSetting,
  PosTransaction,
  InsertPosTransaction,
  ServiceRequest,
  InsertServiceRequest,
  ServiceRequestEvent,
  InsertServiceRequestEvent,
  AttendanceRecord,
  InsertAttendanceRecord,
  Order,
  InsertOrder,
  OrderItem,
  InsertOrderItem,
  ProductVariant,
  InsertProductVariant,
  UpsertCustomerFromGoogle,
  ServiceCatalog,
  InsertServiceCatalog,
  PickupSchedule,
  InsertPickupSchedule,
  ServiceCategory,
  InsertServiceCategory,
  Policy,
  InsertPolicy,
  CustomerReview,
  InsertCustomerReview,
  Inquiry,
  InsertInquiry,
  CustomerAddress,
  InsertCustomerAddress,
  Notification,
  InsertNotification,
} from "../shared/schema.js";

export interface IStorage {
  // Users (Unified)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByPhoneNormalized(phone: string): Promise<User | undefined>;
  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  updateUserLastLogin(id: string): Promise<void>;
  upsertUserFromGoogle(data: UpsertCustomerFromGoogle): Promise<User>;
  linkUserToGoogle(userId: string, data: UpsertCustomerFromGoogle): Promise<User>;

  // Customer Addresses
  getCustomerAddresses(customerId: string): Promise<CustomerAddress[]>;
  createCustomerAddress(address: InsertCustomerAddress): Promise<CustomerAddress>;
  updateCustomerAddress(id: string, customerId: string, updates: Partial<InsertCustomerAddress>): Promise<CustomerAddress | undefined>;
  deleteCustomerAddress(id: string, customerId: string): Promise<boolean>;

  // Service Request Events (Timeline)
  getServiceRequestEvents(serviceRequestId: string): Promise<ServiceRequestEvent[]>;
  createServiceRequestEvent(event: InsertServiceRequestEvent): Promise<ServiceRequestEvent>;

  // Attendance Records
  getAllAttendanceRecords(): Promise<AttendanceRecord[]>;
  getAttendanceByUserId(userId: string): Promise<AttendanceRecord[]>;
  getAttendanceByDate(date: string): Promise<AttendanceRecord[]>;
  getTodayAttendanceForUser(userId: string, date: string): Promise<AttendanceRecord | undefined>;
  createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord>;
  updateAttendanceRecord(id: string, updates: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined>;
  getJobTicketsByTechnician(technicianName: string): Promise<JobTicket[]>;

  // Reports
  getReportData(startDate: Date, endDate: Date): Promise<{
    monthlyFinancials: { name: string; income: number; expense: number; repairs: number }[];
    technicianPerformance: { name: string; tasks: number; efficiency: number }[];
    activityLogs: { action: string; user: string; time: Date; type: string }[];
    summary: { totalRevenue: number; totalRepairs: number; totalStaff: number };
  }>;

  // Dashboard Statistics
  getDashboardStats(): Promise<{
    totalRevenue: number;
    revenueChange: number;
    activeJobs: number;
    pendingServiceRequests: number;
    lowStockItems: number;
    jobStatusDistribution: { name: string; value: number }[];
    weeklyRevenue: { name: string; revenue: number }[];
  }>;

  // Job Overview (Live Stats)
  getJobOverview(): Promise<{
    dueToday: JobTicket[];
    dueTomorrow: JobTicket[];
    dueThisWeek: JobTicket[];
    readyForDelivery: JobTicket[];
    technicianWorkloads: { technician: string; jobs: JobTicket[] }[];
    stats: {
      totalDueToday: number;
      totalDueTomorrow: number;
      totalDueThisWeek: number;
      totalReadyForDelivery: number;
      totalInProgress: number;
    };
  }>;

  // Orders (Shop Orders)
  getAllOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  getOrderByOrderNumber(orderNumber: string): Promise<Order | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order | undefined>;
  getOrdersByCustomerId(customerId: string): Promise<Order[]>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;

  // Product Variants
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  getProductVariant(id: string): Promise<ProductVariant | undefined>;
  createProductVariant(variant: InsertProductVariant): Promise<ProductVariant>;
  updateProductVariant(id: string, updates: Partial<InsertProductVariant>): Promise<ProductVariant | undefined>;
  deleteProductVariant(id: string): Promise<boolean>;
  deleteProductVariantsByProductId(productId: string): Promise<boolean>;

  // Service Catalog
  getAllServiceCatalog(): Promise<ServiceCatalog[]>;
  getActiveServiceCatalog(): Promise<ServiceCatalog[]>;
  getServiceCatalogItem(id: string): Promise<ServiceCatalog | undefined>;
  createServiceCatalogItem(item: InsertServiceCatalog): Promise<ServiceCatalog>;
  updateServiceCatalogItem(id: string, updates: Partial<InsertServiceCatalog>): Promise<ServiceCatalog | undefined>;
  deleteServiceCatalogItem(id: string): Promise<boolean>;

  // Services from Inventory (itemType = 'service')
  getServicesFromInventory(): Promise<InventoryItem[]>;
  getActiveServicesFromInventory(): Promise<InventoryItem[]>;

  // Pickup Schedules
  getAllPickupSchedules(): Promise<PickupSchedule[]>;
  getPickupSchedule(id: string): Promise<PickupSchedule | undefined>;
  getPickupScheduleByServiceRequestId(serviceRequestId: string): Promise<PickupSchedule | undefined>;
  createPickupSchedule(schedule: InsertPickupSchedule): Promise<PickupSchedule>;
  updatePickupSchedule(id: string, updates: Partial<InsertPickupSchedule>): Promise<PickupSchedule | undefined>;
  getPendingPickupSchedules(): Promise<PickupSchedule[]>;
  getPickupSchedulesByStatus(status: string): Promise<PickupSchedule[]>;

  // Quote Operations
  getQuoteRequests(): Promise<ServiceRequest[]>;
  updateQuote(id: string, quoteAmount: string, quoteNotes?: string): Promise<ServiceRequest | undefined>;
  acceptQuote(id: string, pickupTier: string, address?: string): Promise<ServiceRequest | undefined>;
  declineQuote(id: string): Promise<ServiceRequest | undefined>;
  convertQuoteToServiceRequest(id: string): Promise<ServiceRequest | undefined>;

  // Stage Transition (Unified Workflow)
  transitionStage(id: string, newStage: string, actorName?: string): Promise<{
    serviceRequest: ServiceRequest;
    jobTicket?: JobTicket;
  }>;
  getNextValidStages(id: string): Promise<string[]>;

  // Service Categories
  getAllServiceCategories(): Promise<ServiceCategory[]>;
  getServiceCategory(id: string): Promise<ServiceCategory | undefined>;
  createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory>;
  updateServiceCategory(id: string, updates: Partial<InsertServiceCategory>): Promise<ServiceCategory | undefined>;
  deleteServiceCategory(id: string): Promise<boolean>;

  // Policies
  getAllPolicies(): Promise<Policy[]>;
  getPolicyBySlug(slug: string): Promise<Policy | undefined>;
  upsertPolicy(policy: { slug: string; title: string; content: string; isPublished?: boolean }): Promise<Policy>;
  deletePolicy(slug: string): Promise<boolean>;

  // Admin Data Management
  deleteAllBusinessData(): Promise<{ success: boolean; deletedCounts: Record<string, number> }>;

  // Customer Reviews
  createCustomerReview(review: InsertCustomerReview): Promise<CustomerReview>;
  getApprovedReviews(): Promise<CustomerReview[]>;
  getAllReviews(): Promise<CustomerReview[]>;
  updateReviewApproval(id: string, isApproved: boolean): Promise<CustomerReview | undefined>;
  deleteCustomerReview(id: string): Promise<boolean>;
  // Inquiries
  createInquiry(inquiry: InsertInquiry): Promise<Inquiry>;
  getAllInquiries(): Promise<Inquiry[]>;
  updateInquiryStatus(id: string, status: "Pending" | "Read" | "Replied"): Promise<Inquiry | undefined>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Customer Aliases
  getCustomer(id: string): Promise<User | undefined>;
  updateCustomer(id: string, updates: Partial<User>): Promise<User | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getCustomer(id: string): Promise<User | undefined> {
    return this.getUser(id);
  }

  async updateCustomer(id: string, updates: Partial<User>): Promise<User | undefined> {
    return this.updateUser(id, updates);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
    return user;
  }

  async getUserByPhoneNormalized(phone: string): Promise<User | undefined> {
    // Normalize input phone to last 10 digits
    const normalizeToDigits = (p: string): string => {
      let digits = p.replace(/\D/g, '');
      if (digits.startsWith('880')) digits = digits.slice(3);
      if (digits.startsWith('0')) digits = digits.slice(1);
      return digits.slice(-10);
    };

    const targetDigits = normalizeToDigits(phone);

    // Get all users and filter in memory (not efficient for huge datasets but fine for this scale)
    // A better approach would be to store a normalized_phone column
    const users = await db.select().from(schema.users);

    return users.find(user => {
      if (!user.phone) return false;
      return normalizeToDigits(user.phone) === targetDigits;
    });
  }

  async getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.googleSub, googleSub));
    return user;
  }

  async upsertUserFromGoogle(data: UpsertCustomerFromGoogle): Promise<User> {
    // First check if user exists with this Google ID
    const existing = await this.getUserByGoogleSub(data.googleSub);
    if (existing) {
      // Update existing user with latest info from Google
      const [updated] = await db
        .update(schema.users)
        .set({
          name: data.name,
          email: data.email || existing.email,
          profileImageUrl: data.profileImageUrl,
          isVerified: true,
          lastLogin: new Date(),
        })
        .where(eq(schema.users.id, existing.id))
        .returning();
      return updated;
    }

    // Check if user exists with same email (link existing account)
    if (data.email) {
      const existingByEmail = await this.getUserByEmail(data.email);
      if (existingByEmail) {
        const [updated] = await db
          .update(schema.users)
          .set({
            googleSub: data.googleSub,
            profileImageUrl: data.profileImageUrl,
            isVerified: true,
            lastLogin: new Date(),
          })
          .where(eq(schema.users.id, existingByEmail.id))
          .returning();
        return updated;
      }
    }

    // Create new user from Google Sign-In
    const [newUser] = await db
      .insert(schema.users)
      .values({
        id: nanoid(),
        googleSub: data.googleSub,
        name: data.name,
        email: data.email,
        profileImageUrl: data.profileImageUrl,
        isVerified: true,
        role: "Customer",
        password: nanoid(), // Random password for Google users
        status: "Active",
        permissions: "{}",
      })
      .returning();
    return newUser;
  }

  async linkUserToGoogle(userId: string, data: UpsertCustomerFromGoogle): Promise<User> {
    const [updated] = await db
      .update(schema.users)
      .set({
        googleSub: data.googleSub,
        email: data.email || undefined,
        isVerified: true,
        lastLogin: new Date(),
      })
      .where(eq(schema.users.id, userId))
      .returning();
    return updated;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(schema.users).values({ ...user, id: nanoid() }).returning();
    return newUser;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users).orderBy(desc(schema.users.joinedAt));
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(schema.users).where(eq(schema.users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateUserLastLogin(id: string): Promise<void> {
    await db
      .update(schema.users)
      .set({ lastLogin: new Date() })
      .where(eq(schema.users.id, id));
  }

  // Customer Addresses
  async getCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
    return db.select().from(schema.customerAddresses)
      .where(eq(schema.customerAddresses.customerId, customerId))
      .orderBy(desc(schema.customerAddresses.isDefault), desc(schema.customerAddresses.createdAt));
  }

  async createCustomerAddress(address: InsertCustomerAddress): Promise<CustomerAddress> {
    // If setting as default, unset other defaults for this customer
    if (address.isDefault) {
      await db.update(schema.customerAddresses)
        .set({ isDefault: false })
        .where(eq(schema.customerAddresses.customerId, address.customerId));
    }

    const [newAddress] = await db.insert(schema.customerAddresses)
      .values({ ...address, id: nanoid() })
      .returning();
    return newAddress;
  }

  async updateCustomerAddress(id: string, customerId: string, updates: Partial<InsertCustomerAddress>): Promise<CustomerAddress | undefined> {
    // If setting as default, unset other defaults for this customer
    if (updates.isDefault) {
      await db.update(schema.customerAddresses)
        .set({ isDefault: false })
        .where(and(
          eq(schema.customerAddresses.customerId, customerId),
          sql`${schema.customerAddresses.id} != ${id}`
        ));
    }

    const [updated] = await db
      .update(schema.customerAddresses)
      .set(updates)
      .where(and(
        eq(schema.customerAddresses.id, id),
        eq(schema.customerAddresses.customerId, customerId)
      ))
      .returning();
    return updated;
  }

  async deleteCustomerAddress(id: string, customerId: string): Promise<boolean> {
    const result = await db.delete(schema.customerAddresses)
      .where(and(
        eq(schema.customerAddresses.id, id),
        eq(schema.customerAddresses.customerId, customerId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  // Job Tickets
  async getAllJobTickets(): Promise<JobTicket[]> {
    return db.select().from(schema.jobTickets).orderBy(desc(schema.jobTickets.createdAt));
  }

  async getJobTicket(id: string): Promise<JobTicket | undefined> {
    const [job] = await db.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, id));
    return job;
  }

  async getNextJobNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JOB-${year}-`;

    // Optimize: Get the last job number for this year to determine sequence
    const [lastJob] = await db
      .select({ id: schema.jobTickets.id })
      .from(schema.jobTickets)
      .where(like(schema.jobTickets.id, `${prefix}%`))
      .orderBy(desc(schema.jobTickets.id))
      .limit(1);

    let maxNumber = 0;
    if (lastJob?.id) {
      const parts = lastJob.id.split('-');
      const seq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(seq)) {
        maxNumber = seq;
      }
    }

    const nextNumber = maxNumber + 1;
    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  async createJobTicket(job: InsertJobTicket): Promise<JobTicket> {
    const [newJob] = await db.insert(schema.jobTickets).values(job).returning();
    return newJob;
  }

  async updateJobTicket(id: string, updates: Partial<InsertJobTicket>): Promise<JobTicket | undefined> {
    const [updated] = await db
      .update(schema.jobTickets)
      .set(updates)
      .where(eq(schema.jobTickets.id, id))
      .returning();
    return updated;
  }

  async deleteJobTicket(id: string): Promise<boolean> {
    const result = await db.delete(schema.jobTickets).where(eq(schema.jobTickets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getJobTicketsByCustomerPhone(phone: string): Promise<JobTicket[]> {
    // Normalize phone number for matching (last 10 digits)
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    const allJobs = await db.select().from(schema.jobTickets).orderBy(desc(schema.jobTickets.createdAt));
    return allJobs.filter(job => {
      if (!job.customerPhone) return false;
      const jobPhone = job.customerPhone.replace(/\D/g, '').slice(-10);
      return jobPhone === normalizedPhone;
    });
  }

  // Inventory
  async getAllInventoryItems(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems).orderBy(schema.inventoryItems.name);
  }

  async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
    return item;
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [newItem] = await db.insert(schema.inventoryItems).values({ ...item, id: item.id || nanoid() }).returning();
    return newItem;
  }

  async updateInventoryItem(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const [updated] = await db
      .update(schema.inventoryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.inventoryItems.id, id))
      .returning();
    return updated;
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    const result = await db.delete(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateInventoryStock(id: string, quantity: number): Promise<InventoryItem | undefined> {
    const item = await this.getInventoryItem(id);
    if (!item) return undefined;

    const newStock = Math.max(0, item.stock + quantity);
    let status: "In Stock" | "Low Stock" | "Out of Stock" = "In Stock";

    if (newStock === 0) {
      status = "Out of Stock";
    } else if (newStock <= (item.lowStockThreshold || 5)) {
      status = "Low Stock";
    }

    return this.updateInventoryItem(id, { stock: newStock, status });
  }

  async getWebsiteInventoryItems(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.showOnWebsite, true))
      .orderBy(schema.inventoryItems.name);
  }

  // Challans
  async getAllChallans(): Promise<Challan[]> {
    return db.select().from(schema.challans).orderBy(desc(schema.challans.createdAt));
  }

  async getChallan(id: string): Promise<Challan | undefined> {
    const [challan] = await db.select().from(schema.challans).where(eq(schema.challans.id, id));
    return challan;
  }

  async createChallan(challan: InsertChallan): Promise<Challan> {
    const [newChallan] = await db.insert(schema.challans).values({ ...challan, id: challan.id || nanoid() }).returning();
    return newChallan;
  }

  async updateChallan(id: string, updates: Partial<InsertChallan>): Promise<Challan | undefined> {
    const [updated] = await db
      .update(schema.challans)
      .set(updates)
      .where(eq(schema.challans.id, id))
      .returning();
    return updated;
  }

  async deleteChalan(id: string): Promise<boolean> {
    const result = await db.delete(schema.challans).where(eq(schema.challans.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Petty Cash
  async getAllPettyCashRecords(): Promise<PettyCashRecord[]> {
    return db.select().from(schema.pettyCashRecords).orderBy(desc(schema.pettyCashRecords.createdAt));
  }

  async createPettyCashRecord(record: InsertPettyCashRecord): Promise<PettyCashRecord> {
    const [newRecord] = await db.insert(schema.pettyCashRecords).values({ ...record, id: nanoid() }).returning();
    return newRecord;
  }

  async deletePettyCashRecord(id: string): Promise<boolean> {
    const result = await db.delete(schema.pettyCashRecords).where(eq(schema.pettyCashRecords.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Due Records
  async getAllDueRecords(): Promise<DueRecord[]> {
    return db.select().from(schema.dueRecords).orderBy(desc(schema.dueRecords.createdAt));
  }

  async createDueRecord(record: InsertDueRecord): Promise<DueRecord> {
    const [newRecord] = await db.insert(schema.dueRecords).values({ ...record, id: nanoid() }).returning();
    return newRecord;
  }

  async updateDueRecord(id: string, updates: Partial<InsertDueRecord>): Promise<DueRecord | undefined> {
    const [updated] = await db
      .update(schema.dueRecords)
      .set(updates)
      .where(eq(schema.dueRecords.id, id))
      .returning();
    return updated;
  }

  async deleteDueRecord(id: string): Promise<boolean> {
    const result = await db.delete(schema.dueRecords).where(eq(schema.dueRecords.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Products
  async getAllProducts(): Promise<Product[]> {
    return db.select().from(schema.products).orderBy(desc(schema.products.createdAt));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(schema.products).where(eq(schema.products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(schema.products).values({ ...product, id: nanoid() }).returning();
    return newProduct;
  }

  async updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db
      .update(schema.products)
      .set(updates)
      .where(eq(schema.products.id, id))
      .returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(schema.products).where(eq(schema.products.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Settings
  async getAllSettings(): Promise<Setting[]> {
    return db.select().from(schema.settings);
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    return setting;
  }

  async upsertSetting(setting: InsertSetting): Promise<Setting> {
    const [upserted] = await db
      .insert(schema.settings)
      .values({ ...setting, id: nanoid() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: setting.value, updatedAt: new Date() },
      })
      .returning();
    return upserted;
  }

  // POS Transactions
  async getAllPosTransactions(): Promise<PosTransaction[]> {
    return db.select().from(schema.posTransactions).orderBy(desc(schema.posTransactions.createdAt));
  }

  async getPosTransaction(id: string): Promise<PosTransaction | undefined> {
    const [transaction] = await db.select().from(schema.posTransactions).where(eq(schema.posTransactions.id, id));
    return transaction;
  }

  async createPosTransaction(transaction: InsertPosTransaction): Promise<PosTransaction> {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");
    // Optimize: Count existing transactions for today instead of fetching all
    const [result] = await db
      .select({ count: count() })
      .from(schema.posTransactions)
      .where(like(schema.posTransactions.invoiceNumber, `INV-${datePrefix}%`));

    const sequence = (Number(result.count) + 1).toString().padStart(4, "0");
    const invoiceNumber = `INV-${datePrefix}-${sequence}`;

    const [newTransaction] = await db
      .insert(schema.posTransactions)
      .values({ ...transaction, invoiceNumber, id: transaction.id || nanoid() })
      .returning();

    const paymentMethod = (transaction as any).paymentMethod;
    const paymentStatus = (transaction as any).paymentStatus || "Paid";
    const customerName = transaction.customer || "Walk-in Customer";

    // Finance records are now handled in the route handler to avoid duplication and ensure correct logic
    // See POST /api/pos-transactions in server/routes.ts

    return newTransaction;
  }

  async updatePosTransactionStatusByInvoice(invoiceNumber: string, status: string): Promise<void> {
    await db
      .update(schema.posTransactions)
      .set({ paymentStatus: status })
      .where(eq(schema.posTransactions.invoiceNumber, invoiceNumber));
  }

  // Service Requests
  async getAllServiceRequests(): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests).orderBy(desc(schema.serviceRequests.createdAt));
  }

  async getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.id, id));
    return request;
  }

  async createServiceRequest(request: InsertServiceRequest & { customerId?: string | null; expiresAt?: Date | null }): Promise<ServiceRequest> {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");

    // Find the maximum sequence number for today's tickets
    // Optimize: Get the last ticket number for today to determine sequence
    const [lastRequest] = await db
      .select({ ticketNumber: schema.serviceRequests.ticketNumber })
      .from(schema.serviceRequests)
      .where(like(schema.serviceRequests.ticketNumber, `SRV-${datePrefix}-%`))
      .orderBy(desc(schema.serviceRequests.ticketNumber))
      .limit(1);

    let maxSequence = 0;
    if (lastRequest?.ticketNumber) {
      const parts = lastRequest.ticketNumber.split('-');
      const seq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(seq)) {
        maxSequence = seq;
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Try up to 5 times with incrementing sequence in case of collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const sequence = (maxSequence + 1 + attempt).toString().padStart(4, "0");
      const ticketNumber = `SRV-${datePrefix}-${sequence}`;

      try {
        const [newRequest] = await db
          .insert(schema.serviceRequests)
          .values({ ...request, ticketNumber, expiresAt, id: nanoid() })
          .returning();

        // Auto-create initial timeline event
        await db.insert(schema.serviceRequestEvents).values({
          id: nanoid(),
          serviceRequestId: newRequest.id,
          status: "Request Received",
          message: "Your repair request has been received and is being reviewed.",
          actor: "System",
        });

        return newRequest;
      } catch (error: any) {
        // If it's a duplicate key error, try the next sequence
        if (error.message?.includes('duplicate key') && attempt < 4) {
          console.log(`Ticket number ${ticketNumber} collision, retrying with next sequence...`);
          continue;
        }
        throw error;
      }
    }

    // If all retries failed, throw an error
    throw new Error("Failed to generate unique ticket number after multiple attempts");
  }

  async updateServiceRequest(id: string, updates: Partial<InsertServiceRequest> & { trackingStatus?: string; expiresAt?: Date | null; stage?: string }): Promise<ServiceRequest | undefined> {
    const [updated] = await db
      .update(schema.serviceRequests)
      .set(updates as any)
      .where(eq(schema.serviceRequests.id, id))
      .returning();
    return updated;
  }

  async deleteServiceRequest(id: string): Promise<boolean> {
    const result = await db.delete(schema.serviceRequests).where(eq(schema.serviceRequests.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getExpiredServiceRequests(): Promise<ServiceRequest[]> {
    const now = new Date();
    return db.select().from(schema.serviceRequests).where(lt(schema.serviceRequests.expiresAt, now));
  }

  async getServiceRequestByTicketNumber(ticketNumber: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.ticketNumber, ticketNumber));
    return request;
  }

  async getServiceRequestsByCustomerId(customerId: string): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests)
      .where(eq(schema.serviceRequests.customerId, customerId))
      .orderBy(desc(schema.serviceRequests.createdAt));
  }

  async linkServiceRequestToCustomer(requestId: string, customerId: string): Promise<ServiceRequest | undefined> {
    const [updated] = await db
      .update(schema.serviceRequests)
      .set({ customerId })
      .where(eq(schema.serviceRequests.id, requestId))
      .returning();
    return updated;
  }

  async linkServiceRequestsByPhone(phone: string, customerId: string): Promise<number> {
    // Normalize phone to last 10 digits for flexible matching
    const normalizeToDigits = (p: string): string => {
      let digits = p.replace(/\D/g, '');
      // Remove 880 country code if present
      if (digits.startsWith('880')) {
        digits = digits.slice(3);
      }
      // Remove leading 0 if present
      if (digits.startsWith('0')) {
        digits = digits.slice(1);
      }
      return digits.slice(-10); // Last 10 digits
    };

    const normalizedPhone = normalizeToDigits(phone);

    // Get all unlinked requests
    const unlinkedRequests = await db
      .select()
      .from(schema.serviceRequests)
      .where(isNull(schema.serviceRequests.customerId));

    // Filter in JS
    const requestsToLink = unlinkedRequests.filter(req => {
      const reqPhone = normalizeToDigits(req.phone);
      return reqPhone === normalizedPhone;
    });

    if (requestsToLink.length === 0) return 0;

    // Update them
    let linkedCount = 0;
    for (const req of requestsToLink) {
      await db
        .update(schema.serviceRequests)
        .set({ customerId })
        .where(eq(schema.serviceRequests.id, req.id));
      linkedCount++;
    }

    return linkedCount;
  }

  // Customer methods removed (merged into Users)

  // Service Request Events (Timeline)
  async getServiceRequestEvents(serviceRequestId: string): Promise<ServiceRequestEvent[]> {
    return db.select().from(schema.serviceRequestEvents)
      .where(eq(schema.serviceRequestEvents.serviceRequestId, serviceRequestId))
      .orderBy(schema.serviceRequestEvents.occurredAt);
  }

  async createServiceRequestEvent(event: InsertServiceRequestEvent): Promise<ServiceRequestEvent> {
    const [newEvent] = await db.insert(schema.serviceRequestEvents).values({ ...event, id: nanoid() }).returning();
    return newEvent;
  }

  // Attendance Records
  async getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
    return db.select().from(schema.attendanceRecords).orderBy(desc(schema.attendanceRecords.checkInTime));
  }

  async getAttendanceByUserId(userId: string): Promise<AttendanceRecord[]> {
    return db.select().from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.userId, userId))
      .orderBy(desc(schema.attendanceRecords.checkInTime));
  }

  async getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
    return db.select().from(schema.attendanceRecords)
      .where(eq(schema.attendanceRecords.date, date))
      .orderBy(desc(schema.attendanceRecords.checkInTime));
  }

  async getTodayAttendanceForUser(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select().from(schema.attendanceRecords)
      .where(and(eq(schema.attendanceRecords.userId, userId), eq(schema.attendanceRecords.date, date)));
    return record;
  }

  async createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [newRecord] = await db.insert(schema.attendanceRecords).values({ ...record, id: nanoid() }).returning();
    return newRecord;
  }

  async updateAttendanceRecord(id: string, updates: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined> {
    const [updated] = await db
      .update(schema.attendanceRecords)
      .set(updates)
      .where(eq(schema.attendanceRecords.id, id))
      .returning();
    return updated;
  }

  async getJobTicketsByTechnician(technicianName: string): Promise<JobTicket[]> {
    return db.select().from(schema.jobTickets)
      .where(eq(schema.jobTickets.technician, technicianName))
      .orderBy(desc(schema.jobTickets.createdAt));
  }

  async getReportData(startDate: Date, endDate: Date): Promise<{
    monthlyFinancials: { name: string; income: number; expense: number; repairs: number }[];
    technicianPerformance: { name: string; tasks: number; efficiency: number }[];
    activityLogs: { action: string; user: string; time: Date; type: string }[];
    summary: { totalRevenue: number; totalRepairs: number; totalStaff: number };
  }> {
    // Optimize: Filter by date range in DB
    const transactions = await db
      .select()
      .from(schema.posTransactions)
      .where(and(
        gte(schema.posTransactions.createdAt, startDate),
        lte(schema.posTransactions.createdAt, endDate)
      ));

    // Get all petty cash for expenses
    const pettyCash = await db
      .select()
      .from(schema.pettyCashRecords)
      .where(and(
        gte(schema.pettyCashRecords.createdAt, startDate),
        lte(schema.pettyCashRecords.createdAt, endDate)
      ));

    // Get all job tickets for repairs
    const jobs = await db
      .select()
      .from(schema.jobTickets)
      .where(and(
        gte(schema.jobTickets.createdAt, startDate),
        lte(schema.jobTickets.createdAt, endDate)
      ));

    // Get all users
    const users = await db.select().from(schema.users);
    const technicians = users.filter(u => u.role === "Technician");

    // Calculate monthly financials
    const monthlyMap = new Map<string, { income: number; expense: number; repairs: number }>();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Process transactions for income
    transactions.forEach(t => {
      const date = new Date(t.createdAt);
      const monthKey = months[date.getMonth()];
      const current = monthlyMap.get(monthKey) || { income: 0, expense: 0, repairs: 0 };
      current.income += t.total;
      monthlyMap.set(monthKey, current);
    });

    // Process petty cash for expenses
    pettyCash.forEach(p => {
      const date = new Date(p.createdAt);
      const monthKey = months[date.getMonth()];
      const current = monthlyMap.get(monthKey) || { income: 0, expense: 0, repairs: 0 };
      if (p.type === "Expense") {
        current.expense += Math.abs(p.amount);
      } else {
        current.income += p.amount;
      }
      monthlyMap.set(monthKey, current);
    });

    // Process jobs for repairs count
    jobs.forEach(j => {
      const date = new Date(j.createdAt);
      const monthKey = months[date.getMonth()];
      const current = monthlyMap.get(monthKey) || { income: 0, expense: 0, repairs: 0 };
      current.repairs += 1;
      monthlyMap.set(monthKey, current);
    });

    // Convert to array with all months in period
    const monthlyFinancials: { name: string; income: number; expense: number; repairs: number }[] = [];
    const startMonth = startDate.getMonth();
    const endMonth = endDate.getMonth();
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    for (let year = startYear; year <= endYear; year++) {
      const mStart = year === startYear ? startMonth : 0;
      const mEnd = year === endYear ? endMonth : 11;
      for (let m = mStart; m <= mEnd; m++) {
        const monthName = months[m];
        const data = monthlyMap.get(monthName) || { income: 0, expense: 0, repairs: 0 };
        monthlyFinancials.push({
          name: monthName,
          income: Math.round(data.income),
          expense: Math.round(data.expense),
          repairs: data.repairs,
        });
      }
    }

    // Calculate technician performance (within the selected period)
    const technicianPerformance = technicians.map(tech => {
      // Filter jobs for this technician within the selected period
      const techJobs = jobs.filter(j => j.technician === tech.name);
      const completedJobs = techJobs.filter(j => j.status === "Completed");
      const totalAssigned = techJobs.length;

      // Guard against division by zero and NaN
      let efficiency = 0;
      if (totalAssigned > 0) {
        efficiency = Math.round((completedJobs.length / totalAssigned) * 100);
        if (!Number.isFinite(efficiency)) {
          efficiency = 0;
        }
      }

      return {
        name: tech.name,
        tasks: completedJobs.length,
        efficiency,
      };
    });

    // Build activity logs from recent job tickets and POS transactions (within period)
    const activityLogs: { action: string; user: string; time: Date; type: string }[] = [];

    // Add recent jobs within the period
    const recentJobs = jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    recentJobs.forEach(job => {
      activityLogs.push({
        action: job.status === "Completed"
          ? `Completed Job #${job.id}`
          : `Created Job Ticket #${job.id}`,
        user: job.technician || "Admin",
        time: new Date(job.completedAt || job.createdAt),
        type: "job",
      });
    });

    // Add recent transactions within the period
    const recentTransactions = transactions
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    recentTransactions.forEach(t => {
      activityLogs.push({
        action: `Payment ${t.invoiceNumber || t.id} - à§³${t.total}`,
        user: "POS",
        time: new Date(t.createdAt),
        type: "payment",
      });
    });

    // Sort by time descending
    activityLogs.sort((a, b) => b.time.getTime() - a.time.getTime());

    // Calculate summary
    const totalRevenue = transactions.reduce((sum, t) => sum + t.total, 0);
    const totalRepairs = jobs.length;
    const totalStaff = users.filter(u => u.status === "Active").length;

    return {
      monthlyFinancials,
      technicianPerformance,
      activityLogs: activityLogs.slice(0, 15),
      summary: {
        totalRevenue: Math.round(totalRevenue),
        totalRepairs,
        totalStaff,
      },
    };
  }

  // Dashboard Statistics
  async getDashboardStats(): Promise<{
    totalRevenue: number;
    revenueChange: number;
    activeJobs: number;
    pendingServiceRequests: number;
    lowStockItems: number;
    jobStatusDistribution: { name: string; value: number }[];
    weeklyRevenue: { name: string; revenue: number }[];
  }> {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      activeJobsResult,
      pendingRequestsResult,
      lowStockResult,
      thisMonthRevenueResult,
      lastMonthRevenueResult,
      jobStatusResult
    ] = await Promise.all([
      // Active Jobs
      db.select({ count: count() })
        .from(schema.jobTickets)
        .where(or(eq(schema.jobTickets.status, "Pending"), eq(schema.jobTickets.status, "In Progress"))),

      // Pending Service Requests
      db.select({ count: count() })
        .from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.status, "Pending")),

      // Low Stock Items
      db.select({ count: count() })
        .from(schema.inventoryItems)
        .where(lte(schema.inventoryItems.stock, sql`COALESCE(${schema.inventoryItems.lowStockThreshold}, 5)`)),

      // This Month Revenue
      db.select({ revenue: sum(schema.posTransactions.total) })
        .from(schema.posTransactions)
        .where(gte(schema.posTransactions.createdAt, thisMonthStart)),

      // Last Month Revenue
      db.select({ revenue: sum(schema.posTransactions.total) })
        .from(schema.posTransactions)
        .where(and(
          gte(schema.posTransactions.createdAt, lastMonthStart),
          lte(schema.posTransactions.createdAt, lastMonthEnd)
        )),

      // Job Status Distribution
      db.select({ status: schema.jobTickets.status, count: count() })
        .from(schema.jobTickets)
        .groupBy(schema.jobTickets.status),
    ]);

    const activeJobs = Number(activeJobsResult[0]?.count || 0);
    const pendingServiceRequests = Number(pendingRequestsResult[0]?.count || 0);
    const lowStockItems = Number(lowStockResult[0]?.count || 0);
    const thisMonthRevenue = Number(thisMonthRevenueResult[0]?.revenue || 0);
    const lastMonthRevenue = Number(lastMonthRevenueResult[0]?.revenue || 0);

    const revenueChange = lastMonthRevenue > 0
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0;

    const jobStatusDistribution = jobStatusResult.map(r => ({
      name: r.status || "Unknown",
      value: Number(r.count)
    }));

    // Weekly Revenue (last 7 days)
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyRevenuePromises = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      weeklyRevenuePromises.push(
        db.select({ revenue: sum(schema.posTransactions.total) })
          .from(schema.posTransactions)
          .where(and(
            gte(schema.posTransactions.createdAt, date),
            lt(schema.posTransactions.createdAt, nextDate)
          ))
          .then(res => ({
            name: dayNames[date.getDay()],
            revenue: Math.round(Number(res[0]?.revenue || 0))
          }))
      );
    }

    const weeklyRevenue = await Promise.all(weeklyRevenuePromises);

    return {
      totalRevenue: Math.round(thisMonthRevenue),
      revenueChange: Math.round(revenueChange * 10) / 10,
      activeJobs,
      pendingServiceRequests,
      lowStockItems,
      jobStatusDistribution,
      weeklyRevenue,
    };
  }

  // Job Overview (Live Stats for Work Monitoring)
  async getJobOverview(): Promise<{
    dueToday: JobTicket[];
    dueTomorrow: JobTicket[];
    dueThisWeek: JobTicket[];
    readyForDelivery: JobTicket[];
    technicianWorkloads: { technician: string; jobs: JobTicket[] }[];
    stats: {
      totalDueToday: number;
      totalDueTomorrow: number;
      totalDueThisWeek: number;
      totalReadyForDelivery: number;
      totalInProgress: number;
    };
  }> {
    // Get all active jobs (not completed or cancelled)
    const allJobs = await db.select().from(schema.jobTickets)
      .where(
        and(
          sql`${schema.jobTickets.status} != 'Completed'`,
          sql`${schema.jobTickets.status} != 'Cancelled'`
        )
      )
      .orderBy(asc(schema.jobTickets.deadline), desc(schema.jobTickets.priority));

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Filter jobs by deadline
    const dueToday = allJobs.filter(job => {
      if (!job.deadline) return false;
      const deadline = new Date(job.deadline);
      return deadline >= today && deadline < tomorrow;
    });

    const dueTomorrow = allJobs.filter(job => {
      if (!job.deadline) return false;
      const deadline = new Date(job.deadline);
      return deadline >= tomorrow && deadline < dayAfterTomorrow;
    });

    const dueThisWeek = allJobs.filter(job => {
      if (!job.deadline) return false;
      const deadline = new Date(job.deadline);
      return deadline >= dayAfterTomorrow && deadline < weekEnd;
    });

    // Get completed jobs ready for delivery (limit to 50 recent)
    const readyForDelivery = await db.select().from(schema.jobTickets)
      .where(eq(schema.jobTickets.status, "Completed"))
      .orderBy(desc(schema.jobTickets.completedAt))
      .limit(50);

    // Get total count of completed jobs
    const [completedCount] = await db.select({ count: count() })
      .from(schema.jobTickets)
      .where(eq(schema.jobTickets.status, "Completed"));

    // Group jobs by technician
    const technicianMap = new Map<string, JobTicket[]>();
    allJobs.forEach(job => {
      const tech = job.technician || "Unassigned";
      if (!technicianMap.has(tech)) {
        technicianMap.set(tech, []);
      }
      technicianMap.get(tech)!.push(job);
    });

    const technicianWorkloads = Array.from(technicianMap.entries())
      .map(([technician, jobs]) => ({ technician, jobs }))
      .sort((a, b) => b.jobs.length - a.jobs.length);

    // Calculate stats
    const inProgressJobs = allJobs.filter(job => job.status === "In Progress");

    return {
      dueToday,
      dueTomorrow,
      dueThisWeek,
      readyForDelivery,
      technicianWorkloads,
      stats: {
        totalDueToday: dueToday.length,
        totalDueTomorrow: dueTomorrow.length,
        totalDueThisWeek: dueThisWeek.length,
        totalReadyForDelivery: Number(completedCount?.count || 0),
        totalInProgress: inProgressJobs.length,
      },
    };
  }

  // Orders (Shop Orders)
  async getAllOrders(): Promise<Order[]> {
    return db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    return order;
  }

  async getOrderByOrderNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, orderNumber));
    return order;
  }

  async createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");
    const allOrders = await db.select().from(schema.orders);
    const todayOrders = allOrders.filter(o =>
      o.orderNumber?.startsWith(`ORD-${datePrefix}`)
    );
    const sequence = (todayOrders.length + 1).toString().padStart(4, "0");
    const orderNumber = `ORD-${datePrefix}-${sequence}`;

    const [newOrder] = await db
      .insert(schema.orders)
      .values({ ...order, orderNumber, id: nanoid() })
      .returning();

    // Insert order items
    for (const item of items) {
      await db.insert(schema.orderItems).values({
        ...item,
        id: nanoid(),
        orderId: newOrder.id,
      });
    }

    return newOrder;
  }

  async updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order | undefined> {
    const [updated] = await db
      .update(schema.orders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.orders.id, id))
      .returning();
    return updated;
  }

  async getOrdersByCustomerId(customerId: string): Promise<Order[]> {
    return db.select().from(schema.orders)
      .where(eq(schema.orders.customerId, customerId))
      .orderBy(desc(schema.orders.createdAt));
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  }

  // Product Variants
  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, productId));
  }

  async getProductVariant(id: string): Promise<ProductVariant | undefined> {
    const [variant] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, id));
    return variant;
  }

  async createProductVariant(variant: InsertProductVariant): Promise<ProductVariant> {
    const [newVariant] = await db.insert(schema.productVariants).values({ ...variant, id: nanoid() }).returning();
    return newVariant;
  }

  async updateProductVariant(id: string, updates: Partial<InsertProductVariant>): Promise<ProductVariant | undefined> {
    const [updated] = await db
      .update(schema.productVariants)
      .set(updates)
      .where(eq(schema.productVariants.id, id))
      .returning();
    return updated;
  }

  async deleteProductVariant(id: string): Promise<boolean> {
    const result = await db.delete(schema.productVariants).where(eq(schema.productVariants.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteProductVariantsByProductId(productId: string): Promise<boolean> {
    const result = await db.delete(schema.productVariants).where(eq(schema.productVariants.productId, productId));
    return (result.rowCount ?? 0) >= 0;
  }

  // Service Catalog
  async getAllServiceCatalog(): Promise<ServiceCatalog[]> {
    return db.select().from(schema.serviceCatalog).orderBy(asc(schema.serviceCatalog.displayOrder));
  }

  async getActiveServiceCatalog(): Promise<ServiceCatalog[]> {
    return db.select().from(schema.serviceCatalog)
      .where(eq(schema.serviceCatalog.isActive, true))
      .orderBy(asc(schema.serviceCatalog.displayOrder));
  }

  async getServiceCatalogItem(id: string): Promise<ServiceCatalog | undefined> {
    const [item] = await db.select().from(schema.serviceCatalog).where(eq(schema.serviceCatalog.id, id));
    return item;
  }

  async createServiceCatalogItem(item: InsertServiceCatalog): Promise<ServiceCatalog> {
    const [newItem] = await db.insert(schema.serviceCatalog).values({ ...item, id: nanoid() }).returning();
    return newItem;
  }

  async updateServiceCatalogItem(id: string, updates: Partial<InsertServiceCatalog>): Promise<ServiceCatalog | undefined> {
    const [updated] = await db
      .update(schema.serviceCatalog)
      .set(updates)
      .where(eq(schema.serviceCatalog.id, id))
      .returning();
    return updated;
  }

  async deleteServiceCatalogItem(id: string): Promise<boolean> {
    const result = await db.delete(schema.serviceCatalog).where(eq(schema.serviceCatalog.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Services from Inventory (itemType = 'service')
  async getServicesFromInventory(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
      .where(eq(schema.inventoryItems.itemType, 'service'))
      .orderBy(asc(schema.inventoryItems.displayOrder));
  }

  async getActiveServicesFromInventory(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
      .where(and(
        eq(schema.inventoryItems.itemType, 'service'),
        eq(schema.inventoryItems.showOnWebsite, true)
      ))
      .orderBy(asc(schema.inventoryItems.displayOrder));
  }

  // Pickup Schedules
  async getAllPickupSchedules(): Promise<PickupSchedule[]> {
    return db.select().from(schema.pickupSchedules).orderBy(desc(schema.pickupSchedules.createdAt));
  }

  async getPickupSchedule(id: string): Promise<PickupSchedule | undefined> {
    const [schedule] = await db.select().from(schema.pickupSchedules).where(eq(schema.pickupSchedules.id, id));
    return schedule;
  }

  async getPickupScheduleByServiceRequestId(serviceRequestId: string): Promise<PickupSchedule | undefined> {
    const [schedule] = await db.select().from(schema.pickupSchedules)
      .where(eq(schema.pickupSchedules.serviceRequestId, serviceRequestId));
    return schedule;
  }

  async createPickupSchedule(schedule: InsertPickupSchedule): Promise<PickupSchedule> {
    const [newSchedule] = await db.insert(schema.pickupSchedules).values({ ...schedule, id: nanoid() }).returning();
    return newSchedule;
  }

  async updatePickupSchedule(id: string, updates: Partial<InsertPickupSchedule>): Promise<PickupSchedule | undefined> {
    const [updated] = await db
      .update(schema.pickupSchedules)
      .set(updates)
      .where(eq(schema.pickupSchedules.id, id))
      .returning();
    return updated;
  }

  async getPendingPickupSchedules(): Promise<PickupSchedule[]> {
    return db.select().from(schema.pickupSchedules)
      .where(eq(schema.pickupSchedules.status, "Pending"))
      .orderBy(asc(schema.pickupSchedules.createdAt));
  }

  async getPickupSchedulesByStatus(status: string): Promise<PickupSchedule[]> {
    return db.select().from(schema.pickupSchedules)
      .where(eq(schema.pickupSchedules.status, status as any))
      .orderBy(desc(schema.pickupSchedules.createdAt));
  }

  // Quote Operations
  async getQuoteRequests(): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests)
      .where(eq(schema.serviceRequests.isQuote, true))
      .orderBy(desc(schema.serviceRequests.createdAt));
  }

  async updateQuote(id: string, quoteAmount: string, quoteNotes?: string): Promise<ServiceRequest | undefined> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Quote valid for 7 days

    const [updated] = await db
      .update(schema.serviceRequests)
      .set({
        quoteAmount: parseFloat(quoteAmount),
        quoteNotes: quoteNotes || null,
        quoteStatus: "Quoted",
        quotedAt: new Date(),
        quoteExpiresAt: expiresAt,
      })
      .where(eq(schema.serviceRequests.id, id))
      .returning();
    return updated;
  }

  async acceptQuote(
    id: string,
    pickupTier: string | null,
    address?: string,
    servicePreference?: string,
    scheduledVisitDate?: Date | null
  ): Promise<ServiceRequest | undefined> {
    // Calculate pickup cost based on tier (only for home_pickup)
    const pickupCosts: Record<string, string> = {
      "Regular": "0",
      "Priority": "500",
      "Emergency": "1000"
    };
    const pickupCost = pickupTier ? (pickupCosts[pickupTier] || "0") : "0";

    const request = await this.getServiceRequest(id);
    if (!request) return undefined;

    const quoteAmount = request.quoteAmount || 0;
    const totalAmount = quoteAmount + parseFloat(pickupCost);

    // Build update object - only include pickupTier if it has a value
    const updateData: any = {
      quoteStatus: "Accepted",
      acceptedAt: new Date(),
      pickupCost,
      totalAmount,
      address: address || request.address,
    };

    // Only set pickupTier if it's a valid value (not null/empty for service_center)
    if (pickupTier) {
      updateData.pickupTier = pickupTier;
    }

    // Set service preference if provided
    if (servicePreference) {
      updateData.servicePreference = servicePreference;
    }

    // Set scheduled visit date for service center visits
    if (scheduledVisitDate) {
      updateData.scheduledPickupDate = scheduledVisitDate;
    }

    const [updated] = await db
      .update(schema.serviceRequests)
      .set(updateData)
      .where(eq(schema.serviceRequests.id, id))
      .returning();

    // Create pickup schedule if pickup tier selected (only for home_pickup)
    if (pickupTier && updated) {
      await this.createPickupSchedule({
        serviceRequestId: id,
        tier: pickupTier as any,
        tierCost: parseFloat(pickupCost),
        status: "Pending",
        pickupAddress: address || request.address || "",
      });
    }

    return updated;
  }

  async declineQuote(id: string): Promise<ServiceRequest | undefined> {
    const [updated] = await db
      .update(schema.serviceRequests)
      .set({
        quoteStatus: "Declined",
        status: "Closed",
      })
      .where(eq(schema.serviceRequests.id, id))
      .returning();
    return updated;
  }

  async convertQuoteToServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const [updated] = await db
      .update(schema.serviceRequests)
      .set({
        quoteStatus: "Converted",
        status: "Pending",
        trackingStatus: "Request Received",
      })
      .where(eq(schema.serviceRequests.id, id))
      .returning();

    // Add timeline event
    if (updated) {
      await db.insert(schema.serviceRequestEvents).values({
        id: nanoid(),
        serviceRequestId: id,
        status: "Request Received",
        message: "Quote accepted and converted to service request.",
        actor: "System",
      });
    }

    return updated;
  }

  // Stage Transition (Unified Workflow)
  async transitionStage(id: string, newStage: string, actorName: string = "System"): Promise<{
    serviceRequest: ServiceRequest;
    jobTicket?: JobTicket;
  }> {
    const request = await this.getServiceRequest(id);
    if (!request) {
      throw new Error("Service request not found");
    }

    // Get the valid stage flow for this request's specific workflow
    const stageFlow = schema.getStageFlow(request.requestIntent, request.serviceMode);
    const currentStage = request.stage || "intake";
    const currentStageIndex = stageFlow.indexOf(currentStage);
    const newStageIndex = stageFlow.indexOf(newStage);

    // Validate the new stage exists in this workflow
    if (newStageIndex === -1) {
      throw new Error(`Invalid stage "${newStage}" for this workflow`);
    }

    // Must move forward within the workflow's stage flow
    if (newStageIndex <= currentStageIndex && newStage !== currentStage) {
      throw new Error(`Cannot move backwards from "${currentStage}" to "${newStage}"`);
    }

    // Map stages to appropriate tracking status for timeline
    const stageToTrackingStatus: Record<string, string> = {
      intake: "Request Received",
      assessment: "Queued",
      awaiting_customer: "Queued",
      authorized: "Queued",
      pickup_scheduled: "Arriving to Receive",
      picked_up: "Received",
      awaiting_dropoff: "Awaiting Drop-off",
      device_received: "Received",
      in_repair: "Repairing",
      ready: "Ready for Delivery",
      out_for_delivery: "Ready for Delivery",
      completed: "Delivered",
      closed: "Delivered"
    };

    const stageMessages: Record<string, string> = {
      intake: "Request received and is being processed.",
      assessment: "Your device is being assessed by our team.",
      awaiting_customer: "Quote sent - awaiting your response.",
      authorized: "Repair authorized and scheduled.",
      pickup_scheduled: "Pickup has been scheduled.",
      picked_up: "Device has been picked up.",
      awaiting_dropoff: "Awaiting your device drop-off at our service center.",
      device_received: "Device received at service center.",
      in_repair: "Repair is in progress.",
      ready: "Your device is ready.",
      out_for_delivery: "Device is out for delivery.",
      completed: "Service completed successfully.",
      closed: "Case closed."
    };

    // Update the stage
    const [updated] = await db
      .update(schema.serviceRequests)
      .set({ stage: newStage as any })
      .where(eq(schema.serviceRequests.id, id))
      .returning();

    // Add timeline event with appropriate tracking status
    const trackingStatus = stageToTrackingStatus[newStage] || "Request Received";
    await db.insert(schema.serviceRequestEvents).values({
      id: nanoid(),
      serviceRequestId: id,
      status: trackingStatus as any,
      message: stageMessages[newStage] || `Status updated to ${newStage}`,
      actor: actorName,
    });

    // Auto-create job ticket when stage transitions to picked_up or device_received
    let jobTicket: JobTicket | undefined;
    if (schema.JOB_CREATION_STAGES.includes(newStage as any) && !request.convertedJobId) {
      const jobId = await this.getNextJobNumber();

      jobTicket = await this.createJobTicket({
        id: jobId,
        customer: request.customerName,
        customerPhone: request.phone,
        customerAddress: request.address || undefined,
        device: `${request.brand} TV`,
        tvSerialNumber: request.modelNumber || undefined,
        issue: request.primaryIssue,
        status: "In Progress",
        priority: "Medium",
        technician: "Unassigned",
        screenSize: request.screenSize || undefined,
        notes: request.description || undefined,
        estimatedCost: request.quoteAmount || undefined,
      });

      // Link the job ticket to the service request
      await db
        .update(schema.serviceRequests)
        .set({
          convertedJobId: jobId,
          status: "Converted"
        })
        .where(eq(schema.serviceRequests.id, id));

      // Add event for job creation
      await db.insert(schema.serviceRequestEvents).values({
        id: nanoid(),
        serviceRequestId: id,
        status: "Received" as any,
        message: `Job ticket ${jobId} has been created.`,
        actor: actorName,
      });

      // Refetch the updated service request
      const refreshed = await this.getServiceRequest(id);
      if (refreshed) {
        return { serviceRequest: refreshed, jobTicket };
      }
    }

    return { serviceRequest: updated, jobTicket };
  }

  async getNextValidStages(id: string): Promise<string[]> {
    const request = await this.getServiceRequest(id);
    if (!request) {
      return [];
    }

    const stageFlow = schema.getStageFlow(request.requestIntent, request.serviceMode);
    const currentStageIndex = stageFlow.indexOf(request.stage || "intake");

    if (currentStageIndex === -1 || currentStageIndex >= stageFlow.length - 1) {
      return [];
    }

    // Return all stages after the current one (allowing skipping)
    return stageFlow.slice(currentStageIndex + 1);
  }

  // Service Categories
  async getAllServiceCategories(): Promise<ServiceCategory[]> {
    return await db.select().from(schema.serviceCategories).orderBy(asc(schema.serviceCategories.displayOrder));
  }

  async getServiceCategory(id: string): Promise<ServiceCategory | undefined> {
    const [category] = await db.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.id, id));
    return category;
  }

  async createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory> {
    const [created] = await db.insert(schema.serviceCategories).values({ ...category, id: nanoid() }).returning();
    return created;
  }

  async updateServiceCategory(id: string, updates: Partial<InsertServiceCategory>): Promise<ServiceCategory | undefined> {
    const [updated] = await db
      .update(schema.serviceCategories)
      .set(updates)
      .where(eq(schema.serviceCategories.id, id))
      .returning();
    return updated;
  }

  async deleteServiceCategory(id: string): Promise<boolean> {
    const result = await db.delete(schema.serviceCategories).where(eq(schema.serviceCategories.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Admin Data Management - Delete all business data (Super Admin only)
  async deleteAllBusinessData(): Promise<{ success: boolean; deletedCounts: Record<string, number> }> {
    const deletedCounts: Record<string, number> = {};

    try {
      // Delete in order to respect foreign key constraints
      // First delete dependent tables
      const orderItemsResult = await db.delete(schema.orderItems);
      deletedCounts.orderItems = orderItemsResult.rowCount || 0;

      const ordersResult = await db.delete(schema.orders);
      deletedCounts.orders = ordersResult.rowCount || 0;

      const pickupSchedulesResult = await db.delete(schema.pickupSchedules);
      deletedCounts.pickupSchedules = pickupSchedulesResult.rowCount || 0;

      const serviceRequestEventsResult = await db.delete(schema.serviceRequestEvents);
      deletedCounts.serviceRequestEvents = serviceRequestEventsResult.rowCount || 0;

      const serviceRequestsResult = await db.delete(schema.serviceRequests);
      deletedCounts.serviceRequests = serviceRequestsResult.rowCount || 0;



      const jobTicketsResult = await db.delete(schema.jobTickets);
      deletedCounts.jobTickets = jobTicketsResult.rowCount || 0;

      const productVariantsResult = await db.delete(schema.productVariants);
      deletedCounts.productVariants = productVariantsResult.rowCount || 0;

      const productsResult = await db.delete(schema.products);
      deletedCounts.products = productsResult.rowCount || 0;

      const inventoryItemsResult = await db.delete(schema.inventoryItems);
      deletedCounts.inventoryItems = inventoryItemsResult.rowCount || 0;

      const serviceCatalogResult = await db.delete(schema.serviceCatalog);
      deletedCounts.serviceCatalog = serviceCatalogResult.rowCount || 0;

      const serviceCategoriesResult = await db.delete(schema.serviceCategories);
      deletedCounts.serviceCategories = serviceCategoriesResult.rowCount || 0;

      const challansResult = await db.delete(schema.challans);
      deletedCounts.challans = challansResult.rowCount || 0;

      const pettyCashRecordsResult = await db.delete(schema.pettyCashRecords);
      deletedCounts.pettyCashRecords = pettyCashRecordsResult.rowCount || 0;

      const dueRecordsResult = await db.delete(schema.dueRecords);
      deletedCounts.dueRecords = dueRecordsResult.rowCount || 0;

      const posTransactionsResult = await db.delete(schema.posTransactions);
      deletedCounts.posTransactions = posTransactionsResult.rowCount || 0;

      const attendanceRecordsResult = await db.delete(schema.attendanceRecords);
      deletedCounts.attendanceRecords = attendanceRecordsResult.rowCount || 0;

      return { success: true, deletedCounts };
    } catch (error) {
      console.error("Error deleting all business data:", error);
      throw error;
    }
  }

  // Policies
  async getAllPolicies(): Promise<Policy[]> {
    return db.select().from(schema.policies).orderBy(asc(schema.policies.slug));
  }

  async getPolicyBySlug(slug: string): Promise<Policy | undefined> {
    const [policy] = await db.select().from(schema.policies).where(eq(schema.policies.slug, slug as any));
    return policy;
  }

  async upsertPolicy(policy: { slug: string; title: string; content: string; isPublished?: boolean }): Promise<Policy> {
    const existing = await this.getPolicyBySlug(policy.slug);
    if (existing) {
      const [updated] = await db
        .update(schema.policies)
        .set({
          title: policy.title,
          content: policy.content,
          isPublished: policy.isPublished ?? true,
          lastUpdated: new Date(),
        })
        .where(eq(schema.policies.slug, policy.slug as any))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(schema.policies)
        .values({
          id: nanoid(),
          slug: policy.slug as any,
          title: policy.title,
          content: policy.content,
          isPublished: policy.isPublished ?? true,
        })
        .returning();
      return created;
    }
  }

  async deletePolicy(slug: string): Promise<boolean> {
    const result = await db.delete(schema.policies).where(eq(schema.policies.slug, slug as any));
    return (result.rowCount || 0) > 0;
  }

  // Customer Reviews
  async createCustomerReview(review: InsertCustomerReview): Promise<CustomerReview> {
    const [newReview] = await db.insert(schema.customerReviews).values({ ...review, id: nanoid() }).returning();
    return newReview;
  }

  async getApprovedReviews(): Promise<CustomerReview[]> {
    return db.select().from(schema.customerReviews)
      .where(eq(schema.customerReviews.isApproved, true))
      .orderBy(desc(schema.customerReviews.createdAt));
  }

  async getAllReviews(): Promise<CustomerReview[]> {
    return db.select().from(schema.customerReviews).orderBy(desc(schema.customerReviews.createdAt));
  }

  async updateReviewApproval(id: string, isApproved: boolean): Promise<CustomerReview | undefined> {
    const [updated] = await db
      .update(schema.customerReviews)
      .set({ isApproved })
      .where(eq(schema.customerReviews.id, id))
      .returning();
    return updated;
  }

  async deleteCustomerReview(id: string): Promise<boolean> {
    const result = await db.delete(schema.customerReviews).where(eq(schema.customerReviews.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Due Records (Added for partial payments)
  async getDueRecord(id: string): Promise<DueRecord | undefined> {
    const [record] = await db.select().from(schema.dueRecords).where(eq(schema.dueRecords.id, id));
    return record;
  }
  // Inquiries
  async createInquiry(inquiry: InsertInquiry): Promise<Inquiry> {
    const [newInquiry] = await db.insert(schema.inquiries).values({ ...inquiry, id: nanoid() }).returning();
    return newInquiry;
  }

  async getAllInquiries(): Promise<Inquiry[]> {
    return db.select().from(schema.inquiries).orderBy(desc(schema.inquiries.createdAt));
  }

  async updateInquiryStatus(id: string, status: "Pending" | "Read" | "Replied"): Promise<Inquiry | undefined> {
    const [updated] = await db
      .update(schema.inquiries)
      .set({ status })
      .where(eq(schema.inquiries.id, id))
      .returning();
    return updated;
  }

  async updateInquiry(id: string, updates: Partial<Inquiry>): Promise<Inquiry | undefined> {
    const [updated] = await db
      .update(schema.inquiries)
      .set(updates)
      .where(eq(schema.inquiries.id, id))
      .returning();
    return updated;
  }

  async getInquiriesByPhone(phone: string): Promise<Inquiry[]> {
    return db.select().from(schema.inquiries)
      .where(eq(schema.inquiries.phone, phone))
      .orderBy(desc(schema.inquiries.createdAt));
  }


  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(schema.notifications)
      .values({ ...notification, id: nanoid() })
      .returning();
    return newNotification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.id, id))
      .returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.userId, userId));
  }
}

export const storage = new DatabaseStorage();
