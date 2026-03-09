# Admin Panel PRD - Promise Integrated System
> **Version:** 2.0 (Mirror-Finish)  
> **Last Updated:** February 3, 2026  
> **Status:** Production Ready  
> **Purpose:** Complete specification enabling exact system reconstruction

---

## 1. Executive Summary

The **Promise Integrated System Admin Panel** is the operational command center for **Promise Electronics**, a TV repair and electronics retail business in Bangladesh. This React-based web application provides real-time business management capabilities including:

- **AI-Assisted Job Management** with automatic technician suggestions
- **Integrated Point of Sale (POS)** with cross-module billing
- **Multi-Stage Service Request Pipeline** with customer-facing tracking
- **Complete Financial Ledger** (Sales, Petty Cash, Credit/Due Management)
- **E-commerce Order Management** with shop inventory sync
- **Staff Management & Attendance** with granular role-based permissions
- **Mobile App CMS** for controlling the Flutter customer app

### Key Differentiators
- Real-time updates via **Server-Sent Events (SSE)**
- Dual thermal/A4 printing support
- Automatic QR code generation for job tracking
- Warranty calculation engine with automatic expiry dates

---

## 2. Platform Architecture

### 2.1 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Runtime** | Node.js | 20.x+ | ES Modules server environment |
| **Language** | TypeScript | 5.6.3 | Type safety across full stack |
| **Frontend** | React | 19.2.0 | UI framework with hooks |
| **Build Tool** | Vite | 7.1.9+ | Fast dev server & bundler |
| **Routing** | Wouter | 3.3.5 | Lightweight client routing |
| **State** | TanStack Query | 5.60.5 | Server state & caching |
| **Backend** | Express | 4.21.2 | HTTP server & API routes |
| **Database** | PostgreSQL | 15+ | Primary data store (Neon cloud) |
| **ORM** | Drizzle | 0.39.1 | Type-safe database queries |
| **Styling** | TailwindCSS | 4.1.14 | Utility-first CSS |
| **Components** | Radix UI + shadcn/ui | Various | Headless accessible components |
| **Real-time** | SSE (native) | - | Live status updates |
| **Animations** | Framer Motion | 12.23.24 | UI transitions |
| **Charts** | Recharts | 2.15.4 | Data visualization |
| **Forms** | React Hook Form | 7.66.0 | Form management |
| **Validation** | Zod | 3.25.76 | Schema validation |
| **Date Utils** | date-fns | 3.6.0 | Date formatting/manipulation |
| **Toasts** | Sonner | 2.0.7 | Notifications |

### 2.2 Project Structure

```
PromiseIntegratedSystem/
├── client/                          # Frontend React application
│   └── src/
│       ├── components/              # Reusable UI components
│       │   ├── layout/              # Admin shell, sidebar, header
│       │   ├── ui/                  # Shadcn/ui primitives (56 files)
│       │   ├── print/               # Invoice, Receipt templates
│       │   └── *.tsx                # Feature components
│       ├── contexts/                # React contexts (7 total)
│       │   ├── AdminAuthContext.tsx
│       │   ├── AdminSSEContext.tsx
│       │   ├── CartContext.tsx
│       │   └── CustomerAuthContext.tsx
│       ├── hooks/                   # Custom React hooks
│       ├── lib/                     # Utilities & API client
│       │   ├── api.ts               # API layer (typed endpoints)
│       │   └── queryClient.ts       # TanStack Query config
│       ├── pages/
│       │   ├── admin/               # Admin panel pages (20 files)
│       │   └── *.tsx                # Customer portal pages
│       └── App.tsx                  # Main router
│
├── server/                          # Backend Express application
│   ├── routes/                      # Modular API routes (24 files)
│   │   ├── middleware/              # Auth, SSE, validation (6 files)
│   │   ├── auth.routes.ts
│   │   ├── jobs.routes.ts
│   │   ├── pos.routes.ts
│   │   └── ... (21 more route files)
│   ├── repositories/               # Data access layer
│   ├── services/                   # Business logic layer
│   ├── storage.ts                  # Legacy data layer (~77KB)
│   ├── app.ts                      # Express configuration
│   └── index.ts                    # Server entry point
│
├── shared/                          # Shared code (server & client)
│   ├── schema.ts                   # Drizzle schema & Zod validators
│   └── constants.ts                # Enums, status flows, constants
│
└── Configuration Files
    ├── .env                        # Environment variables
    ├── drizzle.config.ts           # Database migrations
    ├── vite.config.ts              # Build configuration
    └── package.json                # Dependencies & scripts
```

### 2.3 Admin Pages Inventory

| Page | File | Size | Description |
|------|------|------|-------------|
| Login | `login.tsx` | 5KB | Admin authentication |
| Dashboard | `dashboard.tsx` | 8KB | Quick overview with SSE live data |
| Overview | `overview.tsx` | 16KB | Business metrics & charts |
| Jobs | `jobs.tsx` | 66KB | Job ticket CRUD, AI tech suggestion |
| Service Requests | `service-requests.tsx` | 95KB | Multi-stage pipeline management |
| Inventory | `inventory.tsx` | 76KB | Products, services, spare parts |
| POS | `pos.tsx` | 69KB | Point of sale with printing |
| Finance | `finance.tsx` | 59KB | Sales, petty cash, due records |
| Orders | `orders.tsx` | 29KB | E-commerce order management |
| Challans | `challan.tsx` | 40KB | Delivery documents |
| Customers | `customers.tsx` | 28KB | Customer database |
| Users | `users.tsx` | 31KB | Staff management |
| Settings | `settings.tsx` | 181KB | Comprehensive configuration |
| Mobile App Settings | `mobile-app-settings.tsx` | 32KB | Flutter app CMS |
| Reports | `reports.tsx` | 17KB | Business analytics |
| Staff Attendance | `staff-attendance.tsx` | 15KB | Check-in/out tracking |
| Pickup Schedule | `pickup-schedule.tsx` | 27KB | Pickup/delivery management |
| Inquiries | `inquiries.tsx` | 11KB | Contact form submissions |
| Technician Dashboard | `technician-dashboard.tsx` | 12KB | Tech-specific view |
| System Health | `system-health.tsx` | 9KB | Server monitoring |

---

## 3. Database Schema

### 3.1 Core Tables (31 Total)

#### User & Authentication
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Staff & customers | id, username, email, phone, role, permissions, googleSub |
| `user_sessions` | PostgreSQL session store | sid, sess, expire |
| `device_tokens` | Push notification tokens | userId, token, platform, isActive |
| `attendance_records` | Staff check-in/out | userId, checkInTime, checkOutTime, date |

#### Job Management
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `job_tickets` | Repair job tickets | id, customer, device, issue, status, technician, estimatedCost, warranty dates |
| `service_requests` | Customer service intake | id, ticketNumber, brand, stage, quoteStatus, customerId |
| `service_request_events` | Timeline events | serviceRequestId, status, message, actor, occurredAt |
| `pickup_schedules` | Pickup/delivery scheduling | serviceRequestId, tier, scheduledDate, assignedStaff |

#### Inventory & Catalog
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `inventory_items` | Products & services | id, name, category, itemType, stock, price, showOnWebsite |
| `service_catalog` | Service offerings | id, name, category, minPrice, maxPrice, features |
| `service_categories` | Service groupings | id, name, displayOrder |
| `products` | E-commerce products | id, name, price, category, image, rating |
| `product_variants` | Product variations | productId, variantName, price, stock, sku |

#### Financial
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `pos_transactions` | Point of sale records | id, invoiceNumber, items, linkedJobs, total, paymentMethod |
| `petty_cash_records` | Daily income/expense | id, description, category, amount, type |
| `due_records` | Credit/due payments | id, customer, amount, paidAmount, status |

#### E-commerce
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `orders` | Shop orders | id, orderNumber, customerId, status, paymentMethod, total |
| `order_items` | Order line items | orderId, productId, variantId, quantity, price |
| `spare_part_orders` | Parts orders with verification | orderId, brand, verificationStatus, tokenNumber |

#### Delivery & Logistics
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `challans` | Delivery documents | id, receiver, type, status, lineItems, vehicleNo |

