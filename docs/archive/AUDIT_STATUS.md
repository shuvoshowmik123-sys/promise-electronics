# Promise Electronics — Admin Panel Audit Status Tracker

Quick cross-reference of every admin tab: audited? bugs found? fixed? verified? what's left.
Detailed per-bug write-ups live in `HUMAN_READY_AUDIT.md` (Phase letters referenced below).

Legend: ✅ done · ⚠️ partial/flagged · ⛔ blocked · — n/a

| Tab | Audited | Bugs found | Fixed | tsc/verify | Flagged (deferred) | Ref |
|-----|:------:|:----------:|:-----:|:----------:|--------------------|-----|
| Jobs | ✅ | yes | ✅ | ✅ | — | earlier |
| Finance (Refunds/Dues/etc.) | ✅ | 2+ | ✅ | ✅ | — | Phase O |
| Dashboard | ✅ | 3 | ✅ | ✅ | revenue trend POS-only | Phase Q |
| DB / future-proofing | ✅ | indexes | ✅ | ✅ | FK constraints, DATABASE.md | Phase P |
| Inventory | ✅ | 5 | ✅ | ✅ | UI pagination; (dup-serial now fixed) | Phase R |
| POS | ✅ | 4 | ✅ | ✅ | non-atomic side-effects (needs db.transaction) | Phase S |
| Customers | ✅ | 4 | ✅ | ✅ | N+1 query; LTV uses estimatedCost | Phase T |
| Salary / HR (Payroll) | ✅ | 1 | ✅ | ✅ | bonus absence-scale (needs spec); mid-month-hire absences | Phase U |
| Settings | ✅ | 2 | ✅ | ✅ | catalog/policy granular permission; categories PATCH unvalidated | Phase V |
| Reports | ✅ | 6 | ✅ | ✅ | revenue POS-only; getReportData loads all jobs | Phase W/X |
| Audit Logs | ✅ | 1 | ✅ | ✅ | refresh=full reload; analyze=settings-perm not super-admin | Phase Y |
| Users / Staff | ✅ | 2 🔴 | ✅ | ✅ | remove dead /api/users legacy routes entirely | Phase Z |
| Service Requests | ✅ | 2 | ✅ | ✅ | PATCH /:id raw body; auto-job-create race | Phase ZA |
| Orders | ✅ | 0 (clean) | — | ✅ | no stock decrement (oversell); stale hot-deal price | Phase ZB |
| Quotations | ✅ | 0 (clean) | — | ✅ | random quote-number collision; status not whitelisted | Phase ZC |
| Warranty Claims | ✅ | 1 🔴 | ✅ | ✅ | no granular 'warranty' permission | Phase ZD |
| Corporate / B2B | ✅ | 2 🔴 + 1 | ✅ | ✅ | discount/vat hardcoded 0; ৳0 silent billing | Phase ZP |
| Purchasing | ✅ | 1 🔴 | ✅ | ✅ | status not whitelisted | Phase ZE |
| Wastage | ✅ | 1 🔴 | ✅ | ✅ | — | Phase ZG |
| Cashier / Drawer | ✅ | 1 🔴 (7 routes) | ✅ | ✅ | reconcile uses body closedBy (now authed) | Phase ZF |
| Challan | ✅ | 0 (clean) | ✅ minor | ✅ | page/limit ignored | Phase ZH |
| Technician | ✅ | 0 (clean) | — | ✅ | name-match collision; loads all jobs | Phase ZI |
| Pickup | ✅ | 0 (clean) | — | ✅ | by-request route no auth (PII by id) | Phase ZJ |
| Quality Analytics | ✅ | 1 | ✅ | ✅ | — | Phase ZN |
| Inquiries | ✅ | 1 🔴 + 1 | ✅ | ✅ | — (rate limit added Phase ZQ) | Phase ZM/ZQ |
| System Health | ✅ | 0 (clean) | — | ✅ | — | Phase ZO |
| Brain (AI) | ✅ | 1 🔴 | ✅ | ✅ | guardrails (no-taka/private-phone) verified enforced | Phase ZK |
| Overview | ✅ | 1 | ✅ | ✅ | — | Phase ZO |
| Analytics routes (shared) | ✅ | 1 🔴 | ✅ | ✅ | — | Phase ZL |

## Global notes
- All fixes are LOCAL, NOT pushed (user pushes). Codex is live-editing B2B/Corporate files — avoid those.
- rtk token-proxy was REMOVED from global settings.json (was corrupting file reads). Do not re-enable for audit work.
- Standing security constraints: AI must NEVER quote taka amounts in any channel; NEVER share phone 01673999995 (only 01886662811). These bind the AI brain/chat, not the human-curated marketing pricing table.
- Verification per tab = `npx tsc --noEmit` clean + fix signatures confirmed in source. Test suite: 12/13 (1 = env DB/session timeout on /api/admin/users, not logic).
