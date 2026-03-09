# Workflow QA Test Matrix

## Overview
This document outlines the comprehensive QA test plan for the Manager → Technician → Cashier workflow enhancements implemented in Phases 1-4.

## Test Environment Setup

### Prerequisites
- Database reset with latest schema
- Test users created:
  - Super Admin (full access)
  - Manager (triage, assignment, view all)
  - Technician (assigned jobs only)
  - Cashier (payment processing, billing)

### Test Data
- 10+ Service Requests in various stages
- 5+ Job Tickets (assigned and unassigned)
- Mix of payment statuses (unpaid, partial, paid, written_off)

---

## Phase 1: Database Foundation & RBAC

### Test 1.1: RBAC Permissions
**Objective:** Verify role-based access control

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC1.1.1 | Login as Cashier, attempt to access `/api/admin/users` | 403 Forbidden | ⬜ |
| TC1.1.2 | Login as Technician, attempt to create job | 403 Forbidden | ⬜ |
| TC1.1.3 | Login as Manager, verify can access triage | 200 OK | ⬜ |
| TC1.1.4 | Login as Cashier, verify can access POS | 200 OK | ⬜ |
| TC1.1.5 | Login as Cashier, verify can access finance routes | 200 OK (with finance permission) | ⬜ |

### Test 1.2: Database Schema
**Objective:** Verify new tables and fields exist

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC1.2.1 | Query `corporate_clients` table | Table exists with correct schema | ⬜ |
| TC1.2.2 | Query `corporate_challans` table | Table exists with correct schema | ⬜ |
| TC1.2.3 | Query `corporate_bills` table | Table exists with correct schema | ⬜ |
| TC1.2.4 | Check `service_requests.proof_of_purchase` | Field exists | ⬜ |
| TC1.2.5 | Check `users.skills` (JSONB) | Field exists and accepts JSON | ⬜ |

---

## Phase 2: Manager Workflow (Service Request Triage)

### Test 2.1: Service Request Triage
**Objective:** Verify Manager can verify and convert service requests

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC2.1.1 | Manager views pending service requests | List shows only unconverted requests | ⬜ |
| TC2.1.2 | Manager clicks "Verify & Convert" | Modal opens with request details | ⬜ |
| TC2.1.3 | Manager adds verification notes and converts | Job ticket created, service request status = "Converted" | ⬜ |
| TC2.1.4 | Verify converted request no longer appears in triage | Request filtered out | ⬜ |
| TC2.1.5 | Attempt to convert already-converted request | Error: "Already converted" | ⬜ |
| TC2.1.6 | Verify audit log created | Audit entry with action "VERIFY_AND_CONVERT_SERVICE_REQUEST" | ⬜ |

### Test 2.2: Stage Transitions
**Objective:** Verify stage transitions work correctly

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC2.2.1 | Transition service request stage | Stage updates, timeline event created | ⬜ |
| TC2.2.2 | Attempt backward transition | Error: "Cannot move backwards" | ⬜ |
| TC2.2.3 | Verify audit log for stage transition | Audit entry with action "TRANSITION_SERVICE_REQUEST_STAGE" | ⬜ |
| TC2.2.4 | Verify customer sees updated tracking status | Customer tracking page reflects new stage | ⬜ |

---

## Phase 3: Technician Workflow

### Test 3.1: Job Assignment
**Objective:** Verify technicians can be assigned to jobs

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC3.1.1 | Manager assigns technician to job | `assignedTechnicianId` and `technician` fields updated | ⬜ |
| TC3.1.2 | Verify audit log for assignment | Audit entry with action "ASSIGN_TECHNICIAN" | ⬜ |
| TC3.1.3 | Technician views their dashboard | Only sees assigned jobs | ⬜ |
| TC3.1.4 | Technician views job details | Can see job information | ⬜ |

### Test 3.2: Technician Workbench Actions
**Objective:** Verify technician can update job status

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC3.2.1 | Technician clicks "Start Repair" | Job status changes to "In Progress" | ⬜ |
| TC3.2.2 | Verify audit log for status change | Audit entry with action "STATUS_CHANGE_TO_IN_PROGRESS" | ⬜ |
| TC3.2.3 | Technician adds repair notes | Notes saved to job | ⬜ |
| TC3.2.4 | Technician clicks "Complete Repair" | Status changes to "Completed", billingStatus = "pending" | ⬜ |
| TC3.2.5 | Verify audit log for completion | Audit entry with action "STATUS_CHANGE_TO_COMPLETED" | ⬜ |
| TC3.2.6 | Non-assigned technician attempts to update | 403 Forbidden or job not visible | ⬜ |