#### Customer Engagement
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `customer_reviews` | Customer feedback | customerId, rating, content, isApproved |
| `inquiries` | Contact form messages | id, name, phone, message, status, reply |
| `notifications` | User notifications | userId, title, message, type, read |
| `customer_addresses` | Saved addresses | customerId, label, address, isDefault |

#### Configuration
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `settings` | App configuration | key, value |
| `policies` | Legal policies | slug, title, content, isPublished |

#### AI & Analytics
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `ai_insights` | AI-generated insights | type, title, content, severity |
| `diagnosis_training_data` | ML training data | jobId, aiPrediction, actualIssue, wasAccurate |
| `ai_query_log` | AI usage tracking | userId, queryType, wasSuccessful |
| `audit_logs` | Action audit trail | userId, action, entity, changes, severity |

### 3.2 Key Enumerations (from `shared/constants.ts`)

```typescript
// Job Management
JOB_STATUSES = ["Pending", "In Progress", "Completed", "Cancelled"]
JOB_PRIORITIES = ["Low", "Medium", "High"]

// Payment & Finance
PAYMENT_METHODS = ["Cash", "Bank", "bKash", "Nagad", "Due"]
PAYMENT_STATUSES = ["Paid", "Due"]
DUE_STATUSES = ["Pending", "Overdue", "Paid"]

// User Roles
USER_ROLES = ["Super Admin", "Manager", "Cashier", "Technician", "Customer"]

// Service Request Pipeline
REQUEST_STAGES = [
  "intake", "assessment", "awaiting_customer", "authorized",
  "pickup_scheduled", "picked_up", "awaiting_dropoff", "device_received",
  "in_repair", "ready", "out_for_delivery", "completed", "closed"
]
QUOTE_STATUSES = ["Pending", "Quoted", "Accepted", "Declined", "Converted", "Expired"]
REQUEST_INTENTS = ["quote", "repair"]
SERVICE_MODES = ["pickup", "service_center"]

// Pickup & Tracking
PICKUP_TIERS = ["Regular", "Priority", "Emergency"]
TRACKING_STATUSES = [
  "Request Received", "Arriving to Receive", "Awaiting Drop-off", "Queued",
  "Received", "Technician Assigned", "Diagnosis Completed", "Parts Pending",
  "Repairing", "Ready for Delivery", "Delivered", "Cancelled"
]

// Orders & Inventory
ORDER_STATUSES = ["Pending", "Accepted", "Processing", "Shipped", "Delivered", "Declined", "Cancelled"]
STOCK_STATUSES = ["In Stock", "Low Stock", "Out of Stock"]
ITEM_TYPES = ["product", "service"]

// Challans
CHALLAN_STATUSES = ["Pending", "Delivered", "Received"]
CHALLAN_TYPES = ["Corporate", "Customer", "Transfer"]

// TV-Specific Constants
TV_BRANDS = [
  "Sony", "Samsung", "LG", "Walton", "Singer", "Vision", "Minister",
  "MyOne", "Jamuna", "Haier", "Hisense", "TCL", "Panasonic", "Xiaomi",
  "Videocon", "General", "Sharp", "Toshiba", "Philips", "Hitachi",
  "Rangs", "Konka", "Nova", "Other"
]
ISSUE_TYPES = [
  "Display Issue", "Power Issue", "Sound Issue", "Connectivity Issue",
  "Physical Damage", "Software Issue", "Remote Issue", "Other"
]
```

---

## 4. Core Modules & Granular Features

### 4.1 Job Management (TV Daktar / Repair Service)

The core operational module managing the complete repair lifecycle.

#### Features
- **Create Job Ticket**: Customer info, device details (brand, screen size, serial), issue description
- **AI Technician Suggestion**: "Sparkles" feature analyzes issue and suggests best technician with reasoning
- **Corporate Job Number**: Optional secondary tracking ID for B2B clients
- **QR Code Generation**: Automatic QR linking to public tracking page
- **Print Templates**: Thermal (80mm) and A4 job sheets with all details
- **Warranty Logic**: When job marked "Completed":
  - Auto-calculates `serviceExpiryDate` = completedAt + serviceWarrantyDays
  - Auto-calculates `partsExpiryDate` = completedAt + partsWarrantyDays

#### Job Ticket Fields
```typescript
interface JobTicket {
  id: string;                    // UUID
  corporateJobNumber?: string;   // Optional corporate reference
  customer: string;              // Customer name (required)
  customerPhone?: string;
  customerAddress?: string;
  device: string;                // Device description (required)
  tvSerialNumber?: string;
  issue: string;                 // Problem description (required)
  status: "Pending" | "In Progress" | "Completed" | "Cancelled";
  priority: "Low" | "Medium" | "High";
  technician: string;            // Default: "Unassigned"
  screenSize?: string;           // e.g., "32", "43", "55"
  estimatedCost?: number;
  deadline?: Date;
  notes?: string;
  aiDiagnosis?: object;          // AI analysis results
  serviceWarrantyDays?: number;
  serviceExpiryDate?: Date;
  partsWarrantyDays?: number;
  partsExpiryDate?: Date;
  warrantyTermsAccepted?: boolean;
  parentJobId?: string;          // For repeat jobs
  createdAt: Date;
  completedAt?: Date;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/job-tickets` | Admin | List all jobs (paginated, filterable) |
| GET | `/api/job-tickets/next-number` | Admin | Get next sequential job ID |
| GET | `/api/job-tickets/:id` | Admin | Get single job details |
| POST | `/api/job-tickets` | Admin | Create new job |
| PATCH | `/api/job-tickets/:id` | Admin | Update job |
| DELETE | `/api/job-tickets/:id` | Admin | Delete job |
| GET | `/api/job-tickets/track/:id` | Public | Public tracking page data |

---

### 4.2 Point of Sale (POS) & Checkout

Highly integrated checkout system for products and services.

#### Features
- **Cross-Module Integration**:
  - Link "Completed" jobs for service billing
  - Pull products directly from inventory
  - Inventory stock auto-decrements on sale
- **Customer Directory**: Searchable by Name, Phone, or Email with auto-fill
- **Service Item Selection**: For linked jobs, select from service catalog with min/max price validation
- **Financial Rules**:
  - VAT/Tax rate from Global Settings
  - Currency symbol from Global Settings
- **Payment Methods**: Cash, Bank, bKash, Nagad, and Due (Credit)
- **Dual Print Support**:
  - A4 Invoice (full detail)
  - Thermal Receipt (80mm, condensed)
- **Transaction History**: View, reprint past transactions

#### POS Transaction Structure
```typescript
interface POSTransaction {
  id: string;
  invoiceNumber: string;         // Auto-generated: INV-YYYYMMDD-XXX
  customer?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: CartItem[];             // Products with quantities
  linkedJobs: LinkedJobCharge[]; // Completed jobs being billed
  subtotal: number;
  tax: number;
  taxRate: number;               // From settings (default 5%)
  discount: number;
  total: number;
  paymentMethod: "Cash" | "Bank" | "bKash" | "Nagad" | "Due";
  paymentStatus: "Paid" | "Due";
  createdAt: Date;
}

interface LinkedJobCharge {
  jobId: string;
  serviceItemId: string | null;
  serviceItemName: string | null;
  billedAmount: number;          // Must be within service min/max range
  customerName?: string;
  customerPhone?: string;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/pos-transactions` | Admin | List all transactions |
| GET | `/api/pos-transactions/:id` | Admin | Get single transaction |
| POST | `/api/pos-transactions` | Admin | Create transaction (checkout) |

---

### 4.3 Finance & Accounts (The Ledger)

Three-tabbed financial management system.

#### Tab 1: Sales
- List all POS transactions
- Filter by date range, payment method
- Payment method breakdown summary
- Export to CSV

#### Tab 2: Petty Cash
- Daily Income and Expense entries
- Categories: Food, Transport, Supplies, Utilities, Other
- Running balance calculation
- Date-based filtering

```typescript
interface PettyCashRecord {
  id: string;
  description: string;
  category: string;
  amount: number;
  type: "Income" | "Expense";
  dueRecordId?: string;         // Link if from due payment
  createdAt: Date;
}
```

#### Tab 3: Due Records
- Track customer credit/debt
- Partial payment support ("Settle Payment" workflow)
- Payment history tracking
- Status progression: Pending → Overdue (if past dueDate) → Paid

