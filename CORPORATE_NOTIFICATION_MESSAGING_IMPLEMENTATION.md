# Corporate Portal: Notifications & Message Manager Implementation Plan

## Overview
Implement functional notification bell and message manager for the corporate portal to enable real-time communication between corporate users and admin panel. This plan addresses non-functional buttons identified in the CorporateLayoutShell and corporate profile page.

## Current State Analysis

### Notification System (Existing)
- ✅ **Customer Notification System**: Full implementation exists
  - Endpoints: `/api/customer/notifications`, `/api/customer/notifications/unread-count`, `/api/customer/notifications/:id/read`
  - Storage: `notifications` table with proper schema
  - Real-time: SSE (Server-Sent Events) infrastructure exists
  
- ❌ **Corporate Notification System**: Missing
  - No corporate-specific notification endpoints
  - Bell icon in CorporateLayoutShell is non-functional
  - No job completion notification integration

### Message Manager (Missing)
- ❌ **No implementation exists**
- ❌ **No chat interface for corporate-admin communication**
- ❌ **No file attachment support**

## Phase 1: Corporate Notification System

### 1.1 Database Extensions
```sql
-- Extend notifications table for corporate context
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS corporate_client_id TEXT REFERENCES corporate_clients(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS job_id TEXT REFERENCES job_tickets(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS context_type TEXT DEFAULT 'corporate';
```

### 1.2 Backend API
**New Routes**: `server/routes/corporate-notifications.routes.ts`
```typescript
// GET /api/corporate/notifications - Get corporate user notifications
// GET /api/corporate/notifications/unread-count
// PATCH /api/corporate/notifications/:id/read
// POST /api/corporate/notifications/mark-all-read
// POST /api/corporate/notifications/job-completed
```

**Job Completion Notification Hook**:
```typescript
// In server/routes/jobs.routes.ts
// Add trigger when job status changes to 'closed' or 'ready'
if (newStatus === 'closed' || newStatus === 'ready') {
  await notificationService.createCorporateJobNotification({
    corporateClientId: job.corporate_client_id,
    jobId: job.id,
    message: `Job #${job.id} completed: ${job.device} - TV Passed QC`
  });
}
```

### 1.3 Corporate Notification Types
1. **Job Completion**: "Job #1234 Completed - TV Passed QC"
2. **Job Status Update**: "Job #5678 Status Changed: In Repair → Quality Check"
3. **Service Request Update**: "Service Request #SR-789 Received Quote"
4. **System Alerts**: "Scheduled Maintenance Tonight"
5. **Admin Messages**: "New Payment Terms Updated"

### 1.4 Frontend Components
**CorporateNotificationBell.tsx** (New Component):
```typescript
// Features:
// - Real-time notification fetching
// - Unread count badge
// - Dropdown notification list
// - Mark as read functionality
// - Click to navigate to relevant job/service request
```

**Integration Points**:
1. CorporateLayoutShell → Replace static Bell with CorporateNotificationBell
2. Corporate Profile Page → Add notification section
3. Corporate Dashboard → Add notification widget

## Phase 2: Message Manager System

### 2.1 Database Schema
```sql
-- Corporate Messages Table
CREATE TABLE corporate_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id),
  admin_user_id TEXT REFERENCES users(id),
  thread_id TEXT, -- For grouping messages
  message TEXT NOT NULL,
  sender_type TEXT NOT NULL, -- 'corporate_user', 'admin'
  sender_id TEXT NOT NULL, -- user_id or admin_user_id
  read_by_admin BOOLEAN DEFAULT FALSE,
  read_by_corporate BOOLEAN DEFAULT FALSE,
  attachments JSONB, -- [{filename, url, type, size}]
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Message Threads Table
CREATE TABLE corporate_message_threads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id),
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open', -- 'open', 'resolved', 'closed'
  last_message_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 Backend API
**New Routes**: `server/routes/corporate-messages.routes.ts`
```typescript
// POST /api/corporate/messages/threads - Create new thread
// GET /api/corporate/messages/threads - List threads
// GET /api/corporate/messages/threads/:threadId/messages - Get thread messages
// POST /api/corporate/messages/send - Send message
// POST /api/corporate/messages/upload-attachment - Upload file
// PATCH /api/corporate/messages/threads/:threadId/status - Update thread status
```

### 2.3 Message Manager UI Design
**Components to Create**:
1. **MessageThreadList**: Shows all conversation threads
2. **MessageThread**: Individual message thread view
3. **MessageComposer**: Rich text editor with file attachments
4. **AttachmentPreview**: Shows uploaded files
5. **AdminMessagePanel**: Admin-side interface for responding

**Corporate Portal Integration**:
- Add "Message Manager" to corporate sidebar navigation
- Create `/corporate/messages` page
- Integrate with existing corporate design system

## Phase 3: Job Completion Integration

### 3.1 Notification Triggers
**Backend Integration Points**:
```typescript
// 1. Job Ticket Status Change (server/routes/jobs.routes.ts)
if (job.corporate_client_id && newStatus === 'closed') {
  await sendCorporateNotification({
    corporateClientId: job.corporate_client_id,
    type: 'job_completed',
    jobId: job.id,
    title: `Job #${job.id} Completed`,
    message: `Your repair job for ${job.device} has been completed successfully.`,
    link: `/corporate/jobs/${job.id}`
  });
}

