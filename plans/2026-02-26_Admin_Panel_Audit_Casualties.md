# Admin Panel Audit — Casualties & Solutions
**Date:** February 26, 2026 · **Audited by:** Senior Architect Review

---

## 🔴 Critical Casualties

### Casualty #1 — No Logout Button in Admin Shell
**Location:** `client/src/pages/admin/design-concept.tsx`
**Problem:** The main admin SPA has no sign-out button anywhere — sidebar, header, or mobile nav. Admins cannot log out.
**Solution:**
- Add a "Sign Out" button at the bottom of the sidebar (desktop) and inside the mobile Sheet menu
- Import `useAdminAuth` from `@/contexts/AdminAuthContext` in `design-concept.tsx`
- Call `logout()` → `toast.success("Signed out")` → redirect to `/admin/login`
- Add user name/role display above the sign-out button

---

### Casualty #2 — Warranty Claims Tab is a Placeholder Stub
**Location:** `client/src/pages/admin/bento/tabs/WarrantyClaimsTab.tsx` (11 lines)
**Problem:** Tab shows only static text "Placeholder for Warranty Claims management." Backend API (`warranty.routes.ts`, 11,825 bytes) is fully built but the frontend never connects to it.
**Solution:**
- Build a full `WarrantyClaimsTab` with:
  - Table listing all warranty claims (claim ID, customer, device, status, dates)
  - Status filters (Pending, Approved, Rejected, In Progress, Completed)
  - Approve/Reject actions with confirmation dialogs
  - Claim detail view with attached photos and warranty policy info
- Wire to existing API endpoints in `warranty.routes.ts`
- Follow the Bento design pattern used by other tabs (BentoCard, motion animations)

---

### Casualty #3 — "Create PO" Button is Non-Functional
**Location:** `client/src/pages/admin/bento/tabs/PurchasingTab.tsx` (line 46-48)
**Problem:** The "Create PO" button renders but has no `onClick` handler — clicking does nothing.
**Solution:**
- Create a `CreatePODialog` component with form fields: Supplier Name, Expected Delivery Date, Line Items (part name, qty, unit price)
- Add state management: `const [createDialogOpen, setCreateDialogOpen] = useState(false)`
- Wire button: `onClick={() => setCreateDialogOpen(true)}`
- Use `purchaseOrdersApi.create()` mutation to submit
- Also add a "Past Orders" table section below the active orders (line 127 has a comment for this)

---

### Casualty #4 — Header User Profile Icon is Dead
**Location:** `client/src/pages/admin/design-concept.tsx` (line 366-368)
**Problem:** Avatar icon has `cursor-pointer` styling but no `onClick` — no profile dropdown, no role display, no settings link.
**Solution:**
- Wrap with a `DropdownMenu` (from shadcn/ui) containing:
  - User name and role at the top
  - "My Profile" → navigate to settings tab
  - "Sign Out" → logout handler
- Pull user data from `useAdminAuth()` context

---

## 🟠 High Severity Casualties

### Casualty #5 — "Refunds" Sidebar Opens Wrong Sub-Tab
**Location:** `client/src/pages/admin/design-concept.tsx` (line 439)
**Problem:** Clicking "Refunds" in the Warehouse sidebar group renders `<FinancesTab />` which defaults to the "Sales" sub-tab — user expects to see refunds.
**Solution:**
- Pass a prop to FinancesTab when opened from the refunds sidebar item: `<FinancesTab defaultSubTab="refunds" />`
- Update `FinancesTab` to accept `defaultSubTab` prop and use it in `<Tabs defaultValue={defaultSubTab || 'sales'}>`
- Alternative: Create a dedicated lightweight `RefundsOnlyTab` wrapper that renders just the refunds sub-tab content

---

### Casualty #6 — Dead `AdminLayout.tsx` (175 Lines of Orphaned Code)
**Location:** `client/src/components/layout/AdminLayout.tsx`
**Problem:** This entire file is never imported or used. `AdminRouter` sends all traffic to `DesignConcept`. The file contains a divergent nav structure and stale permission mappings.
**Solution:**
- Delete `AdminLayout.tsx` entirely
- Audit `adminNavGroups` in `mock-data.ts` (lines 115-168) — if nothing else imports it, delete those too
- Check that `adminNavItems` (line 173) is not used elsewhere; if not, remove it

---

### Casualty #7 — No UI-Level Permission Enforcement
**Location:** `client/src/pages/admin/design-concept.tsx` (sidebar rendering)
**Problem:** All 32+ sidebar items are visible to every authenticated user. The old `AdminLayout` had `checkPermission()` logic, but `DesignConcept` has none. API returns 403, but users see confusing errors instead of hidden tabs.
**Solution:**
- Import `useAdminAuth` and its `hasPermission` function into `DesignConcept`
- Filter `sidebarNavGroups` items based on user permissions before rendering
- Map each tab ID to a permission key (reuse the mapping pattern from `AdminLayout.checkPermission`)
- Hide tabs the user doesn't have access to

