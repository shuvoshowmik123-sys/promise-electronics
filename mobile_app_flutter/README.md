# TV DAKTAR - Flutter Prototype

This is a Flutter prototype for the TV DAKTAR customer mobile app.

## Prerequisites

1. Install Flutter SDK: https://docs.flutter.dev/get-started/install
2. Add Flutter to your PATH
3. Run `flutter doctor` to verify installation

## Setup

```bash
# Navigate to this directory
cd mobile_app_flutter

# Get dependencies
flutter pub get

# Run on Android emulator
flutter run

# Build APK
flutter build apk --release
```

## Project Structure

```
lib/
├── main.dart                 # App entry point, theme, navigation
├── config/
│   └── api_config.dart       # Backend API configuration
├── models/
│   └── chat_message.dart     # Chat message model
├── providers/
│   └── chat_provider.dart    # AI chat state management
├── screens/
│   ├── splash_screen.dart    # Boot screen
│   ├── home_screen.dart      # Main dashboard
│   └── daktar_vai_screen.dart # AI Chat screen
├── widgets/
│   ├── daktar_vai_fab.dart   # Floating AI button
│   └── chat_bubble.dart      # Chat message bubble
└── services/
    └── api_service.dart      # HTTP client
```

## Backend Connection

This app connects to your existing Node.js backend at:
- Production: https://promiseelectronics.com
- Development: http://10.0.2.2:5083 (Android Emulator)

## Features Implemented

- [x] Daktar Vai AI Chat with voice input
- [x] Premium dark theme
- [x] Spring animations
- [ ] Home Screen (coming soon)
- [ ] Service Booking (coming soon)
