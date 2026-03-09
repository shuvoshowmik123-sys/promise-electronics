
// Enums and Constants - Browser Safe

export const JOB_STATUSES = ["Pending", "Diagnosing", "Pending Parts", "In Progress", "On Workbench", "Ready", "Not OK", "Delivered", "Cancelled"] as const;
export const JOB_TYPES = ["standard", "warranty_claim", "repeat_repair"] as const;
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

// ============================================================================
// ADMIN PIPELINE (replaces old "Internal Status")
// ============================================================================

// Admin Pipeline — 6 happy-path steps
export const ADMIN_PIPELINE_FLOW = ["New", "Under Review", "Approved", "Work Order", "Resolved", "Closed"] as const;

// Terminal off-ramps (not part of the linear flow)
export const ADMIN_TERMINAL_STATES = ["Declined", "Cancelled", "Unrepairable"] as const;

// All possible admin statuses (for validation)
export const SERVICE_REQUEST_STATUSES = [
    "New", "Under Review", "Approved", "Work Order", "Resolved", "Closed",
    "Declined", "Cancelled", "Unrepairable"
] as const;

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

// ============================================================================
// CUSTOMER TRACKING (customer-facing statusstatuses)
// ============================================================================

// All possible tracking statuses (union of both flows + off-ramps)
export const TRACKING_STATUSES = [
    "Booked", "Collection En Route", "Device Collected",
    "Awaiting Drop-off", "Device Received",
    "Technician Assigned", "Diagnosis Complete",
    "Awaiting Parts", "Repairing",
    "Ready for Return", "Ready for Collection",
    "Delivered", "Collected",
    "Cancelled", "Unrepairable"
] as const;

export const POLICY_SLUGS = ["privacy", "warranty", "terms"] as const;
export const ORDER_STATUSES = ["Pending", "Accepted", "Processing", "Shipped", "Delivered", "Declined", "Cancelled"] as const;

// Status flows
export const PICKUP_STATUS_FLOW = [
    "Booked", "Collection En Route", "Device Collected",
    "Technician Assigned", "Diagnosis Complete",
    "Awaiting Parts", "Repairing",
    "Ready for Return", "Delivered"
] as const;

export const SERVICE_CENTER_STATUS_FLOW = [
    "Awaiting Drop-off", "Device Received",
    "Technician Assigned", "Diagnosis Complete",
    "Awaiting Parts", "Repairing",
    "Ready for Collection", "Collected"
] as const;

// Legacy alias for backward compatibility
export const INTERNAL_STATUS_FLOW = ADMIN_PIPELINE_FLOW;

// ============================================================================
// STEP CONFIGURATIONS (UI metadata for steppers)
// ============================================================================

/** Admin Pipeline step config with tooltips, colors, and icons */
export const ADMIN_STEP_CONFIG = [
    {
        value: "New",
        label: "New",
        tooltip: { title: "New Request", body: "Request has been submitted and is awaiting initial review by staff." },
        color: "blue",
        icon: "FilePlus",
    },
    {
        value: "Under Review",
        label: "Under Review",
        tooltip: { title: "Under Review", body: "A staff member is evaluating the request, checking device info, and assessing viability." },
        color: "amber",
        icon: "Search",
    },
    {
        value: "Approved",
        label: "Approved",
        tooltip: { title: "Approved", body: "Request has been approved for service. Quote accepted (if applicable). Ready for work order creation." },
        color: "emerald",
        icon: "CheckCircle",
    },
    {
        value: "Work Order",
        label: "Work Order",
        tooltip: { title: "Work Order Active", body: "A Job Ticket has been created and repair work is in progress. Technician tracking is active." },
        color: "violet",
        icon: "Wrench",
    },
    {
        value: "Resolved",
        label: "Resolved",
        tooltip: { title: "Resolved", body: "Repair is complete and the device has been returned to the customer. Auto-triggers when tracking reaches Delivered/Collected." },
        color: "teal",
        icon: "CheckCheck",
    },
    {
        value: "Closed",
        label: "Closed",
        tooltip: { title: "Closed & Archived", body: "Request is archived. Auto-closes 7 days after Resolved. No further changes allowed." },
        color: "slate",
        icon: "Archive",
    },
] as const;

