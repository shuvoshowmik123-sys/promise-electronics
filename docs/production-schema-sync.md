# Production Schema Sync

Vercel only runs `npm run build`. It does not apply database schema changes during deploy.

## Pre-deploy

1. Set `DATABASE_URL` to the production database.
2. Run `npm run schema:check:prod`.
3. If any columns are missing, apply `migrations/0004_prod_schema_sync.sql` to production before redeploying.

Example:

```bash
psql "$DATABASE_URL" -f migrations/0004_prod_schema_sync.sql
```

## Deploy order

1. Apply the SQL migration to production.
2. Deploy the application code.
3. Verify these endpoints return `200` in production:
   `/api/admin/dashboard`
   `/api/admin/job-overview`
   `/api/service-requests`
   `/api/job-tickets`
   `/api/analytics/dashboard`
   `/api/admin/notifications`
   `/api/admin/notifications/unread-count`

## Why this exists

The admin dashboard now includes a legacy-schema fallback for partially migrated databases, but the fallback is a recovery layer. The production database should still be brought forward to the current schema after the app is stable.
