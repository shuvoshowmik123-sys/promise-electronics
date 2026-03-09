import type { Customer, ServiceRequest, ServiceRequestEvent, User, JobTicket, InventoryItem, Challan, PosTransaction } from "@shared/schema";

export type CustomerSession = Omit<Customer, "password">;
export type OrderWithTimeline = ServiceRequest & { timeline: ServiceRequestEvent[] };
export type SafeUser = Omit<User, "password"> & { employmentStatus?: string };

export interface PaginationResult<T> {
    items: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        pages: number;
    };
}

// Admin API Types (Used in both admin and sometimes customer)
export interface OrderItem {
    id: string;
    orderId: string;
    productId: string;
    productName: string;
    variantId: string | null;
    variantName: string | null;
    quantity: number;
    price: string;
    total: string;
}

export interface SparePartOrder {
    id: string;
    orderId: string;
    brand: string;
    screenSize: string | null;
    modelNumber: string | null;
    primaryIssue: string | null;
    symptoms: string | null;
    description: string | null;
    images: string | null;
    fulfillmentType: string;
    pickupTier: string | null;
    pickupAddress: string | null;
    scheduledDate: string | null;
    verificationStatus: string | null;
    isCompatible: boolean | null;
    quotedServiceCharge: number | null;
    quotedAt: string | null;
    quoteAccepted: boolean | null;
    quoteAcceptedAt: string | null;
    tokenNumber: string | null;
    tokenExpiresAt: string | null;
    tokenStatus: string | null;
    tokenRedeemedAt: string | null;
    technicianId: string | null;
    installationNotes: string | null;
}

export interface Order {
    id: string;
    orderNumber: string | null;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    status: "Pending" | "Accepted" | "Processing" | "Shipped" | "Delivered" | "Declined" | "Cancelled" | "Pending Verification";
    paymentMethod: string;
    subtotal: string;
    total: string;
    declineReason: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    items?: OrderItem[];
    sparePartDetails?: SparePartOrder;
}

export interface ProductVariant {
    id: string;
    productId: string;
    variantName: string;
    price: string;
    stock: number;
    sku: string | null;
    createdAt: Date;
}

export interface AdminCustomer {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    address: string | null;
    isVerified: boolean | null;
    joinedAt: Date;
    totalOrders: number;
    totalServiceRequests: number;
}

export interface CustomerDetails extends AdminCustomer {
    orders: Order[];
    serviceRequests: ServiceRequest[];
}
