# Investigation Report: Native App Connectivity Issues

## 1. Problem Description
The native Android app fails to connect to the backend ("Failed to fetch"), while the web version and admin panel work correctly. The user has recompiled the app but the issue persists.

## 2. Configuration Analysis

### A. API Configuration (`client/src/lib/config.ts`)
The app is configured to connect to the **Production Server**:
```typescript
export const API_BASE_URL = isNative
    ? 'https://promiseelectronics.com'
    : '';
```
*   **Finding:** The app attempts to reach `https://promiseelectronics.com`.
*   **Implication:** If you are trying to test against your **Local Computer** (localhost), this configuration is **WRONG**. The app is ignoring your local server and trying to hit the live website.

### B. Server CORS Settings (`server/app.ts`)
```typescript
origin: [
    "https://promiseelectronics.com",
    "capacitor://localhost", // Correct for Android
    ...
]
```
*   **Finding:** The server is correctly configured to accept requests from the Android app (`capacitor://localhost`).

### C. Android Manifest (`AndroidManifest.xml`)
*   **Finding:** `android.permission.INTERNET` is present.
*   **Finding:** `android:usesCleartextTraffic="true"` is **MISSING**.
*   **Implication:** The app allows HTTPS traffic but blocks HTTP traffic. Since the config points to HTTPS, this should be fine *unless* you try to switch to a local HTTP server.

### D. Capacitor Config (`capacitor.config.ts`)
*   **Finding:** `server.url` is commented out.
*   **Implication:** The app runs in "Bundled Mode". It does **NOT** support Live Reload. Any change to the code requires a full rebuild (`npm run build` -> `npx cap sync` -> Install APK).

## 3. Root Cause Hypotheses

### Hypothesis 1: Intention Mismatch (Local vs. Production)
If you are running the server locally on your computer (`npm run dev`) and expect the app to talk to *that*, it will fail because the app is hardcoded to talk to `https://promiseelectronics.com`.

### Hypothesis 2: Network/DNS Issue on Phone
If you *do* intend to talk to Production, the phone might be unable to resolve `promiseelectronics.com` or the connection is being blocked (e.g., by a firewall or VPN on the phone).

### Hypothesis 3: "Failed to Fetch" due to Cookie Policy
The server uses `SameSite: "lax"` for cookies.
```typescript
cookie: {
    sameSite: "lax",
    secure: true, // in production
}
```
*   **Issue:** Requests from the Android App (`capacitor://localhost`) to the Server (`https://promiseelectronics.com`) are considered **Cross-Site**.
*   **Result:** The browser/WebView might block the cookies/session, causing authentication to fail. However, the initial `/api/health` check (which doesn't require auth) should still work. If `/api/health` fails, it's a network/connectivity issue, not an auth issue.

## 4. Proposed Solution

### Step 1: Clarify Target Environment
Do you want the app to connect to:
1.  **Your Local Computer?** (For development/testing)
2.  **The Live Website?** (For final users)

### Step 2: Fix the Configuration
**If Local:** We must change `API_BASE_URL` to `http://192.168.1.115:5083` AND enable Cleartext Traffic in `AndroidManifest.xml`.
**If Production:** We must ensure the phone can reach the site.

### Step 3: Proper Rebuild
We must ensure the "Bundled" app is actually updated:
1.  `npm run build`
2.  `npx cap sync`
3.  `deploy_wifi.bat`
