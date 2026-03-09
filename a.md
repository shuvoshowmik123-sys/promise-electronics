# Customer + Corporate Portal Workflow Issue Log

Date: 2026-02-27  
Scope: Customer portal + Corporate portal logical workflow/navigation audit

## 1) High - Quote Approval Redirects to Invalid Tracker Target
- Problem: Quote approval flow navigates to `/track?id=${token}` using quote token instead of a valid trackable job/order identifier.
- Impact: User can land on "Job Not Found" despite successful approval/payment.
- Locations:
  - `client/src/pages/quote-approval.tsx:63`
  - `client/src/pages/quote-approval.tsx:241`
  - `client/src/pages/track-job.tsx:77`

## 2) High - Home Page Links to Non-Existent Routes
- Problem: Home view generates links to routes that are not present in the customer router (`/native/repair/:id`, `/customer/orders/:id`).
- Impact: Dead links / broken navigation from dashboard activity cards and active-repair card.
- Locations:
  - `client/src/pages/home.tsx:101`
  - `client/src/pages/home.tsx:114`
  - `client/src/pages/home.tsx:599`
  - `client/src/components/layout/CustomerRouter.tsx:68`
  - `client/src/components/layout/CustomerRouter.tsx:88`
  - `client/src/components/layout/CustomerRouter.tsx:90`

## 3) High - Push + Back Navigation Uses `/native/*` Route Set Not Backed by Active Router
- Problem: Push notification navigation and Android back behavior target `/native/*` paths while current customer routes are `/home`, `/track-order`, `/track`, etc.
- Impact: Deep links/back navigation can redirect users to invalid screens.
- Locations:
  - `client/src/hooks/usePushNotifications.ts:54`
  - `client/src/hooks/usePushNotifications.ts:56`
  - `client/src/hooks/usePushNotifications.ts:58`
  - `client/src/hooks/useAndroidBack.ts:11`
  - `client/src/hooks/useAndroidBack.ts:137`

## 4) Medium - Tracking Query Parameters Are Inconsistent Across Flows
- Problem: Different entry points use different query formats for track page (`id`, `ticket`, while tracker reads `order` and `type`).
- Impact: Links open track page but fail to preselect the intended order/request detail.
- Locations:
  - `client/src/pages/home.tsx:152`
  - `client/src/pages/get-quote.tsx:677`
  - `client/src/pages/track-order.tsx:1288`
  - `client/src/pages/track-order.tsx:1289`

## 5) Medium - Corporate Notifications Page Double-Wrapped with Layout Shell
- Problem: Corporate router already wraps pages in `CorporateLayoutShell`, but notifications page wraps itself again.
- Impact: Potential duplicate shell/header/sidebar rendering and unstable layout behavior.
- Locations:
  - `client/src/components/layout/CorporateRouter.tsx:83`
  - `client/src/pages/corporate/notifications.tsx:166`

## 6) Medium - Dead Notification "View Details" Action in Corporate Notifications
- Problem: Link click is prevented and only logs to console; no real navigation occurs.
- Impact: User-facing dead button in notifications workflow.
- Locations:
  - `client/src/pages/corporate/notifications.tsx:323`
  - `client/src/pages/corporate/notifications.tsx:324`

## 7) Low-Medium - Placeholder/Dead CTAs in Corporate Shell and Login
- Problem: Several visible actions have no real navigation/handler.
- Impact: UX inconsistency and perceived broken controls.
- Locations:
  - `client/src/components/layout/CorporateLayoutShell.tsx:127` (Open Ticket button has no action)
  - `client/src/components/layout/CorporateLayoutShell.tsx:195` (Profile menu item non-functional)
  - `client/src/components/layout/CorporateLayoutShell.tsx:198` (Notifications menu item non-functional)
  - `client/src/pages/corporate/login.tsx:121` (Forgot link is placeholder `href="#"`)

## Build/Type Verification
- `npm run check` passed (TypeScript clean in this audit pass).
