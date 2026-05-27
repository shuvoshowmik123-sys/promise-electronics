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

## Phase 3.5 — Quiet Watch (admin-only silent fraud monitoring)

> **Design rules (non-negotiable):**
> - Zero employee-facing UI. Nothing tells staff they are being watched.
> - No automatic blocking, freezing, or notifications.
> - Admin-only screen, `super_admin` role gate, hidden module (not in nav by default).
> - All flags are review-only. Admin decides what to do offline/privately.

### What needs to be built

#### Backend — trigger rules (connect to existing `fraud_alerts` table)
- [ ] Staff replies customer on Messenger → customer never converts → repeated pattern (3+ times same staff) → flag
- [ ] Staff phone number regex detected in outgoing Messenger message → flag (`PERSONAL_CONTACT_SHARE`)
- [ ] Same customer routed to same staff member 3+ times with zero job creation → flag
- [ ] Job marked "completed" in under N minutes (configurable threshold) → flag (`FAST_COMPLETION`)
- [ ] Cash drawer close discrepancy above threshold (already partially tracked in `drawer_sessions.discrepancy`) → flag
- [ ] Refund rate for one staff member exceeds X% of their handled jobs in 30-day window → flag
- [ ] Staff edits customer phone number on existing job ticket → flag (`PHONE_EDIT`)
- [ ] Local part purchase price markup > Y% above average for same part → flag (`MARKUP_ANOMALY`)

#### Frontend — "Quiet Watch" screen
- [ ] Route: `/admin/quiet-watch` — not in main nav, accessible via direct URL or hidden link in Settings
- [ ] Role gate: `super_admin` only
- [ ] Module: `quiet_watch` system module, `enabledAdmin: false` by default (opt-in)
- [ ] Display: list of `fraud_alerts` with alertType, severity, entityType, entityId, description, ruleTriggered, createdAt
- [ ] Status actions: mark as `investigating`, `resolved`, `false_positive` (admin-only, no staff notification)
- [ ] Filter by: severity, alertType, date range, staff member
- [ ] No "share" or "notify staff" button anywhere on this screen

### Already built (foundation)
- [x] `fraud_alerts` table — all columns exist (alertType, severity, entityType, entityId, description, ruleTriggered, status, metadata jsonb)
- [x] `drawer_sessions.discrepancy` — cash variance already tracked
- [x] `job_tickets.assistedByIds` — who touched each job
- [x] Brain claim system — who handled each Messenger session
- [x] Commission engine — ChatHandler attribution exists

### Remaining audit items (after build)
- [ ] **Audit**: Threshold values (fast_job minutes, refund %, markup %) are hardcoded — needs admin-configurable settings
- [ ] **Audit**: Phone regex for BD numbers only — international numbers not caught
- [ ] **Audit**: No "export to PDF" on Quiet Watch — if admin wants offline record, must screenshot

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

---

## Phase 10 — Groq model audit + audio/vision hardening (2026-05-27)

### Model selection — final config

```
groq.chat   = llama-3.3-70b-versatile     # Best Bangla/Banglish fluency, 4/4 lang match
groq.fast   = llama-3.1-8b-instant        # Sub-500ms for simple turns
groq.vision = meta-llama/llama-4-scout-17b-16e-instruct  # Only working Groq vision model
groq.audio  = whisper-large-v3            # Bengali auto-detected, 1,666ms for 13.5s clip
gemini.vision = gemini-2.5-flash          # Fallback for high-quality image analysis
```

### Models tested + rejected
- `llama-3.2-90b-vision-preview` — HTTP 400, decommissioned
- `llama-3.2-11b-vision-preview` — HTTP 400, decommissioned
- `qwen/qwen3-32b` — reasoning model, outputs `<think>` tags, replies English even on Bangla input
- `openai/gpt-oss-120b`, `openai/gpt-oss-20b` — access errors on current key tier
- `groq/compound`, `groq/compound-mini` — not available on current plan

### Audio transcription fix
- **Bug**: `groq.audio.transcriptions.create({ file: fs.createReadStream(...) })` → "Connection error"
- **Root cause**: Groq SDK can't handle Node ReadStream in this environment
- **Fix**: Direct `fetch` to `https://api.groq.com/openai/v1/audio/transcriptions` with `FormData` + `Blob`
- **Verified**: 422KB .wav, 13.5s, Bengali (`bn`), transcribed in 1,666ms
- **Code**: `server/services/ai.service.ts` → `transcribeAudio()` — no temp file, mime inferred from extension

