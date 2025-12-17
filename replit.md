# Promise Electronics - Integrated Business Management System

## Overview

Promise Electronics is a comprehensive full-stack web application designed for the Bangladesh electronics market. It combines customer-facing e-commerce (product sales and TV repair services) with extensive business management tools including CRM, POS, inventory management, job tracking, attendance, and financial operations. The system features multi-role access control (Super Admin, Manager, Cashier, Technician) and supports bilingual operation (Bangla/English) with BDT currency and local time formats.

## User Preferences

Preferred communication style: Simple, everyday language.

**Production Domain**: promiseelectronics.com

## SEO Configuration

**Meta Tags & Structured Data**:
- Comprehensive meta tags for local SEO (Dhaka, Bangladesh)
- LocalBusiness JSON-LD schema with services, address, and contact
- Organization schema with logo and contact point
- WebSite schema with search action
- Open Graph and Twitter Card tags for social sharing

**Technical SEO Files**:
- `client/public/robots.txt` - Search engine crawler directives
- `client/public/sitemap.xml` - Public pages sitemap

**Dynamic Page Titles**:
- Uses `usePageTitle` hook from `client/src/hooks/usePageTitle.ts`
- Each page has a unique title for better SEO

**Google OAuth Configuration**:
- Callback URL: `https://promiseelectronics.com/api/customer/callback`
- Environment variable `CUSTOM_DOMAIN` set to `promiseelectronics.com` in production

## System Architecture

### Frontend Architecture

**Framework**: React 18+ with TypeScript, using Vite as the build tool and development server

**Routing**: Wouter for lightweight client-side routing with separate public-facing and admin routes

**UI Component System**: 
- Shadcn/ui component library (New York style variant) with Radix UI primitives
- Tailwind CSS v4 for styling with custom theme variables
- Custom design tokens for Promise Electronics branding (blue/teal color scheme)
- Responsive design with mobile-first approach

**State Management**: 
- TanStack Query (React Query) for server state management and data fetching
- React Hook Form with Zod for form validation and state
- Context API for shared UI state (toasts, modals)

**Key Design Patterns**:
- Component composition with slot-based architecture
- Separation of public and admin layouts
- Reusable form components with validation schemas
- Mock data layer for development (transitioning to API integration)

### Backend Architecture

**Runtime**: Node.js with TypeScript (ESM modules)

**Web Framework**: Express.js for HTTP server and API routing

**API Design**: RESTful endpoints with JSON request/response format

**Database Layer**:
- Drizzle ORM for type-safe database operations
- PostgreSQL dialect (configured for Neon serverless)
- Schema-first approach with Zod validation integration
- Migration support via drizzle-kit

**Storage Abstraction**: 
- Interface-based storage layer (`IStorage`) for data operations
- Separation of concerns between routes, storage, and database access
- Supports CRUD operations for all entity types

**Server-Side Features**:
- Request logging middleware with timestamp formatting
- Static file serving for production builds
- Vite integration for development with HMR
- Environment-based configuration (development/production modes)

**Key Architectural Decisions**:
- **Problem**: Need for rapid development with type safety
- **Solution**: TypeScript throughout with shared schema definitions between client and server
- **Rationale**: Reduces bugs and improves developer experience with autocomplete and validation

- **Problem**: Complex multi-role business operations
- **Solution**: Role-based enum system with storage interface abstraction
- **Rationale**: Allows flexible permission management and easy extension of user roles

- **Problem**: Bilingual support and localization
- **Solution**: Client-side language switching with BDT currency formatting
- **Rationale**: Provides better UX for Bangladesh market without complex i18n setup

### Data Models

**Core Entities**:
- Users (role-based: Super Admin, Manager, Cashier, Technician)
- Job Tickets (repair workflow with status tracking)
- Products (marketplace items with price ranges)
- Inventory Items (stock management)
- Challans (transportation documents)
- POS Transactions (point of sale records)
- Petty Cash Records (expense tracking)
- Due Records (accounts receivable)
- Settings (system configuration)

