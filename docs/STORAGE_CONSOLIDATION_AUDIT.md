# Storage Consolidation Audit

**Date:** January 2026  
**Status:** Analysis Complete

---

## Current State: 3 Storage Providers

### 1. ImageKit ✅ (PRIMARY - Keep)
**Usage:** Service Request uploads, Profile photos, Order images

| Location | Usage |
|----------|-------|
| `server/routes/upload.routes.ts` | Server-side upload, auth endpoints |
| `client/src/pages/repair-request.tsx` | Customer service request media |
| `client/src/native-app/pages/RepairRequest.tsx` | Native app uploads |
| `client/src/native-app/pages/EditProfile.tsx` | Profile photo uploads |
| `client/src/components/common/ImageKitUpload.tsx` | Reusable upload component |
| `mobile_app_flutter/lib/repositories/order_repository.dart` | Flutter app order images |

**Endpoints:**
- `GET /api/upload/imagekit-auth` - Client-side auth
- `POST /api/imagekit/upload` - Server-side upload

**Environment Variables:**
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_URL_ENDPOINT`

---

### 2. Cloudinary ⚠️ (REDUNDANT - Migrate Away)
**Usage:** Admin panel banner/logo uploads, Legacy media cleanup

| Location | Usage |
|----------|-------|
| `server/routes/upload.routes.ts` | Server-side upload, signed params |
| `client/src/pages/admin/settings.tsx` | Admin banner/logo uploads |

**Endpoints:**
- `POST /api/cloudinary/upload-params` - Get signed upload params
- `POST /api/cloudinary/upload` - Server-side upload
- `POST /api/cleanup/expired-media` - Cleanup (uses Cloudinary SDK)

**Environment Variables:**
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

**Issues:**
- Duplicates ImageKit functionality
- Only used in admin settings page
- Billing separate from ImageKit

---

### 3. Google Cloud Storage (GCS) ⚠️ (LEGACY - Remove)
**Usage:** Legacy object storage, barely used

| Location | Usage |
|----------|-------|
| `server/objectStorage.ts` | ObjectStorageService class |
| `server/objectAcl.ts` | Access control |
| `server/routes/upload.routes.ts` | Legacy upload/serve endpoints |

**Endpoints:**
- `POST /api/objects/upload` - Get upload URL (legacy)
- `GET /objects/:objectPath` - Serve objects

**Comments in Code:**
- Marked as "Legacy" in upload.routes.ts
- Used in cleanup for old media

---

## Analysis

### Feature Comparison

| Feature | ImageKit | Cloudinary | GCS |
|---------|----------|------------|-----|
| Image Optimization | ✅ | ✅ | ❌ |
| Video Optimization | ✅ | ✅ | ❌ |
| Real-time Transforms | ✅ | ✅ | ❌ |
| CDN Included | ✅ | ✅ | ❌ |
| Free Tier | 20GB/mo | 25 Credits/mo | $$ |
| SDK Quality | Good | Excellent | Complex |

### Current Usage by Feature

| Feature | Current Provider | Recommended |
|---------|-----------------|-------------|
| Service Request Media | ImageKit | ImageKit |
| Profile Photos | ImageKit | ImageKit |
| Order Images (Flutter) | ImageKit | ImageKit |
| Admin Banners/Logos | **Cloudinary** | **→ ImageKit** |
| Legacy Objects | GCS | **→ Remove** |

---

## Recommendation: Consolidate to ImageKit

### Why ImageKit?
1. **Already Primary:** Most uploads already use ImageKit
2. **Simpler Billing:** One provider = one bill
3. **Good Free Tier:** 20GB/month bandwidth
4. **Real-time Transforms:** Resize/crop on the fly
5. **Flutter SDK:** Works well with mobile

### Migration Plan

#### Phase 1: Migrate Admin Settings (Cloudinary → ImageKit)
**Files to Update:**
- `client/src/pages/admin/settings.tsx` (lines 934, 960, 1145, 1171)

**Changes:**
1. Replace `fetch("/api/cloudinary/upload-params")` with ImageKit auth
2. Replace Cloudinary upload URL with ImageKit upload
3. Update response handling

#### Phase 2: Remove GCS (Legacy Cleanup)
**Files to Update:**
- `server/routes/upload.routes.ts` - Remove legacy endpoints
- `server/objectStorage.ts` - Delete file
- `server/objectAcl.ts` - Delete file

**Considerations:**
- Check if any production data uses GCS URLs
- Run cleanup job first to migrate or delete

#### Phase 3: Remove Cloudinary Dependencies
**After Migration:**
- Remove Cloudinary endpoints from upload.routes.ts
- Remove cloudinary package from package.json
- Remove environment variables

---

## Environment Variables After Consolidation

### Remove:
```env
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
GCS_BUCKET=xxx (if exists)
```

### Keep:
```env
IMAGEKIT_PUBLIC_KEY=xxx
IMAGEKIT_PRIVATE_KEY=xxx
IMAGEKIT_URL_ENDPOINT=xxx
VITE_IMAGEKIT_PUBLIC_KEY=xxx
VITE_IMAGEKIT_URL_ENDPOINT=xxx
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing URLs | Check database for Cloudinary URLs before removing |
| Admin file uploads fail | Test thoroughly in staging |
| Cleanup job fails | Keep Cloudinary SDK until all media migrated |

---

## Next Steps

1. [x] ~~Update admin settings to use ImageKit~~ ✅ COMPLETED
   - Created `client/src/lib/imagekit-upload.ts` utility
   - Updated `client/src/pages/admin/settings.tsx` 
   - Functions simplified from 50+ lines to 10 lines each
2. [ ] Test all upload flows
3. [ ] Audit database for Cloudinary URLs
4. [ ] Remove GCS code
5. [ ] Remove Cloudinary code from routes (keep for cleanup job until all media migrated)
6. [ ] Update environment variables
7. [ ] Remove unused npm packages (cloudinary, @google-cloud/storage)