---

## Phase 4: Cashier Workflow (Payment Enforcement)

### Test 4.1: Payment Recording
**Objective:** Verify payment must be recorded before invoice generation

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC4.1.1 | Cashier views "Ready for Billing" | Shows completed jobs with billingStatus = "pending" | ⬜ |
| TC4.1.2 | Attempt to generate invoice for unpaid job | 403 Error: "Payment Required" | ⬜ |
| TC4.1.3 | Cashier records payment via POS | paymentStatus updated to "paid" or "partial" | ⬜ |
| TC4.1.4 | Verify audit log for payment | Audit entry with action "RECORD_PAYMENT" | ⬜ |
| TC4.1.5 | Generate invoice after payment | Invoice generated successfully | ⬜ |
| TC4.1.6 | Verify audit log for invoice | Audit entry with action "GENERATE_INVOICE" | ⬜ |

### Test 4.2: Partial Payments
**Objective:** Verify partial payment handling

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC4.2.1 | Record partial payment | paymentStatus = "partial", remainingAmount calculated | ⬜ |
| TC4.2.2 | Generate invoice with partial payment | Invoice generated (allowed) | ⬜ |
| TC4.2.3 | Record remaining payment | paymentStatus = "paid", remainingAmount = 0 | ⬜ |

### Test 4.3: Invoice Print Limits
**Objective:** Verify print limit enforcement

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC4.3.1 | Generate invoice (1st print) | invoicePrintCount = 1 | ⬜ |
| TC4.3.2 | Generate invoice (2nd print) | invoicePrintCount = 2 | ⬜ |
| TC4.3.3 | Attempt 3rd print as Cashier | 403 Error: "Print Limit Exceeded" | ⬜ |
| TC4.3.4 | Super Admin attempts 3rd print | Invoice generated (bypass limit) | ⬜ |

### Test 4.4: Exceptions (Write-off & Mark Incomplete)
**Objective:** Verify exception handling

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC4.4.1 | Manager writes off bad debt | paymentStatus = "written_off", reason saved | ⬜ |
| TC4.4.2 | Verify audit log for write-off | Audit entry with action "WRITE_OFF_JOB" | ⬜ |
| TC4.4.3 | Cashier marks payment incomplete | paymentStatus = "incomplete", reason saved | ⬜ |
| TC4.4.4 | Verify audit log for incomplete | Audit entry with action "MARK_PAYMENT_INCOMPLETE" | ⬜ |
| TC4.4.5 | Technician attempts write-off | 403 Forbidden | ⬜ |

### Test 4.5: POS Integration
**Objective:** Verify POS deep linking and job linking

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC4.5.1 | Cashier clicks "Pay" from billing dashboard | Redirects to POS with pre-filled job data | ⬜ |
| TC4.5.2 | Complete POS transaction with linked job | Job payment automatically recorded | ⬜ |
| TC4.5.3 | Verify job status updated after POS | Job marked as completed if linked | ⬜ |
| TC4.5.4 | Verify audit log for POS job completion | Audit entry created | ⬜ |

---

## Cross-Phase Integration Tests

### Test 5.1: End-to-End Workflow
**Objective:** Verify complete workflow from intake to payment

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC5.1.1 | Customer creates service request | Request appears in Manager triage | ⬜ |
| TC5.1.2 | Manager verifies and converts | Job ticket created | ⬜ |
| TC5.1.3 | Manager assigns technician | Job appears in Technician dashboard | ⬜ |
| TC5.1.4 | Technician starts repair | Status = "In Progress" | ⬜ |
| TC5.1.5 | Technician completes repair | Status = "Completed", billingStatus = "pending" | ⬜ |
| TC5.1.6 | Job appears in Cashier "Ready for Billing" | Job visible in billing queue | ⬜ |
| TC5.1.7 | Cashier records payment | paymentStatus = "paid" | ⬜ |
| TC5.1.8 | Cashier generates invoice | Invoice generated, printCount = 1 | ⬜ |
| TC5.1.9 | Verify all audit logs created | Complete audit trail exists | ⬜ |

