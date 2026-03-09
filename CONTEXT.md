# Promise Integrated System - Context Memory

> **Last Updated:** 2026-02-16  
> **Purpose:** Dynamic Context Handover for 205K token limit management

---

## 1. Project Blueprint

**Promise Integrated System** is a comprehensive business management platform for Promise Electronics, a TV repair and electronics retail business in Bangladesh.

### Tech Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x+ | Runtime (ES Modules) |
| Express | 4.21.2 | HTTP server |
| React | 19.2.0 | UI framework |
| TypeScript | 5.6.3 | Type safety |
| Vite | 7.1.9+ | Build tool & dev server |
| PostgreSQL | 15+ | Primary database (Neon cloud) |
| Drizzle ORM | 0.39.1 | Type-safe ORM |
| TailwindCSS | 4.1.14 | Styling |
| Radix UI | Various | Headless components |
| Capacitor | 7.4.4 | Native mobile app (Android) |

### Business Modules
- **Customer Portal**: Service requests, order tracking, warranties, reviews
- **Corporate Portal**: Business client dashboard, job tracking, notifications
- **Admin Panel**: Jobs, inventory, POS, finance, staff management (Flutter)
- **Native Mobile App**: Capacitor Android app with biometric auth

---

## 2. Current State

### Active Work: Corporate Portal Notifications & Messaging

The system is currently implementing the corporate notification system. Based on open tabs and recent work:

**Completed:**
- Corporate notification backend routes (`server/routes/corporate-notifications.routes.ts`)
- Corporate notification service (`server/services/corporate-notification.service.ts`)
- SSE middleware for real-time updates (`server/routes/middleware/sse-broker.ts`)
- Frontend hooks for SSE (`client/src/hooks/useCorporateSSE.ts`)
- Notification bell component (`client/src/components/corporate/CorporateNotificationsBell.tsx`)

**In Progress:**
- Corporate messages page (`client/src/pages/corporate/messages.tsx`)
- Service request page (`client/src/pages/corporate/service-request.tsx`)
- Dashboard integration (`client/src/pages/corporate/dashboard.tsx`)

### Recent Implementation
- Organization ID system with human-readable short codes (e.g., "1KF", "ABC")
- Corporate client authentication with short code display in profile

---

## 3. Logic Memory

### Key API Endpoints

**Corporate Authentication:**
- `POST /api/corporate/auth/login` - Corporate login
- `GET /api/corporate/auth/me` - Get current user (includes `corporateClientShortCode`, `corporateClientName`)

**Corporate Notifications:**
- `GET /api/corporate/notifications` - Get corporate notifications
- `GET /api/corporate/notifications/unread-count` - Get unread count
- `PATCH /api/corporate/notifications/:id/read` - Mark as read
- `POST /api/corporate/notifications/mark-all-read` - Mark all as read

**Corporate Jobs:**
- `GET /api/corporate/jobs` - List corporate jobs
- `GET /api/corporate/jobs/:id` - Get job details

**SSE Real-time:**
- `/api/corporate/sse` - Server-Sent Events stream for notifications

### Database Schema Notes
- `corporate_clients` table has `shortCode` field for human-readable IDs
- `notifications` table extended with `corporate_client_id`, `job_id`, `context_type`
- `users` table has `corporateClientId` foreign key

### Session Management
- Express-session with connect-pg-simple for production
- Session stored in `session` table
- Corporate auth uses separate session namespace from customer auth

---

## 4. Pending Tasks

### High Priority
- [ ] Complete corporate messages page UI
- [ ] Integrate notification bell with SSE real-time updates
- [ ] Test corporate notification flow end-to-end

### Medium Priority
- [ ] Implement job completion notifications (trigger when job status changes to 'closed' or 'ready')
- [ ] Add file attachment support for corporate messages
- [ ] Complete service request page integration

### Lower Priority
- [ ] Unified Request System implementation (merge Get a Quote + Submit Repair)
- [ ] Mobile app push notification integration for corporate users
- [ ] Admin panel Flutter app updates

---

## Notes

- This file must be updated after every major task or every 10 messages
- When starting a new chat, read this file first to restore context
- If approaching token limit, summarize session into Logic Memory and request chat reset
