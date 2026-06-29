# PROJECT_MEMORY.md
> Read this file first at the start of every session.
> Last updated: 2026-05-26
> Status: NEUTRAL exhaustive documentation of every part of the system. No opinions. The planner decides what to keep or remove.

---

# PROMISE INTEGRATED SYSTEM — COMPLETE SYSTEM REVIEW

## 0. BUSINESS CONTEXT

**Business:** Promise Electronics — TV repair shop, Dhaka, Bangladesh  
**Owner:** Shuvo Shadman (shuvoshadman123@gmail.com)  
**Team size:** 3–4 people  
**Stack type:** Full-stack monorepo (Node.js server + React client in one repo)

**Core business operations:**
- Walk-in TV repair jobs
- Home pickup repair service
- Service-center drop-off repair
- Online shop for parts/products
- Corporate B2B contracts (companies send TVs in bulk)
- Facebook Messenger AI chatbot for customer inquiries

**Commission structure (designed, not yet fully implemented):**
- Corporate pool: Marketing Manager, Admin, Business Reserve
- Operational pool: Chat Handler, Technician, Pickup Delivery

---

## 1. REPOSITORY STRUCTURE

```
PromiseIntegratedSystem/
├── client/                        # React 19 frontend (Vite)
│   └── src/
│       ├── pages/                 # Route-level pages
│       │   ├── admin/             # Admin dashboard + tabs
│       │   ├── corporate/         # Corporate portal pages
│       │   └── tech/              # Technician portal pages
│       ├── components/            # Reusable components
│       │   ├── admin/             # Admin-specific components
│       │   ├── corporate/         # Corporate-specific
│       │   ├── customer/          # Customer-specific
│       │   ├── layout/            # Layout wrappers
│       │   ├── mobile/            # Mobile-specific
│       │   ├── print/             # Print documents
│       │   ├── shared/            # Shared across portals
│       │   ├── tech/              # Technician-specific
│       │   └── ui/                # Radix/shadcn primitives
│       ├── contexts/              # React context providers (10 files)
│       ├── hooks/                 # Custom React hooks (16 files)
│       └── design_references/     # PNG/JPG design mockups (not compiled)
├── server/                        # Express.js backend
│   ├── brain/                     # AI Brain subsystem
│   ├── fonts/                     # Fonts for server-side PDF
│   ├── lib/                       # Server libraries
│   ├── middleware/                # Express middleware
│   ├── repositories/              # Data access layer
│   ├── routes/                    # Route handlers + per-route middleware
│   │   └── middleware/            # Route-level middleware
│   ├── scripts/                   # One-off seed scripts
│   ├── services/                  # Business logic services
│   └── utils/                     # Utility functions
├── shared/                        # Code shared by client and server
│   ├── schema.ts                  # Main DB schema (70+ tables)
│   └── constants.ts               # Status enums, workflow constants
├── migrations/                    # Drizzle SQL migration files (8 files)
├── script/                        # Dev/build/admin scripts (contains Replit artifact copies)
├── scripts/                       # Additional scripts
├── tests/                         # Vitest tests (8 files)
├── mobile_app_flutter/            # Flutter customer-facing app (separate Dart project)
├── workforce_app_flutter/         # Flutter workforce app (separate Dart project)
├── jdk-11.0.29+7/                 # JDK 11 binaries (bundled in repo, 190MB)
├── jdk11.zip                      # JDK 11 archive
├── api/                           # Vercel serverless entry point
├── .github/                       # GitHub Actions
├── Dockerfile                     # Docker container config
├── docker-compose.dev.yml         # Docker dev compose
├── drizzle.config.ts              # Main DB Drizzle config
├── drizzle-brain.config.ts        # Brain DB Drizzle config (separate DB)
├── vite.config.ts                 # Vite build config
├── tsconfig.json
├── package.json                   # All dependencies (single package.json)
├── vercel.json                    # Vercel deployment config
├── build.ts                       # Custom esbuild production build
├── api-contract-snapshot.json     # Generated API contract snapshot
├── codegen.js                     # Code generation with quicktype-core
├── main.py                        # Python entry (unclear purpose)
└── PROJECT_MEMORY.md              # This file
```

The `script/` directory contains a near-full duplicate of the server structure including `schema.ts`, `routes.ts`, and server files — leftover from Replit development environment (a `.replit` file is present inside it).

---

## 2. TECHNOLOGY STACK

### 2.1 Frontend
| Technology | Version | Role |
|---|---|---|
| React | 19.2.0 | UI framework |
| TypeScript | 5.6.3 | Type safety |
| Vite | 7.1.9 | Dev server + bundler |
| TailwindCSS | 4.1.14 | Utility-first CSS |
| Wouter | 3.3.5 | Client-side routing |
| TanStack Query | 5.60.5 | Server state / data fetching |
| @tanstack/react-query-persist-client | 5.90.14 | Persist queries to IndexedDB |
| Framer Motion | 12.23.24 | Animations |
| Recharts | 2.15.4 | Charts and data visualizations |
| Radix UI | full suite (30+ packages) | Headless UI primitives |
| i18next | 25.7.3 | Internationalization |
| react-i18next | 16.5.0 | React binding for i18next |
| i18next-browser-languagedetector | 8.2.0 | Auto language detection |
| jsPDF | 4.2.0 | Client-side PDF generation |
| html2canvas | 1.4.1 | Screenshot for PDF |
| @zxing/library | 0.21.3 | Barcode/QR scanning |
| Embla Carousel | 8.6.0 | Carousel |
| react-hook-form | 7.66.0 | Form state management |
| Zod | 3.25.76 | Schema validation |
| zod-validation-error | 3.4.0 | Zod error formatting |
| drizzle-zod | 0.7.0 | Auto-generate Zod schemas from Drizzle |
| date-fns | 3.6.0 | Date utilities |
| cmdk | 1.1.1 | Command palette |
| idb | 8.0.3 | IndexedDB wrapper |
| sonner | 2.0.7 | Toast notifications |
| vaul | 1.1.2 | Drawer component |
| next-themes | 0.4.6 | Dark/light mode |
| lucide-react | 0.545.0 | Icon set |
| react-resizable-panels | 2.1.9 | Resizable layout panels |
| react-day-picker | 9.11.1 | Date picker |
| papaparse | 5.5.3 | CSV parsing |
| xlsx | 0.18.5 | Excel parsing |
| @vercel/speed-insights | 1.3.1 | Vercel analytics |

### 2.2 Backend
| Technology | Version | Role |
|---|---|---|
| Node.js | runtime | Server runtime |
| Express | 4.21.2 | HTTP framework |
| TypeScript | 5.6.3 | Type safety |
| tsx | 4.20.5 | TypeScript execution in dev |
| Drizzle ORM | 0.39.1 | Database ORM |
| @neondatabase/serverless | 1.0.2 | NeonDB PostgreSQL driver |
| pg | 8.11.3 | PostgreSQL driver |
| Passport.js | 0.7.0 | Authentication framework |
| passport-local | 1.0.0 | Username+password strategy |
| passport-google-oauth20 | 2.0.0 | Google OAuth strategy |
| openid-client | 6.8.1 | OpenID Connect client |
| google-auth-library | 10.5.0 | Google token verification |
| googleapis | 171.4.0 | Google APIs (Drive, etc.) |
| express-session | 1.18.1 | Session middleware |
| connect-pg-simple | 10.0.0 | PostgreSQL session store |
| bcryptjs | 3.0.3 | Password hashing |
| @google/generative-ai | 0.24.1 | Google Gemini AI (text + embeddings) |
| groq-sdk | 0.37.0 | Groq AI (fast inference) |
| firebase-admin | 13.6.0 | Firebase FCM push notifications |
| ioredis | 5.10.0 | Redis client |
| nodemailer | 8.0.1 | Email sending |
| multer | 2.0.2 | Multipart file upload |
| imagekit | 6.0.0 | ImageKit CDN/image service |
| imagekitio-react | 4.3.0 | ImageKit React component |
| cloudinary | 2.8.0 | Cloudinary image/video service |
| @aws-sdk/client-s3 | 3.988.0 | AWS S3 object storage |
| @google-cloud/storage | 7.17.3 | Google Cloud Storage |
| compression | 1.8.1 | HTTP response compression |
| helmet | 8.1.0 | HTTP security headers |
| cors | 2.8.5 | CORS middleware |
| cookie-parser | 1.4.7 | Cookie parsing |
| express-rate-limit | 8.2.1 | Rate limiting |
| swagger-jsdoc | 6.2.8 | OpenAPI spec generation |
| swagger-ui-express | 5.0.1 | Swagger UI serving |
| serverless-http | 3.2.0 | Vercel serverless adapter |
| memoizee | 0.4.17 | Function memoization |
| node-cache | 5.1.2 | In-memory cache |
| memorystore | 1.6.7 | Memory-based session store |
| ws | 8.18.0 | WebSocket |
| mammoth | 1.11.0 | Word document parsing |
| exceljs | 4.4.0 | Excel generation |
| csv-parser | 3.2.0 | CSV streaming parser |
| dotenv | 17.2.3 | Environment variable loading |

### 2.3 Mobile / Cross-Platform
| Technology | Version | Role |
|---|---|---|
| @capacitor/core | 7.4.4 | Cross-platform runtime wrapper |
| @capacitor/camera | 7.0.3 | Device camera access |
| @capacitor/push-notifications | 7.0.4 | Native FCM push |
| @capacitor/preferences | 7.0.3 | Native key-value storage |
| @capacitor/app | 7.1.1 | App lifecycle events |
| @capacitor/haptics | 7.0.3 | Haptic feedback |
| @capacitor/keyboard | 7.0.4 | Keyboard behavior |
| @capacitor/splash-screen | 7.0.4 | Splash screen |
| @capacitor/status-bar | 7.0.4 | Status bar control |
| @capgo/capacitor-native-biometric | 7.6.0 | Fingerprint/face login |
| @capgo/capacitor-updater | 7.43.3 | OTA JavaScript bundle updates |
| @codetrix-studio/capacitor-google-auth | 3.4.0-rc.4 | Native Google sign-in |
| @capacitor-community/speech-recognition | 7.0.1 | Voice input |

### 2.4 Dev / Build Tools
| Technology | Version | Role |
|---|---|---|
| Vitest | 4.0.18 | Test runner |
| drizzle-kit | 0.31.4 | DB schema migration |
| esbuild | 0.25.0 | Production server bundler |
| kill-port | 2.0.1 | Dev port cleanup |
| cross-env | 10.1.0 | Cross-platform env vars |
| ESLint | 10.0.2 | Linting |
| quicktype-core | 23.2.6 | Type generation from JSON |
| @vitejs/plugin-react | 5.0.4 | React Fast Refresh |
| @tailwindcss/vite | 4.1.14 | Tailwind Vite plugin |
| @replit/vite-plugin-cartographer | 0.4.4 | Replit file map |
| @replit/vite-plugin-runtime-error-modal | 0.0.3 | Replit error overlay |
| autoprefixer | 10.4.21 | CSS autoprefixer |

---

## 3. SERVER ARCHITECTURE

### 3.1 Entry Point (`server/index.ts`)
Bootstraps the server:
- Calls `seedSuperAdmin()` to ensure at least one super admin exists
- Creates Express app via `createApp()`
- Starts `drawer-day-close` scheduler
- Registers AI error handler middleware
- Registers JSON 404 catch-all for `/api` routes
- In development: sets up Vite dev server middleware
- In production: serves static files
- Listens on `process.env.PORT` (default 5083), host `0.0.0.0`
- Handles SIGTERM/SIGINT for graceful shutdown with 10-second force-kill timeout

