import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.promiseelectronics.app',
  appName: 'Promise Electronics',
  webDir: 'dist/public',
  server: {
    url: 'https://promise-electronics.netlify.app/',
    cleartext: true
  }
};

export default config;