/** Admin Pipeline off-ramp config (terminal states) */
export const ADMIN_OFFRAMP_CONFIG = [
    {
        value: "Declined",
        tooltip: { title: "Declined", body: "Request was declined. Reasons: spam, unsupported device, or out of service area." },
        color: "red",
        icon: "XCircle",
        canTriggerFrom: ["Under Review"],
    },
    {
        value: "Cancelled",
        tooltip: { title: "Cancelled by Customer", body: "Customer requested cancellation. Device returned as-is if already collected." },
        color: "orange",
        icon: "Ban",
        canTriggerFrom: ["Approved", "Work Order"],
    },
    {
        value: "Unrepairable",
        tooltip: { title: "Unrepairable", body: "Technician determined the device cannot be repaired. Device returned as-is to the customer." },
        color: "rose",
        icon: "ShieldAlert",
        canTriggerFrom: ["Work Order"],
    },
] as const;

/** Pickup flow step config with tooltips and flags */
export const PICKUP_STEP_CONFIG = [
    { value: "Booked", label: "Booked", tooltip: { title: "Pickup Booked", body: "Customer has scheduled a pickup. Our team will collect the device from the customer's location." }, skippable: false },
    { value: "Collection En Route", label: "En Route", tooltip: { title: "Collection En Route", body: "Our pickup agent is on the way to the customer's location to collect the device." }, skippable: false },
    { value: "Device Collected", label: "Collected", tooltip: { title: "Device Collected", body: "Device has been collected from the customer and is being transported to our service center." }, skippable: false },
    { value: "Technician Assigned", label: "Technician", tooltip: { title: "Technician Assigned", body: "A qualified technician has been assigned to diagnose and repair the device." }, skippable: false, requiresJob: true },
    { value: "Diagnosis Complete", label: "Diagnosed", tooltip: { title: "Diagnosis Complete", body: "Technician has completed the diagnosis. Issue identified and repair plan is ready." }, skippable: false, requiresJob: true },
    { value: "Awaiting Parts", label: "Parts", tooltip: { title: "Awaiting Parts", body: "Required replacement parts have been ordered. Repair will resume when parts arrive." }, skippable: true },
    { value: "Repairing", label: "Repairing", tooltip: { title: "Repair In Progress", body: "Device is currently being repaired. Includes component replacement, testing, and quality assurance." }, skippable: false, requiresJob: true },
    { value: "Ready for Return", label: "Ready", tooltip: { title: "Ready for Return", body: "Repair is complete and the device is ready to be returned to the customer's location." }, skippable: false },
    { value: "Delivered", label: "Delivered", tooltip: { title: "Delivered", body: "Device has been successfully returned to the customer. Service complete." }, skippable: false },
] as const;

/** Service Center flow step config with tooltips and flags */
export const SC_STEP_CONFIG = [
    { value: "Awaiting Drop-off", label: "Drop-off", tooltip: { title: "Awaiting Drop-off", body: "Waiting for the customer to bring their device to our service center." }, skippable: false },
    { value: "Device Received", label: "Received", tooltip: { title: "Device Received", body: "Device has been received at our service center and checked in." }, skippable: false },
    { value: "Technician Assigned", label: "Technician", tooltip: { title: "Technician Assigned", body: "A qualified technician has been assigned to diagnose and repair the device." }, skippable: false, requiresJob: true },
    { value: "Diagnosis Complete", label: "Diagnosed", tooltip: { title: "Diagnosis Complete", body: "Technician has completed the diagnosis. Issue identified and repair plan is ready." }, skippable: false, requiresJob: true },
    { value: "Awaiting Parts", label: "Parts", tooltip: { title: "Awaiting Parts", body: "Required replacement parts have been ordered. Repair will resume when parts arrive." }, skippable: true },
    { value: "Repairing", label: "Repairing", tooltip: { title: "Repair In Progress", body: "Device is currently being repaired. Includes component replacement, testing, and quality assurance." }, skippable: false, requiresJob: true },
    { value: "Ready for Collection", label: "Ready", tooltip: { title: "Ready for Collection", body: "Repair is complete. Customer can collect the device from our service center." }, skippable: false },
    { value: "Collected", label: "Collected", tooltip: { title: "Collected", body: "Customer has collected their repaired device. Service complete." }, skippable: false },
] as const;

