# Corporate Portal Implementation Plan V3

## Executive Summary
This V3 plan details the implementation of a strict, Admin-managed Corporate Portal. Corporate clients cannot self-register. Admins will create multiple user accounts for a single corporate entity (e.g., Samsung -> Manager A, Manager B) directly from the Admin Panel. The system will generate secure credentials and automatically email them to the new user.

## 1. Database & Schema Enhancements

### 1.1 User Association
We will modify the core `users` table to support corporate association. This allows multiple users to belong to one corporate client.

**Changes:**
- **Table**: `users`
- **New Field**: `corporateClientId` (Foreign Key to `corporate_clients.id`)
- **Role Update**: Ensure `role` field accepts `'Corporate'` value.

```typescript
// shared/schema.ts
export const users = pgTable("users", {
  // ... existing fields
  role: text("role").default("Customer"), // 'Admin', 'Technician', 'Corporate'
  corporateClientId: text("corporate_client_id").references(() => corporateClients.id),
});
```

### 1.2 Urgent Requests Tracking
New table for tracking corporate-specific urgency requests.

```typescript
// shared/schema.ts
export const corporatePortalUrgencies = pgTable("corporate_portal_urgencies", {
  id: text("id").primaryKey(),
  corpClientId: text("corp_client_id").notNull(),
  jobId: text("job_id").references(() => jobTickets.id),
  reason: text("reason").notNull(),
  urgencyLevel: text("urgency_level").notNull(), // 'high', 'critical'
  status: text("status").default("pending"),
  requestedBy: text("requested_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

## 2. Infrastructure: Email Service

Since no email service currently exists, we will implement a basic `MailerService`.

- **Library**: `nodemailer`
- **File**: `server/services/mailer.ts`
- **Functionality**: `sendWelcomeEmail(email, username, temporaryPassword)`
- **Configuration**: Use SMTP settings from environment variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`).

## 3. Backend Workflow: Admin-Only User Creation

### 3.1 API Endpoint
Create a protected Admin route to generate corporate users.

`POST /api/admin/corporate-users`
- **Body**: `{ corporateClientId, name, email, role }`
- **Logic**:
  1. Generate a secure random password.
  2. Create user in `users` table with `role='Corporate'` and linked `corporateClientId`.
  3. Call `MailerService.sendWelcomeEmail` with credentials.
  4. Return success (and optionally the password for admin confirmation/backup).

### 3.2 Authentication Middleware
Update `server/middleware/auth.ts` to include `requireCorporate` middleware, ensuring access is restricted to active corporate users.

## 4. Frontend Architecture

### 4.1 Admin Panel - Corporate User Management
Enhance the existing "Corporate Client Details" page in the Admin Panel.
- **New Tab**: "Manage Users"
- **Features**:
  - List all users linked to this corporation.
  - "Add User" button (opens modal for Name/Email).
  - "Revoke Access" button (deactivates user).
  - "Reset Password" button (generates new one & emails it).

### 4.2 Corporate Portal (Client Facing)
- **Path**: `/corporate` (Using `CorporateRouter`)
- **Layout**: Simplified, branded interface (Dark Blue/Gold).
- **Dashboard**:
  - Job Status Tracker (Table).
  - "Request Pickup" Form.
  - "Urgent Request" Action.
  - Billing History.

## 5. Implementation Roadmap

### Phase 1: Foundation (Days 1-2)
- [ ] **Schema**: Update `users` table and run migration.
- [ ] **Email Service**: Install `nodemailer` and implement `server/services/mailer.ts`.
- [ ] **Backend API**: Create `POST /api/admin/corporate-users` endpoint.

### Phase 2: Admin Interface (Days 3-4)
- [ ] **UI**: Add "Users" tab to Corporate Client details page.
- [ ] **Functionality**: Implement User Creation Modal & List.

### Phase 3: Corporate Portal Frontend (Days 5-8)
- [ ] **Routing**: Setup `CorporateRouter` and Layout.
- [ ] **Dashboard**: Build job tracking table with `corporateClientId` filtering.
- [ ] **Features**: Implement Pickup & Urgency request forms.

### Phase 4: Testing & Deployment (Day 9)
- [ ] **End-to-End Test**: Admin creates user -> Email sent -> User logs in -> User sees correct data.