```typescript
interface DueRecord {
  id: string;
  customer: string;
  amount: number;                // Total owed
  paidAmount: number;            // Amount received so far
  status: "Pending" | "Overdue" | "Paid";
  invoice: string;               // Reference POS invoice
  dueDate: Date;
  paidAt?: Date;                 // When fully paid
  createdAt: Date;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/petty-cash` | Admin | List petty cash records |
| POST | `/api/petty-cash` | Admin | Create entry |
| DELETE | `/api/petty-cash/:id` | Admin | Delete entry |
| GET | `/api/due-records` | Admin | List all dues |
| PATCH | `/api/due-records/:id` | Admin | Update/settle due |

---

### 4.4 Service Request & Quotes Pipeline

Multi-stage intake system managing customer requests from submission to completion.

#### Stage Flow Variants

**Quote + Pickup Flow:**
```
intake → assessment → awaiting_customer → authorized → pickup_scheduled → 
picked_up → in_repair → ready → out_for_delivery → completed → closed
```

**Quote + Service Center Flow:**
```
intake → assessment → awaiting_customer → authorized → awaiting_dropoff → 
device_received → in_repair → ready → completed → closed
```

**Direct Repair + Pickup Flow:**
```
intake → assessment → authorized → pickup_scheduled → picked_up → 
in_repair → ready → out_for_delivery → completed → closed
```

**Direct Repair + Service Center Flow:**
```
intake → assessment → authorized → awaiting_dropoff → device_received → 
in_repair → ready → completed → closed
```

#### Features
- **Quote Engine**: Admin sets price, customer accepts/declines via link
- **Automatic Job Conversion**: When stage reaches `picked_up` or `device_received`, auto-create JobTicket
- **Expected Date Tracking**: Set estimated pickup, return, and ready dates
- **Media Attachments**: Photos/videos of device condition
- **Customer Tracking Page**: Real-time status visible via ticket number

```typescript
interface ServiceRequest {
  id: string;
  ticketNumber: string;          // Auto: SR-YYYYMMDD-XXX
  customerId?: string;           // Linked customer account
  
  // Device Info
  brand: string;
  screenSize?: string;
  modelNumber?: string;
  primaryIssue: string;
  symptoms?: string;             // JSON array
  description?: string;
  mediaUrls?: string;            // JSON array of URLs
  
  // Customer Contact
  customerName: string;
  phone: string;
  address?: string;
  
  // Request Configuration
  requestIntent: "quote" | "repair";
  serviceMode: "pickup" | "service_center";
  servicePreference?: string;
  
  // Stage Tracking
  stage: string;                 // Current pipeline stage
  status: "Pending" | "Reviewed" | "Converted" | "Closed";
  trackingStatus: string;        // Customer-facing status text
  
  // Quote Fields
  isQuote: boolean;
  serviceId?: string;
  quoteStatus?: "Pending" | "Quoted" | "Accepted" | "Declined" | "Converted" | "Expired";
  quoteAmount?: number;
  quoteNotes?: string;
  quotedAt?: Date;
  quoteExpiresAt?: Date;
  acceptedAt?: Date;
  
  // Pickup Fields
  pickupTier?: "Regular" | "Priority" | "Emergency";
  pickupCost?: number;
  totalAmount?: number;
  scheduledPickupDate?: Date;
  expectedPickupDate?: Date;
  expectedReturnDate?: Date;
  expectedReadyDate?: Date;
  
  // Conversion
  convertedJobId?: string;       // Link to created JobTicket
  
  createdAt: Date;
  expiresAt?: Date;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/service-requests` | Admin | List all requests |
| GET | `/api/service-requests/:id` | Admin | Get single request |
| POST | `/api/service-requests` | Public | Create new request |
| PATCH | `/api/service-requests/:id` | Admin | Update request |
| DELETE | `/api/service-requests/:id` | Admin | Delete request |
| GET | `/api/admin/service-requests/:id/next-stages` | Admin | Get valid next stages |
| POST | `/api/admin/service-requests/:id/transition-stage` | Admin | Move to next stage |
| PUT | `/api/admin/service-requests/:id/expected-dates` | Admin | Set expected dates |

---

### 4.5 Inventory & Service Catalog

Dual-nature inventory managing both physical products and service offerings.

#### Item Types
1. **Products** (Stock-based):
   - Physical items with stock count
   - Low stock threshold alerts
   - Show on Website/App toggles
   - Hot Deals support with special pricing

2. **Services** (Price-range based):
   - Min/Max price range
   - Estimated time
   - "What's Included" feature list
   - Category grouping

```typescript
interface InventoryItem {
  id: string;
  name: string;
  category: string;
  description?: string;
  itemType: "product" | "service";
  
  // Product-specific
  stock: number;
  lowStockThreshold: number;     // Default: 5
  status: "In Stock" | "Low Stock" | "Out of Stock";
  
  // Pricing
  price: number;                 // For products / base for services
  minPrice?: number;             // Service only
  maxPrice?: number;             // Service only
  
  // Visibility
  showOnWebsite: boolean;
  showOnAndroidApp: boolean;
  showOnHotDeals: boolean;
  hotDealPrice?: number;
  
  // Display
  images?: string;               // JSON array of URLs
  icon?: string;
  displayOrder: number;
  features?: string;             // JSON array of feature strings
  estimatedDays?: string;        // "1-2 days", "Same day"
  isSparePart: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}
```

#### Service Categories
```typescript
interface ServiceCategory {
  id: string;
  name: string;
  displayOrder: number;
  createdAt: Date;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/inventory` | Admin | List all items |
| GET | `/api/inventory/:id` | Admin | Get single item |
| POST | `/api/inventory` | Admin | Create item |
| PATCH | `/api/inventory/:id` | Admin | Update item |
| PATCH | `/api/inventory/:id/stock` | Admin | Quick stock update |
| DELETE | `/api/inventory/:id` | Admin | Delete item |
| POST | `/api/inventory/bulk-import` | Admin | Bulk import from CSV |
| GET | `/api/shop/inventory` | Public | Public shop items |
| GET | `/api/services` | Public | Public service catalog |
| GET | `/api/admin/services` | Admin | Admin service list |
| POST | `/api/admin/services` | Admin | Create service |
| PATCH | `/api/admin/services/:id` | Admin | Update service |
| DELETE | `/api/admin/services/:id` | Admin | Delete service |
| GET | `/api/service-categories` | Public | List categories |
| POST | `/api/admin/service-categories` | Admin | Create category |
| PATCH | `/api/admin/service-categories/:id` | Admin | Update category |
| DELETE | `/api/admin/service-categories/:id` | Admin | Delete category |

---

### 4.6 E-commerce Order Management

Full order lifecycle management for the online shop.

```typescript
interface Order {
  id: string;
  orderNumber: string;           // Auto: ORD-YYYYMMDD-XXX
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  status: "Pending" | "Accepted" | "Processing" | "Shipped" | "Delivered" | "Declined" | "Cancelled";
  paymentMethod: "COD" | "bKash" | "Nagad" | "Bank";
  subtotal: number;
  total: number;
  declineReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItem[];
}

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  price: number;
  total: number;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/orders` | Admin | List all orders |
| GET | `/api/admin/orders/:id` | Admin | Get order details |
| PATCH | `/api/admin/orders/:id` | Admin | Update order |
| POST | `/api/admin/orders/:id/accept` | Admin | Accept order |
| POST | `/api/admin/orders/:id/decline` | Admin | Decline with reason |

---

### 4.7 Challans (Delivery Documents)

Internal/external delivery tracking documents.

```typescript
interface Challan {
  id: string;
  receiver: string;
  type: "Corporate" | "Customer" | "Transfer";
  status: "Pending" | "Delivered" | "Received";
  items: number;                 // Item count
  lineItems?: string;            // JSON array of item details
  receiverAddress?: string;
  receiverPhone?: string;
  vehicleNo?: string;
  driverName?: string;
  driverPhone?: string;
  gatePassNo?: string;
  notes?: string;
  createdAt: Date;
  deliveredAt?: Date;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/challans` | Admin | List all challans |
| GET | `/api/challans/:id` | Admin | Get single challan |
| POST | `/api/challans` | Admin | Create challan |
| PATCH | `/api/challans/:id` | Admin | Update challan |
| DELETE | `/api/challans/:id` | Admin | Delete challan |

