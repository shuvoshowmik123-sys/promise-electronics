# Unified Flow Plan

Status: NOT STARTED
Owner: Codex direction, Claude implementation after phase approval
Last updated: 2026-06-26

## Working Rule

Touch one tab or domain at a time.

Do not redesign Service Request, Jobs, Customer Journey, and Pickup together in one implementation pass. Each phase must leave the system usable.

Before each phase:

1. Read `AGENTS.md`.
2. Read `rules.md`.
3. Read `docs/AGENT_CURRENT_CONTEXT.md`.
4. Read `Customer Portal Unified Flow.md`.
5. Read this file.
6. Inspect the exact route/service/repository/frontend files for the phase.
7. Implement only the current phase.
8. Run relevant checks.
9. Update this file with status, files changed, checks run, and remaining issues.

## Phase 0: Current State Audit

Status: DONE
Completed: 2026-06-26

Files inspected:

- server/routes/service-requests.routes.ts
- server/routes/jobs.routes.ts
- server/routes/quotes.routes.ts
- server/routes/customer-repair-journey.routes.ts
- server/routes/admin-repair-journey.routes.ts
- server/routes/notifications.routes.ts
- server/routes/admin-notifications.routes.ts
- server/services/job.service.ts
- server/services/customer-repair-journey.service.ts
- server/services/fcm.service.ts
- server/pushService.ts
- server/repositories/service-request.repository.ts
- server/routes/middleware/sse-broker.js
- shared/schema.ts (service_requests, job_tickets, pickup_schedules tables)
- client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx
- client/src/pages/admin/bento/tabs/JobTicketsTab.tsx
- client/src/pages/admin/bento/tabs/PickupTab.tsx

### Current Flow Summary

**1. Public service request creation:**
POST /api/service-requests creates a service request with auto-generated ticket number (SRV-YYYYMMDD-XXXX), sets status=Pending, stage=intake. Auto-links to customer by phone (creates customer account if none exists). Creates a customer_repair_journey record. Publishes SSE event for admin notification.

**2. Quote request creation:**
POST /api/quotes creates a service request with isQuote=true, quoteStatus=Pending, requestIntent=quote. Same flow as service request but creates journey via createJourneyFromQuote() with stage=quote_requested.

**3. Service request to job ticket conversion:**
POST /api/admin/service-requests/:id/verify-and-convert. Requires stage to be "picked_up" or "device_received" (custody stages). Creates job ticket, copies customer/device/quote data, sets SR status=Work Order, sets SR convertedJobId=new job ID, sets job parentJobId=SR id. Creates timeline events on both SR and journey. Publishes dual SSE events.

**4. Linking between service_request, job_ticket, and customer_repair_journey:**
- service_requests.convertedJobId → job_tickets.id (forward link after conversion)
- job_tickets.parentJobId → service_requests.id (reverse link — actually stores SR id despite field name)
- customer_repair_journeys.service_request_id → service_requests.id
- customer_repair_journeys.job_ticket_id → job_tickets.id (set during conversion via linkJourneyToJobTicket)
- customer_repair_journeys.quote_request_id → for quote-origin journeys

**5. When job status changes, what updates automatically:**
- syncLinkedServiceRequestFromJob() updates SR trackingStatus and status via projected mapping
- syncJobStatusToJourney() updates journey stage and creates journey events
- Job "Ready" → creates customer notification (job_ready type) + push notification
- Job status change → SSE broadcast to admin + customer
- repairJourneyService.syncPaymentToJourney() on payment recording

**6. When job is completed, does SR/journey update automatically:**
YES. syncLinkedServiceRequestFromJob maps:
- Job Pending → SR tracking "Device at Service Center"
- Job Ready → SR tracking "Ready for Collection/Return"
- Job Completed/Delivered → SR status "Resolved", tracking "Repair Completed"
- Job Cancelled → SR status "Closed"
syncJobStatusToJourney maps:
- Job Ready/Completed → journey stage "repair_completed"
- Job Delivered → journey stage "delivered"
- Job Cancelled → journey stage "cancelled"
- Warranty events auto-created on completion if applicable