**Enum-based Status Management**:
- Job status flow: Pending → In Progress → Completed/Cancelled
- Challan tracking: Pending → Delivered → Received
- Stock levels: In Stock, Low Stock, Out of Stock
- Payment status: Pending, Overdue, Paid

### Build System

**Development**:
- Concurrent client (Vite) and server (tsx) processes
- Hot module replacement for client code
- Automatic server restart on file changes

**Production Build**:
- Client: Vite builds to `dist/public` with code splitting
- Server: esbuild bundles to single `dist/index.cjs` file
- Selective dependency bundling to reduce cold start times
- Static asset handling with fallback to index.html for SPA routing

**Custom Vite Plugins**:
- Runtime error overlay for better DX
- Meta image updater for OpenGraph tags
- Replit-specific integrations (cartographer, dev banner)

## External Dependencies

### Database & ORM
- **Neon Serverless PostgreSQL**: Cloud-hosted database with WebSocket connection pooling
- **Drizzle ORM**: Type-safe database toolkit with schema validation and migrations

### UI & Styling
- **Radix UI**: Accessible component primitives (30+ components including dialogs, dropdowns, tooltips)
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Icon library for consistent iconography
- **Framer Motion**: Animation library for transitions (hero carousel)

### Forms & Validation
- **React Hook Form**: Performant form state management
- **Zod**: Schema validation for forms and API data
- **@hookform/resolvers**: Integration between React Hook Form and Zod

### Data Fetching
- **TanStack Query**: Server state management with caching and background updates

### Development Tools
- **Vite**: Fast development server and build tool
- **tsx**: TypeScript execution for server development
- **esbuild**: Fast JavaScript/TypeScript bundler for production
- **@replit/vite-plugin-***: Replit platform integrations

### Admin Authentication System

**Authentication Flow**:
- Admin-only login at `/admin/login` (no public sign-up)
- Session-based authentication using express-session (separate from customer sessions)
- Passwords hashed with bcrypt (12 salt rounds)
- Default super admin seeded on first startup: username: `admin`, password: `admin123`

**Roles & Permissions**:
- Four roles: Super Admin, Manager, Cashier, Technician
- Granular permissions stored as JSON per user
- Tab access: dashboard, jobs, inventory, pos, challans, finance, attendance, reports, serviceRequests, users, settings
- Action permissions: canCreate, canEdit, canDelete, canExport

**User Management**:
- Super Admins can create/edit/delete users and manage permissions
- Other roles can only change their own password
- Admin sessions tracked separately (req.session.adminUserId)

**Security Notes**:
- Override SESSION_SECRET environment variable in production
- Consider migrating to connect-pg-simple for production session storage
- Default super admin credentials should be changed immediately after first login

### Customer Authentication System

**Dual-Auth Architecture**:
- Customers can sign in via Google OAuth 2.0 OR traditional phone/password
- Session-based authentication with support for both methods
- ProfileCompletionModal prompts Google users to add phone number for orders

**Google Sign-In Flow** (Direct Google OAuth):
- `/api/customer/google/login` - Initiates Google OAuth with passport-google-oauth20
- `/api/customer/callback` - OAuth callback handler
- `/api/customer/google/logout` - Logs out and redirects
- `/api/customer/auth/me` - Returns current Google-authenticated customer

**Traditional Auth Flow**:
- `/api/customer/register` - Register with phone/password
- `/api/customer/login` - Login with phone/password
- `/api/customer/logout` - Session logout
- `/api/customer/me` - Returns current session customer

**Profile Management**:
- `/api/customer/profile` (PUT) - Update customer profile (phone, address, name)
- `needsProfileCompletion` flag when phone number is missing (required for orders)

**Customer Schema**:
- `googleSub`: Unique Google OAuth ID (nullable for traditional auth)
- `phone`: Nullable (required after profile completion for Google users)
- `password`: Nullable (only for traditional auth users)
- `profileImageUrl`: From Google profile (nullable)

**Required Environment Variables**:
- `GOOGLE_CLIENT_ID` - Google OAuth client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `SESSION_SECRET` - Session encryption secret (override in production)