---

### 4.8 Mobile App Control Center (Flutter CMS)

Dedicated content management for the Android customer application.

#### Hero Carousel
- Multiple slides with custom titles and images
- Link actions (Shop, Service, Quote, etc.)
- Order control

#### Announcements Banner
- Banner strips with types: Info, Success, Warning, Urgent
- Tap actions configurable
- Dismissible toggle

#### Promotional Popup
- "Daraz-style" full-screen promotional modal
- "Show Once Per Session" toggle
- Custom image and CTA

#### App Versioning & Maintenance
- **Maintenance Mode**: Remote toggle to disable app
- **Minimum Version Required**: Force-update threshold
- Push notification composer

---

### 4.9 Staff Attendance

```typescript
interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  checkInTime: Date;
  checkOutTime?: Date;
  date: string;                  // YYYY-MM-DD format
  notes?: string;
}
```

#### API Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/attendance` | Admin | List all records |
| GET | `/api/admin/attendance/date/:date` | Admin | Records by date |
| GET | `/api/admin/attendance/user/:userId` | Admin | Records by user |
| GET | `/api/admin/attendance/today` | Admin | Current user's today |
| POST | `/api/admin/attendance/check-in` | Admin | Check in |
| POST | `/api/admin/attendance/check-out` | Admin | Check out |

---

## 5. User Control & Permissions

### 5.1 Role Definitions

| Role | Access Level | Primary Use Case |
|------|--------------|------------------|
| **Super Admin** | Full system access + user management | Business owner |
| **Manager** | Operations without settings | Store manager |
| **Cashier** | POS + limited views | Front desk |
| **Technician** | My Jobs + updates only | Repair staff |

### 5.2 Permission Matrix

```typescript
interface UserPermissions {
  // Module Access
  dashboard?: boolean;
  jobs?: boolean;
  inventory?: boolean;
  pos?: boolean;
  challans?: boolean;
  finance?: boolean;
  attendance?: boolean;
  reports?: boolean;
  serviceRequests?: boolean;
  orders?: boolean;
  technician?: boolean;
  inquiries?: boolean;
  systemHealth?: boolean;
  users?: boolean;
  settings?: boolean;
  
  // Actions
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canExport?: boolean;
  canViewFullJobDetails?: boolean;
  canPrintJobTickets?: boolean;
}
```

### 5.3 Default Permissions by Role

| Permission | Super Admin | Manager | Cashier | Technician |
|------------|:-----------:|:-------:|:-------:|:----------:|
| dashboard | ✓ | ✓ | ✓ | ✓ |
| jobs | ✓ | ✓ | View | My Jobs |
| inventory | ✓ | ✓ | View | - |
| pos | ✓ | ✓ | ✓ | - |
| challans | ✓ | ✓ | - | - |
| finance | ✓ | ✓ | - | - |
| attendance | ✓ | ✓ | Self | Self |
| reports | ✓ | ✓ | - | - |
| serviceRequests | ✓ | ✓ | - | Update |
| orders | ✓ | ✓ | ✓ | - |
| technician | ✓ | ✓ | - | ✓ |
| inquiries | ✓ | ✓ | - | - |
| systemHealth | ✓ | - | - | - |
| users | ✓ | - | - | - |
| settings | ✓ | - | - | - |
| canCreate | ✓ | ✓ | POS | - |
| canEdit | ✓ | ✓ | - | Jobs |
| canDelete | ✓ | - | - | - |
| canExport | ✓ | ✓ | - | - |
| canPrintJobTickets | ✓ | ✓ | - | ✓ |

---

## 6. Global Settings & Configuration

### 6.1 Core Settings Keys

| Key | Type | Description | Example |
|-----|------|-------------|---------|
| `siteName` | string | Business name | "Promise Electronics" |
| `siteLogoUrl` | string | Logo image URL | "https://..." |
| `supportPhone` | string | Primary contact | "+880-XXX-XXXXXXX" |
| `supportEmail` | string | Support email | "support@..." |
| `currency` | string | Currency symbol | "৳" |
| `vatPercentage` | number | Tax rate | 5 |
| `tvInches` | array | Screen size options | ["24", "32", "43"...] |
| `shopCategories` | array | Shop filter cats | ["TV", "Parts"...] |
| `serviceFilterCategories` | array | Service filters | ["Screen", "Power"...] |
| `notificationTone` | string | Alert sound | "default" |
| `developerMode` | boolean | Debug features | false |
| `warrantyPolicy` | object | Default warranties | {serviceDays, partsDays} |

### 6.2 Homepage & Website Settings

Comprehensive CMS for the customer-facing website:
- Hero carousel slides
- Info boxes (feature highlights)
- Statistics display
- Team members
- FAQ items
- Contact information
- Section visibility toggles
- Problem-based navigation items
- Before/After gallery items
- Pricing table items
- Brand logos

### 6.3 Policies Management

| Policy Slug | Default Title |
|-------------|---------------|
| `privacy` | Privacy Policy |
| `warranty` | Warranty Policy |
| `terms` | Terms & Conditions |

Each policy has:
- Rich text content (HTML)
- Published on Website toggle
- Published on App toggle

---

## 7. Real-time Features (SSE)

### 7.1 SSE Event Types

```typescript
// Admin Events
type AdminSSEEvent = {
  type: 'JOB_UPDATE' | 'SERVICE_REQUEST_UPDATE' | 'ORDER_UPDATE' | 
        'ATTENDANCE_UPDATE' | 'INVENTORY_ALERT' | 'NOTIFICATION';
  payload: any;
};

// Customer Events
type CustomerSSEEvent = {
  type: 'SERVICE_REQUEST_UPDATE' | 'ORDER_UPDATE' | 'NOTIFICATION';
  payload: any;
};
```

### 7.2 SSE Broker (Middleware)

```typescript
// Server-side SSE management
addAdminSSEClient(res: Response)
removeAdminSSEClient(res: Response)
notifyAdminUpdate(event: AdminSSEEvent)

addCustomerSSEClient(customerId: string, res: Response)
removeCustomerSSEClient(customerId: string, res: Response)
notifyCustomerUpdate(customerId: string, event: CustomerSSEEvent)
```

### 7.3 Client Hooks

```typescript
// React hook for admin SSE
const { isConnected, lastEvent } = useAdminSSE();

// Auto-reconnect on disconnect (with backoff)
// Invalidates relevant queries on events
```

---

## 8. API Authentication & Middleware

### 8.1 Session Management

```typescript
// Session configuration (server/app.ts)
{
  store: pgSession,              // PostgreSQL session store
  secret: process.env.SESSION_SECRET,
  name: 'connect.sid',
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: true,                // HTTPS only in production
    sameSite: 'none',            // Cross-origin mobile support
  },
  resave: false,
  saveUninitialized: false,
}
```

### 8.2 Auth Middleware

```typescript
requireAdminAuth()      // Protect admin routes
requireSuperAdmin()     // Super Admin only routes
requireCustomerAuth()   // Customer-only routes
getCustomerId()         // Extract customer ID from session
getDefaultPermissions() // Get role-based default permissions
```

### 8.3 Validation Middleware

```typescript
validate(schema)         // Validate request body with Zod
validateQuery(schema)    // Validate query parameters
validateParams(schema)   // Validate URL parameters
validateRequest({        // Combined validation
  body?: ZodSchema,
  query?: ZodSchema,
  params?: ZodSchema,
})
```

---

## 9. Print Templates - Complete Layout Specifications

This section provides **pixel-perfect blueprints** for all print outputs. Each template includes ASCII wireframes, exact dimensions, TypeScript data interfaces, and implementation code.

---

### 9.1 Job Ticket Print (Thermal/A4 Hybrid)

**Purpose:** Customer handout for device drop-off, includes QR for tracking.

#### Dimensions
- **Width:** 400px (max), adapts for 57mm thermal or A4
- **Margins:** 20px padding all sides
- **Print Mode:** `window.open()` → `window.print()`

#### ASCII Layout Wireframe

