# Decoupling Admin and Corporate Portals

The goal is to ensure complete separation between the Admin and Corporate portals. This prevents session leakage (security) and allows for future hosting on separate subdomains.

## Proposed Changes

### [Backend] Authentication Middleware
#### [MODIFY] [auth.ts](file:///d:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/middleware/auth.ts)
- Extend `SessionData` with `corporateUserId`.
- Implement `requireCorporateAuth` middleware checking `req.session.corporateUserId`.
- Ensure `Corporate` users cannot session-hop into Admin APIs.

### [Backend] Authentication Routes
#### [NEW] [corporate-auth.routes.ts](file:///d:/PromiseIntegratedSystem/PromiseIntegratedSystem/server/routes/corporate-auth.routes.ts)
- Create new endpoints:
    - `POST /api/corporate/login`: Sets `req.session.corporateUserId`.
    - `POST /api/corporate/logout`: Clears `req.session.corporateUserId`.
    - `GET /api/corporate/me`: Returns the logged-in corporate user.

### [Frontend] Authentication Context
#### [NEW] [CorporateAuthContext.tsx](file:///d:/PromiseIntegratedSystem/PromiseIntegratedSystem/client/src/contexts/CorporateAuthContext.tsx)
- Independent context managing corporate session state.
- Uses `/api/corporate/*` endpoints.

### [Frontend] App Entry Point
#### [MODIFY] [App.tsx](file:///d:/PromiseIntegratedSystem/PromiseIntegratedSystem/client/src/App.tsx)
- Wrap `CorporateRouter` with `CorporateAuthProvider`.
- Keep `AdminAuthProvider` only for Admin routes.

### [Frontend] Layout & Pages
#### [MODIFY] [CorporateLayoutShell.tsx](file:///d:/PromiseIntegratedSystem/PromiseIntegratedSystem/client/src/components/layout/CorporateLayoutShell.tsx)
- Switch from `useAdminAuth` to `useCorporateAuth`.
#### [MODIFY] [login.tsx](file:///d:/PromiseIntegratedSystem/PromiseIntegratedSystem/client/src/pages/corporate/login.tsx)
- Update login logic to use `useCorporateAuth`.

## Verification Plan

### Automated Tests
- Manual testing of session isolation: 
    1. Log into Admin. Visit `/corporate/dashboard`. Should be redirected to login.
    2. Log into Corporate. Visit `/admin/dashboard`. Should be redirected to login.

### Manual Verification
- Verify that logging out of one portal does not log out the other.
- Confirm that "Access Denied" screens are no longer needed as sessions are fully separate.
