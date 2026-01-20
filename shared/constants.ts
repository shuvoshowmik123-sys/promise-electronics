
// Enums and Constants - Browser Safe

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

export const TV_BRANDS = [
    "Sony", "Samsung", "LG", "Walton", "Singer", "Vision", "Minister",
    "MyOne", "Jamuna", "Haier", "Hisense", "TCL", "Panasonic", "Xiaomi",
    "Videocon", "General", "Sharp", "Toshiba", "Philips", "Hitachi",
    "Rangs", "Konka", "Nova", "Other"
] as const;

export const ISSUE_TYPES = [
    "Display Issue",
    "Power Issue",
    "Sound Issue",
    "Connectivity Issue",
    "Physical Damage",
    "Software Issue",
    "Remote Issue",
    "Other"
] as const;

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
