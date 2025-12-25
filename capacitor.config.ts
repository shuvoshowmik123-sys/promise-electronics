import type { CapacitorConfig } from '@capacitor/cli';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const config: CapacitorConfig = {
  appId: 'com.promiseelectronics.customer',
  appName: 'TV ডাক্তার',
  webDir: 'dist/public',
  // server: {
  //   url: 'http://192.168.1.114:5083',
  //   cleartext: true
  // },
  android: {
    // Critical for Android 15+ - Ensures status bar icons are visible
    adjustMarginsForEdgeToEdge: "auto",
    // Custom User-Agent for Firewall Bypass (Stealth Mode - Mimic Chrome)
    overrideUserAgent: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,  // Disable native splash - we use our own React splash
      launchAutoHide: true,
      backgroundColor: "#0f172a",
    },
    StatusBar: {
      style: "LIGHT", // Dark text on light backgrounds
      backgroundColor: "#ffffff",
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      clientId: process.env.GOOGLE_CLIENT_ID || '158965145454-4mi8aafaqrm6b2tfkn5qum2epin3lk4j.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;