**Phone Number Normalization & Auto-Linking**:
- Service requests submitted before customer signup are automatically linked to accounts when customers register with matching phone numbers
- Phone normalization extracts last 10 digits, handling formats: +8801712345678, 01712345678, 1712345678
- `linkServiceRequestsByPhone` in storage.ts uses SQL REGEXP_REPLACE for flexible matching
- Auto-linking triggered on: customer registration, Google profile completion (adding phone)
- Only unlinked requests (customerId is null) are linked to prevent reassignment

### Live Job Overview Dashboard

**Purpose**: Real-time monitoring of all active repair jobs for managers and supervisors

**Location**: `/admin/overview` (accessible via "Overview" in admin navigation)

**Features**:
- Summary cards showing jobs due today, tomorrow, this week
- Ready for delivery queue (completed jobs awaiting customer pickup)
- In-progress job count
- Technician workload visualization with job breakdown per technician
- Manual refresh button for instant data reload
- SSE-based real-time updates when job tickets are created/updated

**API Endpoint**: `GET /api/admin/job-overview`

**Data Structure**:
- `dueToday`: Jobs with deadline set to today
- `dueTomorrow`: Jobs with deadline set to tomorrow
- `dueThisWeek`: Jobs with deadline within next 7 days
- `readyForDelivery`: Completed jobs awaiting delivery
- `technicianWorkloads`: Array of { technician, jobs[] } for workload distribution
- `stats`: Aggregate counts for all categories

### Service Request Workflow System (Stage-Based)

**New Unified Stage System**:
Service requests now use a unified `stage` field that controls the entire workflow. The stage determines what steps are shown to customers and what actions admins can take.

**Request Intent**: Distinguishes between quote requests and direct repair requests
- `quote`: Customer wants a quote first (includes awaiting_customer stage for quote approval)
- `repair`: Customer wants direct repair (skips quote approval stage)

**Service Mode**: Determines pickup vs service center flow
- `pickup`: Home pickup - technician picks up and returns the device
- `service_center`: Customer brings device to the service center

**Stage Flow (Pickup Mode)**:
intake → assessment → awaiting_customer (quote only) → authorized → pickup_scheduled → picked_up → in_repair → ready → out_for_delivery → completed

**Stage Flow (Service Center Mode)**:
intake → assessment → awaiting_customer (quote only) → authorized → awaiting_dropoff → device_received → in_repair → ready → completed

**Terminal Stages**: `closed` - cannot be modified

**Expected Date Fields**:
- `expectedPickupDate`: When technician will collect device (pickup mode)
- `expectedReturnDate`: When device will be returned (pickup mode)
- `expectedReadyDate`: When device will be ready for collection (service center mode)

**Auto Job Ticket Creation**:
- Job ticket automatically created when stage reaches `picked_up` (pickup mode) or `device_received` (service center mode)

**API Endpoints**:
- `GET /api/admin/service-requests/:id/next-stages`: Get valid next stages
- `PUT /api/admin/service-requests/:id/stage`: Transition to new stage
- `PUT /api/admin/service-requests/:id/expected-dates`: Update expected dates

**Legacy Compatibility**:
- Old requests without `stage` field display using legacy `trackingStatus` field
- `effectiveServiceMode` derives mode from `serviceMode` OR legacy `servicePreference`

### Developer Mode

**Purpose**: Super Admin-only testing feature to bypass status flow restrictions

**Location**: Admin Settings tab (General section)

**Capabilities**:
- Allows moving backwards in tracking status flow (normally forward-only)
- Allows editing status fields before quote is approved
- Shows "Dev Mode" badge in service request dialogs when active

**Limitations**:
- Cannot modify terminal states (Converted, Closed) - these remain protected
- Does not affect quote status logic
- Should only be used for testing purposes

### Future Integration Points (Referenced in PRD)
- File upload handling (multer mentioned in dependencies)
- Payment processing capabilities
- Email notifications (nodemailer in dependencies)
- Excel export functionality (xlsx in dependencies)