```
┌─────────────────────────────────────────┐
│           PROMISE ELECTRONICS           │  ← Logo + Company Name (24px bold)
│       TV Repair & Electronics Service    │  ← Subtitle (12px gray)
├─────────────────────────────────────────┤
│                                         │
│              JOB-2025-001               │  ← Ticket ID (28px monospace bold)
│         Corporate Job #: CORP-001       │  ← Optional (12px gray, centered)
│                                         │
├─────────────────────────────────────────┤
│ CUSTOMER                                │
│ ─────────                               │
│ Name: John Doe                          │  ← 14px font-weight-500
│ ┌─────────────────────────────────────┐ │
│ │ CUSTOMER CONTACT                    │ │  ← Light gray box (f8fafc)
│ │ Phone: +880 1XXXXXXXXX              │ │
│ │ Address: 123 Main Street, Dhaka     │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ DEVICE                                  │
│ ─────────                               │
│ Samsung TV UA55AU7000                   │
│ ┌─────────────────────────────────────┐ │
│ │ DEVICE DETAILS                      │ │
│ │ Screen Size: 55 inch                │ │
│ │ Serial: SN123456789 (monospace)     │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ ISSUE                                   │
│ ─────────                               │
│ Display showing horizontal lines,       │
│ possible panel damage                   │
│                                         │
├─────────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────────┐  │
│ │ STATUS       │  │ PRIORITY         │  │  ← 2-column grid
│ │ ┌──────────┐ │  │ ┌──────────────┐ │  │
│ │ │ Pending  │ │  │ │ High         │ │  │  ← Badge styling
│ │ └──────────┘ │  │ └──────────────┘ │  │
│ └──────────────┘  └──────────────────┘  │
│                                         │
│ ┌──────────────┐  ┌──────────────────┐  │
│ │ TECHNICIAN   │  │ DATE CREATED     │  │
│ │ Rahim Khan   │  │ 03 Feb 2026      │  │
│ └──────────────┘  └──────────────────┘  │
│                                         │
├─────────────────────────────────────────┤
│ ESTIMATED COST                          │  ← Conditional
│ ৳ 2,500                                 │
│                                         │
├─────────────────────────────────────────┤
│ NOTES                                   │  ← Conditional
│ Customer requested urgent repair...     │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│            ┌─────────────┐              │
│            │ ▄▄▄▄▄▄▄▄▄▄ │              │  ← QR Code (120x120px)
│            │ █ QR CODE █  │              │
│            │ ▀▀▀▀▀▀▀▀▀▀ │              │
│            └─────────────┘              │
│         Scan for status update          │  ← 10px gray text
│                                         │
├───────────────────────────────�─────────┤
│           Keep this ticket for          │  ← Footer section
│              your reference.            │
│        Contact: +880 1673999995         │
└─────────────────────────────────────────┘
```

#### Status Badge Colors

| Status | Background | Text Color |
|--------|------------|------------|
| Pending | `#f1f5f9` | `#475569` |
| In Progress | `#dbeafe` | `#1d4ed8` |
| Completed | `#dcfce7` | `#166534` |
| Cancelled | `#fee2e2` | `#dc2626` |

| Priority | Background | Text Color |
|----------|------------|------------|
| High | `#fee2e2` | `#dc2626` |
| Medium | `#fef3c7` | `#d97706` |
| Low | `#f1f5f9` | `#64748b` |

#### QR Code Generation
- **API:** `https://api.qrserver.com/v1/create-qr-code/`
- **Parameters:** `size=200x200&data={encodedTrackingUrl}`
- **Tracking URL Format:** `{origin}/track?id={jobId}`

#### Implementation (HTML String for window.open)

```typescript
const handlePrintTicket = (job: JobTicket) => {
  const printWindow = window.open('', '_blank');
  
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Job Ticket - ${job.id}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          padding: 20px; 
          max-width: 400px; 
          margin: 0 auto; 
        }
        .header { 
          text-align: center; 
          border-bottom: 2px solid #000; 
          padding-bottom: 10px; 
          margin-bottom: 20px; 
        }
        .logo { font-size: 24px; font-weight: bold; color: #0066cc; }
        .subtitle { font-size: 12px; color: #666; }
        .ticket-id { 
          font-size: 28px; 
          font-weight: bold; 
          font-family: monospace; 
          margin: 10px 0; 
          text-align: center;
        }
        .section { margin: 15px 0; }
        .label { font-size: 12px; color: #666; margin-bottom: 2px; }
        .value { font-size: 14px; font-weight: 500; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .status { 
          display: inline-block; 
          padding: 4px 12px; 
          border-radius: 4px; 
          font-size: 12px; 
          font-weight: bold; 
        }
        .detail-box { 
          background: #f8fafc; 
          border: 1px solid #e2e8f0; 
          padding: 10px; 
          margin: 10px 0; 
          border-radius: 4px; 
        }
        .detail-title { 
          font-size: 11px; 
          font-weight: bold; 
          color: #475569; 
          margin-bottom: 8px; 
          text-transform: uppercase; 
        }
        .footer { 
          margin-top: 30px; 
          padding-top: 10px; 
          border-top: 1px dashed #ccc; 
          text-align: center; 
          font-size: 11px; 
          color: #666; 
        }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header">
        <div class="logo">Promise Electronics</div>
        <div class="subtitle">TV Repair & Electronics Service</div>
      </div>
      
      <!-- Ticket ID -->
      <div class="ticket-id">${job.id}</div>
      ${job.corporateJobNumber ? 
        `<div style="text-align:center;font-size:12px;color:#666;">
          Corporate Job #: ${job.corporateJobNumber}
        </div>` : ''}
      
      <!-- Customer Section -->
      <div class="section">
        <div class="label">Customer</div>
        <div class="value">${job.customer}</div>
      </div>
      
      <!-- Customer Contact Box (conditional) -->
      ${job.customerPhone || job.customerAddress ? `
      <div class="detail-box">
        <div class="detail-title">Customer Contact</div>
        ${job.customerPhone ? 
          `<div class="grid">
            <div class="label">Phone</div>
            <div class="value">${job.customerPhone}</div>
          </div>` : ''}
        ${job.customerAddress ? 
          `<div style="margin-top:5px;">
            <div class="label">Address</div>
            <div class="value">${job.customerAddress}</div>
          </div>` : ''}
      </div>` : ''}
      
      <!-- Device Section -->
      <div class="section">
        <div class="label">Device</div>
        <div class="value">${job.device}</div>
      </div>
      
      <!-- Device Details Box (conditional) -->
      ${job.tvSerialNumber || job.screenSize ? `
      <div class="detail-box">
        <div class="detail-title">Device Details</div>
        <div class="grid">
          ${job.screenSize ? 
            `<div><div class="label">Screen Size</div>
             <div class="value">${job.screenSize}</div></div>` : ''}
          ${job.tvSerialNumber ? 
            `<div><div class="label">Serial Number</div>
             <div class="value" style="font-family:monospace;">
               ${job.tvSerialNumber}
             </div></div>` : ''}
        </div>
      </div>` : ''}
      
      <!-- Issue Section -->
      <div class="section">
        <div class="label">Issue</div>
        <div class="value">${job.issue}</div>
      </div>
      
      <!-- Status & Priority Grid -->
      <div class="grid">
        <div class="section">
          <div class="label">Status</div>
          <span class="status" style="background:${getStatusBg(job.status)};
            color:${getStatusColor(job.status)};">
            ${job.status}
          </span>
        </div>
        <div class="section">
          <div class="label">Priority</div>
          <span class="status" style="background:${getPriorityBg(job.priority)};
            color:${getPriorityColor(job.priority)};">
            ${job.priority}
          </span>
        </div>
      </div>
      
      <!-- Technician & Date Grid -->
      <div class="grid">
        <div class="section">
          <div class="label">Technician</div>
          <div class="value">${job.technician || 'Unassigned'}</div>
        </div>
        <div class="section">
          <div class="label">Date Created</div>
          <div class="value">${formatDate(job.createdAt)}</div>
        </div>
      </div>
      
      <!-- Estimated Cost (conditional) -->
      ${job.estimatedCost ? `
      <div class="section">
        <div class="label">Estimated Cost</div>
        <div class="value">৳ ${job.estimatedCost}</div>
      </div>` : ''}
      
      <!-- Notes (conditional) -->
      ${job.notes ? `
      <div class="section">
        <div class="label">Notes</div>
        <div class="value">${job.notes}</div>
      </div>` : ''}
      
      <!-- QR Code -->
      <div style="text-align:center;margin:15px 0;">
        <img src="${getQRCodeUrl(job.id)}" alt="QR Code" 
             style="width:120px;height:120px;margin:0 auto;" />
        <p style="font-size:10px;color:#666;margin-top:5px;">
          Scan for status update
        </p>
      </div>
      
      <!-- Footer -->
      <div class="footer">
        <p>Keep this ticket for your reference.</p>
        <p>Contact: +880 1673999995</p>
      </div>
    </body>
    </html>
  `;
  
  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};
