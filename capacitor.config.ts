import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.promiseelectronics.app',
  appName: 'Promise Electronics',
  webDir: 'dist/public',
  // server: {
  //   url: 'http://192.168.1.114:5083',
  //   cleartext: true
  // },
  android: {
    // Critical for Android 15+ - Ensures status bar icons are visible
    adjustMarginsForEdgeToEdge: "auto",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0f172a",
      showSpinner: true,
      androidScaleType: "CENTER_CROP"
    },
    StatusBar: {
      style: "LIGHT", // Dark text on light backgrounds
      backgroundColor: "#ffffff",
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      clientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

