# Human-Ready Audit

Track all implemented features that need UI/UX polish before going live.
Each entry: what was built, what's missing for a real human to use it comfortably.

---

## Phase 1 — Workbench & Lean Mode

### Workbench page (`client/src/pages/admin/workbench.tsx`)
- [x] Built: Lean Mode / Full Power buttons, collapsible module categories, per-module toggles
- [ ] **Audit**: No loading skeleton when modules fetch — blank flash on load
- [ ] **Audit**: "Lean Mode" / "Full Power" buttons have no visual feedback after apply (toast exists but button doesn't animate)
- [ ] **Audit**: Category collapse state resets on page refresh (not persisted)

---

## Phase 2 — Ticket Types, Panel Batch, Commission, Abandonment

### Create Job Drawer — Ticket Type selector
- [x] Built: Ticket type tabs (Full Device / Panel Batch / Motherboard Only / Parts Only)
- [ ] **Audit**: Ticket type selector looks like plain radio buttons — not obviously tappable on mobile
- [ ] **Audit**: No visual distinction between ticket types (all same color/icon)

### Create Job Drawer — Panel Batch table
- [x] Built: Dynamic row table, live piece-count summary, batch submit button
- [ ] **Audit**: Table is desktop-optimized (6 columns) — on a small Android screen it overflows horizontally with no scroll indicator
- [ ] **Audit**: "Add Panel Row" button is text-only, no + icon
- [ ] **Audit**: Row remove button (×) is small — below 44px touch target on mobile
- [ ] **Audit**: Model field auto-parse (e.g. "V500HJ1-CE6" → 50″) not visible to user — no hint text

### Technician Picker — skill filter
- [x] Built: Skill-matched techs shown first, mismatched at 40% opacity with tooltip
- [ ] **Audit**: 40% opacity mismatch styling unclear to non-technical staff — no label like "Wrong skill"
- [ ] **Audit**: Tooltip only works on hover — invisible on touch devices

### Print components (`JobReceipt`, `JobTicketPrint`)
- [x] Built: Components exist with QR codes, thermal format
- [ ] **Audit**: No print buttons wired anywhere in the UI — completely inaccessible to users
- [ ] **Audit**: QR code depends on external API (api.qrserver.com) — fails offline

### Commission engine (backend only)
- [x] Built: Rules, assignments, payouts tables + service
- [ ] **Audit**: Zero UI — no way for admin to view/manage commission rules or see payout summaries

### Abandonment scheduler (backend only)
- [x] Built: Hourly check, auto-Abandoned at 90d, auto-Forfeited at 14d after
- [ ] **Audit**: Zero UI — no way to see which jobs were auto-abandoned or override the scheduler
- [ ] **Audit**: SMS phone number in abandonment message is hardcoded placeholder `01XXXXXXXXX`

### Due utilities (`shared/due-utils.ts`)
- [x] Built: Aging buckets, payment status types, due summary builder
- [ ] **Audit**: Zero UI — no dues/aging report page exists

---

## Phase 3 — Internal Team Chat + Reminders

### Team Chat (`TeamChatPanel.tsx`)
- [x] Built: Floating FAB (bottom-right), slide-over panel, channel list, message bubbles, send on Enter
- [x] Built: Auto-selects General channel, polls for new messages every 5s
- [x] Built: Color-coded avatar initials by role
- [ ] **Audit**: Chat panel is desktop width (w-80) — no responsive adaptation for mobile
- [ ] **Audit**: No unread message badge on FAB — user won't know there are new messages
- [ ] **Audit**: 5s polling is wasteful — should use SSE or WebSocket for real-time
- [ ] **Audit**: No scroll preservation — jumps to bottom on every poll even if user scrolled up
- [ ] **Audit**: No image/file attachment UI despite `attachment_url` field existing
- [ ] **Audit**: Channel creation form not exposed in UI (admin-only API exists but no UI button)
- [ ] **Audit**: Message delete (long-press / swipe) not implemented in UI

### Reminders (`ReminderBell.tsx`)
- [x] Built: Bell icon in header, red badge with count, popover with pending + recently-sent list
- [x] Built: Quick-create form (title + datetime) inline in popover
- [x] Built: Dismiss button (check mark), sent reminders shown struck-through
- [ ] **Audit**: Quick-create has no body/notes field
- [ ] **Audit**: No repeat/recurrence option in the quick-create UI
- [ ] **Audit**: No way to set a reminder for a specific job (jobId field unused in UI)
- [ ] **Audit**: No way to set reminders for other staff (manager→tech) from UI
- [ ] **Audit**: datetime-local input is browser-native — inconsistent look across Android/desktop

### Reminder Scheduler (`reminder.service.ts`)
- [x] Built: Minute-by-minute check, FCM push to user's device tokens, marks sent, schedules repeat
- [ ] **Audit**: No in-app notification fallback if FCM fails — silent failure

---

## Phase 4 — Android-First UI

### Mobile Bottom Nav (design-concept.tsx)
- [x] Built: Updated nav items to TV-repair-shop priorities: Jobs, POS, Stock, Finance, More
- [x] Built: "More" opens full sidebar sheet with all modules
- [ ] **Audit**: Nav labels are tiny (10px) — hard to read on Android
- [ ] **Audit**: No active tab highlight on the "More" button when a menu-opened tab is active
- [ ] **Audit**: Bottom nav sits at h-20 but has no haptic feedback on tap (native feel missing)
- [ ] **Audit**: Dashboard removed from quick nav — if staff checks stats often, reconsider

### QR Scan Button (QRScanButton.tsx)
- [x] Built: Floating scan button in mobile tools bar (top-right)
- [x] Built: BarcodeDetector API (Chrome/Android native), falls back to camera file input
- [x] Built: Extracts job UUID from QR URL pattern, navigates to jobs tab with search
- [ ] **Audit**: If BarcodeDetector not available AND user denies camera, silent failure
- [ ] **Audit**: Scan result navigates via search query — user must tap the job in the list (not direct open)
- [ ] **Audit**: No torch/flashlight button in scan overlay (needed in low-light workshops)

### Pull-to-Refresh (usePullToRefresh.ts hook)
- [x] Built: Touch-event based, 70px threshold, fires `admin:pull-refresh` custom event
- [x] Built: Visual indicator (spinning dot) appears during pull
- [ ] **Audit**: Tab components don't yet listen to `admin:pull-refresh` event — needs wiring per-tab
- [ ] **Audit**: Indicator is minimal (small dot) — not clearly a "pull to refresh" affordance
- [ ] **Audit**: No haptic feedback (window.navigator.vibrate) on trigger

### Voice Notes
- [ ] **Audit**: NOT IMPLEMENTED — needs MediaRecorder API + ImageKit upload + `voice_note_url` DB column
- [ ] **Audit**: Most impactful for technicians dictating repair notes hands-free

---

## Phase 5 — Google Drive Backup + promiseelectronics.com

*(to be filled)*

---

## Phase 6 — Brain Commission Integration

*(to be filled)*
