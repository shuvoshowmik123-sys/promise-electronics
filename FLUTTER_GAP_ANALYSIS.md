# 🔍 Super Agent Gap Analysis: Flutter Admin App

> **Protocol:** `/super_agent` v2.0  
> **Target:** `admin_app_flutter/`  
> **Reference:** Web Admin Panel (React)  
> **Date:** 2026-01-23

---

This document is historical. The active mobile replacement is `workforce_app_flutter/`.

## Executive Summary

| Metric | Value |
|--------|-------|
| **Screens Implemented** | 22 |
| **Providers Implemented** | 15 |
| **Data Models Implemented** | 5 |
| **Estimated Parity** | **~75%** |
| **Critical Gaps** | 4 |
| **P0 Issues** | 3 |

The Flutter Admin App has a solid foundation but exhibits **data divergence** and **incomplete workflow coverage** compared to the Web Admin.

---

## ✅ What's Working (Aligned with Protocol)

### 1. API Parity (§2.B) — ✅ COMPLIANT
The app correctly uses the **same API endpoints** as the Web Admin:

| Feature | Endpoint | Status |
|---------|----------|--------|
| Login | `/api/admin/login` | ✅ |
| Logout | `/api/admin/logout` | ✅ |
| Current User | `/api/admin/me` | ✅ |
| Job Tickets | `/api/job-tickets` | ✅ |
| Inventory | `/api/inventory` | ✅ |
| POS Transactions | `/api/pos-transactions` | ✅ |
| Petty Cash | `/api/petty-cash` | ✅ |
| Due Records | `/api/due-records` | ✅ |

### 2. Session Management — ✅ COMPLIANT
Uses `DioCookieManager` with `CookieJar` to persist `connect.sid` cookie (as required by §2.B.2).

### 3. User Permissions (§2.A.3) — ✅ COMPLIANT
The `UserModel.fromJson()` correctly:
- Parses `permissions` as JSON string OR object
- Falls back to `_getDefaultPermissions(role)` matching the Web's `getDefaultPermissions()` logic

### 4. Real-time Updates — ✅ COMPLIANT
`InventoryProvider` implements SSE subscription (§2.B.3):
```dart
_sseSubscription = SSEService.instance.stream.listen((event) {
  if (event['type'] == 'inventory_update' || ...) {
    fetchProducts();
  }
});
```

---

## ❌ Critical Gaps (P0)

### Gap 1: JobTicketModel Field Mismatch (§2.A)

**Issue:** The Dart model does NOT match the database schema in `shared/schema.ts`.

| Field in DB (`jobTickets`) | Field in Dart Model | Status |
|----------------------------|---------------------|--------|
| `id` | `id` | ✅ |
| `customer` | ❌ Missing (uses `customerName`) | ⚠️ |
| `customerPhone` | `customerPhone` | ✅ |
| `device` | ❌ Missing (uses `deviceBrand`) | ⚠️ |
| `issue` | ❌ Missing (uses `issueDescription`) | ⚠️ |
| `technician` | Partially (mapped from both) | ✅ |
| `aiDiagnosis` | ❌ **MISSING** | ❌ |
| `serviceWarrantyDays` | ❌ **MISSING** | ❌ |
| `partsWarrantyDays` | ❌ **MISSING** | ❌ |
| `serviceExpiryDate` | ❌ **MISSING** | ❌ |
| `partsExpiryDate` | ❌ **MISSING** | ❌ |
| `parentJobId` | ❌ **MISSING** | ❌ |
| `corporateJobNumber` | ❌ **MISSING** | ❌ |

**Impact:** Warranty data is invisible in the Flutter app. Technicians cannot see AI diagnosis suggestions.

**Fix Required:**
```dart
// Add to JobTicketModel:
final Map<String, dynamic>? aiDiagnosis;
final int? serviceWarrantyDays;
final int? partsWarrantyDays;
final DateTime? serviceExpiryDate;
final DateTime? partsExpiryDate;
final String? parentJobId;
final String? corporateJobNumber;
```

---

### Gap 2: Missing `inventory_items.features` Parsing (§2.A)

**Issue:** The `InventoryProvider` stores products as `List<dynamic>` without parsing the `features` JSON field.

**Current Code:**
```dart
List<dynamic> get products => _products; // Raw JSON maps
```