### 3.2 App Factory (`server/app.ts`)
Creates singleton Express app + HTTP server:

**Environment loading:**
- `.env` in development, `.env.production` in production
- Calls `validateEnv()` to check required vars on startup

**Middleware stack (in order):**
1. `compression` — disabled for SSE streams (`accept: text/event-stream`)
2. `helmet` — CSP and COEP disabled for compatibility
3. `trust proxy 1` — for HTTPS behind Vercel edge
4. `cors`
5. `express.json()` + `express.urlencoded()`
6. `cookie-parser`
7. `express-session` with PostgreSQL store (`connect-pg-simple` → `user_sessions` table)
8. Passport initialize + session restore
9. CSRF token injection (`setCsrfToken`)
10. AI logger middleware (`aiErrorHandler` from `ai-logger.ts`)
11. Swagger UI at `/api-docs`
12. All routes via `registerRoutes()`

**Session data augmentation:**
- `adminUserId: string`
- `adminUserRole: string`
- `passport: { user: any }`

### 3.3 Main DB (`server/db.ts`)
- Driver: `@neondatabase/serverless` via `drizzle-orm/neon-http`
- Config: `DATABASE_URL` env var
- Export: `db` (Drizzle ORM instance)

### 3.4 Brain DB (`server/brain/brain.db.ts`)
- Separate NeonDB PostgreSQL instance
- Config: `BRAIN_DATABASE_URL` env var
- Export: `brainDb` (Drizzle ORM instance)
- Extension required: `pgvector` (768-dimension vectors)

---

## 4. MAIN DATABASE SCHEMA

**File:** `shared/schema.ts` (~2200 lines)  
**ORM:** Drizzle ORM  
**Config:** `drizzle.config.ts`

### Table: user_sessions
Managed by `connect-pg-simple`. Prevents Drizzle from dropping it.
`sid` (PK text), `sess` (jsonb), `expire` (timestamp)

### Table: users
All system users: admins, staff, customers, technicians.
- `id` (text PK), `username` (unique), `name`, `email`, `phone` (unique), `phoneNormalized`, `password` (bcrypt), `role` (Super Admin/Manager/Cashier/Technician/Customer), `status` (Active/Inactive)
- `permissions` (text/JSON — 35+ individual flags, see UserPermissions type)
- `skills` (comma-separated), `seniorityLevel` (Junior/Mid/Senior/Expert), `performanceScore`
- `googleSub` (unique — Google OAuth), `storeId` (franchise-ready), `address`, `profileImageUrl`, `avatar`, `isVerified`, `preferences` (JSON), `corporateClientId`, `defaultWorkLocationId`
- `joinedAt`, `lastLogin`
- Indexes: role, email, phone, phoneNormalized, googleSub

**UserPermissions type has 35+ flags:**
dashboard, jobs, inventory, pos, challans, finance, attendance, reports, serviceRequests, orders, technician, inquiries, systemHealth, warrantyClaims, refunds, users, settings, canCreate, canEdit, canDelete, canExport, canViewFullJobDetails, canPrintJobTickets, process_payment, corporate, notifications, knowledgeBase, quality, salary, purchasing, wastage, auditLogs, brain, canViewUsers, canAssignTechnician, canSetPriority, canSetDeadline, canSetWarranty, canViewCustomerPhone, canAddAssistedBy

### Table: work_locations
GPS-fenced work locations for attendance geofencing.
- `id`, `name`, `storeId` (franchise), `latitude`, `longitude`, `radiusMeters` (default 150), `status` (Active), `createdAt`, `updatedAt`
- Indexes: status, storeId

### Table: job_tickets
Core repair job records.
- `id`, `customer`, `customerPhone`, `customerPhoneNormalized`, `customerAddress`, `device`, `tvSerialNumber`, `issue`
- `status` (Pending/Diagnosing/Pending Parts/In Progress/On Workbench/Ready/Not OK/Delivered/Cancelled)
- `technician` (name string), `assignedTechnicianId` (FK users.id), `assistedBy` (text), `assistedByIds` (JSON array), `assistedByNames`
- `priority` (Low/Medium/High — nullable "Not Set"), `screenSize`, `deadline`, `slaDeadline` (corporate SLA)
- `notes`, `receivedAccessories`, `aiDiagnosis` (jsonb)
- `estimatedCost`, `charges` (jsonb — array of {description, amount, type}), `warrantyNotes`
- Payment: `paymentStatus` (unpaid/paid/partial/incomplete/written_off), `paymentId`, `paidAmount`, `remainingAmount`, `paidAt`, `lastPaymentAt`
- Billing: `billingStatus` (pending/billed/invoiced/delivered), `invoicePrintedAt`, `invoicePrintedBy`, `invoicePrintCount`
- Corporate: `corporateChallanId`, `corporateJobNumber`, `corporateClientId`, `initialStatus` (OK/NG), `reportedDefect`, `problemFound`, `corporateBillId`
- Warranty: `warrantyDays` (default 30), `gracePeriodDays` (default 7), `warrantyExpiryDate`, `warrantyTermsAccepted`
- `jobType` (standard/warranty_claim/repeat_repair), `parentJobId` (for repeat repairs)
- `serviceLines` (JSON — service types + custom pricing), `productLines` (JSON — parts used)
- `mobileMedia` (JSON — media from mobile uploads), `lastMobileUpdateAt`
- `writeOffReason`, `writeOffBy`, `writeOffAt`
- `storeId` (franchise-ready), `createdAt`, `completedAt`
- Indexes: status, customer, customerPhoneNormalized, technician, createdAt, corporateChallanId, corporateClientId, paymentStatus, (status+deadline), (status+createdAt)

### Table: inventory_items
Parts and products stock.
- `id`, `name`, `category`, `description`, `itemType` (product/service), `stock`, `price`, `minPrice`, `maxPrice`
- `status` (In Stock/Low Stock/Out of Stock), `lowStockThreshold` (default 5)
- `images` (text/JSON), `showOnWebsite`, `showOnAndroidApp`, `showOnHotDeals`, `hotDealPrice`
- `icon`, `estimatedDays`, `displayOrder`, `features`, `isSparePart`, `isSerialized`, `reorderQuantity`, `preferredSupplier`
- `storeId` (franchise), `createdAt`, `updatedAt`
- Indexes: category, showOnWebsite, status

### Table: inventory_serials
Serial numbers for serialized inventory items.
- `id`, `inventoryItemId` (FK inventory_items), `serialNumber`, `status` (In Stock/Reserved/Consumed/Defective/Wasted)
- `jobTicketId` (set when consumed), `receivedAt`, `consumedAt`, `notes`, `storeId`

### Table: purchase_orders
Purchase orders from suppliers.
- `id`, `supplierName`, `status` (Draft/Pending/Received/Cancelled), `totalAmount`, `expectedDeliveryDate`, `notes`, `storeId`, `createdAt`, `updatedAt`

### Table: purchase_order_items
Line items for purchase orders.
- `id`, `purchaseOrderId` (FK, cascade delete), `inventoryItemId` (FK), `quantity`, `unitPrice`

### Table: local_purchases
Ad-hoc parts purchased locally for a specific job.
- `id`, `jobTicketId`, `partName`, `supplierName`, `costPrice`, `sellingPrice`, `quantity`
- `receiptImageUrl` (mandatory photo), `purchasedBy` (username), `status` (Consumed/Returned)
- `createdAt`, `storeId`

### Table: wastage_logs
Defective or wasted parts records.
- `id`, `inventoryItemId`, `serialId` (if tracked), `quantity`
- `reason` (DOA/Factory Defect/Installation Fault/Transit Damage/Water Damage/Other)
- `jobTicketId` (optional), `financialLoss` (cost × qty), `reportedBy`, `notes`
- `createdAt`, `storeId`
- Index: createdAt

### Table: service_categories
Service type categories for the service catalog.
- `id`, `name` (unique), `displayOrder`, `createdAt`

### Table: challans
Delivery/transfer documents.
- `id`, `receiver`, `type` (Corporate/Customer/Transfer), `status` (Pending/Delivered/Received), `items` (count), `lineItems` (JSON string)
- `receiverAddress`, `receiverPhone`, `vehicleNo`, `driverName`, `driverPhone`, `gatePassNo`
- `createdAt`, `deliveredAt`, `notes`
- Indexes: status, type, createdAt

### Table: petty_cash_records
Petty cash in/out records.
- `id`, `description`, `category`, `amount`, `type` (income/expense), `dueRecordId` (optional link)
- `createdAt`, `drawerSessionId` (FK drawer_sessions — Phase 7)
- Index: createdAt

### Table: due_records
Outstanding customer payment records.
- `id`, `customer`, `amount`, `status` (Pending/Overdue/Paid), `invoice`, `dueDate`, `paidAt`, `paidAmount`
- `createdAt`
- Index: createdAt

### Table: approval_requests
Super admin verification requests for sensitive operations.
- `id`, `type` (company_claim_change/status_override/refund_request), `requestedBy`, `requestedByName`
- `jobId`, `jobNumber`, `oldValue`, `newValue`
- `status` (pending/approved/rejected), `reviewedBy`, `reviewedAt`, `rejectionReason`
- `createdAt`
- Indexes: status, type

### Table: products
E-commerce product catalog (separate from inventory_items).
- `id`, `name`, `price` (text), `category`, `image`, `rating`, `reviews`, `createdAt`

### Table: settings
Key-value system settings.
- `id`, `key` (unique), `value`, `updatedAt`

### Table: system_modules
Per-portal feature toggle configuration.
- `id` (slug e.g. 'jobs'), `name`, `description`, `category` (core/operations/finance/b2b/people/system)
- `enabledAdmin`, `enabledCustomer`, `enabledCorporate`, `enabledTechnician` (boolean per portal)
- `isCore` (cannot be fully disabled), `displayOrder`, `icon`, `dependencies` (JSON), `portalScope` (comma-separated)
- `offlineCapability` (write/read-only/locked)
- `toggledBy`, `toggledAt`, `createdAt`

### Table: corporate_clients
B2B company accounts.
- `id`, `companyName`, `shortCode` (unique, e.g. '1KF')
- `pricingType` (standard/custom_matrix), `customPricing` (jsonb), `discountPercentage`, `billingCycle` (weekly/monthly)
- `paymentTerms` (Net days, default 30), `defaultSlaHours` (default 48), `outstandingBalance`
- Hierarchy: `parentClientId` (self-reference), `branchName`
- `contactPerson`, `contactPhone`, `address`, `phone`, `portalUsername` (unique), `portalPasswordHash`
- `createdAt`, `updatedAt`
- Relations: parentClient (many-to-one self), branches (one-to-many self)

### Table: trusted_corporate_devices
Devices trusted for corporate portal login without re-auth.
- `id`, `userId` (FK users, cascade delete), `tokenHash` (SHA-256 unique), `userAgent`
- `createdAt`, `lastUsedAt`, `trustedUntil`, `revokedAt`, `revokedReason`
- Indexes: tokenHash, (userId + revokedAt + trustedUntil)

