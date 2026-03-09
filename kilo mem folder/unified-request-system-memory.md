# Kilo Memory: Unified Request System - Anti-Fraud & Security Architecture

> **Created:** 2026-02-06  
> **Task:** Analyze "Get a Quote" and "Submit a Repair" features, design a unified system with anti-fraud/security  
> **Status:** Plan complete, awaiting user approval for implementation  
> **Full Plan File:** `plans/unified-request-system-plan.md`

---

## Context & Goal

The customer portal has two features that do similar work:
1. **Get a Quote** - Customer describes their TV problem, gets a price estimate
2. **Submit a Repair** - Customer submits a full repair request

Both store data in the same `service_requests` table but use separate frontend pages, separate API endpoints, and have inconsistent security. The goal is to **unify them** into a shared system that is **anti-fraud, secure, and impenetrable**.

---

## Files Analyzed

### Frontend (Client)
| File | Purpose | Lines |
|------|---------|-------|
| `client/src/pages/get-quote.tsx` | Get a Quote page - 3-step wizard | 710 lines |
| `client/src/pages/repair-request.tsx` | Submit a Repair page - 5-step wizard | 1046 lines |
| `client/src/lib/api.ts` | API client - `quoteRequestsApi` and `serviceRequestsApi` | ~870 lines |
| `client/src/contexts/CustomerAuthContext.tsx` | Customer auth state management | ~150 lines |

### Backend (Server)
| File | Purpose | Lines |
|------|---------|-------|
| `server/routes/quotes.routes.ts` | Quote API routes | 324 lines |
| `server/routes/service-requests.routes.ts` | Service request API routes | 525 lines |
| `server/routes/middleware/auth.ts` | Auth middleware (admin + customer) | 266 lines |
| `server/routes/middleware/rate-limit.ts` | Rate limiting middleware | 115 lines |

### Shared
| File | Purpose | Lines |
|------|---------|-------|
| `shared/schema.ts` (lines 526-650) | Database schema + Zod validation | ~125 lines relevant |

---

## Key Findings

### How They Currently Work

**Get a Quote (`get-quote.tsx`):**
- 3-step wizard: Device Info → Contact → Complete
- Collects: service type, brand, screen size, model number, primary issue, description, name, phone, service preference, address
- API: `POST /api/quotes` → Creates `service_request` with `isQuote: true`, `requestIntent: 'quote'`
- No rate limiting, no auth required, no CAPTCHA, no OTP

**Submit a Repair (`repair-request.tsx`):**
- 5-step wizard: Device Info → Problem → Contact → Account → Done
- Collects: brand, screen size, model number, primary issue, symptoms, description, media uploads, name, phone, address, service preference, scheduled visit date, password
- API: `POST /api/service-requests` → Creates `service_request` with `requestIntent: 'repair'`
- Has rate limiter (10/hour/IP), can create customer account inline, supports ImageKit media upload

**Both share the same `service_requests` database table** differentiated by `isQuote` boolean and `requestIntent` field.

### Database Schema (service_requests table)
Key fields: `id`, `ticketNumber`, `customerId`, `brand`, `screenSize`, `modelNumber`, `primaryIssue`, `symptoms`, `description`, `mediaUrls`, `customerName`, `phone`, `address`, `servicePreference`, `status`, `trackingStatus`, `requestIntent`, `serviceMode`, `stage`, `isQuote`, `serviceId`, `quoteStatus`, `quoteAmount`, `quoteNotes`, `quotedAt`, `quoteExpiresAt`, `acceptedAt`, `pickupTier`, `pickupCost`, `totalAmount`, `scheduledPickupDate`, `expectedPickupDate`, `expectedReturnDate`, `expectedReadyDate`, `intakeLocation`, `physicalCondition`, `customerSignatureUrl`, `proofOfPurchase`, `warrantyStatus`, `agreedToPickup`, `pickupAgreedAt`

---

## Critical Security Vulnerabilities Discovered