### Vision model fix
- **Removed**: `visionFast` and `visionFallback` references to decommissioned models
- **MODELS.groq.vision** → `meta-llama/llama-4-scout-17b-16e-instruct`
- [x] Tested live with Eid poster + Play Console + CHALLAN + Bangla calligraphy images
- [x] All 4 images described correctly in English

### Bangla/Banglish language matching (llama-3.3-70b-versatile)
- Bangla script input → Bangla reply: ✅
- Banglish input → Banglish reply: ✅
- English input → English reply: ✅
- Technical Banglish → Banglish reply: ✅
- Score: 4/4 across test prompts

### Remaining audit items
- [ ] **Audit**: Groq audio `language: "bn"` hardcoded — if customer sends voice in English, transcription still works (Whisper handles multilingual) but hint is always Bengali
- [ ] **Audit**: Vision fallback is Groq only — if Groq vision errors (rate limit), no automatic Gemini fallback for chat-triggered image analysis. Manual escalation path only.
- [ ] **Audit**: No audio length limit on upload — large recordings (>25MB) will fail at Groq API level with no user-facing message
- [ ] **Audit**: Messenger webhook still uses `session.history` JSONB — audio messages from Messenger not wired to `transcribeAudio` yet

---

## Phase 12 — WhatsApp Cloud API + Unified CRM Inbox (2026-05-27)

### WhatsApp Cloud API integration
- [x] Built: `server/routes/whatsapp.routes.ts` — webhook at `/api/whatsapp/webhook`
- [x] Built: Handles text, image, audio messages via same Brain AI (observe/shadow/autopilot)
- [x] Built: Session key prefixed `wa_<phone>` to avoid collision with Messenger PSIDs
- [x] Built: `sendWhatsApp()` helper using Meta Cloud API v19
- [x] Built: Media download via Cloud API (Bearer token + 2-step fetch)
- [x] Verified: Meta webhook verification successful with `WHATSAPP_VERIFY_TOKEN=PROMISE_WA_2026`
- [x] Verified: WhatsApp Business number registered, Phone Number ID `1227589117093768`
- [ ] **Audit**: Business verification still in progress on Meta side — production messaging limited until verified

### New Facebook page setup (Promise Electronics 2026 — Page ID `1088626434331160`)
- [x] Built: Domain ownership verified via `<meta name="facebook-domain-verification">` in client/index.html
- [x] Built: New Meta Developer app created with Messenger use case
- [x] Built: Webhook subscribed (messages, messaging_postbacks, message_echoes)
- [x] Built: `MESSENGER_VERIFY_TOKEN` env var lookup with fallback `PROMISE_MSGR_2026`
- [x] Verified: Webhook callback live + verified at `https://promiseelectronics.com/api/messenger/webhook`
- [ ] **Audit**: Multi-page support NOT built — currently single `MESSENGER_PAGE_ACCESS_TOKEN` env var means only one Messenger page can send replies. Old page tokens need management.
- [ ] **Audit**: New page customer migration plan (pin posts, auto-reply on old page) — not yet executed

### Unified CRM Inbox (`client/src/components/admin/CrmInboxPanel.tsx`)
- [x] Built: Two-column layout (session list | chat panel | reply box)
- [x] Built: Channel auto-detection from senderPsid prefix (WA/Msgr badges)
- [x] Built: Search by name/phone
- [x] Built: Custom reply textbox per session (Enter=send, Shift+Enter=newline)
- [x] Built: Auto-claim session when staff sends first reply
- [x] Built: 8s inbox poll, 5s active conversation poll
- [x] Built: Embedded into BrainTab above Knowledge Graph panel
- [x] Backend endpoints: GET /api/brain/inbox, GET /api/brain/sessions/:psid/messages, POST /api/brain/sessions/:psid/send
- [ ] **Audit**: No file/image attachments yet (can only send text)
- [ ] **Audit**: No "create job from chat" button (Phase 6 gap)
- [ ] **Audit**: No conversation archive/close feature
- [ ] **Audit**: No unread message counter on Brain tab nav
- [ ] **Audit**: Mobile layout collapses to one column — chat hidden until selected (not ideal UX)

