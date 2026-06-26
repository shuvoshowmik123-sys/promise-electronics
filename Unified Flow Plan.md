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

Status: DONE
Completed: 2026-06-26

Files changed:

- server/services/repair-case.service.ts (NEW)
- server/routes/service-requests.routes.ts (added repair-case endpoint)
- server/routes/jobs.routes.ts (added repair-case endpoint)

### What the unified case contract returns

`UnifiedRepairCase` contains:

- `operationalOwner`: `"service_request"` (pre-conversion) or `"job_ticket"` (post-conversion)
- `serviceRequest`: full ServiceRequest record or null
- `jobTicket`: full JobTicket record or null
- `journey`: JourneySummary (id, stage, status, friendly status, event/schedule counts) or null — loaded via raw SQL from customer_repair_journeys
- `pickup`: PickupSchedule record or null — loaded via Drizzle from pickup_schedules
- `customer`: { id, name, phone, address } — aggregated from SR or job
- `links`: { serviceRequestId, jobTicketId, journeyId, pickupScheduleId, serviceRequestTicketNumber, jobTicketNumber }
- `warnings`: array of { code, message } for data integrity issues

Warning codes:
- `ORPHANED_CONVERSION`: SR references a job that doesn't exist
- `NO_CUSTOMER_ACCOUNT`: no linked customer account (walk-in/unregistered)
- `NO_JOURNEY`: converted to job but no journey record
- `NO_SOURCE_REQUEST`: job has no linked service request (direct walk-in or corporate)
- `MISSING_PICKUP`: SR indicates pickup but no pickup_schedule found

### API endpoints

- `GET /api/admin/service-requests/:id/repair-case` — load case from SR side (requires serviceRequests permission)
- `GET /api/admin/job-tickets/:id/repair-case` — load case from job side (requires jobs permission)

Both return the same `UnifiedRepairCase` shape. Either tab can display the same repair context.

### parentJobId ambiguity documented

`job_tickets.parentJobId` is overloaded:
1. SR→Job conversion: stores `service_request.id` (job.service.ts line 304)
2. Warranty claims: stores `original_job.id` (warranty.routes.ts line 306)
3. Corporate bulk jobs: stores parent job id (corporate.service.ts)

The repair case service uses `service_requests.convertedJobId` (forward link) and `serviceRequestRepo.getServiceRequestByConvertedJobId()` (reverse lookup) instead of relying on parentJobId. This avoids the ambiguity.

### Design decisions

- Journey tables stay as raw SQL (not added to Drizzle schema) — they are migration-created tables queried via `db.execute(sql`...`)`. Adding to schema.ts would require verifying all column types match and could break existing journey service code. Phase 5 can address this.
- No schema changes in this phase — all new code is read-only aggregation.
- No UI changes — contract is backend-only for future tab consumption.

Checks run:

- npx tsc --noEmit --pretty false (PASS)
- git diff --check (PASS)

Remaining issues:

- Journey summary uses raw SQL subqueries for event/schedule counts — acceptable for read-only aggregation but not as efficient as indexed counts
- Customer identity falls back from SR to job denormalized fields — some edge cases (renamed customer, phone changed) could show stale data
- Pickup is only linked via SR — jobs created without SR (walk-in) have no pickup path

## Phase 2A: Service Request Intake + Call Follow-up Backend

Status: DONE
Completed: 2026-06-26

Files changed:

- server/services/call-attempt.service.ts (NEW) — call attempts CRUD, call summary, intake lane classifier
- server/services/repair-case.service.ts — extended UnifiedRepairCase with intake { lane, callSummary, needsStaffAction }
- server/routes/service-requests.routes.ts — added 3 call attempt endpoints, moved repair-case import to top
- server/routes/jobs.routes.ts — moved repair-case import to top
- server/index.ts — registered call attempts migration

### API endpoints added

- GET /api/admin/service-requests/:id/call-attempts — list call attempts for SR
- POST /api/admin/service-requests/:id/call-attempts — create structured call attempt with validated callType, outcome, customerMood
- PATCH /api/admin/service-requests/:id/call-attempts/:attemptId — update call attempt outcome/notes

