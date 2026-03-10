import { ServiceRequest } from "../../shared/schema.js";
import {
    ADMIN_PIPELINE_FLOW,
    PICKUP_STATUS_FLOW,
    SERVICE_CENTER_STATUS_FLOW,
    TRACKING_STEP_MESSAGES,
    PROGRESS_ADJUSTMENT_MESSAGES
} from "../../shared/constants.js";

/**
 * Derives the exact tracking status a customer should see based on the admin and job states.
 * 
 * Rules:
 * 1. Admin 'New' -> Request Received
 * 2. Admin 'Under Review' -> Under Review
 * 3. Admin 'Approved':
 *      if pickup + no date -> Approved
 *      if pickup + date -> Pickup Scheduled for [date]
 *      if service_center -> Awaiting Your Drop-off
 * 4. Admin 'Work Order':
 *      if technician assigned -> Technician Assigned (or job specific stages)
 *      if job is in specific status -> map to tracking status
 * 5. Admin 'Resolved' -> Delivered / Collected
 * 6. Offramps -> Request Declined, Request Cancelled, Device Unrepairable, Completed
 */
export function deriveTrackingStatus(
    adminStatus: string,
    serviceMode: "pickup" | "service_center" | "home_pickup" | "center",
    jobStatus?: string | null,
    jobTechnician?: string | null,
    scheduledPickupDate?: Date | null
): string {
    const isPickup = serviceMode === "pickup" || serviceMode === "home_pickup";

    switch (adminStatus) {
        case "New": return "Request Received";
        case "Under Review": return "Under Review";
        case "Approved":
            if (isPickup) {
                return scheduledPickupDate ? `Pickup Scheduled for ${new Date(scheduledPickupDate).toLocaleDateString()}` : "Approved";
            }
            return "Awaiting Your Drop-off";
        case "Work Order":
            if (!jobTechnician || jobTechnician === "Unassigned") return "Being Assessed";
            if (jobStatus === "Pending") return "Technician Assigned";
            if (jobStatus === "Diagnosing") return "Technician Assigned";
            if (jobStatus === "Pending Parts") return "Awaiting Parts";
            if (jobStatus === "In Progress") return "Repairing";
            if (jobStatus === "Ready") return isPickup ? "Ready for Return Delivery" : "Ready for Collection";
            // Default fallback if we don't know the exact job status
            return "Being Assessed";
        case "Resolved":
            return isPickup ? "Delivered" : "Collected";
        case "Closed": return "Completed";
        case "Declined": return "Request Declined";
        case "Cancelled": return "Request Cancelled";
        case "Unrepairable": return "Device Unrepairable";
        default: return "Request Received";
    }
}

/**
 * Returns the valid contextual actions the admin can take from this status.
 */

export function getContextualActions(
    adminStatus: string,
    serviceMode: string,
    role: string,
    quoteStatus?: string | null
): Array<{ id: string, label: string, isPrimary: boolean, intent: 'positive' | 'negative' | 'neutral' }> {
    const actions: Array<{ id: string, label: string, isPrimary: boolean, intent: 'positive' | 'negative' | 'neutral' }> = [];

    switch (adminStatus) {
        case "New":
            actions.push({ id: 'start_review', label: 'Start Review', isPrimary: true, intent: 'positive' });
            actions.push({ id: 'decline', label: 'Decline', isPrimary: false, intent: 'negative' });
            break;
        case "Under Review":
            actions.push({ id: 'approve', label: 'Approve', isPrimary: true, intent: 'positive' });
            actions.push({ id: 'decline', label: 'Decline', isPrimary: false, intent: 'negative' });
            break;
        case "Approved":
            const isPickup = serviceMode === "pickup" || serviceMode === "home_pickup";
            if (isPickup) {
                actions.push({ id: 'schedule_pickup', label: 'Schedule Pickup', isPrimary: true, intent: 'positive' });
            } else {
                actions.push({ id: 'mark_awaiting_dropoff', label: 'Mark Awaiting Drop-off', isPrimary: true, intent: 'positive' });
            }
            actions.push({ id: 'cancel', label: 'Cancel Request', isPrimary: false, intent: 'negative' });
            break;
        case "Work Order":
            actions.push({ id: 'cancel', label: 'Cancel Request', isPrimary: false, intent: 'negative' });
            actions.push({ id: 'mark_unrepairable', label: 'Mark Unrepairable', isPrimary: false, intent: 'negative' });
            break;
        case "Resolved":
            actions.push({ id: 'close', label: 'Close & Archive', isPrimary: true, intent: 'neutral' });
            break;
    }

    return actions;
}

/**
 * Analyzes the current state and returns valid steps an admin can "rewind" to without throwing errors.
 */
export function getAdjustableSteps(currentStatus: string): string[] {
    const history = [...ADMIN_PIPELINE_FLOW] as string[];
    const currentIndex = history.indexOf(currentStatus);
    if (currentIndex <= 0) return [];

    // Admins can rewind up to the point of a Work Order.
    // Rewinding a Work Order itself is too destructive without dropping the job.
    if (currentStatus === "Work Order" || currentStatus === "Resolved" || currentStatus === "Closed") {
        return history.slice(0, currentIndex);
    }

    return history.slice(0, currentIndex);
}

/**
 * Returns message info for customer slideshow based on derived tracking status.
 */
export function getCustomerMessage(trackingStatus: string): { message: string, nextHint: string } {
    const defaultRes = { message: "Your device is being processed.", nextHint: "Please check back later for updates." };
    if (!trackingStatus) return defaultRes;

    // We can do exact or partial matches
    const key = Object.keys(TRACKING_STEP_MESSAGES).find(k => trackingStatus.includes(k));
    if (key) return (TRACKING_STEP_MESSAGES as Record<string, any>)[key];

    return defaultRes;
}
