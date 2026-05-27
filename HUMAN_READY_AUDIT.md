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

### Backup Scheduler (`backup-scheduler.service.ts`)
- [x] Built: Daily automated backup at 02:00 server time, checks every 10 min
- [x] Built: Requires `BACKUP_ENCRYPTION_PASSWORD` env var (min 16 chars) — silent skip if missing
- [x] Built: FCM push to all admins on backup failure
- [x] Built: Phase 2 + Phase 3 tables added to backup snapshot
- [x] Built: `.env.example` updated with all required Google Drive + backup env vars
- [ ] **Audit**: No UI to see backup history or trigger manual backup from admin panel (BackupDialog exists but route not in nav)
- [ ] **Audit**: No Render env var setup docs — user must manually add 5 env vars
- [ ] **Audit**: `lastBackupDate` is in-memory only — server restart before 2 AM + after backup = double backup risk (low probability)

### promiseelectronics.com — Public Site
- [x] Built: All customer pages exist (Home, Shop, Services, Repair, Track, Profile, etc.)
- [x] Fixed: `/track/:id` route added — QR codes from job receipts now deep-link correctly
- [x] Fixed: `TrackJobPage` reads path param first (`/track/uuid`), falls back to `?id=` query param
- [ ] **Audit**: Home page uses `mock-data.ts` images — needs real Promise Electronics photos
- [ ] **Audit**: No `promiseelectronics.com` domain configured in Render custom domain settings
- [ ] **Audit**: `/about` page content is generic placeholder — needs real shop address/hours/contact
- [ ] **Audit**: SMS abandonment message has hardcoded `01XXXXXXXXX` phone number

---

## Phase 6 — Brain Commission Integration

### Brain Session Claim System
- [x] Built: `claimed_by_user_id`, `claimed_by_name`, `claimed_at`, `needs_claim` columns added to brain sessions (startup migration)
- [x] Built: `markNeedsClaim()` called on every human echo from Messenger
- [x] Built: `POST /api/brain/sessions/:psid/claim` — staff self-assigns to a session
- [x] Built: `GET /api/brain/sessions/by-phone/:phone` — phone-based session lookup
- [x] Built: `GET /api/brain/unclaimed` — lists sessions with human replies but no claim
- [ ] **Audit**: Claim is self-service ("I handled this") — no way to assign another staff member
- [ ] **Audit**: If multiple staff replied to same customer, only last claim counts

### Brain Tab — Unclaimed Sessions Banner
- [x] Built: Amber banner appears in Brain tab when unclaimed sessions exist
- [x] Built: "I handled this" button claims the session as the logged-in user
- [ ] **Audit**: Banner is in Brain tab only — staff who never open Brain tab will miss it
- [ ] **Audit**: No notification/push when a new unclaimed session appears
- [ ] **Audit**: Sessions list shows senderPsid (UUID) when senderName is null — unreadable

### CreateJobDrawer — Messenger ChatHandler Auto-Suggest
- [x] Built: On phone input (10+ digits), queries brain session by phone match
- [x] Built: Shows blue banner "handled by [name] on Messenger — add as ChatHandler?"
- [x] Built: "Add" button includes the ChatHandler in `assistedByIds` for commission
- [x] Built: If session found but unclaimed, shows "go to Brain tab to claim" guidance
- [ ] **Audit**: Phone match is last-10-digits — may get false positives for shared/business phones
- [ ] **Audit**: Commission assignment isn't created until job submits — no immediate feedback
- [ ] **Audit**: ChatHandler name shown from `claimedByName` but may differ from user's display name in users table

---

## Phase 7 — Deployment Split (Vercel frontend + Render backend)

### Vercel proxy + CORS config
- [x] Built: `vercel.json` proxies `/api/*` to `promiseelectronics.com` (Render backend)
- [x] Built: SPA fallback routing for non-API paths
- [x] Built: `server/app.ts` CORS allows `*.vercel.app` and `EXTRA_ALLOWED_ORIGINS` env var
- [x] Built: `server/static.ts` non-fatal when `dist/public` missing (backend-only Render deploy)
- [x] Built: `client/src/lib/config.ts` `PROD_API_URL` reads `VITE_API_URL` env var (for Capacitor native app)
- [x] Built: `package.json` `build:frontend` script (vite-only build for Vercel)
- [ ] **Audit**: Vercel proxy destination is hardcoded to `promiseelectronics.com` — if Render URL changes, must edit `vercel.json` (no env var support in rewrite destinations)
- [ ] **Audit**: Session cookie behavior across Vercel proxy not load-tested with real users — possible auth edge cases if cookie `domain` is set by infra
- [ ] **Audit**: No deployment guide / README for the split — `.env.render` and `.env.vercel` exist but no step-by-step doc

### Env file restructure
- [x] Built: `.env.render` template (9 vars, copy-paste into Render dashboard)
- [x] Built: `.env.vercel` template (3-9 vars depending on Firebase usage)
- [x] Built: Both gitignored
- [ ] **Audit**: User must manually replace `REPLACE_WITH_*` placeholders — no validation script to confirm all are filled

