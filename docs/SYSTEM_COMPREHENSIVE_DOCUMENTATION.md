# 🏢 Promise Electronics - Comprehensive System Documentation

> **TV ডাক্তার (TV Doctor)** - A complete electronics repair and parts retail platform  
> **Version:** 2.0 | **Last Updated:** December 25, 2024

---

## 📊 System Overview & Statistics

### Codebase Metrics

| Metric | Count |
|--------|-------|
| **Total Client Code** | 43,663 lines |
| **Total Server Code** | 7,374 lines |
| **Shared Schema** | 711 lines |
| **Web Pages** | 38 pages |
| **Native App Pages** | 22 pages |
| **Admin Panel Pages** | 18 pages |
| **Reusable Components** | 77+ components |
| **Native-Specific Components** | 7 components |
| **API Route Modules** | 19 modules |
| **Database Tables** | 23 tables |
| **Custom Hooks** | 8 hooks |
| **Context Providers** | 7 contexts |

---

## 🎯 System Vision

**Promise Electronics** is a unified platform that transforms traditional TV repair services into a modern, technology-driven experience. The vision encompasses:

1. **AI-Powered Diagnostics** - Use of Google Gemini AI for damage assessment and component identification
2. **Omnichannel Experience** - Seamless experience across web, mobile, and in-store
3. **Real-Time Tracking** - Live updates on repair status via SSE (Server-Sent Events)
4. **Voice & Camera AI** - "Daktar Vai" AI assistant with voice input and camera lens analysis
5. **Complete Business Management** - Full admin control over jobs, inventory, finance, and staff

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT APPLICATIONS                               │
├───────────────────┬───────────────────────┬─────────────────────────────────┤
│   Customer Web    │    Native Android     │         Admin Panel             │
│   (Public Site)   │    (Capacitor App)    │        (Management)             │
│   /home, /shop    │   /native/home, etc   │        /admin/*                 │
├───────────────────┴───────────────────────┴─────────────────────────────────┤
│                         SHARED REACT CLIENT                                  │
│            React 18 + TypeScript + TanStack Query + Wouter                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                              API LAYER                                       │
│                    Express.js + Passport + Sessions                          │
│                              /api/*                                          │
├───────────────────┬───────────────────────┬─────────────────────────────────┤
│   Auth Routes     │    Business Routes    │      Feature Routes             │
│   - Admin Login   │    - Jobs             │      - AI (Gemini)              │
│   - Customer Auth │    - Inventory        │      - Push Notifications       │
│   - Google OAuth  │    - Service Requests │      - File Upload (ImageKit)   │
│                   │    - Orders/POS       │      - Camera Lens              │
├───────────────────┴───────────────────────┴─────────────────────────────────┤
│                            DATABASE LAYER                                    │
│                    PostgreSQL (Neon) + Drizzle ORM                           │
│                            23 Tables                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
PromiseIntegratedSystem/
├── client/                     # Frontend React Application
│   └── src/
│       ├── pages/              # Web pages (38 files)
│       │   ├── admin/          # Admin panel pages (18 files)
│       │   └── *.tsx           # Public customer pages
│       ├── native-app/         # Native Android app
│       │   ├── pages/          # Native pages (22 files)
│       │   ├── components/     # Native components (7 files)
│       │   └── NativeLayout.tsx
│       ├── components/         # Shared components (77+ files)
│       │   ├── ui/             # shadcn/ui components
│       │   ├── layout/         # Layout components
│       │   ├── auth/           # Auth modals
│       │   ├── mobile/         # Mobile-optimized
│       │   └── print/          # Invoice/Receipt
│       ├── contexts/           # React contexts (7 files)
│       ├── hooks/              # Custom hooks (8 files)
│       ├── lib/                # Utilities (11 files)
│       └── styles/             # CSS files
├── server/                     # Backend Express Application
│   ├── routes/                 # API routes (19 modules)
│   │   └── middleware/         # Auth middleware
│   ├── services/               # Business logic services
│   ├── storage.ts              # Data access layer (74KB)
│   └── pushService.ts          # FCM push notifications
├── shared/                     # Shared code
│   └── schema.ts               # Drizzle ORM schema (711 lines)
├── android/                    # Capacitor Android project
└── docs/                       # Documentation
```

---

## 🗄️ Database Schema (23 Tables)

### Core Business Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Users (Admin + Customers) | id, name, phone, email, role, googleSub |
| `job_tickets` | Repair job tickets | id, customer, device, status, technician |
| `service_requests` | Customer repair requests | id, ticketNumber, brand, status, stage |
| `service_request_events` | Status change history | serviceRequestId, status, occurredAt |
| `inventory_items` | Products & spare parts | id, name, stock, price, showOnWebsite |
| `service_catalog` | Service offerings | id, name, minPrice, maxPrice, category |

### E-Commerce Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `orders` | Customer orders | id, orderNumber, status, total |
| `order_items` | Order line items | orderId, productId, quantity |
| `products` | Website products | id, name, price, category |
| `product_variants` | Product variations | productId, variantName, price |

### Financial Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `pos_transactions` | Point of sale records | invoiceNumber, items, total |
| `petty_cash_records` | Cash expenses/income | amount, type, category |
| `due_records` | Customer dues/credit | customer, amount, dueDate |
| `challans` | Delivery challans | receiver, items, status |

### Operational Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `pickup_schedules` | Pickup appointments | tier, scheduledDate, status |
| `attendance_records` | Staff attendance | userId, checkInTime, date |
| `customer_reviews` | Customer feedback | rating, content, isApproved |
| `inquiries` | Website inquiries | name, phone, message |

### System Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `settings` | App configuration | key, value |
| `policies` | Legal policies | slug, content |
| `customer_addresses` | Saved addresses | customerId, label, address |
| `notifications` | In-app notifications | userId, title, message, read |
| `device_tokens` | Push notification tokens | userId, token, platform |
| `user_sessions` | Session storage | sid, sess, expire |

---

## 🛣️ Routes & Navigation

### Web Customer Routes (20 routes)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | RootRoute | Redirect to /home or /native/splash |
| `/home` | HomePage | Main landing page |
| `/shop` | ShopPage | Parts shop |
| `/cart` | CartPage | Shopping cart |
| `/checkout` | CheckoutPage | Order checkout |
| `/repair-request` | RepairRequestPage | Submit repair |
| `/services` | ServicesPage | Service catalog |
| `/services/:id` | ServiceDetailsPage | Service details |
| `/get-quote` | GetQuotePage | Quote request |
| `/track-order` | TrackOrderPage | Order tracking |
| `/track-job` | TrackJobPage | Job tracking |
| `/support` | SupportPage | Contact support |
| `/my-profile` | MyProfilePage | Customer profile |
| `/my-warranties` | MyWarrantiesPage | Warranty info |
| `/login` | LoginPage | Customer login |
| `/about` | AboutPage | About us |
| `/privacy-policy` | PrivacyPolicyPage | Privacy policy |
| `/warranty-policy` | WarrantyPolicyPage | Warranty policy |
| `/terms-and-conditions` | TermsAndConditionsPage | Terms & conditions |

### Native Android Routes (22 routes)

| Route | Page | Purpose | Bottom Nav |
|-------|------|---------|------------|
| `/native/splash` | Splash | App splash screen | ❌ |
| `/native/login` | NativeLogin | Login screen | ❌ |
| `/native/register` | NativeRegister | Registration | ❌ |
| `/native/home` | NativeHome | Home dashboard | ✅ |
| `/native/shop` | NativeShop | Parts shop | ✅ |
| `/native/bookings` | NativeBookings | Repair bookings | ✅ |
| `/native/profile` | NativeProfile | User profile | ✅ |
| `/native/addresses` | NativeAddresses | Address book | ✅ |
| `/native/repair` | NativeRepairRequest | New repair | ❌ |
| `/native/repair/:id` | NativeRepairDetails | Repair details | ❌ |
| `/native/repair-history` | NativeRepairHistory | Repair history | ❌ |
| `/native/chat` | NativeChatTab | Daktar Vai chat | ❌ |
| `/native/camera-lens` | NativeCameraLens | AI camera lens | ❌ |
| `/native/settings` | NativeSettings | Settings | ❌ |
| `/native/settings/edit-profile` | NativeEditProfile | Edit profile | ❌ |
| `/native/settings/change-password` | NativeChangePassword | Password change | ❌ |
| `/native/orders` | NativeOrderHistory | Order history | ❌ |
| `/native/warranties` | NativeWarranties | Warranties | ❌ |
| `/native/support` | NativeSupport | Support | ❌ |
| `/native/about` | NativeAbout | About | ❌ |
| `/native/privacy-policy` | NativePrivacyPolicy | Privacy | ❌ |
| `/native/terms-and-conditions` | NativeTermsAndConditions | Terms | ❌ |

### Admin Panel Routes (18 routes)

| Route | Page | Purpose |
|-------|------|---------|
| `/admin` | AdminRouter | Admin shell |
| `/admin/login` | AdminLoginPage | Admin login |
| `/admin/dashboard` | Dashboard | Main dashboard |
| `/admin/overview` | Overview | Quick stats |
| `/admin/service-requests` | ServiceRequests | Manage requests |
| `/admin/jobs` | Jobs | Job tickets |
| `/admin/inventory` | Inventory | Stock management |
| `/admin/orders` | Orders | Shop orders |
| `/admin/customers` | Customers | Customer DB |
| `/admin/users` | Users | Staff management |
| `/admin/pos` | POS | Point of sale |
| `/admin/finance` | Finance | Financial records |
| `/admin/challans` | Challans | Delivery challans |
| `/admin/pickup-schedule` | PickupSchedule | Pickup management |
| `/admin/staff-attendance` | StaffAttendance | Attendance |
| `/admin/reports` | Reports | Analytics |
| `/admin/settings` | Settings | System settings |
| `/admin/inquiries` | Inquiries | Website inquiries |
| `/admin/technician-dashboard` | TechnicianDashboard | Tech view |

---

## 🔌 API Endpoints (19 Modules)

### Authentication Routes (`auth.routes.ts`)
```
POST   /api/login              - Admin login
POST   /api/logout             - Logout
GET    /api/user               - Get current user
```

### Customer Routes (`customer.routes.ts`)
```
GET    /api/customer/me        - Get customer profile
PUT    /api/customer/profile   - Update profile
GET    /api/customer/service-requests - Customer's requests
GET    /api/customer/orders    - Customer's orders
GET    /api/customer/warranties - Customer's warranties
GET    /api/customer/addresses - Saved addresses
POST   /api/customer/addresses - Add address
PUT    /api/customer/addresses/:id - Update address
DELETE /api/customer/addresses/:id - Delete address
GET    /api/customer/events    - SSE for real-time updates
```

### Service Requests Routes (`service-requests.routes.ts`)
```
GET    /api/service-requests       - List all (admin)
GET    /api/service-requests/:id   - Get one
POST   /api/service-requests       - Create new
PUT    /api/service-requests/:id   - Update
DELETE /api/service-requests/:id   - Delete
POST   /api/service-requests/:id/quote - Submit quote
POST   /api/service-requests/:id/convert - Convert to job
GET    /api/service-requests/:id/timeline - Get timeline
POST   /api/tracking/:ticket       - Track by ticket number
```

### Jobs Routes (`jobs.routes.ts`)
```
GET    /api/jobs           - List all jobs
GET    /api/jobs/next-number - Get next job number
GET    /api/jobs/:id       - Get job details
POST   /api/jobs           - Create job
PUT    /api/jobs/:id       - Update job
DELETE /api/jobs/:id       - Delete job
```

### Inventory Routes (`inventory.routes.ts`)
```
GET    /api/inventory          - List all items
GET    /api/inventory/website  - Website items only
GET    /api/inventory/:id      - Get one
POST   /api/inventory          - Create item
PUT    /api/inventory/:id      - Update item
PUT    /api/inventory/:id/stock - Update stock
DELETE /api/inventory/:id      - Delete item
POST   /api/inventory/bulk-import - Bulk import
```

### Orders Routes (`orders.routes.ts`)
```
GET    /api/orders         - List all orders
GET    /api/orders/:id     - Get order
POST   /api/orders         - Create order
PUT    /api/orders/:id     - Update order
PUT    /api/orders/:id/status - Update status
DELETE /api/orders/:id     - Cancel order
```

### POS Routes (`pos.routes.ts`)
```
GET    /api/pos            - List transactions
POST   /api/pos            - Create transaction
GET    /api/pos/next-invoice - Get next invoice
```

### Finance Routes (`finance.routes.ts`)
```
GET    /api/petty-cash     - List petty cash
POST   /api/petty-cash     - Create record
GET    /api/due-records    - List dues
POST   /api/due-records    - Create due
PUT    /api/due-records/:id - Update due
```

### Settings Routes (`settings.routes.ts`)
```
GET    /api/settings           - List all settings
GET    /api/settings/:key      - Get setting by key
PUT    /api/settings/:key      - Update setting
GET    /api/settings/policies/:slug - Get policy
PUT    /api/settings/policies/:slug - Update policy
GET    /api/service-catalog    - Get service catalog
POST   /api/service-catalog    - Create service
PUT    /api/service-catalog/:id - Update service
DELETE /api/service-catalog/:id - Delete service
```

### AI Routes (`ai.routes.ts`)
```
POST   /api/ai/chat        - Daktar Vai chat
POST   /api/ai/inspect     - Image damage assessment
POST   /api/ai/voice       - Voice transcription (mock)
```

### Lens Routes (`lens.routes.ts`)
```
POST   /api/lens/identify  - Identify component
POST   /api/lens/assess    - Assess damage
POST   /api/lens/barcode   - Scan barcode
```

### Upload Routes (`upload.routes.ts`)
```
POST   /api/upload/imagekit - ImageKit signature
POST   /api/upload/object   - Direct object upload
GET    /api/upload/object/:key - Get object
DELETE /api/upload/object/:key - Delete object
```

### Notifications Routes (`notifications.routes.ts`)
```
GET    /api/notifications       - List notifications
PUT    /api/notifications/:id/read - Mark as read
PUT    /api/notifications/read-all - Mark all as read
POST   /api/notifications/register-device - Register FCM token
```

### Additional Routes
- `users.routes.ts` - Staff management
- `attendance.routes.ts` - Staff check-in/out
- `challans.routes.ts` - Delivery challans
- `quotes.routes.ts` - Quote management
- `reviews.routes.ts` - Customer reviews

---

## ⚛️ React Contexts & State Management

### 1. CustomerAuthContext
**Purpose:** Customer authentication state across the app
```typescript
interface CustomerAuthContext {
  customer: Customer | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  updateProfile: (data: ProfileData) => Promise<void>;
}
```

### 2. AdminAuthContext
**Purpose:** Admin/Staff authentication and permissions
```typescript
interface AdminAuthContext {
  user: User | null;
  permissions: UserPermissions;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}
```

### 3. AdminSSEContext
**Purpose:** Real-time updates for admin panel via Server-Sent Events
```typescript
interface AdminSSEContext {
  isConnected: boolean;
  lastEvent: SSEEvent | null;
  subscribe: (callback: (event: SSEEvent) => void) => () => void;
}
```

### 4. CartContext
**Purpose:** Shopping cart state for e-commerce
```typescript
interface CartContext {
  items: CartItem[];
  addItem: (product: Product, quantity: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
}
```

### 5. NativeThemeContext
**Purpose:** Theme management for native app (dark/light mode)
```typescript
interface NativeThemeContext {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  isDark: boolean;
}
```

### 6. PushNotificationContext
**Purpose:** Push notification handling and permissions
```typescript
interface PushNotificationContext {
  isPermissionGranted: boolean;
  token: string | null;
  requestPermission: () => Promise<void>;
}
```

### 7. AppOpeningContext
**Purpose:** App opening animations (container transform)
```typescript
interface AppOpeningContext {
  openingElement: { id: string; rect: DOMRect } | null;
  setOpeningElement: (el: { id: string; rect: DOMRect } | null) => void;
}
```

---

## 🪝 Custom Hooks (8 Hooks)

| Hook | File | Purpose |
|------|------|---------|
| `useToast` | `use-toast.ts` | Toast notifications |
| `useAndroidBack` | `useAndroidBack.ts` | Android hardware back button |
| `useCameraLens` | `useCameraLens.ts` | AI camera analysis |
| `usePageTitle` | `usePageTitle.ts` | Dynamic page titles |
| `useParallax` | `useParallax.ts` | Parallax scrolling effects |
| `usePushNotifications` | `usePushNotifications.ts` | Push notification management |
| `useSSE` | `useSSE.ts` | Server-Sent Events connection |
| `useVoiceInput` | `useVoiceInput.ts` | Speech-to-text input |

---

## 🎭 Animations & Transitions

### Page Transition System (Native App)

The app uses Framer Motion for iOS/Android-style page transitions:

```typescript
// Route order hierarchy for directional animations
const ROUTE_ORDER = {
  '/native/home': 0,
  '/native/shop': 1,
  '/native/bookings': 2,
  '/native/support': 3,
  '/native/profile': 4,
  // Detail pages
  '/native/repair': 0.5,
  '/native/chat': 0.5,
  // ...
};

// Animation variants
const pageVariants = {
  initial: (direction) => ({
    x: direction === 'forward' ? '100%' : '-100%',
    opacity: 1,
  }),
  animate: { x: 0, opacity: 1 },
  exit: (direction) => ({
    x: direction === 'forward' ? '-30%' : '30%',
    opacity: 0,
  }),
};

// Spring physics
const transition = {
  type: "spring",
  damping: 28,
  stiffness: 300,
  mass: 0.8,
};
```

### Animation Components

| Component | Animation Type | Description |
|-----------|---------------|-------------|
| `AnimatePresence` | Page transitions | Wrap routes for enter/exit |
| `motion.div` | Container | Animated page wrapper |
| `PullToRefresh` | Touch gesture | Pull-to-refresh with haptics |
| `AnimatedButton` | Micro-interaction | Button press feedback |
| `SkeletonCard` | Loading state | Pulse/shimmer skeleton |
| `AppOpeningContext` | Container transform | Shared element transitions |

### CSS Animations

```css
/* Native mode global lock */
html.native-app-mode {
  position: fixed;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* Skeleton shimmer */
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Camera lens scan effect */
.animate-scan-pulse {
  animation: scan-pulse 2s ease-in-out infinite;
}
```

---

## 🔐 Authentication Flows

### Customer Authentication

```
1. Phone/Password Login
   ├── POST /api/customer/auth/login
   ├── Session created with connect-pg-simple
   └── Customer object returned

2. Google OAuth (Native)
   ├── GoogleAuth.signIn() (Capacitor plugin)
   ├── POST /api/customer/auth/google/native
   ├── Create/upsert customer record
   └── Session created

3. Biometric Login (Native)
   ├── Check stored credentials (@capgo/capacitor-native-biometric)
   ├── Prompt biometric verification
   └── Auto-login with stored credentials
```

### Admin Authentication

```
1. Username/Password Login
   ├── POST /api/login
   ├── Passport local strategy
   ├── Session created
   └── User with permissions returned

2. Permission Check
   ├── AdminAuthContext.hasPermission(permission)
   └── Based on user.permissions JSON field
```

---

## 🆚 Platform Comparison: Admin vs Customer Web vs Native App

### Feature Availability Matrix

| Feature | Admin Panel | Customer Web | Native App |
|---------|-------------|--------------|------------|
| **View Service Requests** | ✅ All | ✅ Own only | ✅ Own only |
| **Create Service Requests** | ✅ | ✅ | ✅ |
| **Update Request Status** | ✅ | ❌ | ❌ |
| **Convert to Job** | ✅ | ❌ | ❌ |
| **View All Jobs** | ✅ | ❌ | ❌ |
| **Manage Inventory** | ✅ | ❌ | ❌ |
| **Shop/Buy Parts** | ❌ | ✅ | ✅ |
| **Cart & Checkout** | ❌ | ✅ | ✅ |
| **Process Orders** | ✅ | ❌ | ❌ |
| **POS Transactions** | ✅ | ❌ | ❌ |
| **Finance (Petty Cash)** | ✅ | ❌ | ❌ |
| **Due Records** | ✅ | ❌ | ❌ |
| **Staff Management** | ✅ | ❌ | ❌ |
| **Attendance** | ✅ | ❌ | ❌ |
| **Reports** | ✅ | ❌ | ❌ |
| **Settings** | ✅ | ❌ | ❌ |
| **AI Chat (Daktar Vai)** | ❌ | ✅ Widget | ✅ Full screen |
| **Camera Lens AI** | ❌ | ❌ | ✅ |
| **Voice Input** | ❌ | ❌ | ✅ |
| **Push Notifications** | ❌ | ❌ | ✅ |
| **Biometric Login** | ❌ | ❌ | ✅ |
| **Offline Access** | ❌ | ❌ | ✅ (cached) |
| **OTA Updates** | ❌ | N/A | ✅ (Capgo) |

### Admin Panel Control Levels

| Module | Control Level | Capabilities |
|--------|---------------|--------------|
| **Service Requests** | Full | View, create, update status, convert to job, add events |
| **Jobs** | Full | Create, update, assign technician, close, warranty |
| **Inventory** | Full | Add, edit, stock management, pricing, website toggle |
| **Orders** | Full | View, accept, decline, update status, notes |
| **Customers** | Full | View profiles, service history, order history |
| **Users/Staff** | Full | Create, edit, permissions, reset password |
| **POS** | Full | Create transactions, view history, print invoices |
| **Finance** | Full | Petty cash, due records, collection tracking |
| **Challans** | Full | Create, track, mark delivered |
| **Pickups** | Full | Schedule, assign staff, track |
| **Attendance** | Full | View, manual entry, reports |
| **Settings** | Full | All system settings, policies, catalog |

### Data Access Comparison

| Data Type | Admin Can See | Customer Web | Native App |
|-----------|--------------|--------------|------------|
| **All Service Requests** | ✅ | ❌ Own only | ❌ Own only |
| **Full Customer List** | ✅ | ❌ | ❌ |
| **All Orders** | ✅ | ❌ Own only | ❌ Own only |
| **Inventory with Cost** | ✅ | ❌ Price only | ❌ Price only |
| **Staff Information** | ✅ | ❌ | ❌ |
| **Financial Records** | ✅ | ❌ | ❌ |
| **Reports & Analytics** | ✅ | ❌ | ❌ |
| **Technician Names** | ✅ | ✅ (optional) | ❌ Hidden |

---

## 🤖 AI Features

### Daktar Vai Chat Bot

**Technology:** Google Gemini 2.0 Flash

```
Features:
├── Natural conversation in Bangla/Banglish
├── Multi-turn context retention
├── Image analysis for damage assessment
├── Automatic ticket creation from chat
├── Part recommendations
└── Voice input support (native)
```

### Camera Lens AI

**Modes:**
1. **Identify** - Component identification from image
2. **Assess** - Damage severity assessment
3. **Barcode** - Part number scanning

### AI Endpoints

| Endpoint | Purpose | Model |
|----------|---------|-------|
| `POST /api/ai/chat` | Conversational AI | Gemini 2.0 Flash |
| `POST /api/ai/inspect` | Image analysis | Gemini 2.0 Flash |
| `POST /api/lens/identify` | Component ID | Gemini 2.0 Flash |
| `POST /api/lens/assess` | Damage assessment | Gemini 2.0 Flash |

---

## 📱 Native App Features

### Capacitor Plugins (12 plugins)

| Plugin | Purpose |
|--------|---------|
| `@capacitor/app` | App lifecycle, back button |
| `@capacitor/camera` | Photo capture |
| `@capacitor/haptics` | Vibration feedback |
| `@capacitor/keyboard` | Keyboard management |
| `@capacitor/preferences` | Local storage |
| `@capacitor/push-notifications` | FCM push |
| `@capacitor/splash-screen` | Splash screen |
| `@capacitor/status-bar` | Status bar styling |
| `@capacitor-community/speech-recognition` | Voice input |
| `@capgo/capacitor-native-biometric` | Biometric auth |
| `@capgo/capacitor-updater` | OTA updates |
| `@codetrix-studio/capacitor-google-auth` | Google Sign-In |

### Native-Specific Features

1. **Edge-to-Edge Display** - Status bar overlays content
2. **Safe Area Handling** - Notch and home indicator padding
3. **Android Back Button** - Custom back navigation logic
4. **Pull to Refresh** - Native gesture with haptics
5. **Biometric Auth** - Fingerprint/Face unlock
6. **Push Notifications** - FCM integration
7. **OTA Updates** - Capgo in-app updates
8. **Offline Persistence** - React Query + Capacitor Preferences
9. **Image Compression** - Client-side before upload

---

## 📤 Push Notifications

### Architecture

```
┌─────────────┐    ┌───────────────┐    ┌──────────────┐
│   Backend   │───►│ Firebase FCM  │───►│ Android App  │
│  /api/push  │    │               │    │              │
└─────────────┘    └───────────────┘    └──────────────┘
```

### Notification Types

| Type | When Triggered | Template |
|------|----------------|----------|
| `repair` | Status update | "Your repair #123 is now: In Progress" |
| `shop` | Order update | "Your order #ORD-123 has shipped" |
| `info` | System alerts | "New feature available" |
| `success` | Completion | "Your TV is ready for pickup!" |

---

## 🔄 Real-Time Updates (SSE)

### Customer SSE Connection

```
GET /api/customer/events
├── Connection established
├── Heartbeat every 30 seconds
└── Events:
    ├── service_request_updated
    ├── order_updated
    └── notification_created
```

### Admin SSE Connection

```
GET /api/admin/events
├── Connection established
├── Heartbeat every 30 seconds
└── Events:
    ├── new_service_request
    ├── job_updated
    ├── order_created
    └── low_stock_alert
```

---

## 🎨 Design System

### CSS Variables (Native App)

```css
:root {
  --color-native-bg: #f1f5f9;
  --color-native-surface: #ffffff;
  --color-native-primary: #36e27b;
  --color-native-text: #0f172a;
  --color-native-text-muted: #64748b;
  --color-native-border: #e2e8f0;
  --color-native-input: #f8fafc;
  --safe-top: env(safe-area-inset-top);
  --safe-bottom: env(safe-area-inset-bottom);
}

.dark {
  --color-native-bg: #0f172a;
  --color-native-surface: #1e293b;
  --color-native-text: #f8fafc;
  --color-native-text-muted: #94a3b8;
  --color-native-border: #334155;
  --color-native-input: #1e293b;
}
```

### Component Library

- **shadcn/ui** - Base component library
- **Framer Motion** - Animations
- **Lucide Icons** - Icon set
- **Tailwind CSS 4** - Styling

---

## 🚀 Deployment

### Production Stack

| Service | Purpose |
|---------|---------|
| **Vercel** | Frontend + Serverless backend |
| **Neon PostgreSQL** | Production database |
| **ImageKit** | Image CDN & transformations |
| **Firebase** | Push notifications (FCM) |
| **Capgo** | OTA updates |

### Build Commands

```bash
# Development
npm run dev

# Build client
npm run build:client

# Build Android APK
npx cap sync android
cd android && ./gradlew assembleRelease
```

---

## 📖 Glossary

| Term | Definition |
|------|------------|
| **Service Request** | Customer's initial repair/quote request |
| **Job Ticket** | Internal work order created from service request |
| **Stage** | Current step in the repair workflow |
| **Tracking Status** | Customer-facing status for tracking |
| **Challan** | Delivery/transfer document |
| **POS** | Point of Sale transaction |
| **Daktar Vai** | AI assistant ("Doctor Brother" in Bangla) |
| **Camera Lens** | AI-powered component/damage scanner |

---

## 📊 System Health Endpoints

```
GET /api/health
Response:
{
  "status": "ok",
  "database": "connected",
  "latency": "12ms",
  "timestamp": "2024-12-25T21:15:00.000Z"
}
```

---

**Document Version:** 2.0  
**Total Lines of Code:** ~51,000+  
**Last Updated:** December 25, 2024
