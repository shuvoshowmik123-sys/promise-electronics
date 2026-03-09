# Archived Admin App (Flutter) - Product Requirement Document (PRD)

> **Project:** Promise Integrated System  
> **Component:** Admin Mobile App (Native Android/iOS)  
> **Version:** 1.0  
> **Status:** Archived and replaced by `workforce_app_flutter/`  

---

## 1. Executive Summary

The **Admin App (Flutter)** is the mobile counterpart to the Web Admin Panel, designed to empower staff with "on-the-go" management capabilities. While the Web Admin serves as the stationary command center, the Flutter App extends critical workflows—specifically Point of Sale (POS), Job Tracking, and Technical Support—to handheld devices.

It bridges the physical gap in the repair shop, allowing technicians to update status at the workbench, cashiers to process sales on the floor, and managers to monitor operations remotely.

---

## 2. System Architecture & Relations

The retired Flutter app was built in `admin_app_flutter/`. The active mobile codebase is now `workforce_app_flutter/`.

### 2.1 Ecosystem Map

| Component | Relation to Flutter App |
|-----------|-------------------------|
| **Web Admin Panel** | **Peer Relationship:** Both are frontend clients consuming the same Backend API. Updates made here (e.g., "Job Completed") are instantly reflected on the Web Admin via the shared database. |
| **Server API** | **Data Source:** Connects via REST using `Dio` and shares the same session-based authentication (`connect-pg-simple` cookie persistence). |
| **Customer App** | **Interaction Target:** The Flutter App is used to separate "Service Requests" submitted via the Customer App, converting them into active Job Tickets. |
| **Native Hardware** | **Exclusive Capabilities:** Unlike the Web Admin, the Flutter App leverages device hardware: <br> • **Camera:** QA Scanning for creating/tracking jobs. <br> • **Bluetooth:** Thermal receipt printing for POS. <br> • **Push Notifications:** Real-time alerts via Firebase (FCM). |

### 2.2 Tech Stack (Mobile Specific)
*   **Framework:** Flutter (Dart)
*   **Networking:** Dio + CookieJar (Session management)
*   **State Management:** Provider
*   **Local Storage:** Flutter Secure Storage (Credentials/Tokens)
*   **Hardware Plugins:**
    *   `mobile_scanner`: QR/Barcode scanning
    *   `blue_thermal_printer`: Bluetooth receipt printing
    *   `geolocator`: Location services (optional for attendance)
    *   `firebase_messaging`: Push notifications

---

## 3. User Roles & Limitations

The App adapts its UI based on the logged-in user's role (Super Admin, Manager, Cashier, Technician).

### 3.1 Role-Specific Views

| Role | Primary App Focus | Limitations |
| :--- | :--- | :--- |
| **Super Admin** | **Full Oversight:** Access to Dashboard, Finance, Users, and all Reports. | None. |
| **Manager** | **Operations:** Manage Job Tickets, Inventory, and Staff Attendance. | Restricted from deleting core records and referencing Web Admin key settings. |
| **Technician** | **Workbench Mode:** A simplified view focused solely on "My Jobs". Can update status, add notes, and request parts. | **Strictly Limited:** Cannot see Finance, POS, Sales Reports, or other Staff details. |
| **Cashier** | **Point of Sale:** Dedicated POS screen for rapid checkout. | Restricted from Repair details (except status check) and administrative settings. |

---

## 4. Key Workflows & Mobile Enhancements

### 4.1 Mobile Point of Sale (POS)
*   **Hardware Integration:** Connects to Bluetooth Thermal Printers for instant receipt generation.
*   **Workflow:**
    1.  Add items/jobs to cart.
    2.  Select Customer (Walk-in or Search).
    3.  Tap "Print & Checkout".
    4.  **Result:** Updates Inventory and Finance immediately; prints physical receipt.

### 4.2 Code-Based Job Tracking
*   **QR/Barcode Scanning:** Use the camera to scan a device's label or job sheet.
*   **Action:** Instantly opens the Job Details screen to update status, effectively replacing manual ID entry.
*   **Use Case:** A technician grabs a TV, scans the sticker, marks it "Diagnosed", and puts it back.

### 4.3 Technician Dashboard
*   **Personal Queue:** Shows only jobs assigned to the logged-in user.
*   **Push Alerts:** Technicians receive a buzz notification when a new job is assigned to them.
*   **Part Requests:** "Request Part" button directly from the repair screen.

### 4.4 Staff Attendance
*   **Check-In/Out:** Simple big-button interface for daily attendance.
*   **Validation:** Can optionally enforce Geofencing or WiFi SSID checks (future scope) to ensure presence in the shop.

---

## 5. Technical Constraints & Data Handling

### 5.1 Authentication & Session
*   **Cookie Persistence:** Uses `DioCookieManager` to persist the `connect.sid` cookie, mirroring the web browser's behavior.
*   **Token Refresh:** Handles 401 Unauthorized errors by redirecting to Login.

### 5.2 Offline Limitations
*   Like the Web Admin, the Flutter App is **API-Dependent**. It requires an internet connection for all transactions.
*   *Note:* It does NOT cache job data for offline editing (sync conflicts risk).

### 5.3 JSON Compatibility
*   **Dart Models:** Must manually parse the complex JSON fields (`features`, `items`) that are stored as strings in the SQL database, matching the manual parsing done in the React frontend.