/** Defines which steps allow rollback and to where */
export const ADMIN_ROLLBACK_RULES: Record<string, string | null> = {
    "New": null,                     // Cannot roll back from New
    "Under Review": "New",           // Can roll back to New
    "Approved": "Under Review",      // Can roll back to Under Review
    "Work Order": null,              // Cannot roll back once job is created
    "Resolved": "Work Order",        // Can reopen (warranty re-repair)
    "Closed": null,                  // Cannot roll back from Closed
    "Declined": null,                // Terminal
    "Cancelled": null,               // Terminal
    "Unrepairable": null,            // Terminal
};

/** Auto-transitions that fire when conditions are met */
export const ADMIN_AUTO_TRANSITIONS = {
    // When tracking hits Delivered/Collected → auto-set admin to Resolved
    autoResolveOnDelivery: true,
    // Auto-close X days after Resolved
    autoCloseDays: 7,
};

// ┌─────────────────────────────────────────────────────┐
// │ DEPRECATED: Stage system (replaced by 2-pipeline)   │
// │ Kept for backward compat — do not use in new code   │
// └─────────────────────────────────────────────────────┘

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

export const TRACKING_STEP_MESSAGES: Record<string, { message: string, nextHint: string }> = {
    "Request Received": { message: "We have received your request and are reviewing it.", nextHint: "Our team will evaluate your request shortly." },
    "Under Review": { message: "Our team is reviewing your request.", nextHint: "We will approve the request or contact you if we need more details." },
    "Approved": { message: "Your request has been approved.", nextHint: "We are preparing for the next steps." },
    "Awaiting Your Drop-off": { message: "Please drop off your device at our service center.", nextHint: "Our team is ready to receive your device." },
    "Pickup Scheduled": { message: "A pickup has been scheduled for your device.", nextHint: "Our agent will arrive at your location on the scheduled date." },
    "Being Assessed": { message: "A technician is evaluating your device.", nextHint: "Once evaluated, we will update the repair status." },
    "Technician Assigned": { message: "A technician has been assigned to your device.", nextHint: "The technician will diagnose the issue and start the repair." },
    "Awaiting Parts": { message: "We are waiting for required parts to arrive.", nextHint: "Repair will resume as soon as the parts are received." },
    "Repairing": { message: "Your device is currently being repaired.", nextHint: "We are working carefully to fix the issue." },
    "Ready for Collection": { message: "Your device is ready to be collected from our center.", nextHint: "Please visit our service center during business hours." },
    "Ready for Return Delivery": { message: "Your device is ready and will be delivered to you.", nextHint: "Our agent will contact you for delivery." },
    "Collected": { message: "You have collected your device.", nextHint: "Thank you for using our service." },
    "Delivered": { message: "Your device has been delivered.", nextHint: "Thank you for using our service." },
    "Completed": { message: "This service request is now complete.", nextHint: "We hope your device is working perfectly." },
    "Request Declined": { message: "Your request could not be processed at this time.", nextHint: "Please contact support for more information." },
    "Request Cancelled": { message: "This request has been cancelled.", nextHint: "You can submit a new request if you need service later." },
    "Device Unrepairable": { message: "Unfortunately, this device cannot be repaired.", nextHint: "Your device will be returned to you as-is." },
};

export const PROGRESS_ADJUSTMENT_MESSAGES: Record<string, string> = {
    "Under Review": "Your device is being re-evaluated to ensure the best repair approach.",
    "Approved": "We are adjusting the timeline of your request.",
    "Awaiting Parts": "We are verifying part availability and will update you shortly.",
};