### Table: corporate_challans
Corporate device intake/return challans.
- `id`, `challanNumber` (unique, format: {ClientCode}-C-{Seq}), `type` (incoming/outgoing), `corporateClientId` (FK)
- `items` (jsonb), `totalItems`
- `receivedDate`, `returnedDate`, `receiverName`, `receiverPhone`, `receiverSignature`
- `status` (received/in_progress/completed/delivered), `notes`, `createdAt`
- Indexes: corporateClientId, type, status

### Table: corporate_bills
Billing statements / invoices for corporate clients.
- `id`, `billNumber` (unique, format: {ClientCode}-B-{Seq}), `corporateClientId` (FK)
- `billingPeriodStart`, `billingPeriodEnd`, `lineItems` (jsonb)
- `subtotal`, `discount`, `vatAmount`, `grandTotal`
- `paymentStatus` (unpaid/partial/paid), `paidAmount`, `dueDate`, `paidDate`, `dueRecordId`
- `createdAt`
- Indexes: corporateClientId, paymentStatus

### Table: drawer_sessions
Cash register open/close sessions (Phase 7).
- `id`, `openedBy`, `openedByName`, `openedAt`
- `startingFloat`, `expectedCash` (system-calculated), `declaredCash` (blind count), `discrepancy`
- `status` (open/counting/reconciled), `closedBy`, `closedByName`, `closedAt`, `notes`, `storeId`

### Table: corporate_portal_urgencies
Urgency flags raised by corporate clients through portal.
- `id`, `corpClientId`, `jobId` (FK job_tickets), `reason`, `urgencyLevel` (high/critical)
- `status` (pending/acknowledged/resolved), `requestedBy`, `createdAt`

### Table: fraud_alerts
Automatically-triggered fraud detection alerts.
- `id`, `alertType` (phantom_parts/fast_job/high_refund), `severity` (low/medium/high/critical)
- `entityType` (technician/customer/job), `entityId`, `description`, `ruleTriggered`
- `status` (open/investigating/resolved/false_positive), `metadata` (jsonb)
- `createdAt`, `resolvedAt`, `resolvedBy`

### Table: pos_transactions
Point-of-sale transaction records.
- `id`, `invoiceNumber` (unique), `customer`, `customerPhone`, `customerAddress`
- `items` (text/JSON), `linkedJobs` (text/JSON)
- `subtotal`, `tax`, `taxRate` (default 5%), `discount`, `total`
- `paymentMethod`, `paymentStatus` (default Paid)
- `createdAt`, `drawerSessionId` (FK drawer_sessions)
- Indexes: customerPhone, createdAt, (paymentMethod + createdAt)

### Table: service_catalog
Service type definitions with pricing ranges.
- `id`, `name`, `description`, `category`, `minPrice`, `maxPrice`
- `estimatedDays`, `icon`, `isActive`, `displayOrder`, `features`, `createdAt`

### Table: service_requests
Customer repair/quote requests (pre-job, from online form or portal).
- `id`, `ticketNumber` (unique), `customerId`, `brand`, `screenSize`, `modelNumber`
- `primaryIssue`, `symptoms`, `description`, `mediaUrls`
- `customerName`, `phone`, `address`, `servicePreference`
- `status` (admin pipeline), `trackingStatus` (customer-facing), `estimatedDelivery`
- `paymentStatus`, `requestIntent` (quote/repair), `serviceMode` (pickup/service_center), `stage`
- `isQuote`, `serviceId`, `quoteStatus`, `quoteAmount`, `quoteNotes`, `quotedAt`, `quoteExpiresAt`, `acceptedAt`
- `pickupTier`, `pickupCost`, `totalAmount`
- `scheduledPickupDate`, `expectedPickupDate`, `expectedReturnDate`, `expectedReadyDate`
- `intakeLocation` (jsonb lat/lng), `physicalCondition`, `customerSignatureUrl`
- `proofOfPurchase`, `warrantyStatus` (in_warranty/out_of_warranty/unknown)
- `agreedToPickup`, `pickupAgreedAt`, `adminInteracted`, `adminInteractedAt`, `adminInteractedBy`
- `corporateClientId` (FK), `corporateChallanId` (FK), `storeId`, `convertedJobId`, `expiresAt`, `createdAt`
- Indexes: customerId, status, stage, ticketNumber, createdAt, adminInteracted

### Table: service_request_events
Timeline events for service requests.
- `id`, `serviceRequestId`, `status`, `message`, `actor`, `occurredAt`

### Table: pickup_schedules
Scheduled device pickup records.
- `id`, `serviceRequestId`, `tier` (Regular/Priority/Emergency), `tierCost`
- `status` (Pending/Scheduled/PickedUp/Delivered), `scheduledDate`, `pickupAddress`
- `assignedStaff`, `pickupNotes`, `pickupProofUrl` (photo at pickup)
- `pickedUpAt`, `deliveredAt`, `createdAt`

### Table: attendance_records
Daily staff check-in/check-out records.
- `id`, `userId`, `userName`, `userRole`, `workLocationId`
- `checkInTime`, `checkOutTime`
- `checkInLat`, `checkInLng`, `checkOutLat`, `checkOutLng`
- `checkInAccuracy`, `checkOutAccuracy` (GPS accuracy meters)
- `checkInDistanceMeters`, `checkOutDistanceMeters` (distance from work location)
- `checkInGeofenceStatus`, `checkOutGeofenceStatus`
- `checkInReason`, `checkOutReason`, `devicePlatform`, `deviceId`
- `date` (YYYY-MM-DD), `notes`
- Indexes: (userId + date), workLocationId

### Table: product_variants
Variants (size, color, etc.) for products.
- `id`, `productId`, `variantName`, `price`, `stock`, `sku`, `createdAt`

### Table: orders
E-commerce orders from the shop.
- `id`, `orderNumber` (unique), `customerId`, `customerName`, `customerPhone`, `customerAddress`
- `status` (Pending/Accepted/Processing/Shipped/Delivered/Declined/Cancelled)
- `paymentMethod` (default COD), `subtotal`, `total`, `declineReason`, `notes`
- `createdAt`, `updatedAt`

### Table: order_items
Line items for orders.
- `id`, `orderId`, `productId`, `productName`, `variantId`, `variantName`, `quantity`, `price`, `total`

### Table: spare_part_orders
Customer orders for spare parts (linked to orders table).
- `id`, `orderId` (FK orders), `brand`, `screenSize`, `modelNumber`, `primaryIssue`, `symptoms`, `description`, `images`
- `fulfillmentType` (pickup/service_center), `pickupTier`, `pickupAddress`, `scheduledDate`
- `verificationStatus` (pending/verified/incompatible/quoted), `isCompatible`, `quotedServiceCharge`, `quotedAt`
- `quoteAccepted`, `quoteAcceptedAt`
- Token system: `tokenNumber` (unique), `tokenExpiresAt`, `tokenStatus` (pending/active/used/expired), `tokenRedeemedAt`
- `technicianId`, `installationNotes`, `createdAt`, `updatedAt`

### Table: policies
CMS content for policy pages.
- `id`, `slug` (unique — privacy/warranty/terms), `title`, `content`, `isPublished`, `isPublishedApp`, `lastUpdated`

### Table: customer_reviews
Customer-submitted reviews.
- `id`, `customerId`, `customerName`, `rating` (1-5), `title`, `content`
- `isApproved` (moderation, default false), `createdAt`

### Table: inquiries
Contact form submissions.
- `id`, `name`, `phone`, `message`, `status` (Pending/Replied/Resolved), `reply`, `createdAt`

### Table: customer_addresses
Saved customer shipping/pickup addresses.
- `id`, `customerId`, `label` (Home/Office/etc), `address`, `isDefault`, `createdAt`

### Table: notifications
In-app notifications for users.
- `id`, `userId`, `title`, `message`, `type` (info/success/warning/repair/shop)
- `link`, `read`, `createdAt`, `corporateClientId` (FK), `jobId` (FK), `contextType` (default corporate)
- Indexes: corporateClientId, jobId, contextType

### Table: device_tokens
FCM push notification tokens.
- `id`, `userId`, `token` (unique), `platform` (android/ios/web), `isActive`, `createdAt`, `lastUsedAt`

### Table: ai_insights
Cached AI-generated business insights.
- `id` (serial), `type` (red/green/blue), `title`, `content`, `actionableStep`
- `category`, `severity`, `isRead`, `createdAt`

### Table: diagnosis_training_data
Training data for AI diagnosis accuracy tracking.
- `id` (serial), `jobId` (FK), `customerChatSummary`, `aiPrediction`, `actualIssue`, `wasAccurate`, `feedbackNotes`, `createdAt`

### Table: ai_debug_suggestions
AI-generated suggestions for server errors.
- `id` (serial), `error`, `stackTrace`, `suggestion`, `status` (NEEDS_REVIEW), `createdAt`

### Table: ai_query_log
Lightweight log of AI calls.
- `id` (serial), `userId` (FK), `queryType`, `wasSuccessful`, `createdAt`

### Table: audit_logs
System-wide action audit trail.
- `id`, `userId`, `action` (UPDATE/DELETE/CREATE/LOGIN/etc), `entity` (table name), `entityId`
- `details` (human-readable), `metadata` (jsonb — {ip, ua, location}), `changes` (jsonb — {old, new})
- `severity` (info/warning/critical), `storeId`, `createdAt`

### Table: rollback_requests
Requests to roll back a job ticket to a previous status.
- `id` (serial), `jobTicketId` (FK), `requestedBy`, `reason`, `targetStatus`
- `status` (pending/approved/rejected), `resolvedBy`, `storeId`, `createdAt`

### Table: otp_codes
One-time password codes for phone verification.
- `id`, `phone`, `codeHash` (hashed OTP), `purpose` (request_verification/login/password_reset)
- `attempts`, `maxAttempts` (default 3), `expiresAt`, `verifiedAt`, `ipAddress`, `createdAt`
- Indexes: phone, expiresAt

### Table: fraud_blocklist
Blocked phone numbers, IPs, or device fingerprints.
- `id`, `type` (phone/ip/fingerprint), `value`, `reason`, `blockedBy`, `blockedAt`, `expiresAt` (null = permanent)
- Index: (type + value)

### Table: warranty_claims
Post-repair warranty claim records.
- `id`, `originalJobId`, `newJobId` (if re-repair), `customer`, `customerPhone`, `device`
- `claimType` (service/parts), `claimReason`, `warrantyValid` (auto-computed), `warrantyExpiryDate`
- 2-step audit: `claimedBy`, `claimedByName`, `claimedByRole`, `claimedAt` + `approvedBy`, `approvedByName`, `approvedByRole`, `approvedAt`
- `status` (pending/approved/rejected/in_repair/completed), `rejectionReason`, `notes`
- `createdAt`, `updatedAt`
- Indexes: originalJobId, status, customerPhone

### Table: refunds
Refund records with 3-step audit trail.
- `id`, `type` (job/pos/warranty), `referenceId`, `referenceInvoice`
- `customer`, `customerPhone`, `originalAmount`, `refundAmount`
- `refundMethod` (cash/bank/bkash/nagad/adjustment), `reason`
- 3-step trail: requestedBy/Name/Role/At → approvedBy/Name/Role/At → processedBy/Name/Role/At
- `status` (pending/approved/rejected/processed/cancelled), `rejectionReason`, `cancellationReason`, `notes`
- `pettyCashRecordId` (auto-created on processing), `fraudAlertId`
- `createdAt`
- Indexes: referenceId, status, customerPhone, createdAt