---

## Phase 11 — UI Cursor Fix + DashboardTab Crash Fix (2026-05-27)

### Text I-beam cursor on all interactive elements
- **Bug**: Clicking buttons, tabs, nav items showed text I-beam cursor (`cursor: text`) instead of pointer — Tailwind v4 preflight does not set `cursor: pointer` on buttons by default
- **Root cause**: Radix UI TabsTrigger uses `role="tab"` not `role="button"` — not covered by default browser styles
- **Fix 1**: `client/src/index.css` — added global rules in `@layer base`:
  ```css
  body { cursor: default; }
  button, [role="button"], [role="tab"], [role="menuitem"], [role="option"],
  [role="checkbox"], [role="radio"], a, label[for], select, summary,
  [type="button"], [type="submit"], [type="reset"] {
      cursor: pointer;
      user-select: none;
  }
  input, textarea, [contenteditable="true"] { cursor: text; }
  ```
- **Fix 2**: `client/src/components/ui/tabs.tsx` — added `cursor-pointer select-none` to `TabsTrigger` className
- [x] Local fix applied. Pending localhost:5083 verification before deploy.
- [ ] **Audit**: Other Radix primitives (DropdownMenu, Select, ContextMenu, Popover triggers) may need same treatment if cursor regresses on specific components

### DashboardTab crash — `Cannot read properties of undefined (reading 'toLocaleString')`
- **Bug**: Admin Dashboard crashed on load — `data.totalRevenue` and other stats fields were `undefined` while async fetch was in-flight
- **Root cause**: Component rendered before API response, accessed `.toLocaleString()` directly on `undefined`
- **Fix**: `client/src/pages/admin/bento/tabs/DashboardTab.tsx` — all `data.*` numeric accesses guarded with `?? 0`, all array accesses guarded with `?? []`
  - Lines guarded: 76, 81, 86, 147, 148, 207, 209, 251, 284, 292, 301, 307, 327, 328, 363, 378, 380, 393, 408, 423, 425 + popup list arrays
- [x] Local fix applied. Pending localhost:5083 verification before deploy.
- [ ] **Audit**: No loading skeleton on Dashboard — blank/empty stats shown during fetch. Should show skeleton cards instead of zeros.

---

## Phase N — Kilo Session Fixes (2026-05-27)

### Vercel API routing — all `/api/*` routes returning 404 in production
- **Bug**: Frontend served from `promiseelectronics.com`, but all API calls (`/api/modules`, `/api/admin/me`, `/api/admin/login`) returned 404 "The page could not be found"
- **Root cause**: `vercel.json` had no rewrite rule to route `/api/*` requests to the serverless function at `api/index.ts`. All API requests fell through to Vite's static file handler.
- **Fix**: `vercel.json` — added `"source": "/api/(.*)", "destination": "/api/index"` rewrite before the SPA fallback rule. Redeploy required.
- [x] Applied. Pending deploy verification.
- [ ] **Audit**: `api/index.ts` calls Express app directly (`app(req, res)`) without `serverless-http` wrapper — may cause issues with Vercel's serverless lifecycle (cold starts, connection handling)

### Admin panel text-selection cursor on interactive elements
- **Bug**: Sidebar nav items, switches, cards, and other interactive `<div>` elements in the admin panel showed text-selection I-beam cursor on hover/click instead of pointer cursor. Text was selectable on elements that should behave as application UI.
- **Root cause**: Base CSS `user-select: none` only targets `button`, `[role="button"]`, `[role="tab"]`, etc. — sidebar nav items are plain `<div>` elements with `cursor-pointer` but without `select-none`.
- **Fix**: `client/src/pages/admin/design-concept.tsx` — added `select-none` to the root admin wrapper `<div>` (line 386). This cascades to all child divs while inputs/textarea retain native text selection.
- [x] Applied. Verified on localhost:5083.
- [ ] **Audit**: Legacy `AdminLayout.tsx` (shadcn sidebar) may need same `select-none` treatment if text-selection cursor appears on old admin routes (`/admin/pos`, `/admin/inventory`, etc.)