```

---

### 9.2 Invoice Print (A4 Format)

**Purpose:** Formal sales invoice for POS transactions with itemized billing.

#### Dimensions
- **Page Size:** A4 (210mm × 297mm)
- **Padding:** 32px (8 × 4 Tailwind)
- **Max Width:** 210mm
- **Font:** Sans-serif (system default)

#### ASCII Layout Wireframe

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  ┌──────────────────┐                           ┌────────────────┐ │
│  │   [LOGO 64×64]   │                           │    INVOICE     │ │  ← 30px bold
│  └──────────────────┘                           │                │ │
│  PROMISE ELECTRONICS                            │ INV-20260203-1 │ │  ← Monospace bg-gray
│  Dhaka, Bangladesh                              └────────────────┘ │
│  +880 1700-000000                                                  │
│  support@promise-electronics.com                                   │
│────────────────────────────────────────────────────────────────────│
│                                                                    │
│  BILL TO                                        Invoice Date:      │
│  ─────────                                      03 February 2026   │
│                                                                    │
│  John Doe                                       Time: 14:30        │
│  Phone: +880 1XXXXXXXXX                                            │
│  Address: 123 Main Street, Dhaka                Payment: Cash      │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌────┬────────────────────────────┬──────┬──────────┬───────────┐ │
│  │ #  │ Item Description           │ Qty  │ Unit     │ Amount    │ │  ← Header bg-gray-100
│  ├────┼────────────────────────────┼──────┼──────────┼───────────┤ │
│  │ 1  │ Samsung Remote Control     │  1   │ ৳ 350.00│ ৳ 350.00  │ │
│  │    │ ID: INV-12345              │      │          │           │ │  ← Subtext gray
│  ├────┼────────────────────────────┼──────┼──────────┼───────────┤ │
│  │ 2  │ HDMI Cable 2.1             │  2   │ ৳ 250.00│ ৳ 500.00  │ │
│  │    │ ID: INV-12346              │      │          │           │ │
│  ├────┼────────────────────────────┼──────┼──────────┼───────────┤ │
│  │ 3  │ Panel Replacement Service  │ 1 pc │৳2000.00  │ ৳2000.00  │ │  ← Linked Job
│  │    │ Job: JOB-2025-001          │      │          │           │ │
│  └────┴────────────────────────────┴──────┴──────────┴───────────┘ │
│                                                                    │
│                                          ┌────────────────────────┐ │
│                                          │ Subtotal    ৳ 2850.00 │ │
│                                          │ VAT (5%)    ৳  142.50 │ │
│                                          │ Discount    -৳  50.00 │ │  ← Green text
│                                          ├────────────────────────┤ │  ← 2px border top
│                                          │ TOTAL       ৳ 2942.50 │ │  ← Bold 18px
│                                          └────────────────────────┘ │
│                                                    (width: 288px)   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Authorized Signature              Customer Signature              │
│                                                                    │
│                                                                    │
│  ─────────────────────             ─────────────────────           │
│  PROMISE ELECTRONICS               John Doe                        │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│                     Thank you for your business!                   │
│                   www.promise-electronics.com                      │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

#### Data Interface

```typescript
type InvoiceItem = {
  id: string;
  name: string;
  price: string;       // e.g., "৳ 350.00"
  quantity: number;
};

type LinkedJobCharge = {
  jobId: string;
  serviceItemId: string | null;
  serviceItemName: string | null;
  billedAmount: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
};

type InvoiceData = {
  id: string;
  invoiceNumber: string | null;  // Format: INV-YYYYMMDD-XXX
  customer: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  items: InvoiceItem[];
  linkedJobs: LinkedJobCharge[];
  subtotal: string;
  tax: string;
  taxRate: string;               // Default: "5"
  discount: string;
  total: string;
  paymentMethod: string;
  createdAt: string;             // ISO date string
};

