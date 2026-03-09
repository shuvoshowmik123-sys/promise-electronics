# 002 Session-Based Authentication

**Status**: Accepted

**Date**: 2026-03-01

## Context

The application supports multiple authentication flows (Admin, Customer, Corporate). We need a secure mechanism to maintain authentication state. A common modern alternative is JSON Web Tokens (JWT) stored in LocalStorage or Cookies. The current implementation relies on server-side sessions via `express-session`.

## Decision

We will continue using **Session-Cookie Authentication** with state stored server-side (in PostgreSQL via `connect-pg-simple` in production, memory in dev) rather than migrating to stateless JWTs.

CSRF protection (Double Submit Cookie) will be implemented as a mandatory layer alongside the session cookie for mutually distrustful endpoints (like Corporate Portal state-changing mutations).

## Consequences

**Positive:**
- Immediate and exact session revocation (crucial for admin accounts).
- Zero risk of XSS token theft (cookies are `HttpOnly`).
- Reduced payload size since session data is kept server-side.

**Negative:**
- Server must query the session store for every request.
- Cross-domain authentication (if we ever split frontend and backend dramatically onto completely separate TLDs) requires careful CORS and cookie domain configurations.
- Requires explicit CSRF mitigations for API endpoints.
