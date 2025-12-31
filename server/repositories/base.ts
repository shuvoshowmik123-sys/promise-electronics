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
} from '../../shared/schema.js';