### 🔴 CRITICAL (Exploitable Now)

1. **`DELETE /api/service-requests/:id`** - NO authentication middleware! Any anonymous user can delete any service request by ID.
   - File: `server/routes/service-requests.routes.ts` line 283
   
2. **`PATCH /api/service-requests/:id`** - NO authentication middleware! Any anonymous user can modify any service request.
   - File: `server/routes/service-requests.routes.ts` line 116
   
3. **`GET /api/service-requests`** - NO authentication! Returns ALL service requests with full customer PII (names, phones, addresses).
   - File: `server/routes/service-requests.routes.ts` line 24
   
4. **`GET /api/service-requests/:id`** - NO authentication! Any request details fetchable by anyone who knows/guesses the ID.
   - File: `server/routes/service-requests.routes.ts` line 45

5. **`POST /api/quotes`** - NO rate limiting at all! Unlimited spam submissions possible.
   - File: `server/routes/quotes.routes.ts` line 22

### 🟡 HIGH (Should Fix Soon)

6. **No phone verification (OTP)** - Fake phone numbers can be submitted freely on both forms
7. **No CAPTCHA/bot protection** - Automated bot attacks are trivial
8. **No input sanitization** - XSS possible via description, address, and other text fields
9. **No CSRF tokens** on public POST endpoints
10. **No phone format validation** against Bangladesh telecom patterns (01[3-9]XXXXXXXX)
11. **No duplicate detection** - Same person can submit infinite identical requests
12. **No fraud detection** - No signals collected, no scoring, no blocking

---

## Proposed Solution: 7-Layer Anti-Fraud Defense

### Layer 1: Client-Side Bot Detection
- **Honeypot fields** (invisible form fields bots fill)
- **Browser fingerprinting** (canvas, WebGL, screen, timezone, etc.)
- **Behavioral analysis** (mouse movement, keystrokes, time on form)

### Layer 2: CAPTCHA Protection
- **Cloudflare Turnstile** (free, invisible mode, privacy-friendly)
- Always on for unauthenticated users
- Skip for authenticated + verified customers

### Layer 3: Phone OTP Verification
- 6-digit code via SMS (SSL Wireless / BulkSMS BD)
- 5-minute expiry, max 3 attempts per code
- Max 5 OTP requests per phone per hour
- Store OTP hash (not plaintext)

### Layer 4: Server-Side Rate Limiting
- `POST /api/requests`: 5/hour per IP, 3/hour per phone
- `POST /api/otp/send`: 5/hour per phone
- All read/write endpoints: require admin auth

### Layer 5: Fraud Scoring Engine (0-100)
- +30 honeypot triggered
- +25 form completed < 10 seconds
- +20 no mouse/touch events
- +15 known VPN/proxy IP
- +15 previously flagged phone
- +10 duplicate within 24 hours
- Actions: 0-20 accept, 21-40 flag, 41-60 require extra verification, 61+ block

### Layer 6: Duplicate Detection
- Same phone + brand + issue within 48h = duplicate
- Same phone + any request within 2h = rate limited
- Same fingerprint + issue within 24h = suspicious
- Same IP + 3+ different phones in 1h = fraud ring

### Layer 7: Data Integrity & Tamper Protection
- HMAC-SHA256 request signing
- Server validates integrity hash before processing

---

## Proposed Database Changes

### New Tables
1. **`request_security_metadata`** - Stores fingerprint, IP, fraud score, behavioral signals, verification status per request
2. **`otp_codes`** - Stores hashed OTP codes with expiry and attempt tracking
3. **`fraud_blocklist`** - Stores blocked phones, IPs, fingerprints with reasons and expiry

### New Columns on `service_requests`
- `phone_verified` (boolean)
- `submission_source` (text: 'web' | 'mobile' | 'admin')
- `fraud_score` (integer)
- `flagged_for_review` (boolean)

---

## Proposed Frontend Architecture

