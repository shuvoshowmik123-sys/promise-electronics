# Universal Service Flow Test Guide

## Purpose

Use this guide to test the unified customer service lifecycle:

`Service Request -> Pickup/Drop-off -> Custody OTP -> Job -> Bill/Payment -> Ready -> Delivery/Collection OTP -> Completed`

The system should guide staff with one primary next action. Manual correction actions should stay behind secondary controls.

## Staff Rule

Use the main wizard button first.

Use `More`, status dropdowns, or manual corrections only when fixing wrong data.

## Flow A: Pickup Customer

1. Open `Admin -> Service Requests`.
2. Open a pickup-type request.
3. The mobile sheet should show `Transfer Pickup` or `Open Pickup`.
4. Tap the wizard action.
5. Open `Pickup & Delivery`.
6. In `Collect`, unscheduled work should show `Schedule Pickup`.
7. Schedule date and driver/staff.
8. The same card should then show `Receive with Customer OTP`.
9. Send OTP to customer phone.
10. Enter the 6-digit OTP.
11. Pickup status becomes `PickedUp`; service request custody stage moves forward.
12. Go back to `Service Requests`.
13. The request should now allow `Create Job`.
14. Create the job.
15. Complete repair and billing from Jobs/POS.
16. When ready, open `Pickup & Delivery -> Return`.
17. If due amount exists, collect payment first.
18. For Cash COD, an active drawer is required.
19. Send delivery OTP.
20. Enter customer OTP.
21. Device releases and request completes.

## Flow B: Service Center Customer

1. Open `Admin -> Service Requests`.
2. Open a service-center request.
3. The wizard should show `Receive Device OTP` when custody is required.
4. Send OTP to customer.
5. Enter the 6-digit OTP.
6. The request should then allow `Create Job`.
7. Create the job.
8. Complete repair and bill/payment.
9. Final release should require customer OTP before completion.

## Flow C: Cash COD Safety

1. Close or do not open the cash drawer.
2. Open `Pickup & Delivery -> Return`.
3. Choose a delivery item with amount due.
4. Select Cash and try to collect.
5. Expected result: blocked with `Open drawer first before collecting cash COD`.
6. Open POS drawer.
7. Repeat collection.
8. Expected result: payment records and drawer expected cash increases.

## Flow D: OTP Bypass Safety

1. Try to mark a pickup directly as `PickedUp` without receive OTP.
2. Expected result: backend blocks it.
3. Try to mark a pickup directly as `Delivered` without delivery OTP.
4. Expected result: backend blocks it.
5. After OTP succeeds, status update should be allowed by the handover flow.

## Flow E: Driver Scope

1. Login as a driver.
2. Open `Pickup & Delivery`.
3. Expected result: driver sees only pickup/delivery cards assigned to their staff name.
4. Manager/Super Admin should see all cards.

## What Should Not Happen

- Corporate jobs should not leak into normal customer jobs.
- A job should not be created before custody is confirmed.
- Pickup status and service request stage should not disagree after OTP.
- Cash COD should not be accepted without an active drawer.
- Mobile should not show desktop dialogs for schedule/handover.
- Delete/manual correction should not be a primary action.
