import { createContext, useContext, ReactNode, useEffect } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { isNative } from "@/lib/config";

interface PushNotificationContextType {
    requestPermission: () => Promise<boolean>;
    isSupported: boolean;
}

const PushNotificationContext = createContext<PushNotificationContextType | undefined>(undefined);

export function PushNotificationProvider({ children }: { children: ReactNode }) {
    const { customer, isAuthenticated } = useCustomerAuth();

    const { requestPermission, isSupported } = usePushNotifications({
        userId: isAuthenticated && customer ? customer.id : undefined,
        onNotificationReceived: (notification) => {
            console.log("[PushProvider] Notification received:", notification);
        },
        onNotificationTapped: (action) => {
            console.log("[PushProvider] Notification tapped:", action);
        },
    });

    // Initialize push notifications when user logs in
    useEffect(() => {
        if (isNative && isAuthenticated && customer) {
            console.log("[PushProvider] User logged in, initializing push...");
        }
    }, [isAuthenticated, customer]);

    return (
        <PushNotificationContext.Provider value={{ requestPermission, isSupported }}>
            {children}
        </PushNotificationContext.Provider>
    );
}

export function usePushNotificationContext() {
    const context = useContext(PushNotificationContext);
    if (context === undefined) {
        throw new Error("usePushNotificationContext must be used within a PushNotificationProvider");
    }
    return context;
}
