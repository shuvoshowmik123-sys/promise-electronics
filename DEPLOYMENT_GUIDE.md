# Organization ID Implementation - Deployment Guide

## Overview
This deployment guide walks you through the process of implementing the organization ID system that displays human-readable short codes instead of random UUIDs in the customer portal profile page.

## Prerequisites

- PostgreSQL database running
- Node.js environment
- Database access credentials
- Deployment access to both frontend and backend

## Step 1: Run Database Migration

### 1.1 Apply Migration
```bash
# Navigate to the project root
cd /path/to/PromiseIntegratedSystem

# Run the migration
psql -d your_database_name -f migrations/0002_add_corporate_client_shortcodes.sql
```

### 1.2 Verify Migration
```bash
# Check if migration was successful
psql -d your_database_name -c "SELECT COUNT(*) FROM corporate_clients WHERE shortCode IS NOT NULL;"
```

### 1.3 Expected Results
- Existing corporate clients should have short codes populated
- Format: `[COMPANY_PREFIX]-[SEQUENTIAL_NUMBER]` (e.g., "ABC-001")
- Short codes are unique across all corporate clients

## Step 2: Backend Deployment

### 2.1 Update Backend Files
Deploy the updated backend files:
- `server/routes/corporate-auth.routes.ts`

### 2.2 Restart Backend Server
```bash
# If using PM2
pm2 restart your-app-name

# If using systemd
sudo systemctl restart your-app-name

# If using Docker
docker-compose restart api
```

### 2.3 Verify Backend
```bash
# Check logs for any errors
tail -f /var/log/your-app-name.log

# Or if using PM2
pm2 logs your-app-name
```

## Step 3: Frontend Deployment

### 3.1 Update Frontend Files
Deploy the updated frontend files:
- `client/src/contexts/CorporateAuthContext.tsx`
- `client/src/pages/corporate/profile.tsx`

### 3.2 Rebuild Frontend (if applicable)
```bash
# Build the frontend
npm run build

# Or if using Vite
npm run build
```

### 3.3 Deploy to Production
```bash
# Copy built files to production
rsync -avz dist/ user@server:/path/to/frontend/
```

## Step 4: Verification Testing

### 4.1 Test Corporate Login
1. Access the corporate portal login page
2. Login with corporate user credentials
3. Verify successful authentication

### 4.2 Test Profile Display
1. Navigate to `/corporate/profile`
2. Verify "Organization ID" field displays:
   - Primary: Short code (e.g., "1KF")
   - Fallback: UUID (if no short code)
   - Default: "NOT_ASSIGNED" (if neither exists)

### 4.3 Test Admin Panel
1. Access `/admin/corporate-clients`
2. Create new corporate client with custom short code
3. Verify short code appears in table
4. Verify search functionality works with short code

## Step 5: Rollback Plan

### 5.1 If Issues Occur

#### Option A: Revert Backend
```bash
# Restore previous version of corporate-auth.routes.ts
git checkout HEAD~1 -- server/routes/corporate-auth.routes.ts
pm2 restart your-app-name
```

#### Option B: Revert Frontend
```bash
# Restore previous version
git checkout HEAD~1 -- client/src/contexts/CorporateAuthContext.tsx
git checkout HEAD~1 -- client/src/pages/corporate/profile.tsx
npm run build
rsync -avz dist/ user@server:/path/to/frontend/
```

#### Option C: Database Rollback
```bash
# Remove constraints added by migration
psql -d your_database_name -c "ALTER TABLE corporate_clients DROP CONSTRAINT corporate_clients_shortcode_unique;"
psql -d your_database_name -c "ALTER TABLE corporate_clients DROP CONSTRAINT corporate_clients_shortcode_format;"

# Clear short codes (optional)
psql -d your_database_name -c "UPDATE corporate_clients SET shortCode = NULL;"
```

## Troubleshooting

### Issue 1: Migration Fails
**Symptoms**: Error when running SQL migration

**Solutions**:
1. Check if `shortCode` column already exists
2. Check for duplicate short codes
3. Run migration manually step by step

```bash
# Check current state
psql -d your_database_name -c "\d corporate_clients"
```

### Issue 2: API Returns 500 Error
**Symptoms**: Backend crashes on auth/me or auth/login

**Solutions**:
1. Check backend logs for specific error
2. Verify database connection
3. Ensure `corporate_clients` table exists
4. Check column names in database vs schema

### Issue 3: Profile Page Not Displaying Short Code
**Symptoms**: Still shows UUID instead of short code

**Solutions**:
1. Clear browser cache
2. Check network tab for API response
3. Verify user has `corporateClientId`
4. Check database for corresponding `corporateClients` record

### Issue 4: Short Code Not Unique
**Symptoms**: Migration fails with unique constraint violation

**Solutions**:
1. Check for existing duplicates:
   ```sql
   SELECT shortCode, COUNT(*) 
   FROM corporate_clients 
   GROUP BY shortCode 
   HAVING COUNT(*) > 1;
   ```
2. Manually fix duplicates before migration
3. Or modify migration to handle duplicates differently

## Performance Considerations

### Database Query Impact
- Added LEFT JOIN in `/api/corporate/auth/me`
- Minimal performance impact (one row returned per user)
- Ensure `corporate_clients.id` is indexed (already is - primary key)

### Caching Strategy
- Consider caching corporate client data
- Use Redis or similar for frequently accessed corporate clients
- Set appropriate cache TTL (e.g., 5-10 minutes)

## Security Considerations

### Short Code Exposure
- Short codes are **public identifiers**, not secrets
- Suitable for display in URLs, emails, and UI
- Do not use for authentication or authorization

### Validation
- Database constraint ensures format (2-10 chars, alphanumeric/hyphen)
- Frontend validation optional but recommended
- Admin panel should validate uniqueness

## Monitoring

### Key Metrics to Monitor
1. **API Response Times**: `/api/corporate/auth/me` and `/api/corporate/auth/login`
2. **Login Success Rate**: Corporate user authentication
3. **Short Code Population**: % of corporate clients with short codes
4. **Error Rates**: API errors, database errors

### Logging
```bash
# Check for errors
grep -i "error\|exception" /var/log/your-app-name.log

# Check API response times
grep "API.*200" /var/log/your-app-name.log | tail -100
```

## Success Criteria

✅ **Deployment Complete** when:
- [ ] Migration runs without errors
- [ ] Backend API responds successfully
- [ ] Corporate users can login
- [ ] Profile page displays short code
- [ ] Admin panel can manage short codes
- [ ] No regression in existing functionality

## Timeline Estimate

| Step | Duration | Notes |
|------|----------|-------|
| Database Migration | 5-10 minutes | Depends on data size |
| Backend Deployment | 10-15 minutes | Including restart |
| Frontend Deployment | 5-10 minutes | Including build |
| Testing | 15-30 minutes | Manual verification |
| **Total** | **35-65 minutes** | Excluding troubleshooting |

## Support

For issues or questions, refer to:
- Implementation Summary: `IMPLEMENTATION_SUMMARY.md`
- Architecture: `plans/organization_id_implementation_plan.md`
- Code: `server/routes/corporate-auth.routes.ts`