### Call attempt schema

Table: service_request_call_attempts (idempotent DDL via db.execute)
Fields: id, service_request_id, staff_id, staff_name, call_type, scheduled_at, called_at, outcome, next_action, callback_at, customer_mood, notes, customer_visible_message, created_at, updated_at

### Intake lane classifier

deriveIntakeLane() maps SR state + call summary to one of 9 lanes:
- new_intake: unreviewed pending SR
- needs_call: callback requested or pending callback
- needs_reply: quote pending or SR under review
- quote_sent: quote sent, awaiting customer response
- schedule_needed: pickup/dropoff scheduled
- waiting_customer: 3+ no-answer streak or customer asked for time
- ready_to_receive: device custody stage reached
- converted_to_job: SR has convertedJobId
- rejected_closed: cancelled/declined/closed/unrepairable

### Repair case contract extension

UnifiedRepairCase now includes:
```
intake: {
    lane: IntakeLane;
    callSummary: { callAttemptCount, lastCallOutcome, nextCallbackAt, noAnswerStreak };
    needsStaffAction: boolean;
} | null
```

Checks run:

- npx tsc --noEmit --pretty false (PASS)
- git diff --check (PASS)

### Hotfix: updateCallAttempt SQL (2026-06-26)

Bug: updateCallAttempt() built dynamic SET clauses with `sql.raw` using `$1`/`$2` placeholders, but the `values` array was never bound to `db.execute()`. Values would not be substituted — columns would receive literal `$1` strings or fail.

Fix: replaced raw placeholder logic with safe Drizzle `sql` template chunks. Each column update uses `sql\`column = ${value}\``, joined via `sql.join(chunks, sql\`, \`)`. All values pass through Drizzle parameterized interpolation. Column names remain hardcoded/whitelisted. If no mutable fields are provided, only `updated_at = NOW()` runs (always at least one SET chunk).

Remaining Phase 2B (UI):

- Service Request admin tab redesign using intake lanes
- Call panel UI inside SR detail
- Guided action sheet/wizard for intake processing
- Show linked job status when converted

## Phase 2B: Service Request Tab Intake Queue UI

Status: PARTIAL
Started: 2026-06-26

Files changed:

- client/src/lib/api/adminApi.ts — added repairCaseApi and callAttemptsApi helpers
- client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx — added lane classifier, lane filter chips, repair-case query on selection, call attempt query, call log dialog, intake lane badge + staff action banner in detail view

### UI behavior added

- Lane filter chips replace old status-only KPI. 9 lanes: New Intake, Needs Reply, Quote Sent, Schedule, Waiting, Ready, Job, Closed.
- Lane counts computed client-side from SR fields (no per-row API call).
- Selected request detail shows: intake lane badge, call summary (count + last outcome), "Log Call" button, staff-action-needed banner.
- Call Log dialog: structured form with call type, outcome, customer mood, callback time, notes. Creates call attempt via API.
- Repair case data loaded on selection for lane + call summary context.
- Call attempts list loaded on selection.
- Existing filters (search, status) still work alongside lane filter.
- All existing actions preserved: review, convert, quote, stage, custody, rollback, delete.

### Phase 2B Hotfix (2026-06-27)

Fixed:
1. Call Log dialog: replaced FormData with controlled React state (callForm). Radix Select values now reliably captured.
2. Call form resets on dialog open, after save success, and on cancel.
3. Call history shown in selected request detail: newest first, up to 4 recent entries with outcome badge, mood badge, callback time, notes, staff name. "+N more" if over 4.
4. Converted/closed cards muted: `bg-slate-50 opacity-70`, muted name text. Converted cards show "JOB" badge. Active intake visually distinct.

### What was NOT done (remaining Phase 2B polish)

- Full lane board/kanban view (currently filter chips, not columns)
- "Needs Call" lane using backend call summary (currently uses SR fields only for classification)
- Guided action sheet/wizard for intake processing
- Desktop layout refinement for lane chips
- Call history in desktop detail panel (only mobile detail has it)

Checks run:

