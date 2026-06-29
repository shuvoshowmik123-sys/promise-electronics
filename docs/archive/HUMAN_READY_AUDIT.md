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


---

## Phase O — Finance Tab Audit (2026-05-30)

Tab-by-tab audit. Finance tab (5 sub-tabs: Sales, Petty Cash, Dues, Refunds, Cash Drawer).

### Refunds sub-tab — completely non-functional
- **Bug**: Could not process or reject any refund.
  - Called `refundsApi.processRefund(id)` / `rejectRefund(id, reason)` — methods don't exist (real names: `process` / `reject`). → runtime `TypeError`.
  - Read field `r.amount` everywhere; schema field is `refundAmount`. → all refunds rendered ৳0 / NaN.
  - No Approve step in UI; backend flow is `pending → approved → processed`. Even with names fixed, Process on a pending refund → 400.
  - Sent no `processedBy/Name/Role`, `refundMethod`, or `rejectionReason` payload → 403.
- **Fix**: `client/src/pages/admin/bento/tabs/FinancesTabRefunds.tsx`
  - Added `useAdminAuth` → real staff `id/name/role` sent on every action.
  - Added `handleApproveRefund` (Approve button on pending rows).
  - Process button now appears on `approved` rows, opens dialog with **Refund Method** selector (cash/bank/bKash/Nagad), calls `refundsApi.process(id, {...})`.
  - Reject calls `refundsApi.reject(id, {...})` with reason + role.
  - All `r.amount` → `r.refundAmount` (table, dialogs, export).
  - Added `approved` to status filter; Pending card now shows `Pending / Approved`.
  - `invalidateFinanceCaches()` refreshes petty-cash + drawer caches after process (Cash-in-Hand was going stale).
- [x] Local fix applied. Typecheck clean. Pending localhost:5083 verification before deploy.

### "Record New Due" button — 404
- **Bug**: `FinancesTabDues.tsx` → `dueRecordsApi.create` → `POST /api/due-records`. Route did not exist (only GET/GET-summary/PATCH). Repo `createDueRecord` was unrouted.
- **Fix**: `server/routes/finance.routes.ts` — added `POST /api/due-records` (admin auth + finance permission), validates required fields, coerces `dueDate` to Date.
- [x] Local fix applied. Pending localhost:5083 verification before deploy.

### Verified working (no change)
- Sales sub-tab: table + payment-method summary cards + invoice print — correct.
- Petty Cash sub-tab: paginated CRUD + today summary — correct.
- Dues sub-tab: settle payment (PATCH) via `financeService.recordDuePayment` — correct.
- Cash Drawer sub-tab: reconcile/discrepancy workflow — correct.
- Parent KPI `totalRefunded` already used correct `refundAmount` + `processed` filter.

- [ ] **Audit follow-up**: Petty cash POST does not record `createdBy` (no staff attribution) — same class of gap as the old Jobs `purchasedBy='System'` bug. Low priority.

---

## Phase P — Database Future-Proofing Audit (2026-05-31)

Schema: 86 tables, 2538 lines, 116 indexes, 125 FK-style ID columns but only 30
enforced FKs + 7 onDelete rules, 22 jsonb columns. Cross-referenced 161 repo
query-column usages against existing indexes.

### Missing performance indexes — migration 0008
Columns filtered/sorted in code with no index (seq-scan slow at scale). Added in
`migrations/0008_perf_indexes.sql` (IF NOT EXISTS, reversible, no data change):
- notifications.user_id (fastest-growing table)
- drawer_sessions.status / opened_at / closed_at
- customer_addresses.customer_id
- order_items.order_id, product_variants.product_id, service_request_events.service_request_id (unindexed child FKs)
- inventory_items.item_type, job_tickets.corporate_job_number
- (pos_transactions.invoice_number + policies.slug already unique-indexed — skipped)
- [ ] Apply with `npm run db:push` when DB reachable.

### Pool resilience
- `server/db.ts` connectionTimeoutMillis 5000 → 10000 (Neon free cold-wake > 5s; caused a localhost crash).
- [ ] STILL OPEN: no global `unhandledRejection`/`uncaughtException` handler → a single DB
  timeout crashes the whole server (happened twice on localhost tonight). Needs a crash
  guard before Render 24/7 is safe. NOT yet fixed.

### Load testing
- Added `scripts/loadtest.mjs` (autocannon, read-only endpoints) + `scripts/LOADTEST.md`.
- Must target a throwaway Neon branch, never prod. Guide covers branch create/run/compare/cleanup.
- [ ] Needs `npm i -D autocannon` to run.

### Integrity / manageability findings (not yet fixed)
- ~95 of 125 ID columns have NO foreign-key constraint → orphan-row risk; app code is the only guard.
- Only 7 onDelete rules → deletes mostly unprotected/uncascaded.
- Duplicate migration prefixes (two 0001_*, two 0002_*) → fresh-rebuild ordering ambiguity.
- 22 jsonb blobs (job charges etc.) → not queryable for real financial reporting.
- Tribal knowledge (neon-http DDL bug, api/index.ts cold-start migrations) undocumented → needs DATABASE.md.

### Phase P — UPDATE (2026-05-31, applied)
- [x] Migration 0008 indexes APPLIED to live DB via raw `db.execute` (same pattern as api/index.ts). All 10 verified present in pg_indexes. Fixed a `;`-in-comment bug in the .sql that had broken naive splitting.
- [x] Crash guard APPLIED: `server/index.ts` now has global `unhandledRejection` + `uncaughtException` handlers (log + keep serving). Startup failures still exit 1 via IIFE catch. tsc clean; server verified up, health 200, DB read 200.
- [x] `server/db.ts` pool connectionTimeoutMillis 5s→10s applied.

