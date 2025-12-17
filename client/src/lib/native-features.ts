/**
 * Native features wrapper for Capacitor plugins
 * Use these functions to access native device capabilities
 */

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

// Check if running on native platform
export const isNative = Capacitor.isNativePlatform();

/**
 * Camera Functions
 */

// Take a photo or select from gallery
export async function takePhoto(): Promise<string | null> {
    if (!isNative) {
        console.warn('Camera not available on web');
        return null;
    }

    try {
        const photo = await Camera.getPhoto({
            quality: 80,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Prompt, // Ask user to choose camera or gallery
        });

        return photo.base64String ? `data:image/jpeg;base64,${photo.base64String}` : null;
    } catch (error) {
        console.error('Camera error:', error);
        return null;
    }
}

// Select photo from gallery only
export async function selectFromGallery(): Promise<string | null> {
    if (!isNative) {
        console.warn('Gallery not available on web');
        return null;
    }

    try {
        const photo = await Camera.getPhoto({
            quality: 80,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Photos,
        });

        return photo.base64String ? `data:image/jpeg;base64,${photo.base64String}` : null;
    } catch (error) {
        console.error('Gallery error:', error);
        return null;
    }
}

/**
 * Haptic Feedback Functions
 */

// Light haptic feedback (for button taps)
export async function hapticLight(): Promise<void> {
    if (!isNative) return;
    try {
        await Haptics.impact({ style: ImpactStyle.Light });
    } catch (error) {
        console.error('Haptics error:', error);
    }
}

// Medium haptic feedback (for confirmations)
export async function hapticMedium(): Promise<void> {
    if (!isNative) return;
    try {
        await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (error) {
        console.error('Haptics error:', error);
    }
}

// Heavy haptic feedback (for important actions)
export async function hapticHeavy(): Promise<void> {
    if (!isNative) return;
    try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
        console.error('Haptics error:', error);
    }
}

/**
 * Push Notifications Functions
 */

// Initialize push notifications
export async function initPushNotifications(): Promise<string | null> {
    if (!isNative) {
        console.warn('Push notifications not available on web');
        return null;
    }

    try {
        // Request permission
        const permission = await PushNotifications.requestPermissions();

        if (permission.receive === 'granted') {
            // Register for push notifications
            await PushNotifications.register();

            // Listen for registration token
            return new Promise((resolve) => {
                PushNotifications.addListener('registration', (token) => {
                    console.log('Push registration token:', token.value);
                    resolve(token.value);
                });

                PushNotifications.addListener('registrationError', (error) => {
                    console.error('Push registration error:', error);
                    resolve(null);
                });
            });
        }

        return null;
    } catch (error) {
        console.error('Push notification error:', error);
        return null;
    }
}

// Add listener for incoming push notifications
export function onPushNotificationReceived(
    callback: (notification: { title?: string; body?: string; data?: Record<string, unknown> }) => void
): void {
    if (!isNative) return;

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
        callback({
            title: notification.title,
            body: notification.body,
            data: notification.data,
        });
    });
}

// Add listener for push notification action (when user taps notification)
export function onPushNotificationAction(
    callback: (notification: { title?: string; body?: string; data?: Record<string, unknown> }) => void
): void {
    if (!isNative) return;

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        callback({
            title: action.notification.title,
            body: action.notification.body,
            data: action.notification.data,
        });
    });
}

/**
 * Keyboard Functions
 */

// Hide the keyboard
export async function hideKeyboard(): Promise<void> {
    if (!isNative) return;
    try {
        await Keyboard.hide();
    } catch (error) {
        console.error('Keyboard error:', error);
    }
}

// Listen for keyboard show/hide
export function onKeyboardChange(
    onShow: (height: number) => void,
    onHide: () => void
): void {
    if (!isNative) return;

    Keyboard.addListener('keyboardWillShow', (info) => {
        onShow(info.keyboardHeight);
    });

    Keyboard.addListener('keyboardWillHide', () => {
        onHide();
    });
}

/**
 * Splash Screen Functions
 */

// Hide the splash screen
export async function hideSplashScreen(): Promise<void> {
    if (!isNative) return;
    try {
        await SplashScreen.hide();
    } catch (error) {
        console.error('Splash screen error:', error);
    }
}

// Show the splash screen
export async function showSplashScreen(): Promise<void> {
    if (!isNative) return;
    try {
        await SplashScreen.show();
    } catch (error) {
        console.error('Splash screen error:', error);
    }
}

/**
 * Status Bar Functions
 */

// Set status bar style
export async function setStatusBarStyle(style: 'dark' | 'light'): Promise<void> {
    if (!isNative) return;
    try {
        await StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light });
    } catch (error) {
        console.error('Status bar error:', error);
    }
}

// Set status bar background color
export async function setStatusBarColor(color: string): Promise<void> {
    if (!isNative) return;
    try {
        await StatusBar.setBackgroundColor({ color });
    } catch (error) {
        console.error('Status bar error:', error);
    }
}