// 2. Service Request Completion (server/routes/service-requests.routes.ts)
if (serviceRequest.corporateClientId && newStatus === 'closed') {
  await sendCorporateNotification({
    corporateClientId: serviceRequest.corporateClientId,
    type: 'service_request_completed',
    requestId: serviceRequest.id,
    title: `Service Request Completed`,
    message: `Your service request #${serviceRequest.ticketNumber} has been resolved.`,
    link: `/corporate/service-requests/${serviceRequest.id}`
  });
}
```

### 3.2 Notification Content Templates
```typescript
const notificationTemplates = {
  job_completed: {
    title: "Job Completed: {{jobId}}",
    message: "{{device}} repair has been completed and passed quality control.",
    link: "/corporate/jobs/{{jobId}}"
  },
  job_status_updated: {
    title: "Job Status Updated",
    message: "{{device}} status changed from {{oldStatus}} to {{newStatus}}.",
    link: "/corporate/jobs/{{jobId}}"
  },
  admin_message: {
    title: "Message from Admin",
    message: "{{adminName}}: {{message}}",
    link: "/corporate/messages/{{threadId}}"
  }
};
```

## Phase 4: Real-time Communication

### 4.1 WebSocket Integration
**Technology Stack**: Socket.io or Server-Sent Events (SSE)
- **Existing SSE Infrastructure**: Already implemented for admin panel
- **Extension**: Add corporate-specific event channels

**Event Types**:
```typescript
const corporateEvents = {
  NEW_MESSAGE: 'corporate_new_message',
  JOB_UPDATE: 'corporate_job_update',
  NOTIFICATION: 'corporate_notification'
};
```

### 4.2 Frontend Real-time Integration
**CorporateNotificationContext.tsx**:
```typescript
// Context for managing real-time notifications and messages
// Features:
// - WebSocket connection management
// - Notification state management
// - Message thread updates
// - Unread counters
```

## Phase 5: Admin Panel Integration

### 5.1 Admin Notification Dashboard
**New Admin Components**:
1. **CorporateNotificationCenter**: View all corporate notifications
2. **CorporateMessageInterface**: Admin-side message management
3. **Bulk Notification Sender**: Send announcements to multiple corporate clients

**Admin Routes**:
```typescript
// GET /api/admin/corporate-notifications - Get all corporate notifications
// GET /api/admin/corporate-messages - Get all corporate message threads
// POST /api/admin/corporate-broadcast - Send broadcast to all corporate clients
```

## Technical Implementation Details

### Backend Architecture
```
server/
├── routes/
│   ├── corporate-notifications.routes.ts    # Phase 1
│   ├── corporate-messages.routes.ts         # Phase 2
│   └── corporate-events.routes.ts           # Phase 4 (SSE/WebSocket)
├── services/
│   ├── corporate-notification.service.ts
│   └── corporate-messaging.service.ts
└── repositories/
    └── corporate-notifications.repository.ts
```

### Frontend Architecture
```
client/src/
├── components/corporate/
│   ├── CorporateNotificationBell.tsx        # Phase 1
│   ├── CorporateNotificationCenter.tsx     # Phase 1
│   ├── MessageThreadList.tsx               # Phase 2
│   ├── MessageThread.tsx                   # Phase 2
│   ├── MessageComposer.tsx                 # Phase 2
│   └── AttachmentUploader.tsx              # Phase 2
├── contexts/
│   └── CorporateNotificationContext.tsx     # Phase 4
└── pages/corporate/
    └── messages.tsx                         # Phase 2
```

### Database Migrations
```sql
-- Migration 0003_corporate_notifications.sql
ALTER TABLE notifications ADD COLUMN corporate_client_id TEXT REFERENCES corporate_clients(id);
ALTER TABLE notifications ADD COLUMN job_id TEXT REFERENCES job_tickets(id);
ALTER TABLE notifications ADD COLUMN context_type TEXT DEFAULT 'corporate';

-- Migration 0004_corporate_messages.sql
CREATE TABLE corporate_message_threads (...);
CREATE TABLE corporate_messages (...);
CREATE INDEX idx_corporate_messages_thread ON corporate_messages(thread_id);
CREATE INDEX idx_corporate_messages_client ON corporate_messages(corporate_client_id);
```

## Design Specifications

### Notification Bell UI
```tsx
// Current (non-functional):
<Button variant="ghost" size="icon" className="relative text-slate-500 hover:text-[var(--corp-blue)] corp-btn-glow rounded-full">
  <Bell className="h-5 w-5" />
  <span className="absolute top-2 right-2.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white"></span>
</Button>

// New Implementation:
<CorporateNotificationBell 
  userId={user.id}
  corporateClientId={user.corporateClientId}
  onNotificationClick={(notification) => {
    // Navigate to relevant page
    if (notification.jobId) {
      navigate(`/corporate/jobs/${notification.jobId}`);
    } else if (notification.threadId) {
      navigate(`/corporate/messages/${notification.threadId}`);
    }
  }}