- npx tsc --noEmit --pretty false (PASS)
- npx vite build --mode development (PASS, 17.17s)
- git diff --check (PASS)
- Visual QA: NOT RUN — confidence MEDIUM

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

## Phase 2C: Desktop Intake Parity

Status: DONE
Completed: 2026-06-27

Files changed:

- client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx

### Desktop changes

1. Lane filter chips: replaced STATUS_FILTERS with LANE_CONFIG in desktop toolbar. 9 lanes with counts, horizontal scroll, active chip highlighted.
2. KPI cards updated: "Total Requests" → "New Intake" (count), "Pending" → "Needs Reply" (count), "Quote Requests" → "Quote & Schedule" (quote sent + schedule needed counts). Cards are clickable to filter by lane.
3. Desktop detail panel: added intake lane badge, call summary, "Log Call" button, staff-action-needed banner, and call history (up to 4 recent attempts with outcome/mood badges, callback times, notes, staff names).
4. Desktop grid cards: converted/closed requests muted (bg-slate-50 opacity-75, muted name text). Converted cards show "JOB" badge.
5. Desktop table rows: converted/closed rows muted (opacity-60).

Checks run:

- npx tsc --noEmit --pretty false (PASS)
- npx vite build --mode development (PASS, 18.77s)
- git diff --check (PASS)
- Visual QA: NOT RUN — confidence MEDIUM

Remaining Phase 2 issues:

- Full lane board/kanban view (not implemented — filter chips only)
- "Needs Call" lane using backend call summary (client-side only uses SR fields)
- Guided action sheet/wizard for intake processing
- Visual QA needed for both desktop and mobile

## Phase 2D: Lane Accuracy + Visual QA

Status: DONE
Completed: 2026-06-27

Files changed:

- server/services/call-attempt.service.ts — added getIntakeSummaryBulk() for batch lane classification
- server/routes/service-requests.routes.ts — added GET /api/admin/service-requests/intake-summary
- client/src/lib/api/adminApi.ts — added intakeSummaryApi.getAll()
- client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx — wired backend intake summary for lane filtering, replaced classifyLane with getLane (backend-first, client fallback)

### Backend endpoint

GET /api/admin/service-requests/intake-summary
- Returns array of { serviceRequestId, lane, callSummary, needsStaffAction }
- Single query fetches all call attempts, aggregates per-SR in memory
- Reuses deriveIntakeLane() for consistent classification
- Requires admin auth + serviceRequests permission

### Frontend changes

- intakeSummaryApi query loaded alongside SR list (staleTime 10s, refetchOnMount always)
- getLane(sr) checks backend summary first, falls back to client-side classifyLane(sr)
- Lane counts use backend lane when available
- Call log mutation invalidates intake-summary query so lanes update after logging a call
- "Needs Call" lane now works for callback/no-answer cases (backend has call attempt data)

### Visual QA (2026-06-27)

Desktop 1440x900:
- KPI cards: New Intake 20, Needs Reply 6, Quote & Schedule — correct counts ✓
- Lane chips: All 32, New 20, Needs Reply 6, Quote Sent 1, Schedule 1, Job 4, Closed 1 ✓
- Table view: rows render, converted/closed muted ✓
- Detail panel: lane badge, Log Call, staff-action banner, customer/device/issue ✓
- No horizontal overflow ✓

Mobile 390x844:
- Lane chips scrollable: All 32, New 20, Reply 6, Quote 1, Sched 1 ✓
- Cards: muted for converted/closed, JOB badge ✓
- Detail sheet: lane badge, Log Call button, staff-action banner ✓
- Call log dialog: all fields visible, Save/Cancel ✓
- No horizontal overflow, no dock covering content ✓

Evidence: sr-desktop-full.png, sr-desktop-detail.png, sr-mobile-390.png, sr-mobile-call-dialog.png

### Hotfix: laneCounts dependency (2026-06-27)

laneCounts useMemo depended only on `[serviceRequests]` but `getLane()` reads `intakeLaneMap` which loads async. Counts stayed stale until next SR refetch. Fixed by adding `intakeLaneMap` to the dependency array: `[serviceRequests, intakeLaneMap]`.

### Phase 2 remaining issues (minor polish, not blocking)

