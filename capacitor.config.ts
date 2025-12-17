import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.promiseelectronics.customer',
    appName: 'Promise Electronics',
    webDir: 'dist/public',
    server: {
        androidScheme: 'https',
        // Production server URL - the app will connect to this
        // url: 'https://promiseelectronics.com',
        // Clear text allowed for development (remove in production)
        // cleartext: false,
    },
    plugins: {
        SplashScreen: {
            launchShowDuration: 2000,
            launchAutoHide: true,
            backgroundColor: '#0ea5e9',
            androidSplashResourceName: 'splash',
            androidScaleType: 'CENTER_CROP',
            showSpinner: true,
            spinnerColor: '#ffffff',
        },
        StatusBar: {
            style: 'DARK',
            backgroundColor: '#000000',
        },
        PushNotifications: {
            presentationOptions: ['badge', 'sound', 'alert'],
        },
        Keyboard: {
            resize: 'body',
            resizeOnFullScreen: true,
        },
    },
    android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false,
    },
};

export default config;
