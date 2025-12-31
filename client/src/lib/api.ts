import type {
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
  User,
  InsertUser,
  ServiceRequest,
  InsertServiceRequest,
  Customer,
  ServiceRequestEvent,
  AttendanceRecord,
  ServiceCatalog,
  InsertServiceCatalog,
  PickupSchedule,
  InsertPickupSchedule,
  CustomerReview,
  InsertCustomerReview,
  Notification,
} from "@shared/schema";
import { API_BASE_URL, isNative } from "./config";
import { CapacitorHttp, HttpResponse } from '@capacitor/core';

export type CustomerSession = Omit<Customer, "password">;
export type OrderWithTimeline = ServiceRequest & { timeline: ServiceRequestEvent[] };

const API_BASE = `${API_BASE_URL}/api`;

class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = `${API_BASE}${url}`;
  console.log(`[API] Fetching: ${fullUrl}`);

  // Use CapacitorHttp on native platforms to bypass CORS/WebView restrictions
  if (isNative) {
    return nativeFetchApi<T>(fullUrl, options);
  }

  // Standard browser fetch for web
  const response = await fetch(fullUrl, {
    ...options,
    credentials: 'include',
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  console.log(`[API] Response status: ${response.status} ${response.statusText}`);

  // Get raw text first for debugging
  const rawText = await response.text();
  console.log(`[API] Raw response (first 200 chars): ${rawText.substring(0, 200)}`);

  if (!response.ok) {
    try {
      const errorData = JSON.parse(rawText);
      const apiError = new ApiError(errorData.error || "Request failed", errorData.code);
      throw apiError;
    } catch (parseError) {
      console.error(`[API] Failed to parse error response:`, rawText.substring(0, 500));
      throw new ApiError(`Request failed with status ${response.status}: ${rawText.substring(0, 100)}`);
    }
  }

  if (response.status === 204 || !rawText) {
    return null as T;
  }

  try {
    return JSON.parse(rawText);
  } catch (parseError) {
    console.error(`[API] Failed to parse JSON response:`, rawText.substring(0, 500));
    throw new ApiError(`Invalid JSON response: ${rawText.substring(0, 100)}`);
  }
}

// Native HTTP implementation using CapacitorHttp
async function nativeFetchApi<T>(fullUrl: string, options?: RequestInit): Promise<T> {
  const method = (options?.method?.toUpperCase() || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  let response: HttpResponse;

  const httpOptions = {
    url: fullUrl,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PromiseNativeApp/1.0',
      ...(options?.headers as Record<string, string> || {}),
    },
    connectTimeout: 15000,
    readTimeout: 15000,
  };

  try {
    if (method === 'GET') {
      response = await CapacitorHttp.get(httpOptions);
    } else if (method === 'POST') {
      response = await CapacitorHttp.post({
        ...httpOptions,
        data: options?.body ? JSON.parse(options.body as string) : undefined,
      });
    } else if (method === 'PUT') {
      response = await CapacitorHttp.put({
        ...httpOptions,
        data: options?.body ? JSON.parse(options.body as string) : undefined,
      });
    } else if (method === 'PATCH') {
      response = await CapacitorHttp.patch({
        ...httpOptions,
        data: options?.body ? JSON.parse(options.body as string) : undefined,
      });
    } else if (method === 'DELETE') {
      response = await CapacitorHttp.delete(httpOptions);
    } else {
      response = await CapacitorHttp.get(httpOptions);
    }
  } catch (err: any) {
    console.error(`[Native API] Request failed:`, err);
    throw new ApiError(err.message || 'Network request failed');
  }

  console.log(`[Native API] Response status: ${response.status}`);
  console.log(`[Native API] Response data:`, JSON.stringify(response.data).substring(0, 200));

  if (response.status >= 400) {
    const errorData = response.data;
    throw new ApiError(errorData?.error || `Request failed with status ${response.status}`, errorData?.code);
  }

  if (response.status === 204 || !response.data) {
    return null as T;
  }

  return response.data as T;
}

// Job Tickets API
export const jobTicketsApi = {
  getAll: () => fetchApi<JobTicket[]>("/job-tickets"),
  getOne: (id: string) => fetchApi<JobTicket>(`/job-tickets/${id}`),
  getNextNumber: () => fetchApi<{ nextNumber: string }>("/job-tickets/next-number"),
  create: (data: Partial<InsertJobTicket>) =>
    fetchApi<JobTicket>("/job-tickets", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertJobTicket>) =>
    fetchApi<JobTicket>(`/job-tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/job-tickets/${id}`, {
      method: "DELETE",
    }),
};

// Inventory API
export const inventoryApi = {
  getAll: () => fetchApi<InventoryItem[]>("/inventory"),
  getOne: (id: string) => fetchApi<InventoryItem>(`/inventory/${id}`),
  create: (data: InsertInventoryItem) =>
    fetchApi<InventoryItem>("/inventory", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertInventoryItem>) =>
    fetchApi<InventoryItem>(`/inventory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updateStock: (id: string, quantity: number) =>
    fetchApi<InventoryItem>(`/inventory/${id}/stock`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/inventory/${id}`, {
      method: "DELETE",
    }),
  getWebsiteItems: () => fetchApi<InventoryItem[]>("/shop/inventory"),
  bulkImport: (items: Partial<InsertInventoryItem>[]) =>
    fetchApi<{ imported: number; errors: string[] }>("/inventory/bulk-import", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
};

// Challans API
export const challansApi = {
  getAll: () => fetchApi<Challan[]>("/challans"),
  getOne: (id: string) => fetchApi<Challan>(`/challans/${id}`),
  create: (data: InsertChallan) =>
    fetchApi<Challan>("/challans", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertChallan>) =>
    fetchApi<Challan>(`/challans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/challans/${id}`, {
      method: "DELETE",
    }),
};

// Petty Cash API
export const pettyCashApi = {
  getAll: () => fetchApi<PettyCashRecord[]>("/petty-cash"),
  create: (data: InsertPettyCashRecord) =>
    fetchApi<PettyCashRecord>("/petty-cash", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/petty-cash/${id}`, {
      method: "DELETE",
    }),
};

// Due Records API
export const dueRecordsApi = {
  getAll: () => fetchApi<DueRecord[]>("/due-records"),
  create: (data: InsertDueRecord) =>
    fetchApi<DueRecord>("/due-records", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertDueRecord>) =>
    fetchApi<DueRecord>(`/due-records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/due-records/${id}`, {
      method: "DELETE",
    }),
};

// Products API
export const productsApi = {
  getAll: () => fetchApi<Product[]>("/products"),
  getOne: (id: string) => fetchApi<Product>(`/products/${id}`),
  create: (data: InsertProduct) =>
    fetchApi<Product>("/products", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertProduct>) =>
    fetchApi<Product>(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/products/${id}`, {
      method: "DELETE",
    }),
};

// Settings API
export const settingsApi = {
  getAll: () => fetchApi<Setting[]>("/settings"),
  getOne: (key: string) => fetchApi<Setting>(`/settings/${key}`),
  upsert: (data: InsertSetting) =>
    fetchApi<Setting>("/settings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// POS Transactions API
export const posTransactionsApi = {
  getAll: () => fetchApi<PosTransaction[]>("/pos-transactions"),
  getOne: (id: string) => fetchApi<PosTransaction>(`/pos-transactions/${id}`),
  create: (data: InsertPosTransaction) =>
    fetchApi<PosTransaction>("/pos-transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Users API
export const usersApi = {
  getAll: () => fetchApi<User[]>("/users"),
  getOne: (id: string) => fetchApi<User>(`/users/${id}`),
  create: (data: InsertUser) =>
    fetchApi<User>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertUser>) =>
    fetchApi<User>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Service Requests API
export const serviceRequestsApi = {
  getAll: () => fetchApi<ServiceRequest[]>("/service-requests"),
  getOne: (id: string) => fetchApi<ServiceRequest>(`/service-requests/${id}`),
  create: (data: InsertServiceRequest) =>
    fetchApi<ServiceRequest>("/service-requests", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertServiceRequest>) =>
    fetchApi<ServiceRequest>(`/service-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/service-requests/${id}`, {
      method: "DELETE",
    }),
};

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
};

// Customer Order Tracking API (for backwards compatibility)
export const customerOrdersApi = customerServiceRequestsApi;

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
};

// Admin User Types
export type SafeUser = Omit<User, "password">;

// Admin Users API
export const adminUsersApi = {
  getAll: () => fetchApi<SafeUser[]>("/admin/users"),
  create: (data: {
    username: string;
    name: string;
    email: string;
    password: string;
    role: "Super Admin" | "Manager" | "Cashier" | "Technician";
    permissions?: string;
  }) =>
    fetchApi<SafeUser>("/admin/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<{
    username: string;
    name: string;
    email: string;
    password: string;
    role: "Super Admin" | "Manager" | "Cashier" | "Technician";
    status: "Active" | "Inactive";
    permissions: string;
  }>) =>
    fetchApi<SafeUser>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/admin/users/${id}`, {
      method: "DELETE",
    }),
};

// Attendance API
export const attendanceApi = {
  getAll: () => fetchApi<AttendanceRecord[]>("/admin/attendance"),
  getByDate: (date: string) => fetchApi<AttendanceRecord[]>(`/admin/attendance/date/${date}`),
  getByUser: (userId: string) => fetchApi<AttendanceRecord[]>(`/admin/attendance/user/${userId}`),
  getToday: () => fetchApi<AttendanceRecord | null>("/admin/attendance/today"),
  checkIn: (notes?: string) =>
    fetchApi<AttendanceRecord>("/admin/attendance/check-in", {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  checkOut: () =>
    fetchApi<AttendanceRecord>("/admin/attendance/check-out", {
      method: "POST",
    }),
  getJobsByTechnician: (name: string) => fetchApi<JobTicket[]>(`/admin/jobs/technician/${encodeURIComponent(name)}`),
};

// Reports API
export interface ReportData {
  monthlyFinancials: { name: string; income: number; expense: number; repairs: number }[];
  technicianPerformance: { name: string; tasks: number; efficiency: number }[];
  activityLogs: { action: string; user: string; time: string; type: string }[];
  summary: { totalRevenue: number; totalRepairs: number; totalStaff: number };
}

export const reportsApi = {
  getData: (period: string) => fetchApi<ReportData>(`/admin/reports?period=${period}`),
};

// Order types
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

// Product Variants API
export interface ProductVariant {
  id: string;
  productId: string;
  variantName: string;
  price: string;
  stock: number;
  sku: string | null;
  createdAt: Date;
}

export const productVariantsApi = {
  getByProduct: (productId: string) => fetchApi<ProductVariant[]>(`/products/${productId}/variants`),
  create: (productId: string, data: { variantName: string; price: string; stock: number; sku?: string }) =>
    fetchApi<ProductVariant>(`/admin/products/${productId}/variants`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (productId: string, variantId: string, data: Partial<{ variantName: string; price: string; stock: number; sku?: string }>) =>
    fetchApi<ProductVariant>(`/admin/products/${productId}/variants/${variantId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (productId: string, variantId: string) =>
    fetchApi<void>(`/admin/products/${productId}/variants/${variantId}`, {
      method: "DELETE",
    }),
  deleteAll: (productId: string) =>
    fetchApi<void>(`/admin/products/${productId}/variants`, {
      method: "DELETE",
    }),
};

// Admin Orders API
export const adminOrdersApi = {
  getAll: () => fetchApi<Order[]>("/admin/orders"),
  getOne: (id: string) => fetchApi<Order>(`/admin/orders/${id}`),
  update: (id: string, data: { status?: string; declineReason?: string; notes?: string }) =>
    fetchApi<Order>(`/admin/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  accept: (id: string) =>
    fetchApi<Order>(`/admin/orders/${id}/accept`, {
      method: "POST",
    }),
  decline: (id: string, reason?: string) =>
    fetchApi<Order>(`/admin/orders/${id}/decline`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

// Admin Customers API
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

export const adminCustomersApi = {
  getAll: () => fetchApi<AdminCustomer[]>("/admin/customers"),
  getOne: (id: string) => fetchApi<CustomerDetails>(`/admin/customers/${id}`),
  update: (id: string, data: { name?: string; email?: string; phone?: string; address?: string; isVerified?: boolean }) =>
    fetchApi<AdminCustomer>(`/admin/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/admin/customers/${id}`, {
      method: "DELETE",
    }),
};

// Customer Shop Orders API (for placing orders and viewing order history)
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

// Service Catalog API (public)
export const serviceCatalogApi = {
  getAll: () => fetchApi<ServiceCatalog[]>("/services"),
  getOne: (id: string) => fetchApi<ServiceCatalog>(`/services/${id}`),
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

// Admin Service Catalog API
export const adminServiceCatalogApi = {
  getAll: () => fetchApi<ServiceCatalog[]>("/admin/services"),
  create: (data: InsertServiceCatalog) =>
    fetchApi<ServiceCatalog>("/admin/services", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<InsertServiceCatalog>) =>
    fetchApi<ServiceCatalog>(`/admin/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/admin/services/${id}`, {
      method: "DELETE",
    }),
};

// Admin Quote Requests API
export const adminQuotesApi = {
  getAll: () => fetchApi<ServiceRequest[]>("/admin/quotes"),
  updatePrice: (id: string, data: { quoteAmount: number; quoteNotes?: string }) =>
    fetchApi<ServiceRequest>(`/admin/quotes/${id}/price`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// Admin Stage Transitions API
export const adminStageApi = {
  getNextStages: (id: string) =>
    fetchApi<{ currentStage: string; validNextStages: string[]; stageFlow: string[] }>(`/admin/service-requests/${id}/next-stages`),
  transitionStage: (id: string, data: { stage: string; actorName?: string }) =>
    fetchApi<ServiceRequest>(`/admin/service-requests/${id}/transition-stage`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateExpectedDates: (id: string, data: {
    expectedPickupDate?: string | null;
    expectedReturnDate?: string | null;
    expectedReadyDate?: string | null;
  }) =>
    fetchApi<ServiceRequest>(`/admin/service-requests/${id}/expected-dates`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// Service Categories API
export interface ServiceCategory {
  id: string;
  name: string;
  displayOrder: number | null;
  createdAt: string;
}

export const serviceCategoriesApi = {
  getAll: () => fetchApi<ServiceCategory[]>("/service-categories"),
  create: (data: { name: string; displayOrder?: number }) =>
    fetchApi<ServiceCategory>("/admin/service-categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; displayOrder?: number }) =>
    fetchApi<ServiceCategory>(`/admin/service-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/admin/service-categories/${id}`, {
      method: "DELETE",
    }),
};

// Admin Pickup Schedules API
export const adminPickupsApi = {
  getAll: (status?: string) => fetchApi<PickupSchedule[]>(status ? `/admin/pickups?status=${status}` : "/admin/pickups"),
  getPending: () => fetchApi<PickupSchedule[]>("/admin/pickups/pending"),
  update: (id: string, data: Partial<PickupSchedule>) =>
    fetchApi<PickupSchedule>(`/admin/pickups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  updateStatus: (id: string, status: string) =>
    fetchApi<PickupSchedule>(`/admin/pickups/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// Customer Pickup Schedule API
export const pickupScheduleApi = {
  getByServiceRequest: (serviceRequestId: string) =>
    fetchApi<PickupSchedule>(`/pickups/by-request/${serviceRequestId}`),
};

// Policies API
export interface Policy {
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  isPublishedApp: boolean;
  lastUpdated: string | null;
}

export const policiesApi = {
  getAll: () => fetchApi<Policy[]>("/admin/policies"),
  save: (data: { slug: string; title: string; content: string; isPublished: boolean; isPublishedApp: boolean }) =>
    fetchApi<Policy>("/admin/policies", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (slug: string) =>
    fetchApi<void>(`/admin/policies/${slug}`, {
      method: "DELETE",
    }),
};

// Customer Reviews API (public)
export const reviewsApi = {
  getApproved: () => fetchApi<CustomerReview[]>("/reviews"),
  submit: (data: { rating: number; title?: string; content: string }) =>
    fetchApi<CustomerReview>("/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// Admin Reviews API
export const adminReviewsApi = {
  getAll: () => fetchApi<CustomerReview[]>("/admin/reviews"),
  toggleApproval: (id: string, isApproved: boolean) =>
    fetchApi<CustomerReview>(`/admin/reviews/${id}/approval`, {
      method: "PATCH",
      body: JSON.stringify({ isApproved }),
    }),
  delete: (id: string) =>
    fetchApi<void>(`/admin/reviews/${id}`, {
      method: "DELETE",
    }),
};

// AI API
export const aiApi = {
  suggestTechnician: (jobDescription: string) =>
    fetchApi<{ technicianId: string; reason: string } | null>("/ai/suggest-tech", {
      method: "POST",
      body: JSON.stringify({ jobDescription }),
    }),
  inspectImage: (base64Image: string) =>
    fetchApi<{ component: string; damage: string[]; likelyCause: string; severity: string } | null>("/ai/inspect", {
      method: "POST",
      body: JSON.stringify({ image: base64Image }),
    }),
  chat: (message: string, history: any[], image?: string) =>
    fetchApi<{ text: string; booking: any | null; ticketData?: any; error?: boolean; errorCode?: string }>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, history, image }),
    }),
};

// Camera Lens API
export const lensApi = {
  identifyPart: (image: string) =>
    fetchApi<{ label: string; confidence: number; partInfo?: any; rawText?: string }>("/lens/identify", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),
  assessDamage: (image: string) =>
    fetchApi<{ damage: string[]; rawText?: string }>("/lens/assess", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),
  readBarcode: (image: string) =>
    fetchApi<{ barcode: string; partInfo?: any }>("/lens/barcode", {
      method: "POST",
      body: JSON.stringify({ image }),
    }),
};

// Notifications API
export const notificationsApi = {
  getAll: () => fetchApi<Notification[]>("/notifications"),
  markAsRead: (id: string) =>
    fetchApi<Notification>(`/notifications/${id}/read`, {
      method: "PATCH",
    }),
  markAllAsRead: () =>
    fetchApi<{ message: string }>("/notifications/read-all", {
      method: "PATCH",
    }),
};
