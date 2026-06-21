import type { ServiceRequest, ServiceRequestEvent, PickupSchedule } from "@shared/schema";
import { fetchApi } from "./httpClient";
import { CustomerSession, OrderWithTimeline, Order } from "./types";

export type CustomerJourneyStage =
    | "draft"
    | "quote_requested"
    | "quote_sent"
    | "quote_accepted"
    | "schedule_requested"
    | "schedule_confirmed"
    | "device_waiting"
    | "device_received"
    | "inspection_waiting"
    | "inspection_started"
    | "diagnosis_ready"
    | "repair_approval_required"
    | "repair_approved"
    | "repair_in_progress"
    | "repair_completed"
    | "delivery_scheduled"
    | "delivered"
    | "cancelled";

export interface CustomerRepairJourney {
    id: string;
    customerId: string | null;
    serviceRequestId: string | null;
    quoteRequestId: string | null;
    jobTicketId: string | null;
    currentStage: CustomerJourneyStage;
    currentStatus: string;
    customerFriendlyStatus: string;
    nextAction: string | null;
    nextActionLabel: string | null;
    nextUpdateEta: string | null;
    serviceMode: string;
    pickupRequired: boolean;
    dropoffRequired: boolean;
    customerNote: string | null;
    adminNote?: string | null;
    warrantyClaimId?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CustomerRepairJourneyEvent {
    id: string;
    journeyId: string;
    eventType: string;
    title: string;
    message: string | null;
    actorType: string;
    actorId?: string;
    metadata?: unknown;
    createdAt: string;
}

export interface CustomerRepairSchedule {
    id: string;
    journeyId: string;
    scheduleType: string;
    requestedDate: string | null;
    requestedTimeWindow: string | null;
    confirmedDate: string | null;
    confirmedTimeWindow: string | null;
    status: string;
    customerNote: string | null;
    adminNote?: string | null;
    assignedDriverId?: string | null;
    zone?: string | null;
    routeOrder?: number | null;
    customerConfirmedAt?: string | null;
    pickupScheduleId?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CustomerRepairJourneyDetail extends CustomerRepairJourney {
    events: CustomerRepairJourneyEvent[];
    schedules: CustomerRepairSchedule[];
}

export interface AcceptJourneyQuotePayload {
    servicePreference: "home_pickup" | "service_center";
    pickupTier?: "Regular" | "Priority" | "Emergency";
    address?: string;
    scheduledVisitDate?: string | null;
}

export interface JourneySchedulePayload {
    scheduleType: "pickup" | "drop_off" | "home_visit" | "delivery" | "service_center_visit";
    requestedDate?: string;
    requestedTimeWindow?: string;
    customerNote?: string;
}

// Customer Portal Authentication API
export const customerAuthApi = {
    register: (data: { name: string; phone: string; email?: string; address?: string; password: string }) =>
        fetchApi<CustomerSession>("/customer/register", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    login: (data: { phone: string; password: string }) =>
        fetchApi<CustomerSession>("/customer/login", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    logout: () =>
        fetchApi<{ message: string }>("/customer/logout", {
            method: "POST",
        }),
    me: () => fetchApi<CustomerSession>("/customer/me"),
    googleMe: () => fetchApi<CustomerSession>("/customer/auth/me"),
    updateProfile: (data: { phone?: string; address?: string; name?: string; email?: string; profileImageUrl?: string; preferences?: string }) =>
        fetchApi<CustomerSession>("/customer/profile", {
            method: "PUT",
            body: JSON.stringify(data),
        }),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
        fetchApi<{ message: string }>("/customer/change-password", {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

// Customer Service Requests (Repair Orders) Tracking API
export const customerServiceRequestsApi = {
    getAll: () => fetchApi<ServiceRequest[]>("/customer/service-requests"),
    getOne: (id: string) => fetchApi<OrderWithTimeline>(`/customer/service-requests/${id}`),
    track: (ticketNumber: string) => fetchApi<ServiceRequest & { timeline?: ServiceRequestEvent[]; message?: string }>(`/customer/track/${ticketNumber}`),
    link: (ticketNumber: string) =>
        fetchApi<ServiceRequest>("/customer/service-requests/link", {
            method: "POST",
            body: JSON.stringify({ ticketNumber }),
        }),
    acceptQuote: (id: string, pickupTier: string | null, address: string, servicePreference: "home_pickup" | "service_center", scheduledVisitDate?: Date | null) =>
        fetchApi<ServiceRequest>(`/quotes/${id}/accept`, {
            method: "POST",
            body: JSON.stringify({ pickupTier, address, servicePreference, scheduledVisitDate: scheduledVisitDate?.toISOString() || null }),
        }),
    declineQuote: (id: string) =>
        fetchApi<ServiceRequest>(`/quotes/${id}/decline`, {
            method: "POST",
        }),
    submitPayment: (id: string, data: {
        method: "bkash_send_money" | "nagad_send_money";
        amount: number;
        senderNumber: string;
        transactionId: string;
        notes?: string;
    }) =>
        fetchApi<any>(`/customer/service-requests/${id}/payment-submissions`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

// Customer Order Tracking API (for backwards compatibility)
export const customerOrdersApi = customerServiceRequestsApi;

export const customerRepairJourneysApi = {
    getAll: () => fetchApi<CustomerRepairJourney[]>("/customer/repair-journeys"),
    getOne: (id: string) => fetchApi<CustomerRepairJourneyDetail>(`/customer/repair-journeys/${id}`),
    requestSchedule: (id: string, data: JourneySchedulePayload) =>
        fetchApi<{ scheduleId: string; status: string }>(`/customer/repair-journeys/${id}/schedule`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    requestReschedule: (id: string, data: { scheduleId: string; newDate: string; newTimeWindow?: string; customerNote?: string }) =>
        fetchApi<{ status: string }>(`/customer/repair-journeys/${id}/reschedule`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    acceptQuote: (id: string, data: AcceptJourneyQuotePayload) =>
        fetchApi<ServiceRequest>(`/customer/repair-journeys/${id}/accept-quote`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    askQuestion: (id: string, question: string) =>
        fetchApi<{ eventId: string }>(`/customer/repair-journeys/${id}/ask-question`, {
            method: "POST",
            body: JSON.stringify({ question }),
        }),
};

// Customer Warranties API
export type WarrantyInfo = {
    jobId: string;
    device: string;
    issue: string;
    completedAt: string;
    serviceWarranty: {
        days: number;
        expiryDate: string | null;
        isActive: boolean;
        remainingDays: number;
    };
    partsWarranty: {
        days: number;
        expiryDate: string | null;
        isActive: boolean;
        remainingDays: number;
    };
};

export const customerWarrantiesApi = {
    getAll: () => fetchApi<WarrantyInfo[]>("/customer/warranties"),
    claim: (jobId: string, data: { claimType: "service" | "parts"; issueDescription: string }) =>
        fetchApi<{ claimId: string; message: string }>(`/customer/warranties/${jobId}/claim`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
};

// Customer Shop Orders API
export const shopOrdersApi = {
    getAll: () => fetchApi<Order[]>("/customer/orders"),
    getOne: (id: string) => fetchApi<Order>(`/customer/orders/${id}`),
    create: (data: {
        items: { productId: string; variantId?: string; quantity: number }[];
        address: string;
        phone: string;
        notes?: string;
    }) =>
        fetchApi<Order>("/orders", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    track: (orderNumber: string) => fetchApi<Order>(`/orders/track/${orderNumber}`),
};

// Quote Requests API (customer)
export const quoteRequestsApi = {
    submit: (data: {
        serviceId: string;
        brand: string;
        primaryIssue: string;
        description?: string;
        customerName: string;
        phone: string;
        screenSize?: string;
        modelNumber?: string;
        servicePreference?: string;
        address?: string;
        requestIntent?: string;
        serviceMode?: string;
    }) =>
        fetchApi<ServiceRequest>("/quotes", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    accept: (id: string, data: { pickupTier?: string; servicePreference: string; address?: string }) =>
        fetchApi<ServiceRequest>(`/quotes/${id}/accept`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
    decline: (id: string) =>
        fetchApi<ServiceRequest>(`/quotes/${id}/decline`, {
            method: "POST",
        }),
    convert: (id: string) =>
        fetchApi<ServiceRequest>(`/quotes/${id}/convert`, {
            method: "POST",
        }),
};

// Warranty Claims API
export const warrantyClaimsApi = {
    create: (data: { originalJobId: string; claimType: string; claimReason: string; notes?: string }) =>
        fetchApi("/warranty-claims", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    get: (id: string) => fetchApi(`/warranty-claims/${id}`),
    getAll: (params?: { status?: string; phone?: string; page?: number; limit?: number }) => {
        const query = new URLSearchParams();
        if (params?.status) query.append("status", params.status);
        if (params?.phone) query.append("phone", params.phone);
        if (params?.page) query.append("page", params.page.toString());
        if (params?.limit) query.append("limit", params.limit.toString());
        return fetchApi<any[]>(`/warranty-claims?${query.toString()}`);
    },
    approve: (id: string, data: { approvedBy: string; approvedByName: string; approvedByRole: string }) =>
        fetchApi(`/warranty-claims/${id}/approve`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    reject: (id: string, data: { approvedBy: string; approvedByName: string; approvedByRole: string; rejectionReason: string }) =>
        fetchApi(`/warranty-claims/${id}/reject`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    createJob: (id: string, data?: { createdBy: string }) =>
        fetchApi(`/warranty-claims/${id}/create-job`, {
            method: "POST",
            body: JSON.stringify(data || {}),
        }),
};

// Customer Pickup Schedule API
export const pickupScheduleApi = {
    getByServiceRequest: (serviceRequestId: string) =>
        fetchApi<PickupSchedule>(`/pickups/by-request/${serviceRequestId}`),
};