**7. Pickup scheduling currently works:**
POST /api/admin/service-requests/:id/transfer-to-pickup creates a pickup_schedule linked to serviceRequestId. Pickups have status: Pending/Scheduled/Picked Up/Delivered/Cancelled. Admin can update pickup, assign staff, record COD payment.

**8. Can pickup/delivery exist without a service request:**
NO. pickup_schedules.serviceRequestId is NOT NULL. Pickups cannot exist independently. There is no delivery-from-job flow — only pickup-to-service-request.

**9. Customer notifications:**
- Job ready → notification with type "job_ready" + FCM push
- Job status change → SSE to customer + push via notifyOrderStatusChange()
- Journey events created on stage changes (customer-visible)
- Customer notifications table stores per-user notifications with read/unread state
- Admin SSE broadcasts on all major events

**10. Biggest duplicate-work risks for staff:**
- SR status/trackingStatus is auto-synced from job, but staff may not realize they don't need to manually update SR after conversion
- Journey admin tab exists as a separate workload — staff might try to manage journey stage manually when it should auto-sync from job
- Pickup tab only shows SR-linked pickups — no way to create delivery task after job is ready for return
- No structured call follow-up — call outcomes are free-text notes, not structured data
- Quote on SR vs estimate on job are separate — accepting a quote doesn't auto-populate job estimate in all cases
- No offline/manual pickup creation without a service request

### Confirmed Gaps

1. **No delivery task from job:** When job is ready and customer wants delivery, there is no way to create a delivery logistics task from the job. Pickup only flows from service request.
2. **No independent logistics task:** Pickups require a service request. Offline pickups (call/Messenger) cannot be created without first creating a service request.
3. **No structured call follow-up:** No call_attempts table or structured call outcome tracking. Call notes are free-text on service request.
4. **Journey admin tab is manual:** Admin can manually change journey stages, but this should be auto-driven by SR/job sync. Manual management creates duplicate work.
5. **No claim code for walk-in no-account customers:** Job tickets store customer name/phone but no claim code for later account linking.
6. **Quote-to-job estimate gap:** When SR quote is accepted and job is created, quoteAmount is copied to estimatedCost, but there's no guarantee the quote acceptance flow consistently transfers all billing context.
7. **Pickup-to-job link is indirect:** Pickup links to SR, SR links to job. No direct pickup-to-job reference makes it harder to track logistics for active jobs.
8. **No customer-facing delivery tracking:** Journey has "delivered" stage but no real-time delivery tracking (en route, arrived, etc.).
9. **Service request stage flow is complex:** 15+ stages with multiple branching paths. The "wizard" approach in admin UI helps but the underlying state machine is hard to reason about.
10. **Notification gaps:** No notification for: quote sent, schedule confirmed, pickup en route, delivery en route, payment received confirmation.

### Recommended Next Phase Files

Phase 1 (Unified Repair Case Contract) should focus on:

Backend:
- server/services/job.service.ts — extend sync functions
- server/services/customer-repair-journey.service.ts — verify auto-sync coverage
- server/repositories/service-request.repository.ts — add unified case lookup
- shared/schema.ts — review linking fields

Frontend (read-only inspection, no changes in Phase 1):
- client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx
- client/src/pages/admin/bento/tabs/JobTicketsTab.tsx

Checks run:

- npx tsc --noEmit --pretty false (PASS)
- npx vite build --mode development (PASS)

Remaining risks:

- The journey tables (customer_repair_journeys, events, schedules) are created via raw SQL in customer-repair-journey.service.ts migration, not defined in shared/schema.ts Drizzle schema. This means Drizzle ORM queries cannot be used for these tables — only raw SQL via db.execute(). This limits type safety and query composability for Phase 1.
- The parentJobId field on job_tickets is misleadingly named — it actually stores the source service_request.id, not a parent job. This should be documented but not renamed in Phase 0.

## Phase 1: Unified Repair Case Contract

Status: NOT STARTED

Goal: define backend rules without changing broad UI.

Decisions:

- Service Request remains intake.
- Job Ticket becomes master after device acceptance.
- Customer Repair Journey becomes customer timeline.
- Logistics becomes separate movement layer.

Implementation tasks:

