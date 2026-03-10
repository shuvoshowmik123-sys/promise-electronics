# Admin Panel Analysis Report

Date: 2026-02-27
Scope: Admin panel logic/routing/workflow audit (no code changes in this pass)

## Summary
No blocking compile-time errors were detected. TypeScript check passed. A few logical risks remain and should be addressed to harden behavior.

## Findings

### 1) Medium: Unencoded hash query values can break routing/search
- Problem: Search query values are interpolated directly into `window.location.hash` without URL encoding.
- Risk: Values containing `&`, `?`, `#`, `=` or spaces can break parsing and lead to incorrect tab/query behavior.
- References:
  - `client/src/pages/admin/design-concept.tsx:475`
  - `client/src/pages/admin/design-concept.tsx:491`
  - `client/src/pages/admin/design-concept.tsx:576`
  - `client/src/pages/admin/design-concept.tsx:582`
  - `client/src/pages/admin/design-concept.tsx:592`

### 2) Medium: B2B ID-vs-search dispatch uses heuristic, can misroute
- Problem: `isLikelyEntityId` infers intent from string shape (`length >= 16` and no spaces).
- Risk: Some long search strings can be mistaken as client IDs and route to wrong state.
- References:
  - `client/src/pages/admin/design-concept.tsx:63`
  - `client/src/pages/admin/design-concept.tsx:563`
  - `client/src/pages/admin/design-concept.tsx:564`

### 3) Low: Residual legacy/dead shell logic
- Problem: `hashQuery` is computed but unused; legacy display label for `corp-repairs` remains although routing normalizes to `b2b`.
- Risk: Maintenance ambiguity, future regression risk.
- References:
  - `client/src/pages/admin/design-concept.tsx:164`
  - `client/src/pages/admin/design-concept.tsx:273`
  - `client/src/pages/admin/design-concept.tsx:274`

## Verification Performed
- Static code audit on admin shell, route switching, module guards, B2B workflow paths.
- Type check:
  - Command: `npm run check`
  - Result: Passed (no TypeScript errors)

## Architect Verdict
- No immediate hidden blocking bug surfaced in this review.
- Logical hardening is still recommended for URL encoding and explicit route payload typing.
