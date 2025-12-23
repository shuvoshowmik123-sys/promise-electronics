import { useEffect, useCallback, useRef } from 'react';
import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import { API_BASE_URL, isNative } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

interface PushNotificationHookOptions {
    userId?: string;
    onNotificationReceived?: (notification: PushNotificationSchema) => void;
    onNotificationTapped?: (notification: ActionPerformed) => void;
}

export function usePushNotifications(options: PushNotificationHookOptions = {}) {
    const { userId, onNotificationReceived, onNotificationTapped } = options;
    const { toast } = useToast();
    const [, navigate] = useLocation();
    const hasRegistered = useRef(false);

    // Register device token with backend
    const registerTokenWithBackend = useCallback(async (token: string) => {
        if (!userId) {
            console.log('[Push] No userId, skipping token registration');
            return;
        }

        try {
            const response = await CapacitorHttp.post({
                url: `${API_BASE_URL}/api/push/register`,
                headers: {
                    'Content-Type': 'application/json',
                },
                data: {
                    userId,
                    token,
                    platform: Capacitor.getPlatform(),
                },
            });

            if (response.status === 200) {
                console.log('[Push] Token registered with backend');
            } else {
                console.error('[Push] Failed to register token:', response.data);
            }
        } catch (error) {
            console.error('[Push] Error registering token:', error);
        }
    }, [userId]);

    // Handle navigation based on notification data
    const handleNotificationNavigation = useCallback((data: any) => {
        if (data?.type === 'order_update' && data?.orderId) {
            navigate(`/native/order/${data.orderId}`);
        } else if (data?.type === 'repair_update' && data?.ticketNumber) {
            navigate(`/native/track/${data.ticketNumber}`);
        } else if (data?.type === 'quote_ready' && data?.serviceRequestId) {
            navigate(`/native/repairs`);
        } else if (data?.route) {
            navigate(data.route);
        }
    }, [navigate]);

    // Initialize push notifications
    const initializePushNotifications = useCallback(async () => {
        if (!isNative || hasRegistered.current) {
            return;
        }

        try {
            // Check current permission status
            let permStatus = await PushNotifications.checkPermissions();
            console.log('[Push] Permission status:', permStatus.receive);

            // Request permission if not granted
            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                console.log('[Push] Notification permission denied');
                return;
            }

            // Register for push notifications
            await PushNotifications.register();
            hasRegistered.current = true;
            console.log('[Push] Registration initiated');

            // Listen for registration success
            PushNotifications.addListener('registration', (token: Token) => {
                console.log('[Push] Device token:', token.value);
                registerTokenWithBackend(token.value);
            });

            // Listen for registration errors
            PushNotifications.addListener('registrationError', (error: any) => {
                console.error('[Push] Registration error:', error);
            });

            // Listen for foreground notifications
            PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
                console.log('[Push] Notification received in foreground:', notification);

                // Show in-app toast for foreground notifications
                toast({
                    title: notification.title || 'New Notification',
                    description: notification.body,
                });

                onNotificationReceived?.(notification);
            });

            // Listen for notification tap/action
            PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
                console.log('[Push] Notification tapped:', action);

                // Handle navigation
                handleNotificationNavigation(action.notification.data);

                onNotificationTapped?.(action);
            });

        } catch (error) {
            console.error('[Push] Initialization error:', error);
        }
    }, [registerTokenWithBackend, onNotificationReceived, onNotificationTapped, toast, handleNotificationNavigation]);

    // Run initialization when userId is available
    useEffect(() => {
        if (isNative && userId) {
            initializePushNotifications();
        }

        // Cleanup listeners on unmount
        return () => {
            if (isNative) {
                PushNotifications.removeAllListeners();
            }
        };
    }, [userId, initializePushNotifications]);

    // Expose method to manually request permissions
    const requestPermission = useCallback(async () => {
        if (!isNative) return false;

        try {
            const result = await PushNotifications.requestPermissions();
            if (result.receive === 'granted') {
                await PushNotifications.register();
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Push] Permission request error:', error);
            return false;
        }
    }, []);

    return {
        requestPermission,
        isSupported: isNative,
    };
}
