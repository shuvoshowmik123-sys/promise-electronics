# Handoff — Payments / Finance / Auth / Blacklist session
Date: 2026-06-02 · Continues from Codex's Phase-3 payment-verification handoff.
Detailed per-change log: HUMAN_READY_AUDIT.md (Phases ZR–ZU). Per-tab status: AUDIT_STATUS.md.

⚠️ ALL CHANGES BELOW ARE LOCAL + UNCOMMITTED (except the earlier audit commit 79708a6 already pushed).
⚠️ shared/schema.ts is edited by BOTH Codex and this session — reconcile before pushing.

---

## 1. What was DONE this session

### A. Customer Google Sign-In — FIXED (Phase ZR)
- Session key bug: /api/auth/firebase set session.userId, but the customer app reads session.customerId → login didn't "stick" (instant logout). Now sets customerId. (server/routes/firebase-auth.routes.ts)
- Cross-origin: loginWithGoogle + logout used raw fetch (wrong origin / no cookie in Vercel+Render split). Now use fetchApi. (client/src/contexts/CustomerAuthContext.tsx)
- USER ACTION done by you: added promiseelectronics.com to Firebase Authorized Domains.
- STILL NEEDED: Firebase service account on Render (env FIREBASE_SERVICE_ACCOUNT_BASE64 or /etc/secrets file) — backend had none → token verify disabled. Confirm Render log shows "[Firebase] Admin SDK initialized successfully".

### B. Customer bKash/Nagad payment verification — REVIEWED + HARDENED (Phase ZS)
Codex built the core (customer submits → admin verifies → applies to invoice). Verified it's sound. Fixed:
- 🔴 Money-loss: customer card fell back to fake "01700-000000" when send-money numbers unset → fixed (no fake number; "contact shop" + submit disabled when unset).
- Settings keys bkash_send_money_number / nagad_send_money_number added to allowlists (couldn't be saved/served before). (server/routes/settings.routes.ts)
- Admin Settings UI fields to set the two numbers (Settings → Finance & Locale) + warning. (client SettingsTab.tsx)
- Resubmission: rejected payments with same txn ID can now be resubmitted (guard excludes 'rejected'). (server/routes/customer.routes.ts)

### C. Finance tab re-layout — DONE (Phase ZT)
6 flat tabs → 4 friendly groups: Overview · 💰 Money In · 💸 Money Out · 🧮 Cash Drawer. Overview = "Needs your attention" (pending payments / dues / open register, one-click to act) + quick-nav + KPI strip. Segmented sub-views inside each group. Color = meaning. Legacy deep-links mapped. Mockup: docs/mockups/finance-relayout.svg. (client FinancesTab.tsx)

### D. Manual payment blacklist + end-of-day review — DONE (Phase ZU)
Fully manual (humans decide every block/whitelist; automation only flags + rate-limits).
- payment_blacklist table + idempotent create on boot.
- Routes: list / review(48h flagged) / add / remove(whitelist) + isPhoneBlacklisted() + submission refuse (403 "contact support") + 10/hr flood guard. (server/routes/blacklist.routes.ts, customer.routes.ts, index.ts)
- UI: BlacklistReview in Finance → Cash Drawer (register-close area). (client FinancesTabBlacklist.tsx)
- Typos never auto-lock anyone; repeat rejections only surface for review.

---

## 2. Advisory decisions given (no code)
- INFRA: Do NOT move backend to BD VPS while DB stays in Singapore — every query crosses the border (~80ms × many queries/request) → SLOWER than now. Rule: backend + DB must be colocated. If going local, move the DB too (+ off-VPS backups). Else keep all in Singapore.
- SSE: customer real-time is the right call; the pipeline already exists (sse-broker / notifyCustomerUpdate / /api/customer/events). Gap: verify/reject routes don't push to it yet (see Pending #4).
- BLACKLIST: manual human review > automation engine. Auto-blacklisting real customers loses business. Built accordingly.
- bKash/Nagad: manual TXN-ID verification now; official merchant API later (needs account/fees). No SSLCommerz.

---

## 3. Verified
- tsc --noEmit clean. vite build exit 0. Earlier full suite 13/13 (this session's additions not browser-tested).

---

## 4. PENDING

### Your manual steps (blockers for go-live)
1. Set REAL bKash/Nagad numbers: Admin → Settings → Finance & Locale.
2. Add Firebase service account to Render (Section A) → confirm "Admin SDK initialized".
3. Browser-test the full customer payment flow (submit → admin verify/reject → customer sees update).
4. Commit + push (you push; bot lacks rights). Coordinate shared/schema.ts with Codex first.

### Code follow-ups (I can do)
4. SSE notify on verify/reject → customer portal updates live without reload (small; uses existing SSE).
5. Admin pending-verification badge in sidebar (Finance Overview already shows count).
6. Richer verification table columns (customer name, linked job/invoice, submitted time) + bKash/Nagad method filter.
7. Known-good-number on customer profile (trust a confirmed sender number to relax throttle).

### Deferred (your decision)
- bKash/Nagad official API adapter (Phase 2 of payments).
- DB foreign-key constraints (manageability debt from earlier audit).

---

## 5. Recommended next order
1. Coordinate schema.ts with Codex → commit + push everything (deploys auth + payment + finance + blacklist).
2. You: set numbers + add Firebase service account + browser-test.
3. Me: wire SSE notify on verify/reject (#4) — completes the real-time loop you wanted.
