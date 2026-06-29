# Portal Separation Implementation Plan v2

## Goals
Ensure **complete separation** between Admin and Corporate portals to:
- Prevent session leakage (critical security)
- Enable future hosting on separate subdomains
- Eliminate "Access Denied" screens through proper isolation

## Proposed Changes (Original + Enhancements)

### [Backend] Authentication Middleware
#### [MODIFY] `server/routes/middleware/auth.ts`
- Extend `SessionData` interface:
  ```typescript
  interface SessionData {
    userId?: string;
    corporateUserId?: string;  // NEW
    roles?: string[];         // ENHANCED: For RBAC
  }
  ```
- Implement `requireCorporateAuth` middleware:
  - Checks `req.session.corporateUserId`
  - Validates corporate user roles (RBAC: admin > manager > basic)
  - **NEW: CSRF protection** - Generate/validate tokens for state-changing endpoints
- Ensure Corporate users **cannot** access Admin APIs (explicit deny-list)

### [Backend] Authentication Routes
#### [NEW] `server/routes/corporate-auth.routes.ts`
- Endpoints:
  | Method | Path                  | Description                  |
  |--------|-----------------------|------------------------------|
  | POST   | `/api/corporate/login`| Sets `req.session.corporateUserId` |
  | POST   | `/api/corporate/logout` | Clears corporate session only |
  | GET    | `/api/corporate/me`   | Returns corporate user profile |

### [Backend] Session Management (Recommended Enhancement)
#### [NEW] `server/utils/sessionManager.ts`
```typescript
// Dedicated manager for cleaner separation
export const corporateSessionManager = {
  create: (userId: string, roles: string[]) => { /* impl */ },
  validate: (session: SessionData) => !!session.corporateUserId,
  destroyCorporate: (req: Request) => { /* clear only corporate */ }
};
```
*Benefits: Easier auditing, no session pollution*

### [Frontend] Authentication Context
#### [NEW] `client/src/contexts/CorporateAuthContext.tsx`
- Independent React Context for corporate session state
- Uses `/api/corporate/*` endpoints exclusively
- Auto-redirects on invalid sessions

### [Frontend] App Entry Point
#### [MODIFY] `client/src/App.tsx`
```tsx
// Wrap CorporateRouter with CorporateAuthProvider only
<CorporateAuthProvider>
  <CorporateRouter />
</CorporateAuthProvider>
<AdminAuthProvider>  {/* Admin routes only */}
  <AdminRouter />
</AdminAuthProvider>
```

### [Frontend] Layout & Pages
#### [MODIFY] `client/src/components/layout/CorporateLayoutShell.tsx`
- Replace `useAdminAuth` → `useCorporateAuth`
#### [MODIFY] `client/src/pages/corporate/login.tsx`
- Update form submission to corporate auth endpoints

## Enhanced Verification Plan

### Automated Tests
- **Unit Tests (Jest)**:
  - Session isolation: Admin login → Corporate API → 401
  - Corporate login → Admin API → 401
  - Logout one portal → other persists
  - CSRF token validation fails without token
- **E2E Tests (Playwright/Cypress)**:
  ```
  test('session isolation', async () => {
    // Admin → Corporate redirect
    // Corporate → Admin redirect
    // Concurrent sessions persist
  });
  ```
- **Load Testing (Artillery)**:
  ```
  config:
    target: 'http://localhost:3000'
    phases:
      - duration: 60
        arrivalRate: 50  # 500 concurrent corporate users
  ```

### Manual/Penetration Testing
1. Log Admin → Visit Corporate → Redirect to corporate login
2. Log Corporate → Visit Admin → Redirect to admin login
3. Simultaneous logins → Verify independence
4. **Penetration**: OWASP ZAP scan for session fixation/CSRF
5. Verify no shared cookies between portals

## Deployment Strategy
1. **Pre-Deployment**:
   - Run session purge:
     ```bash
     node scripts/purge-hybrid-sessions.js
     ```
   - Backup current sessions (optional rollback)

2. **Canary Release**:
   - Deploy to 20% corporate users (feature flag)
   - Monitor 24h: session errors, login failures

3. **Full Rollout**:
   - After validation, deploy everywhere
   - Update DNS for subdomain support (future)

4. **Rollback Plan**:
   - Revert auth middleware changes
   - Restore sessions from backup

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Existing hybrid sessions | Purge script + user notification |
| CSRF in legacy endpoints | Token enforcement |
| Role confusion | RBAC validation in middleware |
| Deployment downtime | Blue-green deployment |

This v2 plan strengthens security, adds robust testing, and provides safe deployment guidance while preserving original structure.