**Expected:** A strongly-typed `InventoryItemModel` with:
```dart
final List<String>? features; // Parsed from JSON string
```

**Impact:** Product variants and features show as empty or raw JSON text.

---

### Gap 3: POS "Due" Payment Creates No `dueRecord` (§3 Workflow 2.1)

**Issue:** The `POSProvider.submitTransaction()` sets `paymentStatus: 'Pending'` but does NOT call the `/api/due-records` endpoint to create a due record.

**Current Code (pos_provider.dart:103):**
```dart
'paymentStatus': paymentMethod == 'Due' ? 'Pending' : 'Paid',
```

**Expected (from Web Admin):** When `paymentMethod == 'Due'`, a **separate** `dueRecord` must be created with:
- `customer`
- `amount` (total)
- `invoice` (transaction ID)
- `dueDate` (default: 30 days)

**Impact:** Mobile "Due" sales do NOT appear in the Web Admin's "Due Records" tab.

---

### Gap 4: No Orders Screen (§3 Workflow 5)

**Issue:** The Flutter app has NO `orders_screen.dart`. E-commerce orders submitted via the Customer Portal/App cannot be managed from Mobile.

**Missing Screens:**
- [ ] `orders_screen.dart` (List view with filters)
- [ ] `order_detail_screen.dart` (Accept/Decline actions)

**Missing Provider Methods:**
- [ ] `fetchOrders()`
- [ ] `acceptOrder(id)`
- [ ] `declineOrder(id, reason)`

---

## ⚠️ Minor Gaps (P1/P2)

### Gap 5: No Service Requests Management Screen

**Status:** `create_service_request_screen.dart` exists, but there's no **list view** to see/manage all service requests.

### Gap 6: Finance Screen is Minimal

**Status:** `finance_screen.dart` exists with 3 tabs (Sales, Petty Cash, Due Records) — ✅ COMPLIANT.
However, the **stats calculations are done locally** in `FinanceProvider.stats`, which violates §1 (Golden Rule).

**Issue:** Stats should come from a dedicated `/api/admin/reports` or `/api/admin/dashboard` endpoint, not be calculated in Flutter.

### Gap 7: FCM Push Notification Handling

**Status:** `push_notification_service.dart` exists (4.9KB), but I did not verify if it navigates to the correct screen on tap (§3 Workflow 4.4).

---

## 📋 Recommended Action Plan

| Priority | Gap | Action | Effort |
|----------|-----|--------|--------|
| **P0** | Gap 1 | Update `JobTicketModel` with all missing fields | 1 hour |
| **P0** | Gap 2 | Create `InventoryItemModel` with `features` parser | 2 hours |
| **P0** | Gap 3 | Fix `POSProvider` to create `dueRecord` on "Due" payment | 1 hour |
| **P1** | Gap 4 | Implement `OrdersScreen` + `OrderProvider` | 4 hours |
| **P2** | Gap 5 | Add `ServiceRequestsListScreen` | 3 hours |
| **P2** | Gap 6 | Refactor `FinanceProvider.stats` to fetch from API | 2 hours |
| **P2** | Gap 7 | Test FCM deep-linking on job assignment | 1 hour |

**Total Estimated Effort:** ~14 hours to reach 100% parity.

---

## ✅ Done Criteria Checklist (from §5.2)

| Criteria | Current Status |
|----------|----------------|
| Visual Match: Job Ticket shows identical data | ⚠️ Partial (Warranty fields missing) |
| Logic Match: Completing job updates Web | ✅ Works (via API) |
| Hardware Match: QR Scanner loads Job ID | ✅ `qr_scanner_screen.dart` exists |
| Hardware Match: Printer prints valid receipt | ⚠️ Not verified |
| No Local Logic | ⚠️ Violated (FinanceProvider.stats) |
| Error Resilience | ⚠️ Basic try-catch, no 401 redirect |
| Push Handling: Navigates to correct screen | ⚠️ Not verified |

---

## Next Steps

1. **Immediate:** Fix P0 Gaps (1, 2, 3) — these cause visible data mismatches.
2. **This Week:** Implement Orders screen (Gap 4).
3. **Next Sprint:** Address P2 gaps and full verification.

---

*Generated by: Super Agent Protocol v2.0*  
*Reference: [super_agent.md](file:///d:/PromiseIntegratedSystem/PromiseIntegratedSystem/.agent/workflows/super_agent.md)*
