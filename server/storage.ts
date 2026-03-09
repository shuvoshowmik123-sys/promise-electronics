import { db } from "./db.js";
import { count, desc, eq, isNull, sql, and, like, not, asc, or, isNotNull, inArray, sum, lte, gte, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../shared/schema.js";
import type {
  User,
  InsertUser,
  JobTicket,
  InsertJobTicket,
  InventoryItem,
  InsertInventoryItem,
  InventorySerial,
  InsertInventorySerial,
  LocalPurchase,
  InsertLocalPurchase,
  WastageLog,
  InsertWastageLog,
  Challan,
  InsertChallan,
  PurchaseOrder,
  InsertPurchaseOrder,
  PurchaseOrderItem,
  InsertPurchaseOrderItem,
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
  AuditLog,
  InsertAuditLog,
  RollbackRequest,
  InsertRollbackRequest,
  CorporateClient,
  InsertCorporateClient,
  WarrantyClaim,
  InsertWarrantyClaim,
  Refund,
  InsertRefund,
  CorporateMessageThread,
  InsertCorporateMessageThread,
  CorporateMessage,
  InsertCorporateMessage,
  StaffSalaryConfig,
  InsertStaffSalaryConfig,
  LeaveApplication,
  InsertLeaveApplication,
  PayrollRecord,
  InsertPayrollRecord,
  BonusRecord,
  InsertBonusRecord,
  HolidayCalendar,
  InsertHolidayCalendar,
  DrawerSession,
  InsertDrawerSession
} from "../shared/schema.js";
import { normalizePhone } from "./utils/phone.js";

export interface PaginationResult<T> {
  items: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface IStorage {
  // Users (Unified)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByPhoneNormalized(phone: string): Promise<User | undefined>;
  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(page?: number, limit?: number): Promise<PaginationResult<User>>;
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

  // Service Requests
  getAllServiceRequests(): Promise<ServiceRequest[]>;
  getServiceRequest(id: string): Promise<ServiceRequest | undefined>;
  getServiceRequestByConvertedJobId(jobId: string): Promise<ServiceRequest | undefined>;
  createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest>;
  updateServiceRequest(id: string, updates: Partial<InsertServiceRequest>): Promise<ServiceRequest | undefined>;
  deleteServiceRequest(id: string): Promise<boolean>;
  linkServiceRequestToCustomer(requestId: string, customerId: string): Promise<ServiceRequest | undefined>;

  // Job Parts Syncing
  syncJobParts(jobId: string, oldPartsJson: string | null, newPartsJson: string | null): Promise<void>;

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

  // Rollback Requests
  createRollbackRequest(request: InsertRollbackRequest): Promise<RollbackRequest>;
  updateRollbackRequest(id: number, updates: Partial<RollbackRequest>): Promise<RollbackRequest | undefined>;
  getPendingRollbackRequests(): Promise<RollbackRequest[]>;

  getAllJobTickets(): Promise<JobTicket[]>;
  createJobTicketsBulk(jobs: InsertJobTicket[]): Promise<JobTicket[]>;
  getAllInventoryItems(): Promise<InventoryItem[]>;

  // Inventory Serials (Phase 4.1)
  getInventorySerials(inventoryItemId: string): Promise<InventorySerial[]>;
  createInventorySerials(inventoryItemId: string, serials: string[], storeId?: string): Promise<InventorySerial[]>;
  updateInventorySerialStatus(id: string, status: string, jobTicketId?: string): Promise<InventorySerial | undefined>;

  // Purchase Orders (Phase 4.3)
  getAllPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined>;
  getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]>;
  createPurchaseOrder(po: InsertPurchaseOrder, items: InsertPurchaseOrderItem[]): Promise<PurchaseOrder>;
  updatePurchaseOrderStatus(id: string, status: string): Promise<PurchaseOrder | undefined>;

  // Local Purchases (Phase 4.4)
  createLocalPurchase(purchase: InsertLocalPurchase): Promise<LocalPurchase>;
  getLocalPurchases(jobTicketId?: string): Promise<LocalPurchase[]>;

  // Wastage Logs (Phase 4.5)
  createWastageLog(log: InsertWastageLog & { reportedBy: string; storeId?: string | null }, originalStock?: number): Promise<WastageLog>;
  getWastageLogs(startDate?: Date, endDate?: Date): Promise<WastageLog[]>;

  getAllChallans(): Promise<Challan[]>;
  getJobTicketsByTechnician(technicianName: string): Promise<JobTicket[]>;
  getJobTicketsByCustomerId(customerId: string, page?: number, limit?: number): Promise<{
    jobs: JobTicket[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  }>;
  getJobsByCorporateClient(clientId: string, page?: number, limit?: number, status?: string): Promise<PaginationResult<JobTicket>>;

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

  // Optimized List Queries
  getJobTicketsList(page?: number, limit?: number): Promise<PaginationResult<Partial<JobTicket>>>;

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

  // Workflow KPIs for Manager Dashboard
  getWorkflowKPIs(): Promise<{
    pendingTriage: number;
    jobsReadyForBilling: number;
    unpaidJobs: number;
    partiallyPaidJobs: number;
    writeOffs: number;
    jobsByTechnician: { technician: string; total: number; inProgress: number; completed: number }[];
    jobsByStage: { stage: string; count: number }[];
  }>;

  // Corporate B2B Methods (Phase 5)
  createChallanIn(data: {
    corporateClientId: string;
    items: {
      corporateJobNumber: string;
      deviceModel: string;
      serialNumber: string;
      initialStatus: "OK" | "NG";
      reportedDefect: string;
    }[];
    receivedBy: string;
    receivedAt?: Date;
  }): Promise<{ challanId: string; jobIds: string[] }>;

  createChallanOut(data: {
    corporateClientId: string;
    challanInId?: string;
    jobIds: string[];
    receiverName?: string;
    receiverPhone?: string;
    receiverSignature: string;
  }): Promise<string>;

  getCorporateClientChallans(clientId: string, page?: number, limit?: number): Promise<PaginationResult<Challan>>;

  generateCorporateBill(data: {
    corporateClientId: string;
    jobIds: string[];
    periodStart: Date;
    periodEnd: Date;
  }): Promise<schema.CorporateBill>;

  getChallanJobs(challanId: string): Promise<JobTicket[]>;

  updateCorporateJobStatus(jobId: string, status: string): Promise<void>;

  // Corporate Client Management
  getAllCorporateClients(): Promise<schema.CorporateClient[]>;
  getCorporateClient(id: string): Promise<schema.CorporateClient | undefined>;
  createCorporateClient(client: schema.InsertCorporateClient): Promise<schema.CorporateClient>;
  updateCorporateClient(id: string, updates: Partial<schema.InsertCorporateClient>): Promise<schema.CorporateClient | undefined>;
  getCorporateClientBranches(parentId: string): Promise<schema.CorporateClient[]>;

  // Service Request - Job Conversion
  verifyAndConvertServiceRequest(
    id: string,
    actorName: string,
    verificationNotes?: string,
    priority?: string
  ): Promise<{ serviceRequest: ServiceRequest, jobTicket: JobTicket }>;

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
  getInventoryItemsForAndroidApp(): Promise<InventoryItem[]>;

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
  updateQuote(id: string, quoteAmount: number, quoteNotes?: string): Promise<ServiceRequest | undefined>;
  acceptQuote(id: string, pickupTier?: string | null, pickupAddress?: string, servicePreference?: string, scheduledPickupDate?: Date | null): Promise<ServiceRequest | undefined>;
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
  upsertPolicy(policy: { slug: string; title: string; content: string; isPublished?: boolean; isPublishedApp?: boolean }): Promise<Policy>;
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
  updateInquiry(id: string, updates: Partial<InsertInquiry>): Promise<Inquiry | undefined>;
  getInquiriesByPhone(phone: string): Promise<Inquiry[]>;
  deleteInquiry(id: string): Promise<boolean>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markCorporateNotificationAsRead(id: string, corporateClientId: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Customer Aliases
  getCustomer(id: string): Promise<User | undefined>;
  updateCustomer(id: string, updates: Partial<User>): Promise<User | undefined>;
  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(filters?: { userId?: string, entity?: string, entityId?: string, limit?: number }): Promise<AuditLog[]>;

  // Payment
  recordJobPayment(id: string, payment: { paymentId: string; amount: number; method: string }): Promise<JobTicket>;

  // Analytics (Phase 6)
  getRevenueStats(startDate: Date, endDate: Date): Promise<any[]>;
  getJobStats(startDate: Date, endDate: Date): Promise<any>;
  getTechnicianStats(startDate: Date, endDate: Date): Promise<any[]>;
  getCustomerStats(startDate: Date, endDate: Date): Promise<any>;

  // Warranty Claims
  getAllWarrantyClaims(filters?: { status?: string; phone?: string; page?: number; limit?: number }): Promise<PaginationResult<WarrantyClaim>>;
  getWarrantyClaim(id: string): Promise<WarrantyClaim | undefined>;
  createWarrantyClaim(claim: InsertWarrantyClaim): Promise<WarrantyClaim>;
  updateWarrantyClaim(id: string, updates: Partial<InsertWarrantyClaim>): Promise<WarrantyClaim | undefined>;

  // Refunds
  getAllRefunds(filters?: { status?: string; page?: number; limit?: number }): Promise<PaginationResult<Refund>>;
  getRefund(id: string): Promise<Refund | undefined>;
  createRefund(refund: InsertRefund): Promise<Refund>;
  updateRefund(id: string, updates: Partial<InsertRefund>): Promise<Refund | undefined>;

  // Technician Optimization
  getTechnicianWorkload(): Promise<{ technicianId: string; technicianName: string; activeJobs: number; completedToday: number }[]>;

  // Analytics
  getDefectStats(startDate: Date, endDate: Date): Promise<{ name: string; value: number }[]>;
  getSupplierDefectStats(startDate: Date, endDate: Date): Promise<{ supplier: string; defectCount: number; financialLoss: number }[]>;
  getTechnicianPerformanceStats(startDate: Date, endDate: Date): Promise<any[]>;

  // Corporate Portal (User Side)
  getJobsByCorporateClient(clientId: string, page?: number, limit?: number, status?: string): Promise<PaginationResult<JobTicket>>;
  getCorporateDashboardStats(clientId: string): Promise<{
    activeJobs: number;
    pendingApprovals: number;
    totalSpentMonth: number;
    recentActivity: any[];
  }>;

  // Messaging (Phase 5)
  getCorporateMessageThreads(clientId: string): Promise<CorporateMessageThread[]>;
  getCorporateMessageThread(id: string): Promise<CorporateMessageThread | undefined>;
  createCorporateMessageThread(thread: InsertCorporateMessageThread): Promise<CorporateMessageThread>;
  updateCorporateMessageThread(id: string, updates: Partial<CorporateMessageThread>): Promise<CorporateMessageThread | undefined>;

  getCorporateMessages(threadId: string, limit?: number, before?: Date): Promise<CorporateMessage[]>;
  createCorporateMessage(message: InsertCorporateMessage): Promise<CorporateMessage>;
  markCorporateMessagesAsRead(threadId: string, recipientType: 'corporate' | 'admin'): Promise<void>;
  getUnreadMessageCount(clientId: string, recipientType: 'corporate' | 'admin'): Promise<number>;
  checkCorporateJobExists(clientId: string, corporateJobNumber: string): Promise<boolean>;
  getExistingCorporateJobNumbers(clientId: string, jobNumbers: string[]): Promise<string[]>;

  // HR & Payroll
  getAllSalaryConfigs(): Promise<StaffSalaryConfig[]>;
  getSalaryConfig(userId: string): Promise<StaffSalaryConfig | undefined>;
  createSalaryConfig(config: InsertStaffSalaryConfig): Promise<StaffSalaryConfig>;
  updateSalaryConfig(id: string, updates: Partial<InsertStaffSalaryConfig>): Promise<StaffSalaryConfig | undefined>;
  deleteSalaryConfig(id: string): Promise<boolean>;

  // Leave Applications
  getLeaveApplicationsByUser(userId: string): Promise<LeaveApplication[]>;
  getAllLeaveApplications(status?: string): Promise<LeaveApplication[]>;
  createLeaveApplication(app: InsertLeaveApplication): Promise<LeaveApplication>;
  updateLeaveApplication(id: string, updates: Partial<LeaveApplication>): Promise<LeaveApplication | undefined>;

  // Payroll Records
  getPayrollByMonth(month: string): Promise<PayrollRecord[]>;
  getPayrollByUser(userId: string): Promise<PayrollRecord[]>;
  getPayrollRecord(id: string): Promise<PayrollRecord | undefined>;
  createPayrollRecord(record: InsertPayrollRecord): Promise<PayrollRecord>;
  updatePayrollRecord(id: string, updates: Partial<PayrollRecord>): Promise<PayrollRecord | undefined>;
  deletePayrollRecord(id: string): Promise<boolean>;

  // Bonus Records
  getBonusByYear(year: number): Promise<BonusRecord[]>;
  createBonusRecord(record: InsertBonusRecord): Promise<BonusRecord>;
  updateBonusRecord(id: string, updates: Partial<BonusRecord>): Promise<BonusRecord | undefined>;

  // Holiday Calendar
  getHolidaysByYear(year: number): Promise<HolidayCalendar[]>;
  getActiveHolidaysByYear(year: number): Promise<HolidayCalendar[]>;
  createHoliday(holiday: InsertHolidayCalendar): Promise<HolidayCalendar>;
  updateHoliday(id: string, updates: Partial<HolidayCalendar>): Promise<HolidayCalendar | undefined>;
  deleteHoliday(id: string): Promise<boolean>;

  // Drawer Sessions (Phase 7: Financial Engine)
  openDrawer(session: InsertDrawerSession): Promise<DrawerSession>;
  getActiveDrawer(): Promise<DrawerSession | undefined>;
  getDrawerHistory(page?: number, limit?: number): Promise<PaginationResult<DrawerSession>>;
  logBlindDrop(id: string, declaredCash: number): Promise<DrawerSession | undefined>;
  reconcileDrawer(id: string, data: { status: string, notes?: string, closedBy: string, closedByName: string }): Promise<DrawerSession | undefined>;

  // System Modules
  getAllModules(): Promise<schema.SystemModule[]>;
  getModule(id: string): Promise<schema.SystemModule | undefined>;
  upsertModule(module: schema.InsertSystemModule): Promise<schema.SystemModule>;
  toggleModule(id: string, portal: "admin" | "customer" | "corporate" | "technician", enabled: boolean, userId: string): Promise<schema.SystemModule | undefined>;
  seedDefaultModules(modules: schema.InsertSystemModule[]): Promise<void>;
}


import * as repos from './repositories/index.js';

const allRepoMethods: Record<string, Function> = {};
for (const repo of Object.values(repos)) {
  // Collect own enumerable properties (works for plain object repos)
  for (const [key, value] of Object.entries(repo as any)) {
    if (typeof value === 'function') {
      allRepoMethods[key] = value as Function;
    }
  }
  // Also collect prototype methods (needed for class-instance repos like systemRepo, corporateRepo, hrRepo, warrantyRepo)
  const proto = Object.getPrototypeOf(repo);
  if (proto && proto !== Object.prototype) {
    const restrictedProps = new Set(['constructor', 'caller', 'callee', 'arguments']);
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (!restrictedProps.has(key)) {
        try {
          if (typeof (repo as any)[key] === 'function') {
            // Bind methods to the instance so `this` works correctly
            allRepoMethods[key] = (repo as any)[key].bind(repo);
          }
        } catch (_) {
          // Skip any properties that throw on access (strict mode)
        }
      }
    }
  }
}

type ReposType = typeof repos.userRepo &
  typeof repos.customerRepo &
  typeof repos.jobRepo &
  typeof repos.serviceRequestRepo &
  typeof repos.attendanceRepo &
  typeof repos.financeRepo &
  typeof repos.inventoryRepo &
  typeof repos.settingsRepo &
  typeof repos.notificationRepo &
  typeof repos.orderRepo &
  typeof repos.posRepo &
  typeof repos.analyticsRepo &
  typeof repos.corporateRepo &
  typeof repos.hrRepo &
  typeof repos.warrantyRepo &
  typeof repos.systemRepo;

// Ensure the IDE proxy works transparently across all repository domains
export const storage = new Proxy({} as any, {
  get(target, prop, receiver) {
    if (typeof prop === 'string' && allRepoMethods[prop]) {
      return allRepoMethods[prop];
    }
    return Reflect.get(target, prop, receiver);
  }
}) as ReposType & IStorage;

