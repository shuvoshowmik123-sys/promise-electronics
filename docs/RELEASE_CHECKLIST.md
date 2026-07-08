# Release Checklist

**Master release gate:** `docs/AI_AGENT_OPERATING_RULES.md` Section 17. If this checklist conflicts with the master, the master wins.

## Pre-Deploy

### Environment
- [ ] `NODE_ENV=production` is set on server
- [ ] `DATABASE_URL` points to production Aiven PostgreSQL
- [ ] `BRAIN_DATABASE_URL` points to production Neon (if AI features enabled)
- [ ] `VITE_*` env vars are set for frontend build
- [ ] Firebase service account is available (base64 env or file)
- [ ] ImageKit credentials configured
- [ ] Session secret is a strong random string (not default)

### Build
- [ ] `npx tsc --noEmit --pretty false` — passes
- [ ] `npx vite build --mode production` — passes
- [ ] No `console.log` in client code (except error boundaries)
- [ ] `.env` and credential files are NOT in git

### Database
- [ ] Production database backup exists (< 1 hour old)
- [ ] Migrations are idempotent (IF NOT EXISTS) — safe to re-run
- [ ] No destructive ALTER TABLE (DROP COLUMN) in pending migrations
- [ ] `staff_invitations` table exists (Phase 15)
- [ ] `password_changed_at` column exists on `users` (Phase 15)

## Role Smoke Tests

### Super Admin
- [ ] Login → lands on dashboard
- [ ] Can access all sidebar tabs
- [ ] Can open Users tab → Coverage Health visible
- [ ] Can create setup link via Invite Wizard
- [ ] Can open Edit Access (Permission Designer) for a staff member
- [ ] Can access System Settings
- [ ] Can access Account Settings (My Account)

### Manager
- [ ] Login → lands on dashboard
- [ ] Can see Jobs, Service Requests, Pickups, Finance
- [ ] Cannot see System Settings or Users tab
- [ ] Can process POS payment
- [ ] Can assign technician to job

### Technician
- [ ] Login → lands on /admin#technician
- [ ] Can see assigned jobs
- [ ] Can report repair outcome
- [ ] Cannot access admin sidebar tabs

### Driver
- [ ] Login → lands on /admin#pickup
- [ ] Can see today's pickup tasks
- [ ] Cannot see Jobs, POS, Finance, Users
- [ ] Can access My Account

### Cashier
- [ ] Login → lands on /admin#pos
- [ ] Can process POS payment
- [ ] Can view inventory
- [ ] Cannot access Users, System Settings

### Customer
- [ ] Can submit repair request
- [ ] Can view My Repairs with device names
- [ ] Can see repair journey timeline
- [ ] Can respond to quotes

## Core Flow Checks

- [ ] Service Request → Quote → Accept → Job created
- [ ] Job → Assign Technician → Report Outcome → Advance Status
- [ ] Pickup scheduled → Driver assigned → OTP handover
- [ ] POS sale → Payment recorded → Receipt generated
- [ ] Staff invite → Setup link → Account created → First login guide
- [ ] Permission Designer → Save → User permissions updated
- [ ] Password change → Old password rejected → New password works
- [ ] Customer repair journey events sync correctly

## Security Checks

- [ ] Driver cannot access `/api/settings` (403)
- [ ] Driver cannot access `/api/admin/staff-invites` (403)
- [ ] Malicious permission injection stripped on invite creation
- [ ] `tokenHash` not exposed in staff invite list API
- [ ] Password hashes never returned in any API response

## Post-Deploy

### Deployed Commit Verification
- [ ] Local commit is pushed to remote (`git log --oneline origin/main..HEAD` is empty)
- [ ] Render backend deployed commit hash includes the signed-off fix
- [ ] Vercel frontend deployed commit hash includes the signed-off fix
- [ ] Production domain is not running an older bundle
- [ ] `git status --short` is clean (except explicitly ignored local-only folders)
- [ ] No untracked source file is required by imported code
- [ ] Secret scan: PASS / MANUAL PASS / SECRET FOUND (see master Section 9)

### Health Checks

- [ ] Server starts without migration errors
- [ ] Health endpoint returns 200: `GET /api/health`
- [ ] Super Admin can login
- [ ] No 500 errors in first 5 minutes of server logs
- [ ] Customer portal loads correctly
- [ ] Corporate portal loads correctly (if enabled)

## Rollback Plan

If critical issues found:
1. Revert to previous commit: `git revert HEAD`
2. Redeploy previous build
3. Database: no destructive migrations — rollback is safe
4. Session: users may need to re-login after rollback

## Known Limitations

- Coverage endpoint fetches up to 200 users (sufficient for small/medium shops)
- No real-time session invalidation on permission change (user must re-login)
- Browser-act cannot screenshot React portal content
- Legacy users keep broad permissions until individually migrated via Permission Designer
- First-login guide only shows for invite-created users (not manually created)
