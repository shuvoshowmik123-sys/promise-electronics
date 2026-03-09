# Settings Tab Implementation Plan

## Overview
Implement the 5 missing sub-sections in the Admin Panel's Settings Tab (`SettingsTab.tsx`).

## Important Note
**This is a UI-only concept implementation** for the `design-concept.tsx` file.
- Focus only on the UI/UX part
- Use mock data - no API connections
- No backend integration required
- After testing/validation, this will be replicated in the main admin panel

## Current State
- **File**: `client/src/pages/admin/bento/tabs/SettingsTab.tsx`
- **Defined Sections**: 9 (lines 245-255)
- **Implemented**: 4/9 (General, Service Config, CMS / Home, About Us)
- **Missing**: 5/9 (Mobile App, Data Import, Policies, Reviews, Data & Backups)

## Missing Sections to Implement

### 1. Mobile App Section (`mobile`)
**Location**: New file `client/src/pages/admin/bento/tabs/settings/MobileAppSection.tsx`

**Features**:
- App version management (Android/iOS)
- Push notification settings
- App store URLs configuration
- Biometric authentication toggle
- App update notification settings
- Deep linking configuration

**UI Components**:
- Version info cards
- Toggle switches for features
- Input fields for URLs
- App preview placeholder

---

### 2. Data Import Section (`import`)
**Location**: New file `client/src/pages/admin/bento/tabs/settings/DataImportSection.tsx`

**Features**:
- CSV/Excel import for:
  - Service requests
  - Inventory items
  - Customer data
  - Price lists
- Import history/logs
- Validation preview before import
- Error reporting

**UI Components**:
- File upload dropzone
- Column mapping interface
- Preview table
- Import progress indicator
- Error log display

---

### 3. Policies Section (`policies`)
**Location**: New file `client/src/pages/admin/bento/tabs/settings/PoliciesSection.tsx`

**Features**:
- Terms & Conditions editor
- Privacy Policy editor
- Warranty Policy management
- Refund Policy management
- Service Agreement templates
- Policy version history

**UI Components**:
- Rich text editor (use existing)
- Version selector dropdown
- Preview panel
- Last updated timestamps
- Active/inactive toggle

---

### 4. Reviews Section (`reviews`)
**Location**: New file `client/src/pages/admin/bento/tabs/settings/ReviewsSection.tsx`

**Features**:
- Customer review management
- Review moderation (approve/reject)
- Review response from admin
- Review analytics summary
- Auto-response templates
- Review filtering by rating/date

**UI Components**:
- Review cards with rating stars
- Action buttons (approve/reject/respond)
- Analytics charts
- Filter dropdowns
- Bulk action toolbar

---

### 5. Data & Backups Section (`data`)
**Location**: New file `client/src/pages/admin/bento/tabs/settings/DataBackupsSection.tsx`

**Features**:
- Database backup creation
- Backup history list
- Backup restoration
- Auto-backup scheduling
- Backup file download
- Storage usage display

**UI Components**:
- Backup creation button
- History table with dates/sizes
- Restore confirmation dialog
- Schedule configuration
- Storage meter

---

## Implementation Order

| Phase | Section | Priority | Estimated Effort |
|-------|---------|----------|------------------|
| 1 | Policies | High | Medium |
| 2 | Data Import | High | High |
| 3 | Reviews | Medium | Medium |
| 4 | Mobile App | Medium | Low |
| 5 | Data & Backups | Low | Medium |

## Files to Create

```
client/src/pages/admin/bento/tabs/settings/
├── MobileAppSection.tsx      # NEW
├── DataImportSection.tsx     # NEW
├── PoliciesSection.tsx       # NEW
├── ReviewsSection.tsx        # NEW
└── DataBackupsSection.tsx   # NEW
```

## Integration Steps

1. **Create component files** in `client/src/pages/admin/bento/tabs/settings/`
2. **Import components** in `SettingsTab.tsx`:
   ```typescript
   import MobileAppSection from "./settings/MobileAppSection";
   import DataImportSection from "./settings/DataImportSection";
   import PoliciesSection from "./settings/PoliciesSection";
   import ReviewsSection from "./settings/ReviewsSection";
   import DataBackupsSection from "./settings/DataBackupsSection";
   ```
3. **Add render conditions** in `SettingsTab.tsx` (replace placeholders):
   ```typescript
   {activeTab === "mobile" && <MobileAppSection />}
   {activeTab === "import" && <DataImportSection />}
   {activeTab === "policies" && <PoliciesSection />}
   {activeTab === "reviews" && <ReviewsSection />}
   {activeTab === "data" && <DataBackupsSection />}
   ```

## Mock Data Pattern (UI Only)

Since this is a UI-only concept, each section should use mock data:

```typescript
// Example mock data structure
const mockMobileAppConfig = {
  androidVersion: "2.1.0",
  iosVersion: "2.1.0",
  pushNotificationsEnabled: true,
  biometricEnabled: true,
  appStoreUrl: "https://play.google.com/store/apps/promise",
  playStoreUrl: "https://play.google.com/store/apps/promise"
};

const mockImportHistory = [
  { id: 1, type: "Inventory", file: "inventory_2024.csv", rows: 150, date: "2024-01-15", status: "success" },
  { id: 2, type: "Customers", file: "customers.xlsx", rows: 89, date: "2024-01-10", status: "error" }
];

const mockPolicies = {
  terms: "Terms and conditions text...",
  privacy: "Privacy policy text...",
  warranty: "Warranty policy text...",
  refund: "Refund policy text..."
};

const mockReviews = [
  { id: 1, customer: "John Doe", rating: 5, comment: "Great service!", date: "2024-01-20", status: "pending" },
  { id: 2, customer: "Jane Smith", rating: 4, comment: "Good experience", date: "2024-01-18", status: "approved" }
];

const mockBackups = [
  { id: 1, name: "Full Backup", size: "2.5 GB", date: "2024-01-20 10:00", type: "automatic" },
  { id: 2, name: "Manual Backup", size: "1.8 GB", date: "2024-01-15 14:30", type: "manual" }
];
```

## Implementation Approach

1. **UI Only**: Create visual components with no API calls
2. **Mock Data**: Use hardcoded data for demonstration
3. **Interactive UI**: Buttons and forms should look functional but use local state
4. **Consistent Styling**: Match existing design patterns from other sections
5. **Testing Ready**: Structure allows easy replacement with real API later

## Dependencies
- Existing UI components (Button, Input, Card, Tabs, etc.)
- Existing shared components (containerVariants, itemVariants)
- Lucide React icons
- Framer Motion for animations
- Local state management (useState, useEffect with mock data)

## Notes
- Follow existing patterns from `GeneralSection.tsx` and `CmsHomeSection.tsx`
- Use same container/variant patterns for consistency
- Implement loading states using local useState (not API)
- Consider lazy loading for large components
- No backend required - all data is mock/demo