### Test 5.2: Permission Enforcement
**Objective:** Verify RBAC enforced at all endpoints

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC5.2.1 | Unauthenticated request to POS | 401 Unauthorized | ⬜ |
| TC5.2.2 | Cashier attempts to create job | 403 Forbidden | ⬜ |
| TC5.2.3 | Technician attempts to process payment | 403 Forbidden | ⬜ |
| TC5.2.4 | Manager attempts to write off | 200 OK (Manager has permission) | ⬜ |
| TC5.2.5 | Cashier views finance records | 200 OK (with finance permission) | ⬜ |

### Test 5.3: Audit Trail Completeness
**Objective:** Verify all critical actions are logged

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC5.3.1 | Query audit logs for service request conversion | Entry exists | ⬜ |
| TC5.3.2 | Query audit logs for job assignment | Entry exists | ⬜ |
| TC5.3.3 | Query audit logs for status changes | Entries exist for each change | ⬜ |
| TC5.3.4 | Query audit logs for payments | Entry exists with old/new values | ⬜ |
| TC5.3.5 | Query audit logs for invoices | Entry exists with print count | ⬜ |
| TC5.3.6 | Verify audit log metadata | IP, user agent, user ID present | ⬜ |

---

## Manager Dashboard KPIs

### Test 6.1: Workflow KPIs Endpoint
**Objective:** Verify `/api/admin/workflow-kpis` returns correct data

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC6.1.1 | Call workflow KPIs endpoint | Returns pendingTriage, jobsReadyForBilling, etc. | ⬜ |
| TC6.1.2 | Verify pendingTriage count | Matches unconverted pending requests | ⬜ |
| TC6.1.3 | Verify jobsReadyForBilling count | Matches completed jobs with billingStatus = "pending" | ⬜ |
| TC6.1.4 | Verify unpaidJobs count | Matches jobs with paymentStatus = "unpaid" | ⬜ |
| TC6.1.5 | Verify writeOffs count | Matches jobs with paymentStatus = "written_off" | ⬜ |
| TC6.1.6 | Verify jobsByTechnician | Correctly groups and counts | ⬜ |
| TC6.1.7 | Verify jobsByStage | Correctly groups service requests by stage | ⬜ |

---

## Customer-Facing Tests

### Test 7.1: Customer Tracking Alignment
**Objective:** Verify customer sees accurate, simplified statuses

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC7.1.1 | Customer views service request tracking | Sees stage-based status (not internal fields) | ⬜ |
| TC7.1.2 | Verify payment status not exposed | Customer doesn't see job paymentStatus | ⬜ |
| TC7.1.3 | Stage transition updates customer view | Customer sees updated tracking status | ⬜ |
| TC7.1.4 | Verify technician name hidden | Customer doesn't see assigned technician | ⬜ |

---

## Performance & Edge Cases

### Test 8.1: Concurrent Operations
**Objective:** Verify system handles concurrent requests

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC8.1.1 | Multiple managers convert requests simultaneously | No race conditions, all conversions succeed | ⬜ |
| TC8.1.2 | Multiple cashiers process payments simultaneously | Payments recorded correctly | ⬜ |

### Test 8.2: Data Integrity
**Objective:** Verify data consistency

| Test Case | Steps | Expected Result | Status |
|-----------|-------|-----------------|--------|
| TC8.2.1 | Delete service request with converted job | Prevented or cascade handled | ⬜ |
| TC8.2.2 | Update job paymentStatus manually | Validation prevents invalid states | ⬜ |

---

## Test Execution Checklist

- [ ] All Phase 1 tests passed
- [ ] All Phase 2 tests passed
- [ ] All Phase 3 tests passed
- [ ] All Phase 4 tests passed
- [ ] All integration tests passed
- [ ] All permission tests passed
- [ ] All audit trail tests passed
- [ ] All KPI tests passed
- [ ] All customer-facing tests passed
- [ ] Performance tests completed
- [ ] Edge cases handled

---

## Known Issues & Workarounds

| Issue | Description | Workaround | Status |
|-------|-------------|------------|--------|
| - | - | - | - |

---

## Sign-off

**QA Lead:** _________________ **Date:** _________

**Developer:** _________________ **Date:** _________

**Product Owner:** _________________ **Date:** _________