type CompanyInfo = {
  name: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  website: string;
};
```

#### React Component Implementation

```tsx
export const Invoice = forwardRef<HTMLDivElement, InvoiceProps>(
  ({ data, company }, ref) => {
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-BD", {
      year: "numeric", month: "long", day: "numeric"
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-BD", {
      hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <div ref={ref} className="bg-white p-8 max-w-[210mm] mx-auto font-sans print:p-6">
      
      {/* Header Row */}
      <div className="flex justify-between items-start mb-8 border-b pb-6">
        <div className="flex items-center gap-4">
          {company.logo && (
            <img src={company.logo} alt={company.name} 
                 className="h-16 w-16 object-contain" />
          )}
          <div>
            <h1 className="text-2xl font-bold text-primary">{company.name}</h1>
            <p className="text-sm text-gray-600">{company.address}</p>
            <p className="text-sm text-gray-600">{company.phone}</p>
            <p className="text-sm text-gray-600">{company.email}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">INVOICE</h2>
          <p className="text-sm font-mono bg-gray-100 px-3 py-1 rounded">
            {data.invoiceNumber || data.id}
          </p>
        </div>
      </div>

      {/* Bill To & Invoice Details */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Bill To</h3>
          <p className="font-semibold text-lg">{data.customer || "Walk-in Customer"}</p>
          {data.customerPhone && (
            <p className="text-sm text-gray-600">Phone: {data.customerPhone}</p>
          )}
          {data.customerAddress && (
            <p className="text-sm text-gray-600">Address: {data.customerAddress}</p>
          )}
        </div>
        <div className="text-right">
          <div className="mb-2">
            <span className="text-sm text-gray-500">Invoice Date: </span>
            <span className="font-medium">{formatDate(data.createdAt)}</span>
          </div>
          <div className="mb-2">
            <span className="text-sm text-gray-500">Time: </span>
            <span className="font-medium">{formatTime(data.createdAt)}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Payment: </span>
            <span className="font-medium">{data.paymentMethod}</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full mb-8">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left py-3 px-4 font-semibold text-sm">#</th>
            <th className="text-left py-3 px-4 font-semibold text-sm">Item Description</th>
            <th className="text-center py-3 px-4 font-semibold text-sm">Qty</th>
            <th className="text-right py-3 px-4 font-semibold text-sm">Unit Price</th>
            <th className="text-right py-3 px-4 font-semibold text-sm">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => {
            const price = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
            const amount = price * item.quantity;
            return (
              <tr key={item.id} className="border-b">
                <td className="py-3 px-4 text-sm">{index + 1}</td>
                <td className="py-3 px-4">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-gray-500">ID: {item.id}</p>
                </td>
                <td className="py-3 px-4 text-center">{item.quantity}</td>
                <td className="py-3 px-4 text-right">৳{price.toFixed(2)}</td>
                <td className="py-3 px-4 text-right font-medium">৳{amount.toFixed(2)}</td>
              </tr>
            );
          })}
          {/* Linked Jobs as line items */}
          {data.linkedJobs.map((job, index) => (
            <tr key={job.jobId} className="border-b">
              <td className="py-3 px-4 text-sm">{data.items.length + index + 1}</td>
              <td className="py-3 px-4">
                <p className="font-medium">{job.serviceItemName || "Repair Service"}</p>
                <p className="text-xs text-gray-500">Job: {job.jobId}</p>
              </td>
              <td className="py-3 px-4 text-center">1 pcs</td>
              <td className="py-3 px-4 text-right">৳{job.billedAmount.toFixed(2)}</td>
              <td className="py-3 px-4 text-right font-medium">
                ৳{job.billedAmount.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals Section */}
      <div className="flex justify-end mb-8">
        <div className="w-72">
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span>৳{parseFloat(data.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-600">VAT ({data.taxRate || "5"}%)</span>
            <span>৳{parseFloat(data.tax).toFixed(2)}</span>
          </div>
          {parseFloat(data.discount) > 0 && (
            <div className="flex justify-between py-2 text-sm text-green-600">
              <span>Discount</span>
              <span>-৳{parseFloat(data.discount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between py-3 text-lg font-bold 
                          border-t-2 border-gray-800 mt-2">
            <span>Total</span>
            <span>৳{parseFloat(data.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Signature Section */}
      <div className="border-t pt-6 mt-auto">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-gray-500 mb-8">Authorized Signature</p>
            <div className="border-t border-gray-400 pt-2 w-48">
              <p className="text-sm text-gray-600">{company.name}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-8">Customer Signature</p>
            <div className="border-t border-gray-400 pt-2 w-48">
              <p className="text-sm text-gray-600">{data.customer || "Walk-in Customer"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-8 pt-4 border-t text-xs text-gray-500">
        <p>Thank you for your business!</p>
        <p className="mt-1">{company.website}</p>
      </div>
    </div>
  );
});
```

---

### 9.3 Thermal Receipt (57mm Width)

**Purpose:** Compact receipt for thermal POS printers.

#### Dimensions
- **Width:** 57mm (approximately 216px at 96 DPI)
- **Padding:** 2mm (8px)
- **Font:** Monospace, 10px base size
- **Line Height:** Tight (leading-tight)

#### ASCII Layout Wireframe

```
┌──────────────────────────┐
│        [LOGO 32×32]      │
│    PROMISE ELECTRONICS   │  ← Bold 12px
│    Dhaka, Bangladesh     │  ← 8px gray
│    +880 1700-000000      │
├──────────────────────────┤  ← Dashed border
│                          │
│      SALES RECEIPT       │  ← Bold centered
│                          │
├──────────────────────────┤
│ Rcpt#:     INV-20260203-1│
│ Date:  03/02/26, 14:30   │
│ Customer:        John D. │
│ Phone:    +880 1XXXXXXXX │
│ Addr: 123 Main Street... │  ← 8px, truncated
├──────────────────────────┤
│ Item              Amount │  ← Header bold
├──────────────────────────┤
│ Samsung Remote           │  ← Truncated name
│ 1 x ৳350          ৳350   │  ← Qty x Price = Total
│                          │
│ HDMI Cable 2.1           │
│ 2 x ৳250          ৳500   │
├──────────────────────────┤
│ Subtotal:          ৳850  │
│ VAT (5%):           ৳43  │
│ Discount:          -৳50  │
├──────────────────────────┤  ← Solid line
│ TOTAL:             ৳843  │  ← Bold 12px
├──────────────────────────┤
│ Payment:            Cash │
├──────────────────────────┤
│ Service Jobs:            │  ← Conditional section
│ JOB-2025-001 - Panel Rpr │
│                   ৳2000  │
├──────────────────────────┤
│                          │
│       Thank you!         │  ← Bold
│ Keep receipt for returns │  ← 8px
│ within 7 days            │
│                          │
├──────────────────────────┤
│   *** END OF RECEIPT *** │
└──────────────────────────┘
```

#### Data Interface

```typescript
type ReceiptItem = {
  id: string;
  name: string;
  price: string;
  quantity: number;
};

type LinkedJobCharge = {
  jobId: string;
  serviceItemId: string | null;
  serviceItemName: string | null;
  billedAmount: number;
};

type ReceiptData = {
  id: string;
  invoiceNumber: string | null;
  customer: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  items: ReceiptItem[];
  linkedJobs: LinkedJobCharge[];
  subtotal: string;
  tax: string;
  taxRate: string;
  discount: string;
  total: string;
  paymentMethod: string;
  createdAt: string;
};
```

#### React Component Implementation

```tsx
export const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(
  ({ data, company }, ref) => {
  
  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-BD", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div 
      ref={ref}
      className="bg-white p-2 font-mono text-[10px] leading-tight"
      style={{ width: "57mm", minHeight: "40mm" }}
    >
      {/* Header */}
      <div className="text-center mb-2 pb-2 border-b border-dashed border-gray-400">
        {company.logo && (
          <img src={company.logo} alt={company.name} 
               className="h-8 w-8 object-contain mx-auto mb-1" />
        )}
        <p className="font-bold text-xs">{company.name}</p>
        <p className="text-[8px] text-gray-600">{company.address}</p>
        <p className="text-[8px] text-gray-600">{company.phone}</p>
      </div>

      {/* Title */}
      <div className="text-center mb-2">
        <p className="font-bold">SALES RECEIPT</p>
      </div>

      {/* Receipt Info */}
      <div className="mb-2 pb-2 border-b border-dashed border-gray-400">
        <div className="flex justify-between">
          <span>Rcpt#:</span>
          <span className="font-bold">{data.invoiceNumber || data.id}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{formatDateTime(data.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span>{data.customer || "Walk-in"}</span>
        </div>
        {data.customerPhone && (
          <div className="flex justify-between">
            <span>Phone:</span>
            <span>{data.customerPhone}</span>
          </div>
        )}
        {data.customerAddress && (
          <div className="text-[8px] mt-1">
            Addr: {data.customerAddress}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="mb-2 pb-2 border-b border-dashed border-gray-400">
        <div className="flex justify-between font-bold mb-1">
          <span>Item</span>
          <span>Amount</span>
        </div>
        {data.items.map((item, index) => {
          const price = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
          const amount = price * item.quantity;
          return (
            <div key={item.id} className="mb-1">
              <div className="truncate pr-2">{item.name}</div>
              <div className="flex justify-between text-gray-600">
                <span>{item.quantity} x ৳{price.toFixed(0)}</span>
                <span>৳{amount.toFixed(0)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="mb-2">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>৳{parseFloat(data.subtotal).toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span>VAT ({data.taxRate || "5"}%):</span>
          <span>৳{parseFloat(data.tax).toFixed(0)}</span>
        </div>
        {parseFloat(data.discount) > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-৳{parseFloat(data.discount).toFixed(0)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm 
                        border-t border-gray-400 pt-1 mt-1">
          <span>TOTAL:</span>
          <span>৳{parseFloat(data.total).toFixed(0)}</span>
        </div>
      </div>

      {/* Payment Method */}
      <div className="mb-2 pb-2 border-b border-dashed border-gray-400">
        <div className="flex justify-between">
          <span>Payment:</span>
          <span>{data.paymentMethod}</span>
        </div>
      </div>

      {/* Linked Jobs (conditional) */}
      {data.linkedJobs.length > 0 && (
        <div className="mb-2 pb-2 border-b border-dashed border-gray-400 text-[8px]">
          <p className="font-bold mb-1">Service Jobs:</p>
          {data.linkedJobs.map((job) => (
            <div key={job.jobId}>
              <span>{job.jobId}</span>
              {job.serviceItemName && <span> - {job.serviceItemName}</span>}
              {job.billedAmount > 0 && (
                <span className="float-right">৳{job.billedAmount.toFixed(0)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Thank You Footer */}
      <div className="text-center text-[8px] text-gray-600">
        <p className="font-bold mb-1">Thank you!</p>
        <p>Please keep receipt for returns</p>
        <p>within 7 days with original receipt</p>
      </div>

      {/* End Marker */}
      <div className="text-center mt-2 pt-2 border-t border-dashed border-gray-400">
        <p className="text-[8px]">*** END OF RECEIPT ***</p>
      </div>
    </div>
  );
});
```

---

### 9.4 Print CSS Media Queries

```typescript
// PrintStyles.tsx - Inject in App or print components

export function PrintStyles() {
  return (
    <style>{`
      @media print {
        /* Hide everything except print content */
        body * { visibility: hidden; }
        
        .print-content, .print-content * { visibility: visible; }
        
        .print-content {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        
        /* Invoice A4 styles */
        .print-invoice {
          width: 210mm !important;
          min-height: 297mm !important;
          padding: 15mm !important;
          margin: 0 !important;
          box-shadow: none !important;
        }
        
        /* Receipt thermal printer styles (57mm width) */
        .print-receipt {
          width: 57mm !important;
          min-height: auto !important;
          padding: 2mm !important;
          margin: 0 !important;
          box-shadow: none !important;
          font-size: 10px !important;
        }
        
        /* Remove backgrounds for better printing */
        .print-content {
          background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        
        /* Page breaks */
        .page-break { page-break-before: always; }
        
        /* Hide buttons and interactive elements */
        .no-print { display: none !important; }
      }
      
      @page {
        margin: 0;
        size: auto;
      }
      
      @page invoice {
        size: A4;
        margin: 10mm;
      }
      
      @page receipt {
        size: 57mm auto;
        margin: 0;
      }
    `}</style>
  );
}
```

---

## 10. Deployment & Scripts

### 10.1 Environment Variables

```env
# Required
NODE_ENV=production|development
DATABASE_URL=postgresql://user:pass@host:5432/db
SESSION_SECRET=your-secret-key-here

# Google OAuth (optional)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Cloudinary (optional - for media uploads)
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx

# Firebase (optional - for push notifications)
FIREBASE_PROJECT_ID=xxx
FIREBASE_PRIVATE_KEY=xxx
FIREBASE_CLIENT_EMAIL=xxx

# AI Features (optional)
GEMINI_API_KEY=xxx
```

### 10.2 NPM Scripts

```json
{
  "dev": "cross-env NODE_ENV=development tsx server/index.ts",
  "dev:client": "vite dev --port 5082",
  "build": "tsx script/build.ts",
  "start": "NODE_ENV=production node dist/index.cjs",
  "check": "tsc",
  "db:push": "drizzle-kit push"
}
```

### 10.3 Build Process

1. TypeScript compilation (server)
2. Vite production build (client)
3. Static assets to `dist/public`
4. Server bundle to `dist/index.cjs`

### 10.4 Development Workflow

```bash
# 1. Clone & install
git clone [repo]
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with credentials

# 3. Push database schema
npm run db:push

# 4. Start development
npm run dev
# Opens at http://localhost:5083

# 5. Production build
npm run build
npm run start
```

---

## 11. Known Constraints & Technical Notes

### 11.1 JSON Storage
- Several fields store JSON as TEXT (not JSONB)
- Requires manual parsing: `items`, `features`, `lineItems`, `mediaUrls`, `symptoms`
- Future migration path: Convert to native JSONB columns

### 11.2 SSE Limitations
- Vercel function timeout: 60 seconds max
- Auto-reconnect implemented in client
- Consider WebSocket upgrade for high-frequency use cases

### 11.3 Printing
- Browser-based printing (window.print)
- Thermal prints require user to select correct printer
- No native Bluetooth printer support in web admin (mobile app only)

### 11.4 File Uploads
- Cloudinary for media CDN
- Google Cloud Storage for objects
- Max file sizes configurable in backend

---

## 12. Appendix: Complete API Reference

### Auth Routes
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/me` | GET | Admin | Get current admin user |
| `/api/admin/login` | POST | None | Admin login |
| `/api/admin/logout` | POST | Admin | Admin logout |

### Customer Routes
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/customer/register` | POST | None | Customer registration |
| `/api/customer/login` | POST | None | Customer login |
| `/api/customer/logout` | POST | Customer | Customer logout |
| `/api/customer/me` | GET | Customer | Get profile |
| `/api/customer/profile` | PUT | Customer | Update profile |
| `/api/customer/events` | GET | Customer | SSE stream |
| `/api/customer/service-requests` | GET | Customer | My requests |
| `/api/customer/service-requests/:id` | GET | Customer | Request details |
| `/api/customer/track/:ticketNumber` | GET | None | Track by ticket |
| `/api/customer/service-requests/link` | POST | Customer | Link request to account |
| `/api/customer/warranties` | GET | Customer | My warranties |
| `/api/customer/notifications` | GET | Customer | My notifications |

### Users & Admin Routes
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/dashboard` | GET | Admin | Dashboard stats |
| `/api/admin/job-overview` | GET | Admin | Job overview |
| `/api/admin/events` | GET | Admin | Admin SSE stream |
| `/api/users` | GET | Admin | List all users |
| `/api/users/:id` | GET | None | Get user by ID |
| `/api/users` | POST | None | Create user |
| `/api/users/:id` | PATCH | Admin | Update user |
| `/api/admin/users` | GET | Admin | List staff |
| `/api/admin/users` | POST | Super Admin | Create staff |
| `/api/admin/users/:id` | PATCH | Admin | Update staff |
| `/api/admin/users/:id` | DELETE | Super Admin | Delete staff |
| `/api/admin/customers` | GET | Admin | List customers |
| `/api/admin/customers/:id` | GET | Admin | Get customer |
| `/api/admin/customers/:id` | PATCH | Admin | Update customer |
| `/api/admin/customers/:id` | DELETE | Admin | Delete customer |
| `/api/admin/reports` | GET | Admin | Report data |

### Settings Routes
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/settings` | GET | None | List all settings |
| `/api/settings/:key` | GET | None | Get single setting |
| `/api/settings` | POST | Admin | Upsert setting |
| `/api/policies/:slug` | GET | None | Get public policy |
| `/api/admin/policies` | GET | Admin | List all policies |
| `/api/admin/policies` | POST | Admin | Upsert policy |
| `/api/admin/policies/:slug` | DELETE | Admin | Delete policy |
| `/api/admin/data/all` | DELETE | Super Admin | Wipe all data |

### Upload Routes
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/objects/upload` | POST | None | Get presigned upload URL |
| `/objects/:objectPath` | GET | None | Serve uploaded object |
| `/api/cloudinary/upload-params` | POST | None | Get Cloudinary params |
| `/api/cloudinary/upload` | POST | None | Server-side upload |
| `/api/cleanup/expired-media` | POST | Admin | Clean expired media |

### Notifications & Inquiries
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/push/register` | POST | None | Register push token |
| `/api/inquiries` | POST | None | Submit inquiry |
| `/api/inquiries` | GET | Admin | List inquiries |
| `/api/inquiries/:id/status` | PATCH | Admin | Update status |
| `/api/customer/inquiries` | GET | Customer | My inquiries |

### Reviews
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/reviews` | GET | None | Get approved reviews |
| `/api/reviews` | POST | Customer | Submit review |
| `/api/admin/reviews` | GET | Admin | All reviews |
| `/api/admin/reviews/:id/approval` | PATCH | Admin | Approve/reject |
| `/api/admin/reviews/:id` | DELETE | Admin | Delete review |

### Quotes & Pickups
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/quotes` | POST | None | Submit quote request |
| `/api/admin/quotes` | GET | Admin | List quotes |
| `/api/admin/quotes/:id/price` | PATCH | Admin | Set quote price |
| `/api/quotes/:id/accept` | POST | None | Accept quote |
| `/api/quotes/:id/decline` | POST | None | Decline quote |
| `/api/quotes/:id/convert` | POST | Admin | Convert to request |
| `/api/admin/pickups` | GET | Admin | List pickups |
| `/api/admin/pickups/pending` | GET | Admin | Pending pickups |
| `/api/pickups/by-request/:id` | GET | None | Get by request |
| `/api/admin/pickups/:id` | PATCH | Admin | Update pickup |
| `/api/admin/pickups/:id/status` | PATCH | Admin | Update status |

### AI Routes
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/ai/suggest-technician` | POST | Admin | AI tech suggestion |
| `/api/ai/diagnose` | POST | Admin | AI diagnosis |
| `/api/ai/chat` | POST | Admin | Admin AI chat |
| `/api/ai/insights` | GET | Admin | Get AI insights |

---

## 13. Reconstruction Checklist

To rebuild this system from scratch:

- [ ] Initialize Node.js project with TypeScript
- [ ] Set up PostgreSQL with Drizzle ORM
- [ ] Create all 31 database tables from schema
- [ ] Implement Express server with session management
- [ ] Create 24 route modules with middleware
- [ ] Build React frontend with Vite
- [ ] Implement AdminAuthContext and AdminSSEContext
- [ ] Create 20 admin pages with full CRUD
- [ ] Implement SSE broker for real-time updates
- [ ] Add print templates (Job, Invoice, Receipt)
- [ ] Configure Cloudinary and object storage
- [ ] Add role-based permission system
- [ ] Implement stage-flow state machine for service requests
- [ ] Add AI integration (optional - Gemini)
- [ ] Deploy to Vercel with Neon PostgreSQL

---

*This PRD provides complete technical specifications for the Promise Integrated System Admin Panel. Any AI system with code generation capabilities can use this document to reconstruct the full application.*