---

## Phase Q — Dashboard Tab Audit (2026-06-01)

### Corporate Revenue always ৳0 — FIXED
`analytics.repository.ts` queried `pos_transactions WHERE paymentMethod='Corporate'` — that value is never written. Corporate billing lives in `corporate_bills`. Fixed to `SUM(corporate_bills.grand_total) WHERE created_at >= thisMonthStart`. Now shows real corporate invoice volume.

### "Total Revenue" wrong formula — FIXED
Was POS-only. Fixed to `posRevenueThisMonth + corporateRevenueThisMonth` (POS + corporate_bills).

### "Total Revenue Generated" mislabel — FIXED
Was all-time label on a this-month figure. Relabeled "Revenue This Month" in `DashboardTab.tsx`.

### Pie chart color collision — FIXED
3-color `index % 3` cycle left 6+ statuses sharing colors. Replaced with explicit status→color map in both `<Cell>` and legend dots: Pending=amber, In Progress=blue, Diagnosing=violet, Repairing=green, Waiting=orange, Ready=teal, Completed=white, Delivered=light-green, Cancelled=faint.

### Verified working
- Frontend guards (`?? 0`/`?? []`), crash-safe on missing data.
- Permission masking: non-finance users see ৳0 revenue correctly.
- `recentJobs` correctly ordered newest-first.
- Stale-while-revalidate cache (30s fresh / 5m max) correct.

### Still open (not fixed)
- Revenue trend chart (6-month area) is POS-only — doesn't include monthly corporate bills. Lower priority.
- `getAllJobTickets()` loads all jobs in-memory for status counts. Fine now; at 10k+ jobs should use `COUNT … GROUP BY`. See Phase P notes.

All changes: `server/repositories/analytics.repository.ts`, `client/src/pages/admin/bento/tabs/DashboardTab.tsx`. tsc clean.

---

## Phase R — Inventory Tab (Stock Manager)

### 🔴 Serial-add stock DOUBLE-COUNT — FIXED
`inventory.routes.ts` POST `/:id/serials`: passed `item.stock + addedSerials.length` to `updateInventoryStock`, which itself does `newStock = item.stock + delta`. Result `2×stock + added` — stock doubled on every restock. Fixed to pass just `addedSerials.length` (the delta).

### 🟡 PATCH `/:id` accepted raw unsanitized body — FIXED
Used `req.body` directly → caller could set negative price, inflated stock, overwrite id. Now `insertInventoryItemSchema.partial().parse(req.body)`. ZodError → 400 with details.

### 🟡 GET `/api/inventory` ignored page/limit — FIXED
Parsed params then returned all rows always. Now opt-in pagination: full array when no params (UI unchanged); wrapped envelope `{items,total,page,limit,totalPages}` when page/limit passed. limit clamped 1–500.

### 🟡 DELETE `/:id` no reference guard — FIXED
No check for linked rows → orphaned serials / purchase-order lines (no DB FK cascade). Now counts `inventory_serials` + `purchase_order_items` referencing the item; blocks with 409 + counts if any exist.

### 🟢 mojibake bullet — FIXED
`InventoryTab.tsx:567` `â€¢` → `•`.

### Verified working
- Auto-status logic (In/Low/Out of Stock by threshold) correct.
- Audit logs on create/update/delete/stock/serials present.
- Bulk import validates each row.
- All inventoryApi methods match routes — no 404 gaps.

### Still open (not fixed)
- UI has no pagination controls yet — backend now supports it, frontend can adopt later at scale.
- Duplicate serial numbers not rejected (no crash, minor data-quality gap).

All changes: `server/routes/inventory.routes.ts`, `client/src/pages/admin/bento/tabs/InventoryTab.tsx`. tsc clean.

---

## Phase S — POS Tab (Point of Sale)

### 🔴 Orphan transaction on malformed payload — FIXED
POST `/api/pos-transactions` created the transaction row BEFORE `JSON.parse(items)`. Malformed JSON threw post-commit → orphan paid transaction, no inventory/finance side-effects. Now parse + array-validate items & linkedJobs up-front (400 on malformed) before any insert.

### 🟡 No server-side stock guard — FIXED
`updateInventoryStock(id, -qty)` floors at 0 silently → direct/stale API call could oversell, real count lost. Added pre-insert guard: rejects 409 if `qty > stock` for tracked physical items (service items + non-inventory products skipped).

### 🟡 Misleading error code — FIXED
Catch returned 400 "Invalid POS transaction data" for ALL failures incl. DB/runtime. Now ZodError → 400, everything else → 500 + server log.

### 🟢 Mojibake — FIXED
`PosTab.tsx:672` `â€”` → `—`.

### 🟡 Still open (flagged, not fixed)
- Non-atomic side-effects: transaction insert + inventory + due/petty-cash + drawer + job-complete are separate awaits, no DB transaction wrap. A throw mid-chain leaves partial state. Needs a `db.transaction()` refactor — larger change, deferred.

### 🟢 Verified working
- Cart item.id = inventory id → decrement targets correct rows.
- Frontend stock validation + double-submit disable present.
- Drawer expectedCash bumped only for Cash payments — correct.
- Repo pagination correct; HistoryDialog guards `?.items`.