Shared components in `client/src/components/request/`:
- `UnifiedRequestWizard.tsx` - Config-driven wizard orchestrator
- `steps/DeviceInfoStep.tsx` - Brand, model, screen size
- `steps/ProblemDescriptionStep.tsx` - Issue, symptoms, description, media
- `steps/ContactInfoStep.tsx` - Name, phone+OTP, address, preference
- `steps/ReviewAndConfirmStep.tsx` - Summary + CAPTCHA + terms
- `steps/SuccessStep.tsx` - Confirmation with ticket
- `security/CaptchaWidget.tsx` - Turnstile wrapper
- `security/OtpVerification.tsx` - Phone OTP modal
- `security/FingerprintCollector.tsx` - Browser fingerprint
- `security/HoneypotFields.tsx` - Hidden bot trap

Config-driven: Both pages use same components with different `WizardConfig`:
- `QUOTE_CONFIG` - Fewer steps, no media upload, no account creation
- `REPAIR_CONFIG` - Full steps, media upload, symptom picker, account creation

---

## Proposed API Changes

### New Unified Endpoint
- `POST /api/requests` - Replaces both `POST /api/quotes` and `POST /api/service-requests`
- Full security pipeline: Rate Limit → Honeypot → Blocklist → CAPTCHA → Phone Validation → OTP → Duplicate Detection → Fraud Scoring → Create Request

### Secured Existing Endpoints
- `GET /api/service-requests` → `requireAdminAuth`
- `GET /api/service-requests/:id` → `requireAdminAuth` OR ownership check
- `PATCH /api/service-requests/:id` → `requireAdminAuth`
- `DELETE /api/service-requests/:id` → `requireAdminAuth` + `requirePermission('canDelete')`

### New Public Endpoints
- `GET /api/track/:ticketNumber` - Safe public tracking (limited fields)
- `POST /api/otp/send` - Send OTP (rate limited)
- `POST /api/otp/verify` - Verify OTP (rate limited)

---

## Implementation Phases

| Phase | Focus | Items |
|-------|-------|-------|
| 1 | **Critical Security Fixes** | Auth on all endpoints, rate limit quotes, input sanitization, safe tracking endpoint |
| 2 | **Phone OTP System** | OTP table, generation service, SMS integration, verify endpoint, React component |
| 3 | **CAPTCHA Integration** | Cloudflare Turnstile setup, widget component, server validation |
| 4 | **Anti-Fraud Engine** | Security metadata table, fraud scoring, honeypots, fingerprinting, behavioral analysis, blocklist, duplicate detection |
| 5 | **Unified Frontend** | Shared types, hooks, step components, wizard orchestrator, refactor both pages |
| 6 | **Unified API** | New `/api/requests` endpoint, deprecate old endpoints, request signing |
| 7 | **Monitoring & Alerting** | Fraud logging, admin notifications, analytics dashboard widget |

---

## Technology Choices

| Need | Solution | Reason |
|------|----------|--------|
| CAPTCHA | Cloudflare Turnstile | Free, invisible, privacy-friendly |
| OTP SMS | SSL Wireless / BulkSMS BD | Bangladesh-focused, reliable |
| Fingerprinting | @fingerprintjs/fingerprintjs | Open-source, no API key for basic |
| Input Sanitization | DOMPurify | Industry standard XSS prevention |
| Rate Limiting | express-rate-limit | Already in codebase |
| Fraud Scoring | Custom in-house | Simple logic, no external dependency |
| Request Hashing | Node.js crypto HMAC-SHA256 | Built-in, zero dependency |

---

## Discussion Notes

- User's primary concern: make the system **"unbreakable, unpenetrable, and anti-fraud"**
- Both features must produce the same outcome (service request in DB) but through properly secured, unified pathways
- The system must be practical for a Bangladesh-based TV repair business (phone-centric, SMS-based verification)
- Phase 1 (critical security fixes) should be implemented immediately as the current system has exploitable vulnerabilities
