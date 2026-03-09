import { useEffect, useRef, useCallback } from 'react';
import { useCustomerAuth } from '@/contexts/CustomerAuthContext';

interface IdleTimeoutProviderProps {
    children: React.ReactNode;
    /**
     * Timeout in minutes. Default is 10 minutes.
     */
    timeoutMinutes?: number;
}

export function IdleTimeoutProvider({ children, timeoutMinutes = 10 }: IdleTimeoutProviderProps) {
    const { logout, customer } = useCustomerAuth();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const customerRef = useRef(customer);

    // Keep ref in sync without triggering useEffect re-runs
    useEffect(() => {
        customerRef.current = customer;
    }, [customer]);

    // Convert minutes to milliseconds
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Use a stable reference to avoid triggering useCallback loops
    const logoutMutation = async () => {
        await logout();
    };

    const resetTimer = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Only start the timer if a user is logged in
        if (customerRef.current) {
            timeoutRef.current = setTimeout(async () => {
                // Perform logout
                try {
                    await logoutMutation();
                } catch (e) {
                    console.error("Idle timeout logout failed", e);
                } finally {
                    // Always reload to clear state and release connections
                    window.location.reload();
                }
            }, timeoutMs);
        }
    }, [timeoutMs]); // Removed customer dependency to prevent loop

    useEffect(() => {
        // Debounce actual DOM listeners to reduce CPU usage
        let ticking = false;

        const handleActivity = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    resetTimer();
                    ticking = false;
                });
                ticking = true;
            }
        };

        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

        events.forEach((event) => {
            window.addEventListener(event, handleActivity, { passive: true });
        });

        // Initialize timer
        resetTimer();

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            events.forEach((event) => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [resetTimer]);

    return <>{children}</>;
}
