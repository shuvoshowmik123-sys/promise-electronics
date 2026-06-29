import { createContext, useContext, ReactNode } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

interface PushNotificationContextType {
    requestPermission: () => Promise<boolean>;
    isSupported: boolean;
}

const PushNotificationContext = createContext<PushNotificationContextType | undefined>(undefined);

export function PushNotificationProvider({ children }: { children: ReactNode }) {
    const { customer, isAuthenticated } = useCustomerAuth();

    const { requestPermission, isSupported } = usePushNotifications({
        userId: isAuthenticated && customer ? customer.id : undefined,
    });

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
