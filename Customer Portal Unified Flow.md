# Customer Portal Unified Flow

Status: NOT STARTED
Owner: Codex direction, Claude implementation after review
Last updated: 2026-06-26

## Purpose

This document defines the unified customer repair flow for Promise Electronics.

The goal is to stop one repair from becoming three confusing staff workloads across Service Request, Customer Repair Journey, and Jobs. The database can stay separated, but the staff experience must become one clear repair case.

## Core Rule

One customer repair can have multiple linked records, but only one active operational owner at a time.

- Before Promise accepts the device or work: Service Request owns the flow.
- After Promise receives or accepts the device for repair: Job Ticket owns the flow.
- Customer Repair Journey never owns operational work. It is the customer-visible timeline.
- Pickup and delivery are Logistics work. They can connect to Service Request, Job Ticket, or offline/manual requests.

## Main Objects

### Service Request

Purpose: intake before repair work officially starts.

Use it for:

- online quote request
- online repair request
- customer consultation request
- call appointment request
- pickup request before device is collected
- service center visit request before device is received
- offline/call/Messenger request entered by staff
- quote sent, accepted, declined, expired
- rejected or abandoned intake

Service Request answers: should Promise accept this work?

### Job Ticket

Purpose: actual repair operation after device/work is accepted.

Use it for:

- device received at shop
- device picked up and handed to Promise
- walk-in job created directly
- technician assignment
- diagnosis
- parts
- repair
- QC
- final bill
- delivery completion
- warranty

Job Ticket answers: how is Promise repairing this device?

### Customer Repair Journey

Purpose: customer-facing timeline across intake, job, billing, delivery, and warranty.

Use it for:

- friendly customer status
- timeline events
- customer questions
- customer-visible notes
- quote ready
- schedule requested/confirmed
- device received
- inspection started
- repair progress
- bill ready
- ready for delivery
- delivered
- warranty active

Customer Repair Journey answers: what does the customer see and understand?

It must not become a separate daily staff workload tab.

### Logistics Task

Purpose: movement of a device.

Use it for:

- pickup
- delivery
- offline pickup
- offline delivery
- driver assignment
- route management
- failed contact
- reschedule
- proof photo/signature/note

Logistics Task answers: who moves the TV, where, when, and with what proof?

## Unified Repair Case

Staff should eventually open one Repair Case view from any tab.

The Repair Case view should contain:

- Intake
- Customer
- Call Follow-up
- Logistics
- Job
- Billing
- Messages
- Timeline

Service Request, Jobs, Logistics, and Customer Journey can remain separate tabs for queues, but opening any item should lead to the same unified case view.

## Customer Types

### Registered Customer

Flow:

1. Customer submits request or staff finds account by phone.
2. Service Request or Job links to customerId.
3. Customer Repair Journey is visible in customer portal.
4. Full details are visible to the customer.

### Walk-in Customer With No Account

Flow:

1. Staff searches phone.
2. If no account exists, staff offers account creation or QR signup.
3. If customer agrees, create/link account.
4. Create Job Ticket directly if TV is received.
5. Print job slip.

### Walk-in Customer Refuses Account

Flow:

1. Staff creates Job Ticket with customer name and phone.
2. customerId stays null.
3. System generates claim code.
4. Printed job slip includes ticket number, QR, and claim code.
5. Public tracking only shows safe basic status.
6. If customer later creates account, they can claim repair using phone plus claim code.

Phone-only tracking is not enough. Phone numbers are guessable. Claim code is required for full linking.

### Offline Pickup Customer

Flow:

1. Customer calls, sends Messenger/WhatsApp request, or is referred by another customer.
2. Staff creates manual Logistics Task.
3. Link to customer if known.
4. If no account, store name, phone, address, source, and claim code.
5. Driver completes pickup.
6. Staff receives device and creates/converts to Job Ticket.

Offline pickup does not require customer portal intake.

## Service Request Flow

Service Request should be redesigned as queue lanes, not a status dropdown.

Lanes:

1. New Intake
2. Needs Call
3. Needs Reply
4. Quote Sent
5. Schedule Needed
6. Waiting Customer
7. Ready to Receive
8. Converted to Job
9. Rejected / Closed

### New Intake

New customer request arrived from portal, call, Messenger, WhatsApp, or staff entry.

Primary actions:

- review
- mark call needed
- ask for more info
- send quote
- approve for pickup
- approve service center visit
- politely reject

### Needs Call

Staff must call customer before next decision.

Call outcomes must be structured:

- call scheduled
- accepted
- rejected
- asked for time
- no answer
- phone off
- wrong number
- hung up
- callback requested
- converted to pickup
- converted to service center visit
- converted to quote
- closed after no response

### Needs Reply

Customer needs a human answer, not only a status update.

Use it for:

- consultation
- repair possibility
- rough expectation
- photo/video clarification
- warranty question
- cost range question

### Quote Sent

Customer must accept, decline, or ask a question.

Rules:

