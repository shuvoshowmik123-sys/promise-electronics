# 📱 Promise Electronics - Native App Documentation

> **TV ডাক্তার (TV Doctor)** - A Capacitor-powered native Android app for Promise Electronics' customer service platform.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Capacitor Plugins](#capacitor-plugins)
4. [Project Structure](#project-structure)
5. [Animation System](#animation-system)
6. [Design System & Styling](#design-system--styling)
7. [Components](#components)
8. [Pages](#pages)
9. [API Integration & Admin Panel Connection](#api-integration--admin-panel-connection)
10. [Authentication System](#authentication-system)
11. [Push Notifications](#push-notifications)
12. [AI Features](#ai-features)
13. [Build & Deployment](#build--deployment)

---

## Overview

The native app is built using **Capacitor** to wrap a React + Vite web application, providing native Android capabilities while maintaining web development workflows. The app serves as the customer portal for Promise Electronics, allowing customers to:

- 🔧 Submit repair requests with AI-powered diagnostics
- 📦 Track service orders in real-time
- 🛒 Shop for electronics and parts
- 💬 Chat with "Daktar Vai" AI assistant
- 🔔 Receive push notifications for order updates
- 👤 Manage their profile and addresses

**App Name:** TV ডাক্তার  
**Package ID:** `com.promiseelectronics.customer`

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | React 19 |
| **Build Tool** | Vite 7 |
| **Native Bridge** | Capacitor 7 |
| **Routing** | Wouter |
| **State Management** | TanStack React Query |
| **Animations** | Framer Motion 12 |
| **Styling** | Tailwind CSS 4 |
| **Forms** | React Hook Form + Zod |
| **UI Components** | Radix UI Primitives |
| **Icons** | Lucide React |
| **Internationalization** | i18next |
| **Backend Communication** | REST API + CapacitorHttp |

---

## Capacitor Plugins

### Core Plugins

| Plugin | Version | Purpose |
|--------|---------|---------|
| `@capacitor/core` | ^7.4.4 | Core Capacitor runtime |
| `@capacitor/android` | ^7.4.4 | Android platform support |
| `@capacitor/app` | ^7.1.1 | App lifecycle management |
| `@capacitor/camera` | ^7.0.3 | Photo capture for repair diagnostics |
| `@capacitor/haptics` | ^7.0.4 | Tactile feedback on button presses |
| `@capacitor/keyboard` | ^7.0.4 | Keyboard visibility handling |
| `@capacitor/preferences` | ^7.0.3 | Secure key-value storage |
| `@capacitor/push-notifications` | ^7.0.4 | Firebase Cloud Messaging |
| `@capacitor/splash-screen` | ^7.0.4 | Custom splash screen |
| `@capacitor/status-bar` | ^7.0.4 | Status bar styling |

### Community & Third-Party Plugins

| Plugin | Purpose |
|--------|---------|
| `@capacitor-community/speech-recognition` | Voice input for AI chat |
| `@capgo/capacitor-native-biometric` | Fingerprint/Face authentication |
| `@codetrix-studio/capacitor-google-auth` | Google OAuth sign-in |

### Capacitor Configuration

```typescript
// capacitor.config.ts
{
  appId: 'com.promiseelectronics.customer',
  appName: 'TV ডাক্তার',
  webDir: 'dist/public',
  android: {
    adjustMarginsForEdgeToEdge: "auto",
    overrideUserAgent: "Mozilla/5.0 (Linux; Android 10; K)..."
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#0f172a"
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#ffffff"
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      clientId: '...'
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true
    }
  }
}
```

---

## Project Structure

```
client/src/native-app/
├── NativeLayout.tsx          # Page wrapper with slide animations
├── components/
│   ├── AnimatedButton.tsx    # Haptic-enabled button with variants
│   ├── BottomNav.tsx         # Fixed bottom navigation bar
│   ├── NativeHeader.tsx      # Dynamic header with notifications
│   ├── NativeShell.tsx       # Safe area handler for status/nav bars
│   ├── NotificationsPopup.tsx # Slide-out notifications panel
│   ├── PullToRefresh.tsx     # Native-style pull-to-refresh
│   └── SkeletonCard.tsx      # Loading placeholder component
├── pages/
│   ├── Home.tsx              # Dashboard with quick actions
│   ├── Login.tsx             # Phone/password authentication
│   ├── Register.tsx          # New user registration
│   ├── Splash.tsx            # Animated splash screen
│   ├── Profile.tsx           # User profile overview
│   ├── EditProfile.tsx       # Profile editing with image upload
│   ├── Settings.tsx          # App settings & preferences
│   ├── ChangePassword.tsx    # Password management
│   ├── Addresses.tsx         # Address book management
│   ├── RepairRequest.tsx     # Multi-step repair wizard
│   ├── RepairDetails.tsx     # Single repair details
│   ├── RepairHistory.tsx     # Past repairs list
│   ├── Bookings.tsx          # Active repair tracking
│   ├── Shop.tsx              # Products catalog
│   ├── OrderHistory.tsx      # Shop order history
│   ├── ChatTab.tsx           # AI assistant (Daktar Vai)
│   ├── CameraLens.tsx        # AI-powered part identification
│   ├── Warranties.tsx        # Warranty tracking
│   ├── Support.tsx           # Help & contact
│   ├── About.tsx             # App information
│   ├── PrivacyPolicy.tsx     # Legal document
│   └── TermsAndConditions.tsx # Legal document
```

---

## Animation System

### Page Transitions

The app uses Framer Motion for smooth iOS-like page transitions:

```typescript
// NativeLayout.tsx - Slide animation for page transitions
<motion.div
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: -20 }}
  transition={{ duration: 0.3, ease: "easeOut" }}
>
```

### App Opening Animation (Container Transform)

iOS-style "button expands to page" effect:

```typescript
// AppOpeningContext.tsx
<motion.div
  initial={{
    borderRadius: 16,
    width: buttonRect.width,
    height: buttonRect.height,
  }}
  animate={{
    borderRadius: 0,
    width: '100vw',
    height: '100vh',
  }}
  transition={{
    type: 'spring',
    stiffness: 300,
    damping: 30,
  }}
/>
```

### AnimatedButton Variants

| Variant | Use Case | Effect |
|---------|----------|--------|
| `default` | Standard buttons | Scale 88%, opacity 85% |
| `iconExpand` | Icon buttons | Scale 85%, opacity 70% |
| `cardExpand` | Cards | Scale 94%, y +4px |
| `rowExpand` | List items | Scale 96%, x +8px |
| `pulse` | Primary CTAs | Scale 88% with glow |
| `iconSlide` | Back buttons | Scale 85%, x -8px |
| `avatarZoom` | Profile pics | Scale 115% |
| `textHighlight` | Text links | Scale 95%, opacity 60% |

### Haptic Feedback

All button interactions trigger haptic feedback:

```typescript
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Light feedback for most buttons
await Haptics.impact({ style: ImpactStyle.Light });

// Medium feedback for primary CTAs and cards
await Haptics.impact({ style: ImpactStyle.Medium });
```

---

## Design System & Styling

### CSS Variables (Native Theme)

```css
/* Light Mode */
--color-native-primary: hsl(199 89% 48%);
--color-native-bg: hsl(210 40% 98%);
--color-native-surface: hsl(0 0% 100%);
--color-native-card: hsl(0 0% 100%);
--color-native-text: hsl(222 47% 11%);
--color-native-text-muted: hsl(215.4 16.3% 46.9%);
--color-native-border: hsl(214.3 31.8% 91.4%);
--color-native-input: hsl(210 40% 96%);

/* Dark Mode (.native-dark, .dark) */
--color-native-primary: hsl(199 89% 55%);
--color-native-bg: hsl(222 47% 8%);
--color-native-surface: hsl(217 33% 12%);
--color-native-card: hsl(217 28% 15%);
--color-native-text: hsl(210 40% 98%);
--color-native-text-muted: hsl(215 20% 65%);
--color-native-border: hsl(217 25% 20%);
--color-native-input: hsl(217 30% 12%);
```

### Safe Area Handling

```css
/* Global CSS Lock for Native Apps */
html.native-app-mode,
html.native-app-mode body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: fixed;
  overscroll-behavior-y: none;
}

:root {
  --safe-top: env(safe-area-inset-top);
  --safe-bottom: env(safe-area-inset-bottom);
}
```

### Edge-to-Edge Display (Android)

```java
// MainActivity.java
WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
```

```xml
<!-- styles.xml -->
<item name="android:statusBarColor">@android:color/transparent</item>
<item name="android:navigationBarColor">@android:color/transparent</item>
```

---

## Components

### NativeShell

Handles safe area insets and status bar styling:

```typescript
<NativeShell
  header={<HeaderContent />}
  footer={<FooterContent />}
  statusBarStyle="dark" // or "light"
>
  {children}
</NativeShell>
```

### BottomNav

Fixed bottom navigation with 4 tabs:

| Tab | Icon | Route |
|-----|------|-------|
| Home | Home | `/native/home` |
| Shop | ShoppingCart | `/native/shop` |
| Repairs | Wrench | `/native/bookings` |
| Profile | User | `/native/profile` |

### PullToRefresh

Native-style pull-to-refresh with visual feedback:

```typescript
<PullToRefresh onRefresh={async () => {
  await queryClient.invalidateQueries({ queryKey: ["data"] });
}}>
  {content}
</PullToRefresh>
```

### NotificationsPopup

Slide-out panel for notifications with real-time updates.

---

## Pages

### Home (Dashboard)

- Hero section with dynamic banner image
- Quick action buttons (New Repair, Buy Parts, Track Order, Help Center, Daktar Vai)
- Current active repair card with progress bar
- Promotional "For You" carousel
- App Opening animations on key buttons

### RepairRequest (Multi-Step Wizard)

6-step repair submission flow:

1. **Service Mode** - Pickup or drop-off
2. **Service Selection** - Choose service type
3. **Device Details** - Brand, model, screen size
4. **Issue Selection** - Primary issue and description
5. **Photo Upload** - AI-powered damage assessment
6. **Review & Submit** - Confirm and submit

Features:
- AI damage assessment via camera
- Voice input for descriptions
- Image upload via ImageKit
- Estimated cost calculation

### ChatTab (Daktar Vai AI)

AI-powered conversational assistant:

- Text and voice input
- Image analysis for diagnostics
- Repair booking through conversation
- Typing indicators and animations
- Bengla language support

### CameraLens

AI-powered visual tools:

- **Part Identification** - Identify TV components
- **Damage Assessment** - Analyze visible damage
- **Barcode Scanner** - Look up parts by barcode

---

## API Integration & Admin Panel Connection

### API Architecture

The native app uses `CapacitorHttp` for API calls to bypass WebView CORS restrictions:

```typescript
// Native HTTP implementation
if (isNative) {
  response = await CapacitorHttp.get({
    url: fullUrl,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### API Endpoints Used by Native App

#### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/register` | POST | New user registration |
| `/api/customer/login` | POST | Phone/password login |
| `/api/customer/logout` | POST | Session logout |
| `/api/customer/me` | GET | Current user session |
| `/api/customer/profile` | PUT | Update profile |
| `/api/customer/change-password` | POST | Change password |

#### Service Requests
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/service-requests` | GET | Get all user's requests |
| `/api/customer/service-requests/:id` | GET | Get single request with timeline |
| `/api/customer/track/:ticketNumber` | GET | Track by ticket number |
| `/api/quotes` | POST | Submit repair quote request |
| `/api/quotes/:id/accept` | POST | Accept quote |
| `/api/quotes/:id/decline` | POST | Decline quote |

#### Shop & Orders
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shop/inventory` | GET | Get products for website |
| `/api/customer/orders` | GET | Get user's shop orders |
| `/api/orders` | POST | Create new order |
| `/api/products/:id/variants` | GET | Get product variants |

#### Warranties
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/customer/warranties` | GET | Get all warranties |

#### Notifications
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/notifications` | GET | Get all notifications |
| `/api/notifications/:id/read` | PATCH | Mark as read |
| `/api/notifications/read-all` | PATCH | Mark all as read |

#### AI Features
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat` | POST | Chat with Daktar Vai |
| `/api/ai/inspect` | POST | Analyze image for damage |
| `/api/lens/identify` | POST | Identify part from image |
| `/api/lens/assess` | POST | Assess damage from image |
| `/api/lens/barcode` | POST | Read barcode from image |

### Real-Time Updates

The app syncs with the admin panel through:

1. **React Query** - Automatic refetching and caching
2. **Push Notifications** - Firebase Cloud Messaging for order updates
3. **Pull-to-Refresh** - Manual data refresh

---

## Authentication System

### Flow

```
┌─────────────────┐
│    Splash.tsx   │
│  (Check Auth)   │
└────────┬────────┘
         │
         ▼
    ┌────────────┐     No      ┌─────────────┐
    │ Logged In? │──────────▶ │   Login.tsx  │
    └────────────┘             └──────┬───────┘
         │ Yes                        │
         ▼                            ▼
    ┌──────────┐              ┌──────────────┐
    │ Home.tsx │              │ Register.tsx │
    └──────────┘              └──────────────┘
```

### Biometric Authentication

```typescript
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

// Check availability
const { isAvailable } = await NativeBiometric.isAvailable();

// Verify with biometrics
await NativeBiometric.verifyIdentity({
  reason: 'Login to your account',
  title: 'Log in',
});

// Store/retrieve credentials securely
await NativeBiometric.setCredentials({ username, password, server });
const credentials = await NativeBiometric.getCredentials({ server });
```

### Persistent Sessions

Credentials stored using `@capacitor/preferences` for auto-login:

```typescript
import { Preferences } from '@capacitor/preferences';

await Preferences.set({ key: 'auth_session', value: JSON.stringify(data) });
const { value } = await Preferences.get({ key: 'auth_session' });
```

---

## Push Notifications

### Setup

1. **Firebase Configuration**
   - `google-services.json` in `android/app/`
   - Firebase Admin SDK on backend

2. **Registration Flow**

```typescript
import { PushNotifications } from '@capacitor/push-notifications';

// Request permission
await PushNotifications.requestPermissions();

// Register for notifications
await PushNotifications.register();

// Listen for token
PushNotifications.addListener('registration', (token) => {
  // Send token to backend
  await api.registerDeviceToken(token.value);
});
```

### Notification Types

| Type | Trigger | Content |
|------|---------|---------|
| `order_update` | Status change | "Your repair status updated to..." |
| `quote_ready` | Quote provided | "Quote ready for your repair" |
| `repair_complete` | Job finished | "Your device is ready for pickup" |
| `promotion` | Admin broadcast | Marketing messages |

---

## AI Features

### Daktar Vai (AI Assistant)

Powered by Google Gemini AI:

```typescript
const response = await aiApi.chat(message, chatHistory, optionalImage);
// Returns: { text, booking?, ticketData?, error? }
```

Features:
- Natural language repair booking
- Image-based diagnostics
- Bengla language support
- Context-aware conversations

### Camera Lens

AI-powered visual identification:

```typescript
// Part identification
await lensApi.identifyPart(base64Image);
// Returns: { label, confidence, partInfo, rawText }

// Damage assessment
await lensApi.assessDamage(base64Image);
// Returns: { damage: string[], rawText }

// Barcode reading
await lensApi.readBarcode(base64Image);
// Returns: { barcode, partInfo }
```

---

## Build & Deployment

### Development

```bash
# Start dev server
npm run dev

# Sync web assets to Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

### Production Build

```bash
# Build web + sync to native
npm run build:mobile

# Generate APK in Android Studio
# Build > Build Bundle(s) / APK(s) > Build APK(s)
```

### Key Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build:mobile` | Build and sync to Capacitor |
| `npm run android` | Open Android Studio |
| `npm run android:sync` | Sync web assets only |

### APK Location

After building in Android Studio:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Appendix

### External Services

| Service | Purpose |
|---------|---------|
| **ImageKit** | Image upload and CDN |
| **Firebase** | Push notifications (FCM) |
| **Google Cloud** | OAuth and AI (Gemini) |
| **PostgreSQL (Neon)** | Production database |

### Environment Variables

```env
# API
VITE_API_URL=https://your-api.vercel.app

# ImageKit
IMAGEKIT_PUBLIC_KEY=...
IMAGEKIT_PRIVATE_KEY=...
IMAGEKIT_URL_ENDPOINT=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Firebase
# (Uses google-services.json for Android)
```

---

**Last Updated:** December 25, 2024  
**Maintained by:** Promise Electronics Development Team