All changes: `server/routes/pos.routes.ts`, `client/src/pages/admin/bento/tabs/PosTab.tsx`. tsc clean (sole remaining tsc error is in CorporateRepairsTab.tsx — Codex's live B2B edit, not this work).

---

## Phase T — Customers Tab

### 🔴 Top "Total Orders" stat always 0 — FIXED
Stat card read `c.ordersCount`; backend returns `totalOrders`. Field never existed → card summed 0. Fixed to `c.totalOrders`.

### 🔴 Null phone crashed customer list — FIXED
Search filter did `c.phone.includes(...)` + `c.name.toLowerCase()` unguarded. Google-auth customers have null phone → threw → entire list white-screened on search. Now optional-chained (`c.phone?.`, `c.name?.`).

### 🟡 DELETE no reference guard — FIXED
Deleted customer with no check → orphaned orders/service-requests (customerId → deleted user). Now counts linked orders + service requests; blocks 409 with counts if any.

### 🟡 PATCH phone change → generic 500 — FIXED
Duplicate phone hit DB unique violation (23505) → 500. Now returns friendly 409 PHONE_EXISTS (mirrors profile route).

### 🟡 Still open (flagged, not fixed)
- N+1 query in GET /api/admin/customers: 3 queries per customer (orders + service reqs + jobs) on every load. 500 customers = 1500 queries. Needs repo-level aggregation (GROUP BY) — larger refactor, deferred.
- LTV uses estimatedCost fallback → slightly overstates lifetime value when actualCost unset.

### 🟢 Verified working
- Table fields (totalOrders/totalServiceRequests/lifetimeValue) match backend.
- Create validates name+phone+duplicate.
- Customer-facing routes (auth/profile/SSE/addresses) have proper Zod + 409 handling.

All changes: `client/src/pages/admin/bento/tabs/CustomersTab.tsx`, `server/routes/users.routes.ts`. tsc clean (sole remaining error is CorporateRepairsTab.tsx — Codex's live B2B edit).

---

## Phase U — Salary / HR (Payroll)

### 🔴 Bonus double-calculation — FIXED
`POST /api/admin/payroll/bonus/calculate` had no existence check (monthly payroll has one). Running twice for same bonusType+year created a second full set of bonus records → double bonus pay. Added guard: 400 if that bonusType+year already exists.

### 🟡 Flagged (money logic — NOT changed without product decision)
- calculateBonus (payroll.service.ts) hardcodes deductionPercent:0 / finalBonusAmount:fullBonus. The bonusDeductionScale + getBonusDeductionPercent helpers are dead code → every employee gets 100% bonus regardless of absences; periodStartMonth/End unused. Comment marks it "Simplistic V2 / Legacy". Needs attendance aggregation over bonus period to wire correctly.
- Mid-month hire: daysAbsent = totalWorkingDays - daysPresent counts pre-join days as absent (advisory only, low impact).

### 🟢 Verified solid
- generateMonthlySalary: bulk pre-fetch (no N+1), zero default deductions, calcHash tamper-detect, Math.round/Math.max(0).
- applyApprovedDeductions blocks on pending proposals.
- Routes: month-exists guard, role-gated finalize/clear/delete, dismiss recalculates net.

### ⚠ Tooling note
server/routes/hr.routes.ts does NOT exist. The rtk token proxy fabricated file content for it earlier this session; no edit applied (cancelled). rtk corrupts/invents content on large files — recommend disabling it for audit work. Real payroll files: payroll.routes.ts, payroll.service.ts.

Change: server/routes/payroll.routes.ts. tsc clean.

---

## Phase V — Settings Tab

### Verified solid (earlier fabricated-read suspicions were FALSE)
- POST /api/settings: insertSettingSchema.parse + ALLOWED_SETTING_KEYS allowlist.
- GET /api/public/settings: filters to PUBLIC_SETTING_KEYS -> no secret leak.
- No secrets stored in settings table (all brand/UI/CMS keys).
- Full GET /api/settings: admin + permission('settings') + audit logged.
- DELETE /api/admin/data/all: requireSuperAdmin + 'DELETE ALL' confirmation.

### Fixed
- PATCH /api/admin/services/:id: was raw req.body; now insertServiceCatalogSchema.partial().parse + 400 on ZodError.
- PATCH /api/admin/products/.../variants/:variantId: was raw req.body; now insertProductVariantSchema.partial().parse + 400.

### Flagged (not changed)
- Service catalog / categories / variants / policies write routes use only requireAdminAuth (no granular requirePermission). Permission-model decision.
- PATCH /api/admin/service-categories/:id still raw req.body (no insert schema imported; low value).

Change: server/routes/settings.routes.ts. tsc clean.

---

## Phase W — Reports Tab

### Correction
An earlier audit pass (under rtk corruption) claimed a "critical month-name collision" bug in users.routes.ts. That code does NOT exist there — the /api/admin/reports handler just calls analyticsRepo.getReportData. The fabricated edit FAILED to apply (exact-match safety). Real logic is in analytics.repository.ts getReportData.

### Real findings (all minor — no critical/crash)
- FIXED: monthlyFinancials now sorted by calendar month (was Map insertion order → bars could render out of order). analytics.repository.ts.
- Note: month-name keying is SAFE in practice — getReportData pre-filters to the period range (max span one year), so same month never collides across years.

### Flagged (not changed)
- activityLogs always [] (analytics.repository.ts:476) → Reports "Activity Logs" tab permanently empty, though an audit_logs table exists. Incomplete feature.
- totalRevenue = POS transactions only (understated; excludes corporate bills + service/job revenue — same pattern as Dashboard).
- totalStaff counts all non-Customer users incl. inactive/terminated.
- monthlyFinancials omits months with zero activity (gaps in chart).
- Export PDF (ReportsTab.tsx handleExportPDF) is a stub — writes near-empty HTML (title+date only), no report data.
- getReportData loads ALL job tickets then filters in memory (scalability).

Change: server/repositories/analytics.repository.ts. tsc clean.

### Tooling
rtk removal from global settings.json took effect (tsc no longer shows rtk wrapper message). Bash/Grep/Read now accurate.

---

## Phase X — Remaining flagged-item fixes

### Fixed
- Reports activityLogs: was hardcoded [] -> now queries last 20 audit_logs in range, joins user name, maps to {action,user,time,type}. The Reports "Activity Logs" tab now shows real data. (analytics.repository.ts)
- Reports totalStaff: now counts only role!=Customer AND status==='Active' (was counting inactive/terminated too). (analytics.repository.ts)
- Reports Export PDF: was a blank stub (title+date only). Now builds full printable report from reportData — KPIs, monthly financials table, technician performance, recent activity, with print button + HTML escaping. (ReportsTab.tsx)
- Inventory add-serials: trim + dedupe submitted batch, reject (409) serials already existing for the item. Prevents duplicate serials inflating stock / breaking per-unit tracking. (inventory.routes.ts)

### Deliberately deferred (NOT silently changed — reasons)
- Salary bonus absence-deduction scale: NO UI caller triggers bonus/calculate (tab only displays existing records); periodStartMonth/End format unspecified; replicating absence math blind on payroll money = mis-pay risk. Advisory model (Super Admin reviews before pay). Needs product spec before implementation. Double-calc guard already added (Phase U).
- POS db.transaction wrap: requires threading a tx param through 6 repo methods across multiple files — large surface, high regression risk. Not a bounded fix.
- Customers N+1 (3 queries/customer): works correctly; only a scale concern at hundreds+ customers. Premature to refactor now; needs GROUP BY repo method.

tsc clean. 12/13 tests (1 = env DB/session timeout on /api/admin/users, unrelated). All local, not pushed.

---

## Phase Y — Audit Logs Tab

### Verified solid
- Backend GET /api/audit-logs: permission('auditLogs') gated, LEFT JOIN users for actor name, limit capped at 1000, filters (user/entity/date/search), logs the viewer ("who watches the watchers").
- db-health + db-health/analyze: read-only / ANALYZE-only (no locks, no data change).
- Frontend: null-safe search/filters, date grouping, severity dots, before/after diff view, immutable read-only ledger. No crash/security/data bugs.

### Fixed
- Expand chevron showed for logs with metadata OR changes, but expanded panel only rendered changes -> metadata-only logs expanded to nothing. Now renders a Metadata panel when there are no before/after changes. (AuditLogsTab.tsx)

### Flagged (minor, not changed)
- Refresh button uses window.location.reload() (full reload) instead of query refetch — functional, heavy.
- db-health/analyze comment says "Super Admin only" but gate is requirePermission('settings'); ANALYZE is harmless so low risk.
- Invalid startDate/endDate query -> new Date().toISOString() throws -> 500 instead of 400. Low.

tsc clean.

---

## Audit complete — all reachable admin tabs done
Audited + fixed: Inventory, POS, Customers, Salary/HR, Settings, Reports, Audit Logs, Dashboard (earlier), Finance (earlier), Jobs (earlier).
Corporate/B2B: found bugs earlier (bill number collision, month-boundary billing) but NOT fixed — Codex actively editing those files.
Crash-class bugs across audited tabs: 0. Money-mischarge: 0.

---

## Phase Z — Users / Staff Management Tab  (HIGHEST-SEVERITY FINDINGS)

### 🔴 Privilege escalation + plaintext password — FIXED
Two legacy routes bypassed all the protections the /api/admin/users routes have:

1. PATCH /api/users/:id (was: updateUser(id, req.body) raw)
   - Any admin with 'users' permission could PATCH { role:'Super Admin', permissions:'{"*":true}' } → self-escalate to Super Admin / grant wildcard permissions.
   - Could set a plaintext password (login compares bcrypt → also a hijack/lockout vector).
   - No validation, no escalation guard, no hashing, returned password hash in response.
   FIX: block role/permission changes unless caller is Super Admin; bcrypt-hash any password; strip password from response.

2. POST /api/users (was: createUser(insertUserSchema.parse(body)) — plaintext password, arbitrary role/permissions)
   FIX: non-Super-Admin cannot create Super Admin or set custom permissions; bcrypt-hash password; strip password from response.

Note: usersApi.create/update are UNUSED by the frontend (UsersTab uses the safe adminUsersApi → /api/admin/users), so these are zero-breakage hardening of live, directly-exploitable HTTP endpoints.

### Verified solid
- /api/admin/users/* routes: escalation guards (only Super Admin changes role/permissions), bcrypt, schema validation, audit logs, self-delete block, trusted-device revoke on role/password change.
- UsersTab.tsx frontend: uses adminUsersApi, default-permissions per role, sensible create/edit/permission/status handlers.

### Flagged (minor)
- /api/users POST/PATCH still exist as duplicates of /api/admin/users; consider removing usersApi.create/update + these routes entirely once confirmed dead. Hardened for now.

Change: server/routes/users.routes.ts. tsc clean.

---

## Phase ZA — Service Requests Tab

### Fixed
- send-quote: rejected only NaN/empty quoteAmount → negative amounts (e.g. -100) passed. Now requires a positive number (> 0). (service-requests.routes.ts:818)
- DELETE /api/service-requests/:id: now blocks (409) deleting a request already converted to a job ticket — deletion orphaned the job's source history/media. (service-requests.routes.ts:415)

### Verified solid
- POST /api/service-requests (public intake): zod-validated, rate-limited (serviceRequestLimiter), auto-creates customer with bcrypt-hashed random password.
- PATCH /quote-response (no auth middleware): has a proper INLINE ownership check (session.customerId === request.customerId, or admin) → 403 otherwise. Secure.
- Admin routes (PATCH/DELETE/transition-stage/send-quote): requireAdminAuth + requirePermission('serviceRequests').
- Auto-job-create on status→Work Order guards against existing convertedJobId.

### Flagged (not changed)
- PATCH /api/service-requests/:id uses raw req.body (no schema validation). Admin-gated (no privilege-escalation vector) but allows arbitrary fields; retrofitting strict validation risks breaking the complex partial-update flow (status auto-job-create, date coercion). Lower priority.
- Auto-job-create has a theoretical race under concurrent PATCH status=Work Order (two jobs). Low — admin UI unlikely concurrent.
- Frontend ServiceRequestsTab.tsx: lighter-touch (backend was the risk surface); calls the audited routes.

Change: server/routes/service-requests.routes.ts. tsc clean (sole error is CorporateRepairsTab.tsx — Codex's live B2B edit).

---

## Phase ZB — Orders Tab
### Verified solid (no code change)
- POST /api/orders (customer): server-side pricing — fetches product/variant price; client price only accepted if it matches a stored price (hot-deal or regular) within 0.01. Cannot underpay.
- Ownership via requireCustomerAuth; admin list/accept/decline gated by requirePermission('orders'); accept/decline guard status==='Pending'.
### Flagged (behavioral — not changed)
- Orders never decrement inventory stock (create or accept) — overselling possible. May be intentional (COD + manual fulfillment). Inconsistent with POS which decrements.
- Hot-deal price honored from product.hotDealPrice even if showOnHotDeals ended (stale-deal price). Low.
- PATCH /admin/orders/:id status accepted without whitelist. Low.

## Phase ZC — Quotations Tab
### Verified solid (no code change) — model implementation
- POST/PATCH use db.transaction (header + items atomic), zod validation on header AND items, audit logs, 404 guards, DELETE cascades items in a transaction.
### Flagged (minor)
- quotationNumber = QTN-<year><month><random4> — random (not sequential) could rarely collide vs unique constraint; month not zero-padded. Low/cosmetic.
- PATCH /:id/status accepts status without whitelist. Low.

## Phase ZD — Warranty Claims Tab
### 🔴 Authorization bypass — FIXED
approve + reject derived the authorization role from CLIENT-SUPPLIED req.body.approvedByRole. Any admin (e.g. Cashier/Technician) could send approvedByRole:'Super Admin' to approve/reject claims — including the Super-Admin-only expired-warranty override. FIX: role + actor identity now read from the authenticated session user ((req as any).user set by requireAdminAuth), never from the body. Stored approvedBy/Name/Role + audit userId now reflect the real actor.
### Verified solid
- All /api/warranty-claims routes gated by requireAdminAuth (router.use).
- approve/reject guard status==='pending'.
- create-job is idempotent: requires status==='approved', sets status='in_repair' after → second call blocked (no duplicate warranty jobs).
### Flagged (minor)
- Warranty routes have no granular requirePermission (only requireAdminAuth) — any admin reaches them; approve/reject now role-gated server-side, create/view are not. Consider a 'warranty' permission.

Changes: server/routes/warranty.routes.ts. tsc clean (excluding CorporateRepairsTab.tsx — Codex's live B2B edit).

---

## Phase ZE — Purchasing Tab
### 🔴 Stock double-count on PO receive — FIXED
PATCH /api/purchase-orders/:id/status, on status→Received: updateInventoryStock(item.id, inventoryItem.stock + item.quantity). updateInventoryStock takes a DELTA → newStock = stock + (stock + qty) = doubled. Receiving a PO doubled the item's stock. FIX: pass item.quantity (delta) only. (purchase-orders.routes.ts:91)
### Verified solid
- All routes requirePermission('purchasing'); POST validates order + items with zod; Received guard (po.status !== 'Received') prevents re-applying.
### Flagged
- PATCH status accepts arbitrary status string (no whitelist). Low.

## Phase ZF — Cashier / Drawer Tab  (CRITICAL)
### 🔴 Unauthenticated cash-handling endpoints — FIXED
drawerRouter is mounted raw (app.use(drawerRouter), routes/index.ts:165) with NO guard. Only /day-close/run-now and /:id/close-day had inline requireAdminAuth. The rest were fully PUBLIC:
  GET /api/drawer/active, /history, /:id/summary  (cash data exposure)
  POST /api/drawer/open  (open register, arbitrary float)
  POST /api/drawer/:id/drop  (blind drop)
  PATCH /api/drawer/:id/reconcile  (close/reconcile; closedBy from body)
  POST /api/drawer/:id/justify  (justify shortage → masks missing cash + creates petty-cash expense; justifiedBy from body)
Anyone (no login) could open/close/reconcile registers, read cash sessions, and justify shortages to hide theft.
FIX: added requireAdminAuth to all 7. /justify additionally now requires session role === 'Super Admin' (comment claimed Super-Admin-only but nothing enforced) and takes justifier identity from the session user, not the request body.
NOTE: POS is an admin-only tab → adding auth does not break the legit POS flow (admin session present).

## Phase ZG — Wastage Tab
### 🔴 /consume double-decrements stock — FIXED
inventoryService.createWastageLog ALREADY decrements inventory stock (service line 84-90). POST /api/inventory/:id/consume also called storage.updateInventoryStock(-quantity) BEFORE createWastageLog → stock dropped by 2× the consumed quantity per job-part consumption. FIX: removed the manual decrement; rely on createWastageLog; re-fetch item for low-stock alert + response. (inventory.routes.ts:~675)
### Verified solid
- POST /api/inventory/:id/wastage: zod-validated, audit-logged, decrements stock once (correct, via service). No double-count.
- /consume retains its pre-consume stock-availability guard (400 if insufficient).

Changes: purchase-orders.routes.ts, drawer.routes.ts, inventory.routes.ts. tsc clean (excl. CorporateRepairsTab.tsx — Codex's live B2B edit).

---

## Phase ZH — Challan Tab
### Fixed
- PATCH /api/challans/:id used raw req.body → now insertChallanSchema.partial().parse + 400 on ZodError. (challans.routes.ts)
### Verified solid
- router.use('/api/challans', requireAdminAuth) — all routes admin-gated. POST validates with zod. DELETE 404-guards.
### Flagged
- GET /api/challans parses page/limit but ignores them (getAllChallans() no args). Low.

## Phase ZI — Technician Tab
### Verified solid (no code change)
- GET /api/technician/stats + /jobs: both requireAdminAuth, scoped to the logged-in technician's own jobs (technician===name OR assignedTechnicianId===userId).
### Flagged
- Name-based job matching could collide for two technicians sharing a name. Loads all jobs in memory (scalability). Low.

## Phase ZJ — Pickup Tab
### Verified solid (no code change)
- Admin routes all requireAdminAuth: GET /api/admin/pickups, /pending, PATCH /:id, PATCH /:id/status.
### Flagged
- GET /api/pickups/by-request/:serviceRequestId has NO auth — exposes pickup schedule (incl. delivery address PII) to anyone with the serviceRequestId. Used by the customer app (pickupScheduleApi), so it cannot be made admin-only; should be ownership-checked. Mitigated by opaque nanoid ids. Low/medium.
- PATCH /api/admin/pickups/:id uses raw req.body (admin-gated). Low.

Changes: server/routes/challans.routes.ts. tsc clean (excl. CorporateRepairsTab.tsx — Codex's B2B edit).

---

## Phase ZK — Brain (AI Inbox) Tab  (CRITICAL)
### 🔴 Unauthenticated AI/chat endpoints — FIXED
brain.routes.ts had NO auth (no router-level, no inline) and was mounted app.use('/api/brain', brainRoutes) with no guard. Every /api/brain/* endpoint was public:
  GET /conversations, /inbox, /sessions/:psid/messages, /sessions/by-phone/:phone → read ALL customer chat history (PII)
  POST /sessions/:psid/send → send WhatsApp/Messenger messages AS THE BUSINESS via real Meta tokens (impersonation/spam)
  PATCH /config/mode, POST /import-conversations, /media/cleanup, /cases/backfill → manipulate AI config/data
FIX: added router.use(requireAdminAuth) to brain.routes.ts. Auto AI replies run via the Meta webhook → brainService directly (not these routes), so the live chat pipeline is unaffected.
### Verified solid — standing security constraints ENFORCED
- Pricing: ai.service.ts:92 "PRICING POLICY [CRITICAL — NEVER VIOLATE] — NEVER quote specific prices/taka". Reinforced at lines 294, 1098.
- Phone: AI prompt uses ONLY the public 01886662811; the private 01673999995 does NOT appear anywhere in server code.

## Phase ZL — Analytics routes  (CRITICAL, shared by Overview/Quality/Reports/Dashboard)
### 🔴 Unauthenticated revenue/metrics exposure — FIXED
analytics.routes.ts (mounted app.use('/api/analytics', ...)) had NO auth despite an inline comment claiming "admin session auth". Public endpoints exposed: /revenue, /dashboard, /metrics, /workload, /technicians, /export/excel, /defects, /supplier-defects, /performance. Anyone could read shop revenue + export data.
FIX: added router.use(requireAdminAuth). All consumers are admin-panel tabs.

## Phase ZM — Inquiries Tab
### 🔴 Status update hit the wrong route (404) — FIXED
Frontend PATCHed /api/inquiries/:id but the backend route is /api/inquiries/:id/status → every inquiry status/reply update 404'd. Also used raw fetch (relative URL, no credentials) → broke cross-origin in the Vercel+Render split. FIX: switched to fetchApi (base URL + cookie + CSRF) and corrected the path to /inquiries/:id/status. Backend handler accepts {status, reply}.
### Flagged
- POST /api/inquiries (public contact form) has no rate limiter → spam risk. Low/medium.

## Phase ZN — Quality Analytics Tab
### 🟡 Cross-origin raw fetch — FIXED
3 raw fetch("/api/analytics/...") calls (relative URL, no credentials) → broken in split deploy. Switched to fetchApi. Backend routes (/defects, /performance, /supplier-defects) exist + now admin-gated (Phase ZL).

## Phase ZO — Overview + System Health Tabs
### Overview — 🟡 Cross-origin raw fetch — FIXED
fetch('/api/admin/job-overview') → fetchApi('/admin/job-overview'). Other call already used analyticsApi.
### System Health — Verified solid (no code change)
Uses proper API clients (jobTicketsApi/serviceRequestsApi/inventoryApi). No raw fetch.

Changes: brain.routes.ts, analytics.routes.ts, InquiriesTab.tsx, QualityAnalyticsTab.tsx, OverviewTab.tsx. tsc clean (excl. CorporateRepairsTab.tsx — Codex's B2B edit).

---

## Phase ZP — Corporate / B2B Tab  (Codex paused — now audited)

### 🔴 Bill-number collision — FIXED
generateCorporateBill used seq = global count(corporate_bills) + 1. Gaps/reuse on delete, cross-client jumps, concurrent dupes → reused number hit the bill_number unique constraint → 500 + failed billing. FIX: per-client sequential — parse max existing -BILL-<n> for THIS client, +1 (mirrors the challan numbering already in the file). (corporate.repository.ts)

### 🔴 Double-billing — FIXED
generateCorporateBill billed whatever jobIds were passed with no check, and stamped data.jobIds as billed. A job already on a bill could be billed again / re-attached to a new bill. FIX: filter out jobs with billingStatus='billed' or an existing corporateBillId (throw if none left); stamp only the actually-billed subset.

### 🟡 Monthly auto-generate revenue leak — FIXED
/bills/auto-generate filtered candidate jobs by createdAt within the month, but bills COMPLETED jobs. A job created in one month and completed the next was billed in neither run → permanent leak. FIX: filter by completion date (completedAt, fallback updatedAt/createdAt).

### Verified solid
- B2B portal (corporate-portal.routes.ts): router.use(requireCorporateAuth); every query scoped to session user.corporateClientId; /jobs/:id rejects cross-client access → tenant isolation enforced.
- Corporate auth (corporate-auth.routes.ts): authLimiter rate limiting, bcrypt, CSRF token, zod validation, admin-assisted OTP reset, generic reset message (no user enumeration), failed-login audit.
- All admin corporate routes requirePermission('corporate').

### Flagged (feature gaps — not changed)
- generateCorporateBill hardcodes discount=0, vat=0 (ignores any client billing terms).
- Jobs with no charges and no estimatedCost are billed at ৳0 silently (no warning).

Changes: corporate.repository.ts, corporate.routes.ts. tsc fully clean.

---

# ✅ AUDIT COMPLETE — ALL ADMIN TABS DONE (including B2B)
Security 🔴 fixed across the whole effort:
  - Users: privilege escalation + plaintext password (legacy /api/users)
  - Warranty: authz bypass (client-supplied role)
  - Cashier/Drawer: 7 unauthenticated cash routes (incl. justify-shortage)
  - Brain (AI): all /api/brain/* unauthenticated (PII + message impersonation)
  - Analytics: unauthenticated revenue/metrics/export
  - Corporate: bill-number collision + double-billing
Stock-integrity 🔴 fixed: Purchasing PO-receive double-count, Wastage /consume double-decrement, Inventory serial double-count.
Prod-breakers fixed: Inquiries 404 route + cross-origin; Quality Analytics / Overview cross-origin fetches.
Plus earlier Finance / Dashboard / Reports / POS / Customers / Service Requests fixes.
AI guardrails verified enforced (no-taka pricing policy; private phone 01673999995 never in code).
tsc clean. All changes LOCAL, not pushed.

---

## Phase ZQ — Inquiries public-endpoint rate limit
### Fixed
- POST /api/inquiries (public, unauthenticated contact form) had no rate limiter → spam-flood risk for the inquiries table. Applied the existing serviceRequestLimiter (10 submissions/hour per IP — generous, no real customer hits it). (notifications.routes.ts)
### Note
- Limit chosen to be customer-friendly: a genuine customer submits 1-3 inquiries; only bot floods (hundreds/min) are blocked. Adjustable in server/routes/middleware/rate-limit.ts (serviceRequestLimiter).

tsc clean.

---

## Phase ZR — Customer Google Sign-In (split-deploy)
### 🟡 Token exchange used raw cross-origin fetch — FIXED (code)
CustomerAuthContext.loginWithGoogle posted the Firebase idToken via raw fetch("/api/auth/firebase") — relative URL, no credentials. In the split deploy (frontend Vercel @ promiseelectronics.com, backend Render) this hit the Vercel origin (no backend there) with no session cookie → token exchange failed. Switched to fetchApi("/auth/firebase") (+ logout call) → correct API base + credentials + CSRF. Route /api/auth/firebase exists (firebase-auth.routes.ts) and accepts { idToken }.

### 🔴 PRIMARY cause is CONFIG, not code (USER action required)
Console error: "current domain is not authorized for OAuth operations. Add promiseelectronics.com to authorized domains." signInWithPopup is blocked by Firebase before reaching the backend.
ACTION: Firebase Console → Authentication → Settings → Authorized domains → add promiseelectronics.com (+ www). If still failing, add https://promiseelectronics.com to the Google Cloud OAuth client's Authorized JavaScript origins.

### Cross-check: architecture is correctly SEPARATED
- Frontend Vercel (promiseelectronics.com) → backend Render (onrender.com) via VITE_API_URL.
- Backend CORS (app.ts) hardcodes promiseelectronics.com + www, credentials:true; session cookie sameSite:none + secure in prod. Correctly configured for cross-origin. Frontend is NOT acting as backend.

Change: client/src/contexts/CustomerAuthContext.tsx. tsc clean.

---

## Phase ZS — Phase-3 Payment Flow review + UI hardening

### Verified (read the real code)
- Customer submit (customer.routes.ts): ownership-checked, zod-validated, admin-notified, pending+customer_submission.
- Admin verify (finance.routes.ts): permission-gated; on accept APPLIES to job invoice / due record (recordJobPayment/recordDuePayment) → status applied_to_invoice. Money loop DOES close.
- Reject requires reason; applied payments cannot be rejected.
- Admin queue UI: source + status filters, txn/sender/amount columns, Verify + Reject (reason dialog) per pending row. Human-ready.

### 🔴 Fixed — money-loss blocker
Customer card fell back to fake number "01700-000000" when send-money numbers unset → customer would send real money to a non-number and lose it. AND the keys bkash_send_money_number / nagad_send_money_number were not in the settings allowlists (couldn't be saved OR served publicly).
FIX:
- settings.routes.ts: added both keys to ALLOWED_SETTING_KEYS + PUBLIC_SETTING_KEYS.
- track-order.tsx: no fake fallback; if a number is unset, show "Online payment not available — contact the shop" and DISABLE submit.
- SettingsTab.tsx: added admin fields (Finance & Locale sheet) to set bKash/Nagad Send Money numbers + a "customers send real money here" warning. State load + save wired.

### 🟡 Fixed — resubmission after rejection
customer.routes.ts dup-txn guard blocked ANY existing payment with that txn ID, incl. rejected → a wrongly-rejected real payment couldn't be resubmitted. Now excludes rejected (ne(status,'rejected')).

### Flagged (polish, not blocking)
- Admin verify applies the customer-claimed amount verbatim (no edit-at-verify). Admin can reject+ask resubmit.
- Admin queue status filter has no "applied/verified" view; pending badge/count not yet shown.

### 3-person operability
Flow REDUCES staff load: customer self-serves submission (no staff entry); one role owns the verification queue (batchable). Manual statement cross-check is per-payment labor — fine at shop volume.

Changes: server/routes/settings.routes.ts, server/routes/customer.routes.ts, client track-order.tsx, client SettingsTab.tsx. tsc clean + vite build OK.

---

## Phase ZT — Finance tab re-layout (simpler / friendlier)
Problem: 6 flat equal sub-tabs (Sales, Petty Cash, Dues, Refunds, Drawer, Manual Pay) = "exam hall" — scan all 6 every time, mixed mental models.

Reworked FinancesTab.tsx into 4 meaning-based groups + a landing:
- Overview (landing): "Needs your attention" panel (pending customer payments / outstanding dues / open register → each a one-click jump to the right place; "All clear" empty state) + "Go to" quick-nav cards. KPI strip (Sales/Cash/Due/Refunded) stays pinned on top.
- 💰 Money In (green): segmented Payments | Sales | Dues. Payments tab shows pending count badge.
- 💸 Money Out (red): segmented Expenses | Refunds.
- 🧮 Cash Drawer (blue): open/count/reconcile.
Color = meaning everywhere (green in / red out / blue cash / amber attention).
Legacy deep-links (defaultTab sales/petty-cash/dues/refunds/manual-payments/drawer) mapped onto the new groups so existing links still work.

3-person fit: cashier lives on Overview + Money In; manager on Cash Drawer. Each owns a colored slice; nobody scans everything.

Mockup: docs/mockups/finance-relayout.svg
Changes: client/src/pages/admin/bento/tabs/FinancesTab.tsx (sub-components unchanged, just regrouped). tsc clean + vite build OK.

---

## Phase ZU — Manual payment blacklist + end-of-day review
Per user design: fully MANUAL (humans decide every block/whitelist); automation only rate-limits + surfaces candidates. No auto-blacklist engine (avoids false-positive customer lockouts).

Built:
- Table payment_blacklist (shared/schema.ts) + idempotent CREATE TABLE on boot (server/index.ts).
- server/routes/blacklist.routes.ts:
  - GET /api/admin/payment-blacklist (current manual blocks)
  - GET /api/admin/payment-blacklist/review (rolling 48h: numbers with >=2 rejected submissions, flagged for human review; marks alreadyBlacklisted)
  - POST add (manual block; normalized BD number; dup guard) · DELETE :id (whitelist = remove "as if nothing happened")
  - exported isPhoneBlacklisted() helper. All requirePermission('finance').
- Refuse check: customer payment-submission now 403 (PAYMENT_SUBMISSION_BLOCKED, "contact support") if sender number OR account phone is blacklisted.
- Light flood guard: serviceRequestLimiter (10/hr per IP) added to the submission endpoint. No escalation engine.
- UI: FinancesTabBlacklist.tsx (BlacklistReview) — intro, "Needs review" flagged list (Block button), current blacklist (Whitelist button), manual Add. Wired into Finance > Cash Drawer (the register-close area).

Honest limitation: no bKash/Nagad API → software surfaces candidates (rejected attempts, amount, time, customer); the human matches against their bKash app and decides. Software organizes + gives Block/Whitelist; matching is manual (correct at shop scale).

Typo-safety: numbers are never auto-blocked; repeat rejections only FLAG for review. A genuine typo'ing customer is never locked out automatically.

Changes: shared/schema.ts, server/index.ts, server/routes/blacklist.routes.ts (new), server/routes/index.ts, server/routes/customer.routes.ts, client/src/lib/api/adminApi.ts, client FinancesTabBlacklist.tsx (new) + FinancesTab.tsx. tsc clean + vite build OK.
