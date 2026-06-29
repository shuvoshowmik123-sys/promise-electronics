# Task: Decoupling Admin and Corporate Portals (v2 Plan)

- [x] Documentation Cleanup [/]
    - [x] Deleted irrelevant `.md` files
- [ ] Backend: Update Session and Middleware [/]
    - [ ] Update `auth.ts` with `corporateUserId`
    - [ ] Implement `corporateSessionManager` utility
    - [ ] Add `corporate-auth.routes.ts`
    - [ ] Implement CSRF protection for corporate endpoints
- [ ] Frontend: Create Corporate Auth Context [/]
    - [ ] Implement `CorporateAuthContext.tsx`
- [ ] Frontend: Integration [/]
    - [ ] Update `App.tsx` providers
    - [ ] Update `CorporateLayoutShell.tsx` to use `useCorporateAuth`
    - [ ] Update `CorporateLoginPage` to use `useCorporateAuth`
- [ ] Verification [/]
    - [ ] Test session isolation (Admin vs Corporate)
    - [ ] Verify subdomain readiness
    - [ ] Manual security audit (cookie check)