- quote has expiry date
- customer can accept quote
- customer can decline quote
- customer can ask follow-up
- expired quote moves to Waiting Customer or Closed

### Schedule Needed

Customer has chosen pickup, service center visit, home visit, or delivery.

Action creates or confirms a Logistics Task.

### Waiting Customer

No Promise work can continue until customer responds.

Examples:

- no answer after call attempts
- quote pending
- schedule proposal pending
- customer said call later

### Ready to Receive

Promise is waiting to receive the TV by pickup or shop visit.

When device is received, create or link Job Ticket.

### Converted to Job

Service Request becomes source history.

No active operational work remains in Service Request.

### Rejected / Closed

Internal reason can be strict. Customer message must be polite.

Examples:

- unsupported product
- out of service area
- customer refused quote
- duplicate
- spam
- no response
- customer postponed

## Job Sync Rules

Job Ticket is the master after conversion.

No staff person should manually sync Service Request after job status changes.

Required automatic sync:

- Job Pending/Received -> Journey: device received
- Job Diagnosing -> Journey: inspection started
- Job Pending Parts -> Journey: waiting for parts
- Job In Progress -> Journey: repair in progress
- Job Ready -> Journey: repair completed / ready
- Job Ready + delivery requested -> create or prompt Logistics delivery task
- Job Completed -> Service Request completed, Journey completed
- Job Delivered -> Logistics delivered, Journey delivered
- Job Cancelled -> Service Request closed softly, Journey cancelled

Service Request should show linked job status but should not require duplicate management.

## Logistics Flow

Long-term tab name: Logistics.

Do not keep pickup and delivery as separate mental systems.

Task types:

- pickup
- delivery
- home visit
- service center visit reminder
- return to office

Task sources:

- Service Request
- Job Ticket
- offline manual request
- customer repair journey
- corporate job later

Logistics lanes:

1. Requested
2. Scheduled
3. Assigned
4. En Route
5. Arrived
6. Completed
7. Failed Contact
8. Customer Unavailable
9. Reschedule Needed
10. Cancelled
11. Returned to Office

Driver actions:

- call customer
- start route
- reached
- picked up
- delivered
- customer unavailable
- phone unreachable
- reschedule requested
- cancel/return
- add photo
- add signature
- add note

Customer wording must be soft:

- failed_contact -> We could not reach you today. Please choose another time.
- customer_unavailable -> Our team could not complete the handover. We are ready to reschedule.
- cancelled -> This schedule was cancelled. Contact us when you are ready.

## Call Follow-up Flow

Every important customer call must be logged as structured data, not only notes.

Call attempt fields:

- serviceRequestId
- staffId
- callType
- scheduledAt
- calledAt
- outcome
- nextAction
- callbackAt
- customerMood
- notes
- customerVisibleMessage

Call types:

- consultation
- quote
- schedule
- follow_up
- payment
- delivery

Call outcome rules:

- after one no answer: call back needed
- after two no answers: reminder/task
- after three no answers: Waiting Customer
- after seven days no response: soft close
- hung up/rejected requires reason
- accepted must move to quote, schedule, pickup, service center visit, or job flow

## Billing Flow

Before Job Ticket:

- estimate/quote belongs to Service Request.
- customer can accept/decline.
- quote is not final invoice.

After Job Ticket:

- real bill belongs to Job Ticket.
- final invoice should link to Job Ticket.
- service request quote can be copied into job as starting estimate.
- payment may reference Service Request before conversion, but final settlement must attach to Job Ticket if repair is accepted.

## Notification Rules

Every customer-facing state change should create:

- journey event
- in-app notification if customer linked
- push notification where device token exists
- admin notification/task when staff action is required

Required notifications:

- new service request
- customer question
- call back due
- quote accepted/rejected
- schedule requested
- schedule confirmed
- reschedule requested
- pickup/delivery failed
- job ready
- bill ready
- payment submitted
- warranty claim submitted

Corporate-specific notification cleanup is separate from this customer flow, but later Logistics should support corporate jobs.

## Map And Route Management

Map support should be added only after Logistics Task behavior is stable.

First version:

- address field
- optional latitude/longitude
- area/zone
- driver assignment
- route order
- suggested ordering
- manual override
- driver mobile route view

Suggested route can start simple:

1. group by zone
2. prioritize time windows
3. order by estimated distance
4. allow admin to reorder manually

Do not block core Logistics release on advanced route optimization.

## Customer-Friendly Status Rule

Internal statuses can be direct. Customer messages must be warm and human.

Examples:

- rejected -> We are sorry, we cannot support this request right now.
- no answer -> We tried to reach you and are ready to help when convenient.
- busy schedule -> We are fully booked for that time. Please choose another slot.
- customer unavailable -> We could not complete the visit today. We can reschedule.
- quote expired -> This quote has expired. We can review it again if you want to continue.

## Final Target

Staff should think:

- Service Request: should we take this work?
- Logistics: how does the TV move?
- Job: how do we repair it?
- Billing: how do we collect money?
- Journey: what does customer see?
- Repair Case: everything together.

