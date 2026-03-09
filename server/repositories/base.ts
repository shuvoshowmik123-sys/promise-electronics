/**
 * Base Repository Utilities
 * 
 * Common imports and utilities shared across all repositories.
 * This file re-exports the database connection, ORM operators, and schema.
 */

// Re-export database connection
export { db } from '../db.js';

// Re-export nanoid for ID generation
export { nanoid } from 'nanoid';

// Re-export Drizzle ORM operators
export {
    eq,
    desc,
    asc,
    and,
    or,
    like,
    gte,
    lte,
    lt,
    gt,
    sql,
    isNull,
    isNotNull,
    count,
    sum,
    avg,
    inArray,
    notInArray,
    between,
} from 'drizzle-orm';

// Re-export schema definitions
export * as schema from '../../shared/schema.js';

export interface PaginationResult<T> {
    items: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    };
}


// Re-export types for convenience
export type {
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
    WorkLocation,
    InsertWorkLocation,
    ServiceCatalog,
    InsertServiceCatalog,
    PickupSchedule,
    InsertPickupSchedule,
    CustomerReview,
    InsertCustomerReview,
    Inquiry,
    InsertInquiry,
    CustomerAddress,
    InsertCustomerAddress,
    Notification,
    InsertNotification,
    DeviceToken,
    InsertDeviceToken,
    Order,
    InsertOrder,
    OrderItem,
    InsertOrderItem,
    ProductVariant,
    InsertProductVariant,
    Policy,
    InsertPolicy,
    UpsertCustomerFromGoogle,
    PurchaseOrder,
    InsertPurchaseOrder,
    PurchaseOrderItem,
    InsertPurchaseOrderItem,
    DrawerSession,
    InsertDrawerSession,
    InventorySerial,
    InsertInventorySerial,
    LocalPurchase,
    InsertLocalPurchase,
    WastageLog,
    InsertWastageLog,
    CorporateClient,
    InsertCorporateClient,
    CorporateBill,
    InsertCorporateBill,
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
    WarrantyClaim,
    InsertWarrantyClaim,
    Refund,
    InsertRefund,
    RollbackRequest,
    InsertRollbackRequest,
    AuditLog,
    InsertAuditLog,
} from '../../shared/schema.js';