### Table: corporate_message_threads
Chat threads between corporate client and admin.
- `id`, `corporateClientId` (FK), `subject`, `status` (open/closed/archived), `lastMessageAt`, `createdAt`, `updatedAt`
- Indexes: corporateClientId, status

### Table: corporate_messages
Individual messages in corporate threads.
- `id`, `threadId` (FK), `senderId`, `senderType` (corporate/admin)
- `messageType` (text/image/video/file), `content`, `attachments` (jsonb)
- `isRead`, `createdAt`
- Indexes: threadId, isRead, createdAt

### Table: backup_metadata
Records of each backup performed.
- `id`, `fileName`, `fileSize`, `googleDriveFileId`, `backupType` (manual/scheduled), `scheduleId`, `description`
- Encryption: `encryptionVersion`, `salt`, `iv`, `authTag`, `iterations`
- Data info: `totalRecords`, `tablesIncluded` (jsonb), `checksum`
- System info: `systemVersion`, `databaseVersion`
- `createdAt`, `createdBy`, `expiresAt`, `status` (active/expired/deleted), `verified`, `lastVerifiedAt`

### Table: backup_schedules
Backup schedule configuration.
- `id`, `name`, `type` (daily/weekly/monthly/custom), `cronExpression`, `enabled`, `retentionDays`
- `notifyOnSuccess`, `notifyOnFailure`, `lastRun`, `nextRun`, `createdAt`, `updatedAt`

### Table: backup_audit_logs
Actions log for backup operations.
- `id`, `timestamp`, `userId`, `userName`, `action`, `backupId`, `backupName`
- `ipAddress`, `userAgent`, `success`, `errorMessage`, `metadata` (jsonb)

### Table: staff_salary_config
Per-employee salary configuration.
- `id`, `userId` (unique)
- Earnings: `basicSalary`, `houseRentAllowance` (50% default), `medicalAllowance` (10% default), `conveyanceAllowance` (10% default), `otherAllowances`
- Deductions: `incomeTaxPercent`
- Leave balances: `casualLeaveBalance` (default 10), `sickLeaveBalance` (default 14), `earnedLeaveBalance` (accumulates)
- `lastIncrementDate`, `incrementBlockedReason`, `effectiveFrom`, `createdAt`, `updatedAt`
- Index: userId

### Table: leave_applications
Staff leave requests.
- `id`, `userId`, `userName`, `userRole`
- `leaveType` (casual/sick/earned), `startDate`, `endDate` (YYYY-MM-DD), `totalDays`, `reason`
- `medicalCertificateUrl` (required for sick leave)
- `status` (pending/approved/rejected), `reviewedBy` (Super Admin), `reviewedAt`, `rejectionReason`
- `createdAt`
- Indexes: userId, status, (startDate + endDate)

### Table: payroll_records
Monthly payroll calculations.
- `id`, `userId`, `userName`, `month` (YYYY-MM), `assignmentId`, `runType` (regular/final_settlement/arrear)
- `calcSnapshotJson`, `calcHash`, `isLocked`, `userRole`
- Attendance summary: `totalWorkingDays`, `daysPresent`, `daysAbsent`, `daysLate`, `consecutiveLatePenalties`, `approvedLeaves`, `unapprovedAbsences`, `totalOvertimeHours`
- Earnings: `basicSalary`, `houseRentAllowance`, `medicalAllowance`, `conveyanceAllowance`, `otherAllowances`, `overtimePay`, `grossSalary`
- Deductions: `absentDeduction`, `lateDeduction`, `incomeTax`, `otherDeductions` (require Super Admin approval), `deductionApproved`, `deductionApprovedBy`, `deductionApprovedAt`, `totalDeductions`
- `netSalary`, `status` (draft/pending_approval/finalized/paid), `generatedBy`, `clearedBy`, `paidAt`, `createdAt`
- Indexes: (userId + month), status, month

### Table: bonus_records
Eid festival bonus records.
- `id`, `userId`, `userName`, `bonusType` (eid_ul_fitr/eid_ul_adha), `year`
- `fullBonusAmount` (= 1 month basic), `unapprovedAbsences` (6-month window), `deductionPercent`, `deductionAmount`, `finalBonusAmount`
- `status` (calculated/approved/paid), `approvedBy`, `paidAt`, `createdAt`
- Indexes: (userId + year), bonusType

### Table: holiday_calendar
Company holiday management.
- `id`, `year`, `date` (YYYY-MM-DD), `name`, `type` (government/religious/custom)
- `status`: `active` (staff off), `dismissed` (cancelled — must work), `forced` (emergency holiday)
- `dismissedReason`, `forcedReason`, `modifiedBy`, `modifiedAt`, `createdAt`
- Indexes: (year + date), year, status

### Table: employment_profiles
Extended employment data per user.
- `id`, `userId` (unique), `employeeCode` (unique), `employmentType` (full_time/part_time/contract)
- `payrollEligible`, `employmentStatus` (pending_compensation/active/on_notice/resigned/terminated)
- `joinDate`, `noticePeriodDays` (default 30), `resignationDate`, `lastWorkingDate`, `separationReason`
- `createdAt`, `updatedAt`
- Indexes: userId, employmentStatus

### Table: salary_components
Library of salary component definitions.
- `id`, `code` (unique — BASIC/HRA/etc), `name`, `componentType` (earning/deduction)
- `calcMode` (fixed/percent_of_basic), `defaultPercent`, `isProratable`, `isTaxable`
- `appliesTo` (regular/final_settlement/both), `displayOrder`, `isActive`, `createdAt`

### Table: salary_structures
Named salary structure templates.
- `id`, `code` (unique), `name`, `isActive`, `createdAt`, `updatedAt`

### Table: salary_structure_lines
Components assigned to a salary structure.
- `id`, `structureId` (FK), `componentId` (FK), `sequence`, `isMandatory`, `createdAt`
- Index: structureId

### Table: employee_salary_assignments
Assignment of a salary structure + amounts to an employee.
- `id`, `userId`, `employmentProfileId`, `structureId`, `baseAmount`, `hraAmount`, `medicalAmount`, `conveyanceAmount`, `otherAmount`, `incomeTaxPercent`
- `currency` (default BDT), `effectiveFrom`, `effectiveTo`
- `changeReason` (new_hire/increment/promotion/correction), `approvedBy`, `approvedAt`, `createdBy`, `createdAt`
- Indexes: userId, (userId + effectiveFrom + effectiveTo)

### Table: increment_suggestions
AI-suggested salary increment proposals.
- `id`, `userId`, `currentAssignmentId`, `currentBaseAmount`, `suggestedBaseAmount`, `suggestedIncreasePercent`
- `suggestionReason` (annual_review/performance/market_adjustment/promotion), `reasoningJson`
- `status` (pending/approved/modified/dismissed), `adminDecisionAmount`, `adminNotes`, `decidedBy`, `decidedAt`, `effectiveFrom`
- `createdAt`
- Indexes: userId, status

### Table: deduction_proposals
AI-suggested deduction proposals for payroll.
- `id`, `userId`, `payrollRecordId`, `month`, `proposalType` (absent/late_streak/performance/other)
- `description`, `calculatedAmount`, `supportingDataJson`
- `status` (pending/approved/modified/dismissed), `approvedAmount`, `adminNotes`, `decidedBy`, `decidedAt`
- `createdAt`
- Indexes: userId, month, status

### Table: offboarding_cases
Employee resignation/termination offboarding records.
- `id`, `userId`, `employmentProfileId`, `offboardingType` (resignation/termination/retirement)
- `status` (draft/approved/settlement_generated/paid/closed), `noticeServedDays`, `lastWorkingDate`, `settlementDueDate`
- `approvedBy`, `approvedAt`, `createdAt`, `updatedAt`
- Index: userId

### Table: final_settlement_records
Final settlement calculation for offboarding employees.
- `id`, `offboardingCaseId`, `userId`, `periodStart`, `periodEnd`
- `grossTotal`, `deductionTotal`, `netTotal`, `componentBreakdownJson`
- `status`, `approvedBy`, `approvedAt`, `paidAt`, `createdAt`
- Index: offboardingCaseId

### Table: quotations
Formal sales quotations.
- `id`, `quotationNumber` (unique), `customerId` (FK users), `customerName`, `customerPhone`, `customerEmail`, `customerAddress`
- `status` (Draft/Sent/Accepted/Rejected/Expired), `subtotal`, `discount`, `taxRate`, `tax`, `total`
- `notes`, `validUntil`, `createdBy`, `createdByName`, `createdAt`, `updatedAt`
- Indexes: customerId, quotationNumber, createdAt

### Table: quotation_items
Line items for quotations (partially visible in schema).

**Total tables in main DB: 70+**

---

## 5. BRAIN DATABASE SCHEMA

**File:** `server/brain/schema.ts`  
**Config:** `drizzle-brain.config.ts`  
**Extension:** pgvector (768-dimension embeddings)

### Table: conversations
Logged Facebook Messenger conversation pairs.
- `id` (uuid PK), `customerMessage`, `ourReply`
- `senderPsid` (Facebook Page-Scoped ID), `senderName`, `channel` (default 'messenger')
- `category`, `sentiment`, `intent`, `language` (AI-classified)
- `isGoodExample`, `wasEdited`, `editedReply`, `repliedBy` (human/ai/ai_edited)
- `embedding` (vector 768 — Gemini text-embedding-004)
- `createdAt`

### Table: sessions
Per-user conversation session state.
- `id` (uuid PK), `senderPsid` (unique), `senderName`
- `history` (jsonb array), `messageCount`, `lastMessageAt`, `firstMessageAt`
- `detectedLanguage`, `customerPhone` (extracted), `customerIssues` (jsonb)

### Table: knowledge
Knowledge base for AI RAG retrieval.
- `id` (uuid PK), `topic`, `title`, `content`
- `embedding` (vector 768), `source`, `isActive`, `updatedAt`

### Table: brain_config
Runtime configuration key-value store.
- `key` (text PK), `value` (e.g. 'observe'/'shadow'/'autopilot'), `updatedAt`

### Table: shadow_drafts
AI-generated reply drafts awaiting human review.
- `id` (uuid PK), `senderPsid`, `customerMessage`, `aiDraft`
- `status` (pending/approved/rejected/expired), `adminEditedReply`, `reviewedAt`, `createdAt`

---

## 6. AUTHENTICATION SYSTEM

### 6.1 Admin Authentication
- **Strategy:** Passport.js local strategy (username + bcrypt password comparison)
- **Session:** express-session + connect-pg-simple (stored in `user_sessions` table)
- **Session fields written:** `adminUserId`, `adminUserRole`
- **Routes:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **File:** `server/routes/auth.routes.ts`
- **Role-based guards:** `requireAuth` middleware checks session, `requireRole` checks role hierarchy

### 6.2 Customer Authentication
- **Google OAuth 2.0:** passport-google-oauth20, creates/updates user record by `googleSub`
- **OTP phone verification:** code hashed and stored in `otp_codes`, verified on login
- **Guest access:** certain customer routes accessible without auth
- **File:** `server/customerGoogleAuth.ts`
- **Callback:** `GET /auth/google/callback`

### 6.3 Corporate Authentication
- **Strategy:** email (`portalUsername`) + bcrypt password (`portalPasswordHash`) from `corporate_clients`
- **Trusted devices:** SHA-256 hashed token stored in `trusted_corporate_devices`, valid for `trustedUntil`
- **Routes:** `server/routes/corporate-auth.routes.ts` at `/api/corporate/auth/*`

