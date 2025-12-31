import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'wouter';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Root screens where pressing back should exit the app
 */
const ROOT_SCREENS = [
    '/native/home',
    '/native/login',
    '/native/splash',
];

/**
 * Screens that should navigate to a specific parent instead of going back
 */
const PARENT_ROUTES: Record<string, string> = {
    '/native/settings/edit-profile': '/native/settings',
    '/native/settings/change-password': '/native/settings',
    '/native/repair': '/native/home',
    '/native/chat': '/native/home',
    '/native/camera-lens': '/native/home',
};

/**
 * useAndroidBack - Hook to handle Android hardware back button
 * 
 * Behavior:
 * 1. If a modal/dialog is open, close it
 * 2. If on a root screen, exit the app
 * 3. If on a child screen, navigate to parent or go back
 * 4. Provides haptic feedback on back action
 */
export function useAndroidBack() {
    const [location, setLocation] = useLocation();
    const lastBackPress = useRef<number>(0);

    useEffect(() => {
        // Only run on native platforms
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        const handleBackButton = async () => {
            console.log('[BackButton] Pressed on:', location);

            // 1. Check for open modals/dialogs (Radix UI uses data-state="open")
            const openModals = document.querySelectorAll(
                '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]'
            );

            if (openModals.length > 0) {
                console.log('[BackButton] Closing modal');
                // Close the modal by simulating Escape key
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true
                }));
                return;
            }

            // 2. Check for open popovers/dropdowns
            const openPopovers = document.querySelectorAll(
                '[data-state="open"][data-radix-popper-content-wrapper]'
            );

            if (openPopovers.length > 0) {
                console.log('[BackButton] Closing popover');
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true
                }));
                return;
            }

            // 3. Check for open sheets/drawers
            const openSheets = document.querySelectorAll('[vaul-drawer][data-state="open"]');
            if (openSheets.length > 0) {
                console.log('[BackButton] Closing drawer');
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true
                }));
                return;
            }

            // Provide haptic feedback
            try {
                await Haptics.impact({ style: ImpactStyle.Light });
            } catch (e) {
                // Haptics not available
            }

            // 4. Check if on root screen
            if (ROOT_SCREENS.includes(location)) {
                const now = Date.now();

                // Double-tap to exit (within 2 seconds)
                if (now - lastBackPress.current < 2000) {
                    console.log('[BackButton] Exiting app');
                    App.exitApp();
                } else {
                    lastBackPress.current = now;
                    console.log('[BackButton] Press again to exit');
                    // Optionally show a toast here: "Press back again to exit"
                }
                return;
            }

            // 5. Check for predefined parent route
            if (PARENT_ROUTES[location]) {
                console.log('[BackButton] Navigating to parent:', PARENT_ROUTES[location]);
                setLocation(PARENT_ROUTES[location]);
                return;
            }

            // 6. Handle repair wizard steps (check for step > 1)
            const wizardBackButton = document.querySelector('[data-wizard-back]') as HTMLButtonElement;
            if (wizardBackButton) {
                console.log('[BackButton] Triggering wizard back');
                wizardBackButton.click();
                return;
            }

            // 7. Default: Go back in history
            if (window.history.length > 1) {
                console.log('[BackButton] Going back in history');
                window.history.back();
            } else {
                // No history, go to home
                console.log('[BackButton] No history, going home');
                setLocation('/native/home');
            }
        };

        // Register listener
        const listener = App.addListener('backButton', handleBackButton);

        // Cleanup
        return () => {
            listener.then(handle => handle.remove());
        };
    }, [location, setLocation]);
}

export default useAndroidBack;