- add or confirm helper functions for linked repair case lookup
- make sure Service Request can show linked job summary
- make sure Job Ticket can show source service request
- make sure Journey links to request and job consistently
- define automatic sync entry points

Do not:

- redesign pickup tab yet
- redesign customer portal yet
- create new visual system

Done when:

- one repair can be loaded as a unified case object in backend or API helper
- link rules are documented in code or plan

## Phase 2: Service Request Tab Redesign As Intake Queue

Status: NOT STARTED

Goal: turn Service Request into a clean intake workflow, not a dropdown status table.

Target lanes:

- New Intake
- Needs Call
- Needs Reply
- Quote Sent
- Schedule Needed
- Waiting Customer
- Ready to Receive
- Converted to Job
- Rejected / Closed

Backend tasks:

- add structured intake state if current fields are not enough
- add call follow-up model or endpoint
- add call outcome actions
- add polite rejection/close reason handling
- ensure customer question creates admin notification/task

Frontend tasks:

- redesign Service Request tab queue layout
- add guided action sheet/wizard
- replace dangerous status dropdown with contextual actions
- show call panel
- show linked job status when converted

Done when:

- staff can process a request from new intake to quote, schedule, reject, or receive
- call outcomes are structured
- converted requests become read-only/source history

## Phase 3: Service Request To Job Conversion

Status: NOT STARTED

Goal: make conversion reliable and hard to misuse.

Allowed conversion paths:

- customer drops TV at shop
- pickup completed
- admin verifies and accepts work
- walk-in direct job creation

Tasks:

- enforce custody/receive step before normal repair job
- preserve customer name, phone, media, issue, quote, and source
- create or link Customer Repair Journey
- create audit event
- create printed slip/claim code path for no-account customers if missing

Done when:

- converted Service Request clearly points to Job Ticket
- Job Ticket clearly points back to Service Request
- customer timeline continues without duplicate records

## Phase 4: Job Tab Sync

Status: NOT STARTED

Goal: job status automatically updates customer-facing state and source request state.

Sync rules:

- Job Ready -> Journey repair completed / ready message
- Job Completed -> Journey completed and Service Request completed
- Job Delivered -> delivery complete
- Job Cancelled -> closed softly
- Warranty active -> Journey warranty event

Tasks:

- centralize sync in job service
- remove need for manual service request updates after conversion
- notify customer when linked
- notify admin if delivery is required but missing

Done when:

- no separate staff intervention is needed to reflect completed job in Service Request or Customer Journey

## Phase 5: Customer Repair Journey Cleanup

Status: NOT STARTED

Goal: make Journey a timeline, not another operations tab.

Tasks:

- keep customer questions and timeline
- reduce admin journey tab to monitoring/exceptions
- ensure system creates events from service request, job, logistics, billing, warranty
- customer-facing messages must be friendly

Done when:

- staff does not need to manage Journey as a separate job queue
- customer can understand full repair story in portal

## Phase 6: Billing Flow

Status: NOT STARTED

Goal: separate estimate before job from final bill after job.

Rules:

- Service Request owns quote/estimate before job.
- Job Ticket owns final bill after repair starts.
- Payments can reference request before conversion.
- Final invoice should reference Job Ticket.

Tasks:

- inspect current quote/payment/manual payment flow
- ensure quote accepted transfers estimate into job
- ensure final bill does not depend on Service Request after conversion
- ensure customer portal shows bill ready at the right stage

Done when:

- customer billing is understandable from request through job completion
- admin can see quote vs final bill clearly

## Phase 7: Logistics Data Model

Status: NOT STARTED

Goal: prepare pickup and delivery for real operation.

Decision required:

- extend `pickup_schedules`, or
- create new `logistics_tasks`

Recommendation:

- create or migrate toward `logistics_tasks`, because delivery/offline/manual/corporate movement is wider than pickup.

Required fields:

- taskType
- sourceType
- serviceRequestId
- jobTicketId
- customerId
- customerName
- customerPhone
- pickupAddress
- deliveryAddress
- scheduledDate
- timeWindow
- status
- assignedDriverId
- zone
- routeOrder
- latitude
- longitude
- proofPhotoUrl
- signatureUrl
- notes
- failureReason
- rescheduleReason
- completedAt

