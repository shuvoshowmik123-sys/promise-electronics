/**
 * Frontend workflow utilities for deriving UI state from service request data.
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
