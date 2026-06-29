# Backend Playbook

## Module Structure

New backend domains should follow this pattern:

```
server/modules/<domain>/
  <domain>.routes.ts       — thin route definitions, middleware chain
  <domain>.service.ts      — business logic, orchestration
  <domain>.repository.ts   — SQL/Drizzle queries
  <domain>.validators.ts   — Zod schemas for request bodies
  <domain>.permissions.ts  — granular permission keys used
  <domain>.types.ts        — TypeScript interfaces
```

Existing code lives in `server/routes/`, `server/services/`, `server/repositories/`. New features may use either structure. Do not bulk-migrate existing code.

## Route Files

Routes must be thin. A route handler should:
1. Validate input (Zod or manual checks).
2. Call a service function.
3. Return the result or error.

Do not put business logic in route handlers. No raw SQL in routes — use repositories.

## Middleware Chain

Every admin mutation route must include:
```
requireAdminAuth, requireGranularPermission('module.action'), handler
```

Use `requireGranularPermission` for new routes. Use `requirePermission` only for existing routes that haven't been migrated. Never leave POST/PATCH/DELETE routes with only `requireAdminAuth`.

## Imports

All `.ts` imports use `.js` extension (ESM convention):
```typescript
import { storage } from '../storage.js';
import { PERMISSION_CATALOG } from '../../shared/permission-catalog.js';
```

## SQL / Drizzle

- Use `db.execute(sql`...`)` for raw queries.
- Use Drizzle query builder for typed operations.
- DDL (CREATE TABLE, ALTER TABLE) must be idempotent (`IF NOT EXISTS`).
- DDL runs at server startup in migration functions.
- Main DB uses `DATABASE_URL` (Aiven PostgreSQL).
- Brain DB uses `BRAIN_DATABASE_URL` (Neon) — only in `server/brain/`.

## Audit Logging

State-changing operations must log via `auditLogger`:
```typescript
await auditLogger.log({
    userId: req.session.adminUserId!,
    action: "ACTION_NAME",
    entity: "EntityName",
    entityId: targetId,
    details: "What changed",
    req,
}).catch(() => {});
```

Use fire-and-forget (`.catch(() => {})`) — audit failure must not block the operation.

## Data Safety

Never return in API responses:
- `password`, `passwordHash`
- `temporaryPassword`, `resetSecret`
- `otpSecret`, `codeHash`
- `tokenHash` (invite tokens)

Customer/corporate routes must be ownership-scoped — a customer can only see their own data.

## Permission System

Source of truth: `shared/permission-catalog.ts`

- 67 granular permissions across 20 modules
- `requireGranularPermission(key)` checks: wildcard → direct → legacy compatibility
- Blocked invite permissions: `settings.manage`, `users.inviteStaff`, `users.editPermissions`, `users.deactivate`
- Super Admin gets wildcard `*` — always passes all checks

## Error Responses

Use consistent format:
```json
{ "error": "Human-readable message" }
```

Use 400 for validation errors, 401 for auth, 403 for permissions, 404 for not found, 500 for server errors. Do not expose stack traces or internal paths.

## Phone Normalization

Always use `normalizePhone()` from `server/utils/phone.ts` when storing phone numbers. Store both `phone` (raw) and `phoneNormalized` (last 10 digits).