### 6.4 Manager PIN Verification
- **Purpose:** Inline re-verification for sensitive admin actions (price overrides, discounts)
- **Hook:** `useManagerPin.tsx` triggers a PIN dialog
- **Verification:** Manager re-submits their own password via dedicated endpoint

---

## 7. WORKFLOW PIPELINES

### 7.1 Job Ticket Statuses
```
Pending → Diagnosing → Pending Parts → In Progress → On Workbench → Ready → Delivered
                                                                           ↘ Not OK
(Cancelled from any status)
```
Types: standard / warranty_claim / repeat_repair

### 7.2 Admin Pipeline (Service Requests — 6 happy-path steps)
```
New → Under Review → Approved → Work Order → Resolved → Closed
         ↘ Declined    (any) → Cancelled
                    ↘ Unrepairable (from Work Order)
```
- Declined can trigger from: Under Review
- Cancelled can trigger from: Approved, Work Order
- Unrepairable can trigger from: Work Order
- `autoResolveOnDelivery = true` — when tracking hits Delivered/Collected, auto-sets to Resolved
- `autoCloseDays = 7` — auto-closes 7 days after Resolved

### 7.3 Rollback Rules (per ADMIN_ROLLBACK_RULES)
| Status | Can Roll Back To |
|---|---|
| New | Cannot |
| Under Review | New |
| Approved | Under Review |
| Work Order | Cannot (job already created) |
| Resolved | Work Order (for re-repair) |
| Closed | Cannot |
| Terminal states | Cannot |

### 7.4 Pickup Flow (9 steps, customer-facing tracking)
```
Booked → Collection En Route → Device Collected →
Technician Assigned → Diagnosis Complete → Awaiting Parts (skippable) →
Repairing → Ready for Return → Delivered
```
Steps with `requiresJob: true`: Technician Assigned, Diagnosis Complete, Repairing

### 7.5 Service Center Flow (8 steps)
```
Awaiting Drop-off → Device Received →
Technician Assigned → Diagnosis Complete → Awaiting Parts (skippable) →
Repairing → Ready for Collection → Collected
```

### 7.6 Legacy Stage System (deprecated, kept for backward compat)
4 flows: QUOTE_PICKUP, QUOTE_SERVICE_CENTER, REPAIR_PICKUP, REPAIR_SERVICE_CENTER  
Helper function `getStageFlow(intent, mode)` returns appropriate flow.

### 7.7 Service Request Statuses (alternative set in schema enums)
submitted → triaged → quoted → customer_decision → scheduled → device_received → assigned → in_repair → quality_check → ready → out_for_delivery → closed

---

## 8. BRAIN AI SYSTEM

### 8.1 Overview
Facebook Messenger chatbot integrated with AI. Separate PostgreSQL database. Three operating modes controlled via DB config or env var.

### 8.2 Operating Modes
| Mode | Behavior |
|---|---|
| `observe` | Records all messages and human replies. No AI auto-reply. Pure data collection. |
| `shadow` | AI generates draft reply. Saved to `shadow_drafts` for human review before sending. |
| `autopilot` | AI auto-replies to customers immediately via Messenger Send API. |

Mode source: `brain_config` table key `brain_mode`, or `BRAIN_MODE` env var fallback.

### 8.3 Brain Service (`server/brain/brain.service.ts`)
- `getSession(senderPsid)` — retrieve or create session in Brain DB
- `updateSession(psid, message)` — append message to JSONB history array
- `logConversation(data)` — save Q&A pair + generate 768-dim vector via Gemini `text-embedding-004`
- `getBrainMode()` — read mode from DB first, then env var
- `saveShadowDraft(psid, message, draft)` — queue AI draft for review
- Semantic search: vector cosine similarity against `conversations.embedding` and `knowledge.embedding` for RAG

### 8.4 AI Models Used
- **Gemini 1.5 Pro** (`@google/generative-ai`) — conversation generation, classification
- **Gemini text-embedding-004** — 768-dimension text embeddings for semantic search
- **Groq SDK** — alternative fast-inference endpoint