---

### Casualty #8 — Commented-Out Sidebar Items (Shipments & Procurement)
**Location:** `client/src/pages/admin/design-concept.tsx` (lines 175-176)
**Problem:** Two sidebar items are commented out with no corresponding components. Also listed in `TAB_DISPLAY_NAMES` and the fallback exclusion array (line 457), creating confusion.
**Solution:**
- Either:
  - **(A)** Remove all traces — delete from `TAB_DISPLAY_NAMES`, remove from the fallback array, remove comments
  - **(B)** Implement them — create proper `ShipmentsTab` and `ProcurementTab` components
- Recommended: Option A for now, add a backlog ticket for future implementation

---

### Casualty #9 — `DragDropDemo.tsx` Unreachable Dead Code (12KB)
**Location:** `client/src/pages/admin/bento/tabs/DragDropDemo.tsx`
**Problem:** Never lazy-loaded in `design-concept.tsx`, not in any sidebar group. Completely unreachable.
**Solution:**
- Delete the file, or move to a `/demos` folder if needed for future reference
- Remove any imports if they exist elsewhere

---

## 🟡 Moderate Casualties

### Casualty #10 — Mobile Sheet Doesn't Auto-Close
**Location:** `client/src/pages/admin/design-concept.tsx` (lines 293-297)
**Problem:** When users tap a menu item in the mobile "More" sheet, the tab changes but the sheet stays open. User must manually close it.
**Solution:**
- Convert to a controlled Sheet: `const [mobileMenuOpen, setMobileMenuOpen] = useState(false)`
- Set `open={mobileMenuOpen}` and `onOpenChange={setMobileMenuOpen}` on the `<Sheet>` component
- In the `setActiveTab` callback, add `setMobileMenuOpen(false)` after setting the tab

---

### Casualty #11 — Desktop Header Missing Settings Shortcut
**Location:** `client/src/pages/admin/design-concept.tsx` (header area)
**Problem:** Desktop header has Bell (notifications) and User (profile) icons, but no quick Settings shortcut icon — even though the old `AdminLayout` had one.
**Solution:**
- Add a Settings gear icon button between the notification bell and user avatar
- `onClick={() => setActiveTab('settings')}`

---

### Casualty #12 — PurchasingTab Missing Past Orders Table
**Location:** `client/src/pages/admin/bento/tabs/PurchasingTab.tsx` (line 127)
**Problem:** The "Received This Month" stat card shows a count, but there's no table to view the actual completed purchase orders.
**Solution:**
- Add a second table section below the active orders showing `pastOrders` (already computed on line 37)
- Include columns: PO Number, Supplier, Received Date, Status
- Style consistently with the active orders table

---

### Casualty #13 — `PlaceholderTab` Prop Naming Inconsistency
**Location:** `client/src/pages/admin/bento/tabs/PlaceholderTab.tsx`
**Problem:** Uses `tabName` prop while other components use `title`. Minor inconsistency.
**Solution:**
- Rename prop to `title` for consistency, or leave as-is since it's a temporary component

---

### Casualty #14 — Stale `mock-data.ts` Navigation Config
**Location:** `client/src/lib/mock-data.ts` (lines 115-173)
**Problem:** `adminNavGroups` and `adminNavItems` define URL-based navigation for the dead `AdminLayout`. They're out of sync with the actual `DesignConcept` sidebar (20 items vs 32+).
**Solution:**
- Check if any other file imports `adminNavGroups` or `adminNavItems`
- If only `AdminLayout` uses them, delete both exports when deleting `AdminLayout`
- If other files use them (e.g., permission checks), update to match current tab structure

---

## Summary Matrix

| # | Casualty | Severity | Fix Effort | Priority |
|---|---|---|---|---|
| 1 | No Logout button | 🔴 Critical | 30 min | P0 |
| 2 | Warranty Claims stub | 🔴 Critical | 3–4 hrs | P0 |
| 3 | Create PO button dead | 🔴 Critical | 1–2 hrs | P0 |
| 4 | Profile icon dead | 🔴 Critical | 1 hr | P0 |
| 5 | Refunds opens wrong tab | 🟠 High | 30 min | P1 |
| 6 | Dead AdminLayout.tsx | 🟠 High | 15 min | P1 |
| 7 | No permission checks in UI | 🟠 High | 2–3 hrs | P1 |
| 8 | Commented-out nav items | 🟠 High | 15 min | P1 |
| 9 | DragDropDemo dead code | 🟠 High | 5 min | P1 |
| 10 | Mobile sheet won't close | 🟡 Moderate | 30 min | P2 |
| 11 | No Settings shortcut | 🟡 Moderate | 15 min | P2 |
| 12 | Missing past orders table | 🟡 Moderate | 1 hr | P2 |
| 13 | Prop naming inconsistency | 🟡 Moderate | 5 min | P3 |
| 14 | Stale mock-data nav config | 🟡 Moderate | 15 min | P1 |

**Total estimated fix time: ~10–12 hours**
