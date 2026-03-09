# Endpoint Access Matrix

This matrix documents the intended and actual state of access control across all primary router groups.

| Route File | Intended Guard | Intended Permissions | Current State | Risk Level |
|---|---|---|---|---|
| **jobs.routes.ts** | `requireAdminAuth` | `jobs` | ❌ Imports auth but does not apply it to any routes. | CRITICAL |
| **inventory.routes.ts** | `requireAdminAuth` | `inventory` | ❌ Imports auth but does not apply it to any routes. | CRITICAL |
| **corporate.routes.ts** | `requireAdminAuth` | `corporate` | ⚠️ Inconsistent manual checks. | HIGH |
| **settings.routes.ts** | `requireAdminAuth` | `settings` | ✅ Applied per-route. | OK |
| **chalans.routes.ts** | `requireAdminAuth` | `challans` | ❌ Needs verification, likely unprotected mutations. | HIGH |
| **corporate-portal.routes.ts**| `requireCorporateAuth` | Client-scoped | ✅ Applied globally via `router.use`. | OK |
| **customer.routes.ts** | `requireCustomerAuth` | User-scoped | ✅ Applied per-route for mutations. | OK |
| **modules.routes.ts** | `requireAdminAuth` (mutations) | `Super Admin` | ✅ Public reads, protected writes. | OK |
| **auth.routes.ts** | Custom / Public | - | ✅ Handled securely with rate limiting. | OK |
| **public.routes.ts** | Public | - | ✅ Expected public access. | OK |

## Action Items (Phase 1.2)
- [ ] Apply `requireAdminAuth` and `requirePermission('jobs')` to all POST/PUT/PATCH/DELETE routes in `jobs.routes.ts`
- [ ] Apply `requireAdminAuth` and `requirePermission('inventory')` to all POST/PUT/PATCH/DELETE routes in `inventory.routes.ts`
- [ ] Apply `requireAdminAuth` and `requirePermission('corporate')` to all POST/PUT/PATCH/DELETE routes in `corporate.routes.ts`
- [ ] Audit and fix remaining admin mutation routes (e.g. `chalans.routes.ts`).