Done when:

- backend can create pickup or delivery task from Service Request, Job Ticket, or manual offline entry

## Phase 8: Pickup/Delivery Tab Redesign

Status: NOT STARTED

Goal: replace current weak pickup tab with useful Logistics operations.

Scope:

- desktop view
- mobile view
- driver-friendly actions

Target lanes:

- Pickup Requests
- Delivery Requests
- Today Route
- Assigned
- En Route
- Failed / Reschedule Needed
- Completed

Driver actions:

- call customer
- start route
- reached
- picked up
- delivered
- customer unavailable
- phone unreachable
- request reschedule
- upload proof
- add note

Done when:

- pickup and delivery cannot be forgotten under work pressure
- failed contact and reschedule are visible
- driver sees only practical movement tasks

## Phase 9: Map And Route Management

Status: NOT STARTED

Goal: add practical map and route support after Logistics works.

First version:

- address cleanup
- optional map pin
- zone selection
- suggested route order
- manual reorder
- driver route list

Suggested route logic:

1. group by zone
2. prioritize confirmed time windows
3. order by approximate distance
4. allow admin override

Do not:

- block phase release on perfect route optimization
- add complex map dependency before provider choice is approved

Done when:

- admin can assign a route
- driver can follow ordered stops
- task statuses update the route board

## Phase 10: Customer Portal Final Pass

Status: NOT STARTED

Goal: make customer portal feel like one human repair assistant.

Tasks:

- make My Repairs / journey detail the canonical repair control page
- show quote, schedule, reschedule, question, bill, warranty in one place
- add friendly customer wording
- avoid forcing customer to refill forms for same repair
- support account-linked and claim-code-linked repairs

Done when:

- customer can continue an existing repair without starting from zero
- customer understands next action clearly

## Phase 11: QA And Release Gate

Status: NOT STARTED

Required flows:

- online quote -> accept -> pickup -> job -> ready -> delivery -> completed
- online service center visit -> receive -> job -> completed
- walk-in account customer -> direct job -> customer portal visible
- walk-in no-account customer -> printed claim code -> later claim
- offline pickup -> logistics -> receive -> job
- delivery requested after shop drop-off -> job ready -> delivery task
- call no answer -> waiting customer -> soft close
- rejected request -> polite customer message
- job completed -> service request and journey auto-sync

Checks:

- TypeScript
- targeted backend tests if existing
- targeted frontend build or lint
- Playwright for critical portal/admin flows where practical
- mobile viewport checks for redesigned Logistics

Done when:

- no critical customer flow depends on memory/manual duplicate updates
- inspector approves public release behavior

## Claude Plot Prompt

Use this prompt when handing a phase to Claude Code:

```
You are working on Promise Electronics. Follow AGENTS.md exactly.

Read these files first, in order:
1. AGENTS.md
2. rules.md
3. docs/AGENT_CURRENT_CONTEXT.md
4. docs/AGENT_FRONTEND_PLAYBOOK.md if touching frontend
5. Customer Portal Unified Flow.md
6. Unified Flow Plan.md

Current phase: [PHASE NAME]

Implement only this phase. Do not redesign other tabs. Do not change unrelated customer, corporate, billing, auth, session, or schema behavior unless the phase explicitly requires it.

Before editing, inspect the relevant route/service/repository/component files and summarize the current shape.

After implementation:
- run relevant checks
- update Unified Flow Plan.md phase status to DONE or PARTIAL
- add files changed under that phase
- add checks run under that phase
- add remaining risks under that phase
- keep the AGENTS.md feedback block in your final response

If blocked by unclear schema, missing file, or cross-phase dependency, stop and update the phase as BLOCKED with exact reason.
```

## Status Update Format For Claude

When a phase is finished, rewrite that phase like this:

```
## Phase X: Name

Status: DONE
Completed: YYYY-MM-DD

Files changed:

- path/to/file

Checks run:

- command

Result:

- one or two sentences

Remaining issues:

- none
```

If not fully finished, use:

```
Status: PARTIAL
Remaining issues:
- exact issue
```

If blocked, use:

```
Status: BLOCKED
Blocking reason:
- exact reason
```