---

## Phase 8 — AI Stack Hardening (Gemini key audit + model selection)

### Gemini API capability discovery
- [x] Built: Live test scripts (`scripts/test-gemini.ts`, `test-all-models.ts`, `quota-discovery.ts`, `load-test-gemini.ts`) — all gitignored
- [x] Confirmed: User key has access to 7 working models; 9+ blocked by region (BD free tier `limit: 0`)
- [x] Confirmed: `gemini-3.5-flash` (latest), `gemini-3.1-flash-lite` (fastest, 906ms), `gemini-2.5-flash-lite` all live
- [x] Confirmed: RPM limits per model — 3.5-flash=5, 3.1-flash-lite=15, 2.5-flash-lite=10
- [ ] **Audit**: `ai.service.ts` `MODELS.gemini.vision` still set to `gemini-2.5-flash` (older, 5 RPM, 500/day). Latest = `gemini-3.5-flash`; fastest = `gemini-3.1-flash-lite`. Not yet swapped in code.
- [ ] **Audit**: No retry-on-quota logic in AI service — if Gemini key hits daily limit, customer gets a 500 instead of fallback to Groq
- [ ] **Audit**: `GROQ_API_KEY` currently expired/invalid (401 on smoke test) — user must refresh from console.groq.com

---

## Phase 9 — Knowledge Graph (KG-RAG memory replacement)

### Brain DB — KG schema + migration
- [x] Built: `kg_facts` table (subject, predicate, value, tags[], confidence, source, expires_at)
- [x] Built: `brain_messages` table (per-session full history, never compressed)
- [x] Built: GIN index on `kg_facts.tags` for ~10ms array-overlap retrieval
- [x] Built: `migrateKGTables()` in `brain.service.ts` — uses raw neon client (Drizzle 0.39 + neon-http 1.0+ DDL incompat)
- [x] Built: Migration runs on server startup
- [ ] **Audit**: pgvector v0.8.0 installed but not yet used — KG uses tag-matching only. Semantic search upgrade path documented but not built.
- [ ] **Audit**: No "auto-expire stale facts" job — admin must manually set `expires_at`

### KG service — entity extraction + retrieval
- [x] Built: `extractEntities()` — deterministic regex for TV brands, issue keywords (Bangla + English), screen sizes, model codes
- [x] Built: `getRelevantFacts(tags, 5)` — tag overlap query, confidence-sorted
- [x] Built: `formatFactsForPrompt()` — token-efficient prompt block (~50-200 tok)
- [x] Built: `logBrainMessage()` + `getRecentMessages()` — per-session isolation
- [x] Built: `addFact()`, `listFacts()`, `deleteFact()`, `countFacts()`, `bulkImportFacts()` (CSV)
- [ ] **Audit**: Entity extractor is regex-only — won't catch typos ("samsng" instead of "samsung") or fuzzy matches. Upgrade path: pgvector embeddings.
- [ ] **Audit**: Bengali keyword list is small (~12 issue types) — needs admin-driven expansion as real customer messages come in
- [ ] **Audit**: No fact-conflict detection — if admin adds two contradictory facts about same subject, both get injected

### AI service — KG injection
- [x] Built: `chatWithDaktarVai` extracts entities → fetches facts → prepends `KNOWN FACTS` block to system prompt
- [x] Built: History capped at last 6 turns (KG covers long-term memory)
- [x] Built: Verified live: `[AI] KG injected 1 facts for tags: [samsung]`
- [ ] **Audit**: KG block injected even when facts not relevant to current turn — wastes tokens on small-talk turns. No "is this turn worth KG lookup?" gate.
- [ ] **Audit**: Messenger webhook (`messenger.routes.ts`) still uses old `session.history` JSONB blob — not migrated to `brain_messages` yet. Both work in parallel currently.

### KG admin UI (Brain tab → top section)
- [x] Built: `KGPanel.tsx` component — add fact form, facts list, search, paginate, delete
- [x] Built: CSV bulk import textarea
- [x] Built: Test-extract debugger (admin types message, sees tags + matched facts)
- [x] Built: Total facts counter, auto-refreshes every 30s
- [x] Built: Embedded into BrainTab above stats cards
- [ ] **Audit**: Predicate field is free-text — no dropdown/autocomplete, admin can typo (e.g. "STATU" vs "STATUS")
- [ ] **Audit**: No fact edit — to fix a typo, admin must delete + re-add
- [ ] **Audit**: Tags display is truncated at 8 — long tag lists hidden, no expand
- [ ] **Audit**: No "view recent admin activity" log — can't audit who added which fact
- [ ] **Audit**: CSV import gives total count but no per-line preview — bad rows reported in toast only
- [ ] **Audit**: Confidence slider missing — UI hardcodes 1.0, can't surface low-confidence inferred facts
- [ ] **Audit**: No "expires at" date input — admin can't set fact decay timeline from UI