### 8.5 Messenger Webhook (`server/routes/messenger.routes.ts`)
- `GET /api/messenger/webhook` — Facebook hub verification handshake using `MESSENGER_VERIFY_TOKEN`
- `POST /api/messenger/webhook` — processes message events
  - Filters `messaging` events
  - Detects echo (page's own messages) → logs as human reply (`repliedBy: 'human'`)
  - Routes to observe/shadow/autopilot based on mode

### 8.6 Knowledge Base
`knowledge` table stores structured topic/content pairs with embeddings. Retrieved by semantic similarity as context for AI responses (RAG pattern).

### 8.7 TV Knowledge Base (`server/services/tv-knowledge-base.ts`)
Static structured data about TV brands, common failure modes, repair procedures. Used as additional context in AI prompts.

---

## 9. ADMIN PORTAL

**URL base:** `/admin/*`  
**Auth:** Admin session (Passport local), AdminAuthContext  
**Main shell:** `client/src/pages/admin/bento/` (bento-grid tab-based dashboard)  
**Module gate:** each tab can be enabled/disabled via system_modules

### 9.1 Admin Login (`client/src/pages/admin/login.tsx`)
Username + password form. On success, session is set and AdminAuthContext populated.

### 9.2 Admin Workbench (`client/src/pages/admin/workbench.tsx`)
Module management page:
- Lists all `system_modules` with per-portal enable/disable toggles (4 toggles per module)
- Text search filter
- Auto-detects current operating mode: `admin_only` / `retail` / `b2b` / `full_business` / `max_power` / `custom`
- Dev infrastructure modules (system_health, ai_brain, audit_logs) shown in separate section
- Confirmation dialog for toggle changes on core modules
- `useModules` context integration

### 9.3 Bento Dashboard Shared Components (`bento/shared/`)
- `BentoCard.tsx` — grid card wrapper component
- `DashboardSkeleton.tsx` — loading skeleton
- `GlobalSearch.tsx` — cross-entity search (jobs, customers, inventory, orders, service requests)
- `HighlightMatch.tsx` — highlights search term matches in text
- `NotificationPanel.tsx` — notification bell with slide-out panel
- `StatusBadge.tsx` — colored status label component

### 9.4 DashboardTab
- 4 metric cards: jobs today, revenue today, pending jobs, critical/overdue
- Each card opens a popup panel with more detail
- Area chart: 7-day revenue trend
- Pie chart: job status distribution
- IndexedDB snapshot for offline fallback

### 9.5 JobTicketsTab (+ sub-components in `jobs/`)
- 3 view modes: **Grid** (kanban-style cards), **List** (table), **Kanban** (drag columns)
- SSE real-time updates push new jobs/status changes to UI
- Bulk actions: change status, assign technician, delete
- QR/barcode scanner: scan ticket number to jump to job
- Full CRUD: Create Job (`CreateJobDrawer.tsx`), Edit Job (`EditJobDrawer.tsx`), View (`JobDetailsSheet.tsx`)
- Filters (`JobFilters.tsx`): status, technician, date range, search text, priority
- Grid view: `JobTicketGrid.tsx` | List view: `JobTicketList.tsx`

### 9.6 ServiceRequestsTab
- Dual-pipeline UI: Admin Pipeline (6 steps + 3 off-ramps) + Customer Tracking (Pickup 9-step or SC 8-step)
- Step advancement buttons with confirmation
- Media viewer for uploaded images/videos
- Quote creation modal with pricing inputs
- Technician assignment
- Convert to job ticket action
- Filter by status, date, mode (pickup/service_center)

### 9.7 BrainTab
- Radio selector for observe/shadow/autopilot mode (calls API to update `brain_config`)
- Shadow draft list: pending AI-generated reply drafts
- Per-draft: approve, reject, or edit inline before approving
- Conversation history view (from `conversations` table)
- Polls every 10 seconds for new pending drafts

### 9.8 FinancesTab (5 sub-tabs)
- **FinancesTabSales.tsx:** POS transaction history, daily/weekly totals, payment method breakdown
- **FinancesTabPettyCash.tsx:** Petty cash in/out log, add new record
- **FinancesTabDues.tsx:** Outstanding due records, mark paid, overdue alerts
- **FinancesTabRefunds.tsx:** Refund list, approve/reject/process workflow
- **FinancesTabDrawer.tsx:** Drawer session history, open new session, reconciliation dialog (blind drop comparison)

### 9.9 SalaryHRTab (4 sub-tabs + leave/payroll/bonus)
- **SalaryNatureSubTab.tsx:** Salary component library (earning/deduction definitions), salary structure templates
- **EmployeeCompensationSubTab.tsx:** Per-employee salary assignment with structure + base amounts
- **AdvisoryDashboardSubTab.tsx:** AI increment suggestions + deduction proposals, admin approve/modify/dismiss
- **OffboardingSubTab.tsx:** Resignation/termination workflow, final settlement calculation
- Leave management: leave application list, approve/reject, balance tracking
- Payroll records: monthly payroll list, generate/approve/mark paid
- Bonus records: Eid bonus calculation and payment tracking
- Holiday calendar: add/edit holidays, dismiss/force status
- Dialogs: `SalaryHRDialogs.tsx`

### 9.10 AttendanceTab
- Monthly calendar grid per employee
- Daily check-in/check-out times, GPS coordinates, geofence status
- Distance from work location per record
- Export to CSV/Excel
- Per-employee filter and date range

### 9.11 InventoryTab
- Stock item list with search and category filter
- Add/edit/delete items
- Serial number management per serialized item
- Wastage modal: log defective/damaged parts
- Image carousel for item photos
- Low stock alerts (items below `lowStockThreshold`)
- Hot deals toggle

### 9.12 PosTab
- Full POS terminal interface
- Cart: add items from inventory, adjust quantity, remove
- Barcode/QR scanner to add items by SKU
- Job linking: attach sale to existing job ticket
- Drawer session requirement: must open drawer before processing cash
- Payment: cash/card/bKash/Nagad, handles change calculation
- Invoice generation and print
- Dialogs: `PosDialogs.tsx`

### 9.13 ChallanTab
- Challan list with status and type filters
- Create challan wizard: multi-device entry, vehicle/driver info
- Print challan document (opens `ChallanOutPrint.tsx`)
- Mark as delivered with timestamp

### 9.14 UsersTab
- Staff list: name, role, status, last login
- Create/edit user: full profile, role assignment
- 35+ individual permission checkboxes
- Activate/deactivate user
- Salary config link

### 9.15 SettingsTab (4 sections, each in own file)
- **GeneralSection.tsx:** Shop name, address, phone, logo upload, timezone
- **ServiceConfigSection.tsx + ServiceConfigEditor.tsx:** Service types, pricing tiers, tag lists (`TagListCard.tsx`)
- **CmsHomeSection.tsx:** Homepage CMS — hero sliders, counters, service cards, hot deals, brands
- **AboutUsSection.tsx:** About page CMS — company info, team, story

### 9.16 CustomersTab
- Customer list with search (by name/phone)
- Per-customer activity sheet: jobs, orders, reviews, service requests
- Customer profile view

### 9.17 OverviewTab
- KPI row: total jobs, revenue, active techs, satisfaction score
- 30-day charts: revenue trend, job volume
- Technician workload breakdown (jobs per tech, completion rate)

### 9.18 SystemHealthTab
- Automatically detects system health issues:
  - Overdue jobs (past deadline)
  - Low stock items (below threshold)
  - Unattended service requests (adminInteracted = false)
- Each alert links to the relevant tab
- Refresh interval

### 9.19 TechnicianTab
- Per-technician expandable cards
- Current active jobs list
- Job count, completion rate
- Performance metrics

### 9.20 QuotationsTab
- Quotation list with status filter
- Create/edit quotation with line items editor
- PDF export via jsPDF + html2canvas
- Status tracking (Draft/Sent/Accepted/Rejected/Expired)
- Email/print send options

### 9.21 PickupTab
- Pickup schedule list
- Tier management (Regular/Priority/Emergency with pricing)
- Staff assignment to pickup
- Status progression through pickup flow steps

### 9.22 WastageTab
- Wastage log list
- Financial loss KPIs (total loss, by category, by supplier)
- Date range filter, technician filter

### 9.23 ReportsTab
- Period selector (7/30/90 days, custom)
- Revenue charts, job volume charts
- Technician performance comparison
- Export to PDF

### 9.24 WarrantyClaimsTab
- Warranty claim list
- 2-step audit: claim → approve
- Link to original job
- Auto-validity check against `warrantyExpiryDate`

### 9.25 PurchasingTab
- Purchase order list
- Create purchase order with item/supplier/quantity
- Mark as received → updates inventory stock levels
- Expected delivery tracking

### 9.26 AuditLogsTab
- Full action history with actor, entity, timestamp
- Color-coded action types (CREATE/UPDATE/DELETE/LOGIN)
- Severity dots (info/warning/critical)
- Filter by user, action type, date range

### 9.27 InquiriesTab
- Contact form message list
- Reply with CSRF protection
- Mark as resolved

### 9.28 QualityAnalyticsTab
- Defect statistics by category
- Per-technician defect/rework rate
- Supplier defect rates
- Date range filter

### 9.29 CorporateMessagesTab
- WhatsApp-style chat UI
- Thread list sidebar + message view
- SSE real-time message delivery
- Message queue for delivery guarantee
- Read receipts
- Image/file attachment upload
- Mark thread as closed/archived

### 9.30 CorporateTab
- Corporate client list
- Create/edit client modal (company info, pricing, SLA)
- Generate billing statement for a client

### 9.31 CorporateRepairsTab
- Job tickets filtered to corporate clients
- Filter by client name
- Corporate-specific fields (challan, bill, SLA)

### 9.32 OrdersTab
- E-commerce order list
- Status progression (Pending → Accepted → Processing → Shipped → Delivered)
- Decline with reason

### 9.33 CashierTab
- Cashier-scoped view (limited permissions)
- Focused on POS and payment processing

### 9.34 UnifiedB2BTab
- Combined view of corporate-related activity

### 9.35 Demo/Placeholder Tabs
- `PlaceholderTab.tsx` — empty placeholder for unfinished features
- `DragDropDemo.tsx` — drag-and-drop UI experiment
- `DesignConceptShell.demo.tsx` — design concept preview shell

---

## 10. CUSTOMER PORTAL

**URL routes:** `/`, `/track-job`, `/repair-request`, `/shop`, `/cart`, `/checkout`, `/my-profile`, `/my-warranties`, `/get-quote`, `/quote-approval`, `/track-order`, `/intake-wizard`, `/services`, `/service-details`, `/about`, `/support`, `/privacy-policy`, `/terms-and-conditions`, `/warranty-policy`, `/login`, `/welcome`, `/not-found`

### 10.1 home.tsx
- Hero slider (Embla Carousel, Framer Motion animations)
- Animated number counters
- Active repair card (shows customer's current job if logged in)
- Quick action buttons (book repair, track job, shop)
- Services section (from service catalog)
- Hot deals section (`showOnHotDeals = true` items)
- Featured products grid
- Customer reviews carousel (approved only)
- FAQ accordion
- Before/after repair photo section
- Brand logos section
- All CMS content editable from admin SettingsTab

### 10.2 track-job.tsx
- Search input for ticket number
- Fetches job status from API
- Shows current status with colored icon
- Step progress indicator for pickup/SC flows
- Estimated delivery display

### 10.3 repair-request.tsx
- Multi-step form:
  1. Brand/device type/primary issue/symptoms/photos
  2. Contact info (name, phone, address)
  3. Schedule (pickup vs service center, date, time slot)
- Photo upload via ImageKit
- Returns ticket number on submission

### 10.4 my-profile.tsx
Tabbed interface:
- **Profile:** edit name, phone, email, address, photo
- **My Jobs:** job ticket history with statuses
- **Orders:** order history with tracking
- **Warranties:** warranty-covered jobs, submit claim
- **Reviews:** submitted reviews, write new review

### 10.5 shop.tsx
- Products filtered by `showOnWebsite = true`
- Category/brand filter sidebar
- Price range filter
- Product cards with image carousel
- Add to cart

### 10.6 cart.tsx
- Cart item list (from CartContext)
- Quantity +/- controls
- Remove item
- Subtotal calculation
- Proceed to checkout

### 10.7 checkout.tsx
- Shipping address (saved addresses or new)
- Payment method selection
- Order summary with total
- Submit order → creates `orders` + `order_items` records

### 10.8 track-order.tsx
- Order number input
- Order status and shipping info display

### 10.9 get-quote.tsx
- Quote request form (device info, issue, contact)
- Submits as `service_request` with `isQuote = true`

### 10.10 quote-approval.tsx
- Customer views quote details (price, notes)
- Accept or reject quote → updates `quoteStatus`

### 10.11 intake-wizard.tsx
- Alternative multi-step intake flow
- More detailed device condition capture
- Photo capture via camera

### 10.12 my-warranties.tsx
- List of jobs with active warranty
- Warranty claim submission form

### 10.13 login.tsx
- Google OAuth sign-in button
- OTP phone verification flow

### 10.14 welcome.tsx
- Post-login welcome/onboarding screen

### 10.15 Static/Info Pages
- `about.tsx` — Company about page (CMS content from settings)
- `services.tsx` — Service listing from `service_catalog`
- `service-details.tsx` — Individual service detail page
- `support.tsx` — Support contact form (submits to `inquiries` table)
- `privacy-policy.tsx` — Content from `policies` table (slug: privacy)
- `terms-and-conditions.tsx` — Content from `policies` table (slug: terms)
- `warranty-policy.tsx` — Content from `policies` table (slug: warranty)
- `not-found.tsx` — 404 page

---

## 11. CORPORATE PORTAL

**URL routes:** `/corporate/login`, `/corporate/dashboard`, `/corporate/job-tracker`, `/corporate/job-details/:id`, `/corporate/messages`, `/corporate/notifications`, `/corporate/profile`, `/corporate/service-request`, `/corporate/corporate-not-found`

### 11.1 corporate/login.tsx
- Email + password form
- Trusted device checkbox (skips re-auth next time)

### 11.2 corporate/dashboard.tsx
- Stats: active jobs, pending, completed this month, outstanding balance
- Quick charts (lazy-loaded chart component)
- Quick links to other sections

### 11.3 corporate/job-tracker.tsx
- Paginated job list filtered to this corporate client
- 30-second auto-refresh
- Status filter
- Click → job-details

### 11.4 corporate/job-details.tsx
- Full detail view of single job
- Status history timeline
- Flag as urgent button (creates `corporate_portal_urgency`)

### 11.5 corporate/messages.tsx
- WhatsApp-style chat UI
- SSE real-time delivery (`useCorporateSSE` hook)
- Message queue (`useMessageQueue` hook) for delivery guarantee
- Sound notification on new message (`useSound` hook)
- Read receipts
- Image upload attachment

### 11.6 corporate/notifications.tsx
- Notification list for this corporate account
- Mark as read

### 11.7 corporate/profile.tsx
- Corporate account info view
- Contact details, billing info

### 11.8 corporate/service-request.tsx
- Submit new repair service request from corporate portal
- Multiple device entry

---

## 12. TECHNICIAN PORTAL

**URL routes:** `/tech/dashboard`, (job detail via drawer)

### 12.1 TechDashboard.tsx
- "Tech Workbench" — shows ONLY jobs assigned to the logged-in technician
- QR scanner for job lookup by ticket number
- Status advancement: shows only transitions allowed from current status
- Photo upload buttons (diagnosis, completion) via Capacitor camera or file input
- `TechJobDrawer.tsx` opens for selected job

### 12.2 TechJobDrawer.tsx
- Slide-in job detail panel
- Status update buttons
- Notes entry field
- Device images display
- Parts used entry
- Local purchase logging

---

## 13. MODULE SYSTEM

### 13.1 system_modules Table
Each row represents one toggleable feature. Per-portal enable/disable. `isCore` modules cannot be fully disabled.

### 13.2 Operating Mode Detection (workbench.tsx)
Analyzed by scanning all module states and matching against predefined mode patterns:
- `admin_only` — only admin portal features
- `retail` — admin + customer-facing retail
- `b2b` — admin + corporate portal
- `full_business` — admin + customer + corporate
- `max_power` — all features including dev/AI
- `custom` — non-standard combination

### 13.3 ModuleContext (`client/src/contexts/ModuleContext.tsx`)
- Fetches `/api/modules` at app start
- Provides `isModuleEnabled(moduleId, portal)` helper
- Used in tab rendering to conditionally show/hide tabs and UI sections
- Module has `offlineCapability`: write/read-only/locked

---

## 14. REAL-TIME INFRASTRUCTURE

### 14.1 SSE Broker (`server/routes/middleware/sse-broker.ts`)
Three separate connection pools:
| Pool | Who connects | Events pushed |
|---|---|---|
| Admin | Admin dashboard users | job updates, SR changes, notifications, messages |
| Customer | Customer portal users | job status updates, order changes |
| Corporate | Corporate portal users | job updates, new messages |

Functions: `broadcastToAdmins`, `broadcastToCustomer`, `broadcastToCorporate`  
Connection counts exposed via `getAdminConnectionCount()`, `getCustomerConnectionCount()`, `getCorporateConnectionCount()`  
Health endpoint at `/api/health` shows live connection counts.

### 14.2 Admin Notification Feed (`server/services/admin-notification-feed.service.ts`)
Sends structured notification payloads to admin SSE pool when business events occur.

### 14.3 Admin Real-time (`server/services/admin-realtime.service.ts`)
Broadcasts real-time data updates to admin SSE clients.

### 14.4 Corporate Notification Service (`server/services/corporate-notification.service.ts`)
Dispatches events to corporate SSE pool and creates `notifications` records.

### 14.5 Push Notifications (`server/pushService.ts`)
- Firebase Admin SDK
- Sends FCM push to tokens in `device_tokens` table
- Used for: job status changes, new messages, order updates

### 14.6 Client-side SSE Hook (`client/src/hooks/useSSE.ts`)
Generic EventSource connection hook. Handles reconnection.

### 14.7 Corporate SSE Hook (`client/src/hooks/useCorporateSSE.ts`)
Corporate-specific SSE connection manager.

---

## 15. PRINT DOCUMENTS

All in `client/src/components/print/`:

| Component | Purpose | Trigger |
|---|---|---|
| `Invoice.tsx` | Sales/job invoice | POS complete, job billing |
| `Receipt.tsx` | POS transaction receipt | After POS sale |
| `ChallanOutPrint.tsx` | Outgoing delivery challan | Challan print button |
| `CorporateSingleJobPrint.tsx` | Single job detail for corporate | From corporate job detail |
| `CorporateMultiJobPrint.tsx` | Multi-job billing statement | Corporate bill generation |
| `PrintStyles.tsx` | Shared `@media print` CSS | Imported by all above |

`client/src/pages/admin/corporate-bill-print.tsx` — full-page dedicated print route for corporate bills.

jsPDF + html2canvas used in `QuotationsTab` and `ReportsTab` for programmatic PDF.  
Server-side PDF also available via `server/services/pdf-invoice.service.ts` (uses fonts in `server/fonts/`).

---

## 16. REACT CONTEXTS

All in `client/src/contexts/`:

| Context | What it manages |
|---|---|
| `AdminAuthContext.tsx` | Admin session state, login/logout, user data + permissions |
| `CustomerAuthContext.tsx` | Customer Google OAuth session, profile |
| `CorporateAuthContext.tsx` | Corporate client session |
| `AdminSSEContext.tsx` | Admin SSE connection + event handler registration |
| `ModuleContext.tsx` | system_modules state + `isModuleEnabled(id, portal)` |
| `CartContext.tsx` | Shopping cart items, add/remove/clear/total |
| `OfflineContext.tsx` | Online/offline status, offline queue |
| `PushNotificationContext.tsx` | FCM token registration, notification handlers |
| `RollbackContext.tsx` | Job status rollback workflow state |
| `AppOpeningContext.tsx` | Capacitor app open/pause/resume lifecycle |

---

## 17. CUSTOM HOOKS

All in `client/src/hooks/`:

| Hook | Purpose |
|---|---|
| `use-dashboard.ts` | Dashboard data fetching + IndexedDB caching |
| `use-mobile.tsx` | Responsive breakpoint detection (mobile/tablet/desktop) |
| `use-toast.ts` | Sonner toast notification helper |
| `useAndroidBack.ts` | Capacitor Android hardware back button interception |
| `useCameraLens.ts` | Camera capture + ImageKit upload integration |
| `useCorporateSSE.ts` | Corporate portal SSE EventSource connection |
| `useManagerPin.tsx` | Modal PIN dialog for manager re-verification |
| `useMessageQueue.ts` | Offline message queue for chat delivery guarantee |
| `useNetworkStatus.ts` | Online/offline browser events |
| `useOfflineMutation.ts` | TanStack Query mutation wrapper with offline queue |
| `usePageTitle.ts` | Dynamic `document.title` updates |
| `useParallax.ts` | Parallax scroll effect for hero sections |
| `usePushNotifications.ts` | FCM token lifecycle (register, update, delete) |
| `useSSE.ts` | Generic SSE EventSource connection with reconnection |
| `useSound.ts` | Audio playback for notification sounds |
| `useVoiceInput.ts` | Capacitor speech recognition (voice-to-text) |

---

## 18. SERVER SERVICES (26 files)

All in `server/services/`:

| Service | Responsibility |
|---|---|
| `ai.service.ts` | Gemini API calls: diagnosis, insights, classification |
| `audit.service.ts` | Helper to write audit_log entries |
| `auth.service.ts` | Password hashing/comparison, session helpers |
| `backup.service.ts` | Database backup orchestration (export → encrypt → compress → upload) |
| `compression.service.ts` | Data compression for backup payloads |
| `corporate-notification.service.ts` | Corporate SSE event dispatch |
| `corporate.service.ts` | Corporate client business logic |
| `customer.service.ts` | Customer profile upsert (Google OAuth) |
| `drawer-day-close.service.ts` | Scheduled auto-close of open drawer sessions at EOD |
| `encryption.service.ts` | AES-256-GCM encryption for backup files |
| `fcm.service.ts` | Firebase Cloud Messaging push dispatch |
| `finance.service.ts` | Financial calculations, summary queries |
| `firebase.ts` | Firebase Admin SDK initialization singleton |
| `google-drive.service.ts` | Google Drive OAuth + file upload/download |
| `inventory.service.ts` | Stock level management, reorder alert logic |
| `job.service.ts` | Job ticket business logic, status transition validation |
| `mailer.ts` | Nodemailer SMTP setup + email templates |
| `notificationService.ts` | Create `notifications` record + dispatch FCM push |
| `payroll.service.ts` | Payroll calculation engine (attendance → salary) |
| `pdf-invoice.service.ts` | Server-side PDF generation with embedded fonts |
| `restoration.service.ts` | Database restore from encrypted backup |
| `sms.service.ts` | SMS dispatch (provider integration, used for OTP) |
| `storage.service.ts` | Multi-provider file storage abstraction (ImageKit/Cloudinary/S3/GCS) |
| `tv-knowledge-base.ts` | Static TV repair domain knowledge |

---

## 19. SERVER REPOSITORIES (22 files)

All in `server/repositories/`. Pattern: functions/classes querying Drizzle ORM.

| File | Entities |
|---|---|
| `base.ts` | Base repository class |
| `analytics.repository.ts` | Aggregate analytics queries |
| `attendance.repository.ts` | Attendance records |
| `corporate.repository.ts` | Corporate clients, challans, bills |
| `customer.repository.ts` | Customer profiles |
| `employment.repository.ts` | Employment profiles |
| `finance.repository.ts` | POS, petty cash, dues, drawers |
| `hr.repository.ts` | Leave, payroll, bonuses, holidays |
| `inventory.repository.ts` | Inventory items, serials, purchase orders |
| `job.repository.ts` | Job tickets |
| `legacy-schema.ts` | Backward-compat schema references |
| `notification.repository.ts` | Notifications, device tokens |
| `offboarding.repository.ts` | Offboarding, settlement |
| `order.repository.ts` | Orders, order items |
| `pos.repository.ts` | POS transactions |
| `salary-structure.repository.ts` | Salary components, structures, assignments |
| `service-request.repository.ts` | Service requests, events, pickup schedules |
| `settings.repository.ts` | Settings key-value |
| `system.repository.ts` | System modules |
| `user.repository.ts` | Users |
| `warranty.repository.ts` | Warranty claims |
| `work-location.repository.ts` | Work locations |
| `index.ts` | Barrel export |

---

## 20. SERVER LIBRARIES

In `server/lib/`:

| File | Purpose |
|---|---|
| `dashboardCache.ts` | Server-side dashboard data caching (memoizee/node-cache) |
| `mobile-workforce.ts` | Mobile workforce assignment + GPS tracking logic |
| `workflowAutomation.ts` | Auto-transition firing (autoResolveOnDelivery, autoCloseDays) |

---

## 21. SERVER UTILITIES

In `server/utils/`:

| File | Purpose |
|---|---|
| `auditLogger.ts` | Helper to write to audit_logs from route handlers |
| `cache.ts` | node-cache and memoizee wrappers |
| `phone.ts` | Bangladesh phone number normalization (last 10 digits) |
| `redact.ts` | Scrubs sensitive fields (passwords, tokens) from logs |
| `route-error.ts` | Standardized HTTP error throwing helper |
| `sessionManager.ts` | Session utility helpers |
| `validateEnv.ts` | Checks required env vars on startup, throws if missing |

---

## 22. ROUTE MIDDLEWARE

In `server/routes/middleware/`:

| File | Purpose |
|---|---|
| `auth.ts` | `requireAuth` (session check), `requireRole` (role hierarchy) |
| `superAdminOnly.ts` | Restricts endpoint to super_admin role only |
| `csrf.ts` | CSRF token injection + verification |
| `rate-limit.ts` | Express rate-limit configurations per route group |
| `sse-broker.ts` | SSE connection pool management (3 pools) |
| `validate.ts` | Zod schema request body/params validation |
| `ai-logger.ts` | Logs AI requests/responses, AI error handling |
| `error-handler.ts` | Central error response formatting |

---

## 23. FILE STORAGE SYSTEM

### 23.1 Multi-Provider Abstraction (`server/services/storage.service.ts`)
Routes uploads to different providers:
- **ImageKit** (primary): image optimization + CDN delivery
- **Cloudinary**: cloud video/image transformation
- **AWS S3**: object storage
- **Google Cloud Storage**: object storage

### 23.2 Upload Route (`server/routes/upload.routes.ts`)
- multer middleware for multipart/form-data
- Determines provider based on file type and context
- Returns CDN URL in response

### 23.3 Object Storage (`server/objectStorage.ts`)
Low-level S3/GCS operations.

### 23.4 Object ACL (`server/objectAcl.ts`)
Access control for stored objects.

---

## 24. BACKUP SYSTEM

### 24.1 Process
1. Export database tables as JSON/SQL
2. Compress with `compression.service.ts`
3. Encrypt with AES-256-GCM (`encryption.service.ts`) — stores salt, iv, authTag in `backup_metadata`
4. Upload to Google Drive via `google-drive.service.ts`
5. Record in `backup_metadata` table

### 24.2 Restore Process
`restoration.service.ts`: download from Drive → decrypt → decompress → import to DB

### 24.3 Backup Routes (`/api/admin/*`)
- Trigger manual backup
- List backups
- Download backup
- Configure schedule
- Restore from backup

### 24.4 Tables Used
`backup_metadata`, `backup_schedules`, `backup_audit_logs`

---

## 25. AI FEATURES

### 25.1 Diagnosis AI (`server/routes/ai.routes.ts` + `server/services/ai.service.ts`)
- Analyzes device symptoms + issue description
- Returns diagnosis suggestions and repair steps
- Few-shot examples from `diagnosis_training_data`
- Results stored in `ai_debug_suggestions` (also used for server error suggestions)
- Training feedback loop: `wasAccurate` flag per prediction

### 25.2 Business Insights
- Generates insights from job/finance data using Gemini
- Cached in `ai_insights` with expiry
- Types: red (warning), green (positive), blue (informational)
- Displayed in `OverviewTab` and `ReportsTab`

### 25.3 Lens AI (`server/routes/lens.routes.ts`)
- Admin captures photo of device
- Gemini Vision analyzes image
- Returns visual condition assessment (damage, component status)

### 25.4 Salary Advisory
- `increment_suggestions` table: AI-suggested salary increments based on performance/attendance
- `deduction_proposals` table: AI-suggested deductions based on absence patterns
- Admin reviews in `AdvisoryDashboardSubTab`

### 25.5 Query Logging
All AI calls logged to `ai_query_log` (queryType, wasSuccessful only — lightweight).

---

## 26. OFFLINE SYNC

### 26.1 Client-Side
- `OfflineContext.tsx` — tracks network status
- `useNetworkStatus.ts` — listens to browser online/offline events
- `useOfflineMutation.ts` — queues TanStack Query mutations when offline, replays when online
- `useMessageQueue.ts` — queues chat messages for guaranteed delivery
- TanStack Query persist client + `@tanstack/query-sync-storage-persister` for IndexedDB query cache
- `idb` library wraps IndexedDB operations

### 26.2 Server-Side (`server/routes/offline-sync.routes.ts` at `/api/offline`)
- Receives batched operations
- Applies with conflict resolution strategy
- Returns merge results and conflicts

---

## 27. CAPACITOR MOBILE APP

The React + Vite frontend is wrapped as a Capacitor app for iOS/Android deployment.

### 27.1 Native Capabilities
| Capability | How used |
|---|---|
| Camera | Photo capture for job/device images |
| Push Notifications | FCM native push delivery |
| Preferences | Persist auth tokens, settings |
| App lifecycle | Handle pause/resume for SSE reconnect |
| Haptics | Feedback on button press, status change |
| Keyboard | Adjust layout when keyboard opens |
| Splash Screen | Control display duration |
| Status Bar | Match app theme color |
| Native Biometric | Fingerprint/face login for admin |
| OTA Updater | Ship JS bundle updates without app store |
| Google Auth | Native Google sign-in (no browser redirect) |
| Speech Recognition | Voice input for search/notes |

### 27.2 OTA Updates
`@capgo/capacitor-updater` fetches updated JS bundles from a configured URL. Users get new features without re-downloading from the app store.

### 27.3 Biometric Auth Flow
1. Super admin enables biometric for a user account
2. First login: user registers biometric
3. Subsequent logins: native prompt, no password required

---

## 28. FLUTTER APPS

Two separate Dart/Flutter projects in the repository root:

### 28.1 mobile_app_flutter/
Customer-facing app. Separate Dart/Flutter codebase. Targets same Node.js backend API. Not integrated with the Node.js/Vite build pipeline.

### 28.2 workforce_app_flutter/
Technician/workforce management app. Separate Dart/Flutter codebase. Targets same backend. Not integrated with Node.js build.

Both apps include their own `pubspec.yaml`. JDK 11 (`jdk-11.0.29+7/` and `jdk11.zip`) is bundled in the repository root for Android builds.

---

## 29. BUILD AND DEPLOYMENT

### 29.1 Development
```bash
npm run dev          # tsx server/index.ts — serves API + Vite dev middleware on port 5083
npm run dev:client   # Vite standalone dev server on port 5082
```

### 29.2 Production Build (`build.ts`)
1. `api-docs:generate` — generates API contract snapshot
2. Vite build for client (output: `dist/public/`)
3. esbuild for server (output: `dist/index.cjs`, CommonJS)
4. Copies static assets

### 29.3 Production Run
```bash
NODE_ENV=production node dist/index.cjs
```

### 29.4 Deployment Targets
- **Render:** referenced in recent git commits, primary deployment
- **Vercel:** `vercel.json` + `serverless-http` adapter in `api/` directory
- **Docker:** `Dockerfile` + `docker-compose.dev.yml` available
- Formerly ran on **Replit** (`.replit` files present)

### 29.5 Database Operations
```bash
npm run db:push               # Apply schema changes to DB (drizzle-kit push)
npm run schema:check:prod     # Compare local schema vs production DB
```

---

## 30. SCRIPTS AND TOOLING

### 30.1 `script/` Directory (Dev scripts)
| Script | Purpose |
|---|---|
| `build.ts` | Production build orchestration |
| `check-db.ts` | Test database connection |
| `check-production-schema.ts` | Schema diff vs production |
| `create-admin.ts` | Create admin user from CLI |
| `verify-admin.ts` | Verify admin account exists |
| `verify-matching.ts` | Schema verification tool |
| `generate-api-contract.ts` | Generate `api-contract-snapshot.json` |
| `backfill_hr_data.ts` | One-time HR data migration |
| `update_hr_setup_routes.ts` | Route migration helper |
| `update_payroll_routes.ts` | Route migration helper |

Also contains full duplicate server files (Replit artifact — `server/routes.ts`, `schema.ts`, etc.).

### 30.2 `server/scripts/`
`seed-corporate.ts` — seeds sample corporate client data.

### 30.3 `server/seed.ts`
Seeds super admin account on startup if none exists.

---

## 31. TESTS

**Framework:** Vitest  
**Directory:** `tests/`

| File | Tests |
|---|---|
| `admin-notification-feed.test.ts` | Admin SSE notification feed |
| `admin-routes-smoke.test.ts` | Smoke tests for all admin API routes |
| `auth-boundaries.test.ts` | Auth middleware boundary enforcement |
| `factory.ts` | Test data factory helpers |
| `mobile-workforce.test.ts` | Mobile workforce logic |
| `repository-compat.test.ts` | Repository layer compatibility |
| `setup.ts` | Vitest setup (DB connections, test env) |
| `sse-load.ts` | SSE load test utility |

---

## 32. MIGRATIONS

**Directory:** `migrations/`

| File | Description |
|---|---|
| `0000_productive_ser_duncan.sql` | Initial full schema |
| `0001_add_assisted_by.sql` | Add `assisted_by` to job_tickets |
| `0001_job_ticket_received_accessories.sql` | Add `received_accessories` to job_tickets |
| `0002_add_corporate_client_shortcodes.sql` | Add `short_code` to corporate_clients |
| `0002_service_requests_admin_interacted.sql` | Add `admin_interacted` to service_requests |
| `0003_corporate_notifications.sql` | Corporate notification tables |
| `0004_prod_schema_sync.sql` | Production schema sync (recent) |
| `meta/0000_snapshot.json` | Drizzle schema snapshot |
| `meta/_journal.json` | Migration journal |

---

## 33. ENVIRONMENT VARIABLES (Key)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Main PostgreSQL (NeonDB serverless) |
| `BRAIN_DATABASE_URL` | Brain PostgreSQL (separate NeonDB) |
| `SESSION_SECRET` | Express session signing key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `IMAGEKIT_PUBLIC_KEY` | ImageKit |
| `IMAGEKIT_PRIVATE_KEY` | ImageKit |
| `IMAGEKIT_URL_ENDPOINT` | ImageKit CDN base URL |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary |
| `CLOUDINARY_API_KEY` | Cloudinary |
| `CLOUDINARY_API_SECRET` | Cloudinary |
| `AWS_ACCESS_KEY_ID` | AWS S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 |
| `AWS_REGION` | AWS S3 region |
| `AWS_S3_BUCKET` | S3 bucket name |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK JSON |
| `GEMINI_API_KEY` | Google Gemini AI |
| `GROQ_API_KEY` | Groq AI |
| `MESSENGER_VERIFY_TOKEN` | FB Messenger webhook verification |
| `MESSENGER_PAGE_ACCESS_TOKEN` | FB Messenger Send API |
| `BRAIN_MODE` | Default brain mode env fallback |
| `REDIS_URL` | Redis (ioredis) |
| `GOOGLE_DRIVE_FOLDER_ID` | Backup destination folder |
| `GOOGLE_DRIVE_CREDENTIALS` | Service account JSON for Drive |
| `PORT` | HTTP listen port (default 5083) |
| `NODE_ENV` | development / production |

---

## 34. NOTABLE SYSTEM BEHAVIORS

### 34.1 Dual Database Architecture
Business data in main NeonDB. AI Brain data in separate NeonDB. Two `drizzle.config.ts` files. Two separate DB connection files. They never join across databases.

### 34.2 Single `users` Table for All User Types
Admins, staff, customers, and technicians all share one `users` table. Role field distinguishes them. Customer `users` rows are created by Google OAuth (`googleSub`) or OTP phone login. Admin rows are manually created.

### 34.3 Franchise-Ready Fields
`storeId` column present on many tables (job_tickets, inventory_items, users, etc.) for future multi-location support. Not currently used in routing logic.

### 34.4 Drawer Day-Close Scheduler
`drawer-day-close.service.ts` runs a scheduled job. Automatically closes any open drawer sessions at end of business day. Started in `server/index.ts`, stopped gracefully on SIGTERM.

### 34.5 Legacy Stage System
Old stage-based workflow (`QUOTE_PICKUP_STAGE_FLOW`, etc.) deprecated but kept for backward compatibility. New 2-pipeline system (Admin Pipeline + Customer Tracking) is the current approach. Both systems coexist.

### 34.6 Swagger/OpenAPI
`server/swagger.ts` reads JSDoc annotations on route files. Serves at `/api-docs`. `generate-api-contract.ts` creates `api-contract-snapshot.json`.

### 34.7 Two Separate Inventory Concepts
- `inventory_items`: parts/components stocked for repairs, flagged for website display
- `products`: e-commerce products for the shop (separate table, simpler schema)
Both systems exist independently.

### 34.8 Two Separate Request Systems
- `service_requests`: customer-submitted repair/quote requests going through admin pipeline
- `job_tickets`: actual repair work orders created from service_requests or directly by admin
Both coexist. A service_request can be `convertedJobId` when a job is created from it.

### 34.9 `script/` Is a Replit Artifact
Contains near-complete duplicate server codebase (`server/routes.ts`, `schema.ts`, `server/index.ts`, etc.) — leftover from original Replit environment. A `.replit` file exists inside it.

### 34.10 Corporate Client Hierarchy
`corporate_clients` has self-reference via `parentClientId` + `branchName`. Supports branch/master corporate account structure (e.g. "Gulshan Branch" under master "Company X").

### 34.11 3-Step Refund Audit Trail
Refunds require: requested → approved → processed by three potentially different staff members. Each step records who/when.

### 34.12 Payment Methods (Bangladesh-specific)
Cash, Bank, bKash, Nagad, Due — all first-class payment methods in POS and refunds.

---

## 35. MASTER ROADMAP (confirmed 2026-05-27)

Phases in order. "Fix ground hard first" — web backend stable before mobile/Flutter.

| Phase | Name | Status |
|---|---|---|
| 1 | Cleanup + Lean Mode (7 visible tabs) | ✅ Built |
| 2 | Parts-only tickets + Commission engine + Skill-based assignment + 90-day abandonment + Due calculation | ✅ Built |
| 3 | Manager chat + reminders (ping on phone, re-ping if unacknowledged) | ✅ Built |
| 3.5 | **Quiet Watch** — silent admin-only fraud monitoring | ❌ Not built |
| 4 | Android-first UI (bottom nav, QR scan, pull-to-refresh, voice notes) | ✅ Built (partial) |
| 5 | Google Drive backup + website restore | ✅ Built |
| 6 | Brain commission integration — `repliedByUserId` per message, unified who-talked-to-customer view | ⚠️ Partial |
| 7 | Deployment split (Vercel frontend + Render backend) | ✅ Built |
| 8 | AI stack hardening (Gemini/Groq model audit) | ✅ Built |
| 9 | Knowledge Graph (KG-RAG) | ✅ Built |
| 10 | Groq model audit + audio/vision hardening | ✅ Built |
| 11 | UI cursor fix + DashboardTab crash fix | ⚠️ Local, pending deploy |

### Phase 3.5 — Quiet Watch design rules
- Zero employee-facing UI. Staff never know they are monitored.
- No automatic blocking, freezing, or alerts to staff.
- Super admin only. Hidden module, not in nav by default.
- All flags review-only. Admin acts offline/privately.
- Uses existing `fraud_alerts` table. Needs: trigger rules wired + `/admin/quiet-watch` screen.

### Phase 6 gap — `repliedByUserId`
Current state: Brain claim system tracks who "handled" a session (self-assignment). Missing: per-message staff attribution column (`replied_by_user_id` on `conversations` or `brain_messages`). This enables commission credit for ChatHandler role based on actual message volume, not just session claim.

### Multi-person customer chat problem (context)
Multiple staff types reply to customers on Facebook/Messenger: marketing manager, technicians, proxies, owner. No tracking today. Solution: `repliedByUserId` on every outgoing message. Admin sees unified "who talked to this customer" view. Commission engine uses it for ChatHandler attribution on job conversion.

### Manager accountability problem (context)
Manager handles two roles (marketing + calculation tracking) and forgets schedules. Phase 3 reminders system is the fix — internal chat + deadline pings + re-ping if unacknowledged. Already built but unverified in production.

---

*End of document.*
