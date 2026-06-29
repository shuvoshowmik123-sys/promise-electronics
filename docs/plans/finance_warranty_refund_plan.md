# Finance, Warranty & Refund System - Full Plan

## Overview

Three interconnected systems with **strict audit trails** and **role-based approvals**.

---

## Part 1: Finance Module Enhancements

### Changes to `finance.tsx`
1. Add **Date Range Picker** (Start/End date) to all 3 tabs
2. Add **Export CSV** button for filtered data
3. Add **Print Report** button (formatted summary)
4. Add **Pagination** (20 records per page)

### Files to Modify
- `client/src/pages/admin/finance.tsx`
- `client/src/lib/api.ts` (add date params)
- `server/routes/pos.routes.ts` (add date filtering)

---

## Part 2: Warranty Claims System

### Schema Addition (`warranty_claims` table)
```sql
CREATE TABLE warranty_claims (
  id TEXT PRIMARY KEY,
  original_job_id TEXT NOT NULL,       -- Original repair job
  new_job_id TEXT,                     -- New warranty job created
  customer TEXT NOT NULL,
  customer_phone TEXT,
  claim_type TEXT NOT NULL,            -- 'service' | 'parts'
  claim_reason TEXT NOT NULL,
  warranty_valid BOOLEAN NOT NULL,     -- Was it within warranty?
  
  -- Audit Trail
  claimed_by TEXT NOT NULL,            -- Staff who received claim
  claimed_by_role TEXT NOT NULL,       -- 'Technician' | 'Manager' | 'Admin'
  claimed_at TIMESTAMP DEFAULT NOW(),
  
  approved_by TEXT,                    -- Manager who approved
  approved_by_role TEXT,
  approved_at TIMESTAMP,
  
  status TEXT DEFAULT 'pending',       -- 'pending' | 'approved' | 'rejected' | 'completed'
  rejection_reason TEXT,
  notes TEXT
);
```

### Role-Based Flow

| Action | Technician | Manager | Super Admin |
|--------|------------|---------|-------------|
| Receive claim | ✅ | ✅ | ✅ |
| Approve claim | ❌ | ✅ | ✅ |
| Reject claim | ❌ | ✅ | ✅ |
| Override expired warranty | ❌ | ❌ | ✅ |

### UI Location
New tab: **Jobs → Warranty Claims**

### Features
1. **Search by Phone/Job ID** → Auto-pull original job
2. **Warranty Status Check** → Green (valid) / Red (expired)
3. **Create Claim** → Records who created it
4. **Approval Queue** → Managers see pending claims
5. **Auto-Link Jobs** → New job linked via `parentJobId`

---

## Part 3: Refund Management System

### Schema Addition (`refunds` table)
```sql
CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- 'job' | 'pos' | 'warranty'
  reference_id TEXT NOT NULL,          -- job_id or transaction_id
  customer TEXT NOT NULL,
  customer_phone TEXT,
  
  original_amount REAL NOT NULL,
  refund_amount REAL NOT NULL,
  refund_method TEXT,                  -- 'cash' | 'bank' | 'bkash' | 'adjustment'
  reason TEXT NOT NULL,
  
  -- Audit Trail (3-step)
  requested_by TEXT NOT NULL,          -- Staff who initiated
  requested_by_role TEXT NOT NULL,
  requested_at TIMESTAMP DEFAULT NOW(),
  
  approved_by TEXT,                    -- Manager who approved
  approved_by_role TEXT,
  approved_at TIMESTAMP,
  
  processed_by TEXT,                   -- Who gave the money
  processed_by_role TEXT,
  processed_at TIMESTAMP,
  
  status TEXT DEFAULT 'pending',       -- 'pending' | 'approved' | 'rejected' | 'processed'
  rejection_reason TEXT,
  notes TEXT
);
```

### Role-Based Flow

| Action | Technician | Manager | Super Admin |
|--------|------------|---------|-------------|
| Request refund | ✅ | ✅ | ✅ |
| Approve ≤ ৳2,000 | ❌ | ✅ | ✅ |
| Approve > ৳2,000 | ❌ | ❌ | ✅ |
| Process (disburse) | ❌ | ✅ | ✅ |

### UI Location
New tab: **Finance → Refunds**

### Features
1. **Request Refund** from Job Details or POS Transaction
2. **Pending Queue** for Managers
3. **Amount Threshold** alerts (>৳2,000 needs Super Admin)
4. **Auto Petty Cash Entry** on processing
5. **Full Audit Log** visible on each refund

---

## Implementation Order

| Phase | Task | Estimated |
|-------|------|-----------|
| 1 | Finance date filters + export | 2-3 hours |
| 2 | `warranty_claims` table + API | 1 hour |
| 3 | Warranty Claims UI | 2 hours |
| 4 | `refunds` table + API | 1 hour |
| 5 | Refunds UI + approval flow | 2-3 hours |

---

## User Confirmation Needed

> [!IMPORTANT]
> Before implementation, please confirm:

1. **Refund threshold**: Is ৳2,000 the right amount for Super Admin approval?
2. **Warranty override**: Can Super Admin approve claims even if warranty expired?
3. **Location**: Warranty Claims as tab in Jobs page, and Refunds as tab in Finance page?