- Full kanban board view (currently filter chips, not columns)
- Guided action sheet/wizard for intake processing
- Call history not shown in desktop detail if backend has 0 call attempts (correct behavior, no calls yet)

### Phase 2 completion assessment

Phase 2 (A through D) is functionally complete:
- Backend: call attempts table, CRUD endpoints, intake lane classifier, bulk intake summary, repair case contract with intake context
- Frontend: lane filter chips (mobile + desktop), lane counts from backend, call log dialog, call history in detail view, staff-action banner, muted converted/closed cards
- Visual QA: PASS at desktop 1440x900 and mobile 390x844

## Phase 3A: Service Request To Job Conversion Hardening

Status: DONE
Completed: 2026-06-27

Files changed:

- server/services/job.service.ts — improved error messages, added phone normalization
- server/services/repair-case.service.ts — added JOURNEY_LINK_BROKEN warning

### Audit findings

Conversion path (`POST /api/admin/service-requests/:id/verify-and-convert`) was already well-guarded:

1. Duplicate prevention: ✓ — `if (request.convertedJobId) throw` (was present)
2. Custody enforcement: ✓ — `JOB_CREATION_STAGES` requires "picked_up" or "device_received" (was present)
3. Fields copied: ✓ — customer name/phone/address, device brand/size/model, issue, quote amount, corporate links (was present)
4. `convertedJobId` always set: ✓ — updated in SR after job creation (was present)
5. `parentJobId` stores SR id: ✓ — `parentJobId: request.id` (was present, ambiguity documented in Phase 1)
6. Journey linked: ✓ — `syncJobConversionToJourney` links journey + creates "job_created" event (was present)
7. Audit logging: ✓ — both SR conversion and job creation audit events (was present)
8. Timeline event: ✓ — SR timeline records conversion with actor name (was present)

### Hardening applied

1. Error messages improved:
   - Duplicate: now shows linked job id: `"already converted to job JOB-2026-0123. Open the linked job instead."`
   - Stage check: now shows current stage and allowed stages: `"Cannot create job at stage 'intake'. Device custody must be confirmed first (stage must be 'picked_up' or 'device_received')."`

2. Phone normalization: job ticket now gets `customerPhoneNormalized` from `normalizePhone(request.phone)` during conversion. Previously only `customerPhone` was copied, missing the normalized form used for phone-based lookups.

3. Repair case warning: added `JOURNEY_LINK_BROKEN` code for cases where job exists but journey record has no valid id (sync may have failed during conversion).

### What was NOT changed

- Journey sync remains fire-and-forget (`.catch()` in route handler). Making it transactional would require wrapping the entire conversion in a DB transaction, which is a larger change. The `NO_JOURNEY` repair-case warning already catches this case.
- `parentJobId` field name not renamed (documented in Phase 1 — used for warranty/corporate too).
- No claim code for walk-in no-account customers (deferred to later phase).
- No printed slip generation (deferred — not blocking conversion flow).

Checks run:

- npx tsc --noEmit --pretty false (PASS)
- npx vite build --mode development (PASS, 17.79s)
- git diff --check (PASS)

### Hotfix: JOURNEY_LINK_BROKEN detection (2026-06-27)

Original check `job && journey && !journey.id` never fires — if journey is found it always has an id. Real failure mode: journey exists (found by service_request_id) but `job_ticket_id` is null or mismatched because `syncJobConversionToJourney` failed silently.

Fix: added `serviceRequestId` and `jobTicketId` to `JourneySummary`. New condition: if `sr.convertedJobId && job && journey && journey.jobTicketId !== job.id` then warn with both ids for diagnosis.

Remaining risks:

- Journey sync failure is silent. Staff must check repair case warnings if customer reports missing timeline.
- Walk-in direct job creation (no SR involved) has no structured intake tracking. Phase 4 should address this.

## Phase 3B: Conversion UI + Remaining Tasks

Status: NOT STARTED

Remaining tasks from original Phase 3:

- printed slip/claim code path for no-account customers
- walk-in direct job creation flow audit
- conversion UI improvements (show what will be copied, preview job before creating)

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

