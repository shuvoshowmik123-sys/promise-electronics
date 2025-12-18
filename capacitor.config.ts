import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.promiseelectronics.app',
  appName: 'Promise Electronics',
  webDir: 'dist/public',
  server: {
    url: 'https://promise-electronics.netlify.app/',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: "#ffffffff",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
  },
};

export default config;