/>
```

### Message Manager UI
**Design Requirements**:
1. **Corporate Branding**: Use corporate color scheme (`--corp-blue`, `--elite-gold`)
2. **Responsive Layout**: Mobile-first design
3. **File Uploads**: Support images, PDFs, documents
4. **Message Status**: Read receipts, delivery status
5. **Admin Differentiation**: Clearly distinguish admin vs corporate messages

**Chat Interface Components**:
1. **Left Panel**: Thread list with unread indicators
2. **Right Panel**: Message thread with:
   - Message bubbles (corporate: right-aligned, admin: left-aligned)
   - Timestamps
   - Attachment previews
   - Read status indicators
3. **Composer Panel**: Rich text editor with attachment button
4. **Attachment Modal**: Preview, remove, upload progress

## Implementation Timeline

### Week 1: Notification System Foundation
- [ ] Database migrations (0003_corporate_notifications.sql)
- [ ] Backend API for corporate notifications
- [ ] Notification service integration with job completion
- [ ] Basic CorporateNotificationBell component

### Week 2: Message Manager Backend
- [ ] Database migrations (0004_corporate_messages.sql)
- [ ] Message CRUD APIs
- [ ] File upload handling
- [ ] Message thread management

### Week 3: Frontend Implementation
- [ ] CorporateNotificationBell with real-time updates
- [ ] MessageManager page layout
- [ ] Chat interface components
- [ ] File attachment UI

### Week 4: Admin Integration & Polish
- [ ] Admin notification dashboard
- [ ] Admin message interface
- [ ] Real-time WebSocket integration
- [ ] Testing and bug fixes

## Success Criteria

### Functional Requirements
- [ ] Notification bell shows unread count
- [ ] Clicking bell shows notification list
- [ ] Job completion triggers "TV Passed QC" notification
- [ ] Message manager allows corporate-admin communication
- [ ] File attachments supported (images, PDFs)
- [ ] Admin can send bulk notifications
- [ ] Real-time updates without page refresh

### Performance Requirements
- [ ] Notification load < 200ms
- [ ] Message send < 500ms
- [ ] File upload < 2MB/s
- [ ] Real-time updates < 100ms latency

### UX Requirements
- [ ] Intuitive notification management
- [ ] Clear message threading
- [ ] Mobile-responsive design
- [ ] Accessible (WCAG 2.1 AA)
- [ ] Consistent with corporate branding

## Testing Strategy

### Unit Tests
- Notification creation and retrieval
- Message thread management
- File upload processing
- Real-time event handling

### Integration Tests
- Job completion → Notification trigger
- Admin message → Corporate notification
- File attachment → Message display
- Real-time sync between admin/corporate

### E2E Tests
- Full notification flow
- Complete message thread
- File upload/download
- Cross-platform compatibility

## Rollout Plan

### Phase 1: Development Environment
- Implement all backend APIs
- Create frontend components
- Test with mock data

### Phase 2: Staging Environment
- Deploy to staging
- UAT with corporate test accounts
- Performance testing

### Phase 3: Production Deployment
- Gradual rollout (25%, 50%, 100%)
- Monitor system performance
- Gather user feedback
- Iterate based on feedback

## Dependencies

### Required Infrastructure
- Database: PostgreSQL extensions
- File Storage: S3 or similar for attachments
- Real-time: Socket.io server or SSE infrastructure
- Background Jobs: For notification processing

### External Services
- File upload service (existing ImageKit)
- Email service (for notification fallback)
- SMS service (optional for critical alerts)

## Risk Mitigation

### Technical Risks
1. **Real-time scaling**: Start with SSE, migrate to WebSocket if needed
2. **File storage costs**: Implement file size limits and retention policies
3. **Notification spam**: Implement rate limiting and user preferences

### Business Risks
1. **Information overload**: Allow users to customize notification types
2. **Support burden**: Provide comprehensive documentation
3. **Data privacy**: Encrypt messages, secure file uploads

## Monitoring & Analytics

### Metrics to Track
- Notification delivery rate
- Message response time
- File upload success rate
- User engagement with notifications
- System load under peak usage

### Alerting
- Failed notification deliveries
- File upload failures
- High system latency
- Database connection issues

## Post-Launch Enhancements

### Short-term (Month 1-3)
- Notification preferences panel
- Email digest for offline users
- Message templates for common queries
- Bulk file download

### Medium-term (Month 4-6)
- Advanced search in messages
- Message tagging and categorization
- Analytics dashboard for admin
- Mobile push notifications

### Long-term (Month 7+)
- AI-powered response suggestions
- Automated notification categorization
- Integration with third-party ticketing systems
- Advanced reporting and insights

## Conclusion

This implementation plan provides a comprehensive roadmap for adding notification bell functionality and message manager to the corporate portal. The solution leverages existing infrastructure while adding corporate-specific features that enable real-time communication and job status updates between corporate users and admin staff.

The phased approach ensures manageable development while maintaining system stability and performance throughout the rollout.