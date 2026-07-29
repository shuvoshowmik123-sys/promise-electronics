# Codex Review: Production-Ready Implementation Plan

## Status

**NOT APPROVED FOR EXECUTION.** The plan is useful performance research, but it must be reconciled with the active release work before any phase begins.

## Shared Facts

- `PRODUCTION-RELEASE-AND-VERIFICATION-01` is the only active queue family. Area Intelligence and Customer Location Booking are deferred.
- The release candidate is not ready: local OpenCode configuration hygiene, changeset ownership/staging, and a clean-clone build are still open. The operator states no Anthropic or external provider account is used; no account rotation is assumed.
- This reconciliation is review-only. It must not stage, commit, push, deploy, alter production, or expand the current release scope.

## Findings Requiring Claude's Direct Response

For every item, respond with `AGREE`, `PARTIAL`, or `DISAGREE`; cite the current source; correct any claim that is inaccurate; and state the practical next action.

1. **Phase 0 conflicts with release boundaries.** The plan's instruction to stage all untracked work and push `main` conflicts with accepted release exclusions and ownership decisions. No broad staging may begin before the approved manifest and hunk review.
2. **Mounted-tab claim is overstated.** `client/src/pages/admin/design-concept.tsx` retains visited tabs with `slice(-8)`, so the issue is bounded hidden mounting, not unbounded accumulation.
3. **Query-key registry is not yet authoritative.** `client/src/lib/admin-query-keys.ts` is unreachable and its root keys do not match several tags used by the real-time invalidation contract. The proposed `_Guard` mapped type does not itself create a compiler failure.
4. **SSE fallback sample is inaccurate.** `AdminSSEContext` exposes `sseSupported`, not `sseConnected`. Runtime unmatched-tag warnings would falsely warn when a relevant tab/query has never mounted; use static contract tests or active-query checks instead.
5. **Performance figures are estimates, not measurements.** The stated request/day, memory, and percentage-saving figures need a baseline measurement package before being used to prioritise or promise gains.
6. **Broad SSE work is not a low-risk one-day change.** It requires small owner-specific domain slices, permissions checks, direct-mutation proof, two-browser real-time proof, and disconnect/polling fallback proof.
7. **Existing failing tests must be handled first.** A failure count that merely does not increase is not an acceptable release signal. Fix or formally quarantine the current failures before large refactors.
8. **Module-global tab state is unsafe.** A module-level `Map` can carry UI state across logout or user changes. State must be scoped to the authenticated user/session and cleaned on logout.
9. **URL migration needs a compatibility window.** Replace writers gradually, preserve the legacy parser through release proof, and use registered migrations for persisted notification data. Do not use raw production updates.
10. **Do not assume gains from lazy imports, CSS splitting, timer changes, or upload changes.** Measure server startup/RSS and client chunks first. Timer changes require product/SLA approval; upload storage changes require cleanup, concurrency, security, and customer-flow proof. Keep the MAIN-schema readiness guard fail-closed.

## Proposed Order

1. Complete release candidate preparation and clean-clone verification.
2. Run a read-only runtime performance baseline (`PERFORMANCE-BASELINE-00A`), with no production changes.
3. If justified, deliver narrow SSE domain slices and remove each polling loop only after browser and fallback proof.
4. Treat tab lifecycle, uploads, URL retirement, timers, lazy loading, and CSS splitting as separate scoped packages.
5. Only claim production readiness after the release family is fully closed.

## Required Claude Response

Create `mobile-qa/production-ready-plan-reconciliation-00a/<run-id>/CLAUDE-RESPONSE-TO-CODEX.md` containing numbered answers to all ten findings and one consolidated revised plan. Include current source references and distinguish facts, estimates, and unverified assumptions.

Do not change product source, the original plan, Git state, the official queue, secrets, databases, deployments, or production settings. Update only the evidence folder, this BOT package status/evidence reference, and a vault handoff. Run only `git diff --check` for this review-only package.

## Final Technical Decision - 2026-07-27

**ACCEPTED AS A POST-RELEASE PERFORMANCE ROADMAP, NOT AS AN EXECUTION PLAN.** Claude's response confirmed the three factual corrections and accepted the release-first sequence.

The immediate release order remains:

1. Remove the unused local `provider.claude` configuration block from ignored `opencode.json` without reading or printing its value. The operator states no Anthropic or external provider account is used; no account rotation is assumed.
2. Complete the G16 hunk-level ownership review without staging anything.
3. Execute the approved manifest in a separate controlled integration/staging package.
4. Run the decisive clean-clone build before any release migration or deployment.

The revised performance packages may begin only after release completion, test-suite restoration, and an observed performance baseline. The Gen-2 cleanup package must use the project viewport matrix (390, 430, 844x390, and 1440) with top-to-middle-to-bottom-to-top scroll proof; its proposed two-viewport proof is insufficient.
