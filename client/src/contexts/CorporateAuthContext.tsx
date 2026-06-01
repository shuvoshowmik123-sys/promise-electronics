import { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import type { User } from "@shared/schema";

type SafeUser = Omit<User, "password"> & {
    corporateClientShortCode?: string;
    corporateClientName?: string;
};

interface CorporateAuthContextType {
    user: SafeUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (username: string, password: string, trustDevice?: boolean) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const CorporateAuthContext = createContext<CorporateAuthContextType | undefined>(undefined);

export function CorporateAuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<SafeUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const authVersionRef = useRef(0);

    const fetchUser = async (version = authVersionRef.current) => {
        try {
            const res = await fetch("/api/corporate/auth/me", {
                credentials: "include",
            });
            if (version !== authVersionRef.current) return;
            if (res.ok) {
                const data = await res.json();
                setUser(data);
            } else {
                setUser(null);
            }
        } catch (error) {
            if (version !== authVersionRef.current) return;
            console.error("Failed to fetch corporate user:", error);
            setUser(null);
        } finally {
            if (version === authVersionRef.current) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUser();
    }, []);

    // Helper to get cookie value
    const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
    };

    const login = async (username: string, password: string, trustDevice: boolean = false) => {
        authVersionRef.current += 1;
        setIsLoading(true);
        console.log("[Auth] Starting login process...");

        // Ensure we have a CSRF token
        if (!getCookie('XSRF-TOKEN')) {
            console.log("[Auth] No CSRF cookie found, fetching new one...");
            await fetch("/api/corporate/auth/csrf-token", { credentials: "include" });
        } else {
            console.log("[Auth] CSRF cookie found:", getCookie('XSRF-TOKEN'));
        }

        const csrfToken = getCookie('XSRF-TOKEN');
        console.log("[Auth] Using CSRF token for request:", csrfToken);

        const res = await fetch("/api/corporate/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-XSRF-TOKEN": csrfToken || ""
            },
            credentials: "include",
            body: JSON.stringify({ username, password, trustDevice }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || "Login failed");
        }

        const data = await res.json();
        if (!data?.user) {
            throw new Error("Login response is invalid");
        }
        setUser(data.user);
        setIsLoading(false);
    };

    const logout = async () => {
        const csrfToken = getCookie('XSRF-TOKEN');
        await fetch("/api/corporate/auth/logout", {
            method: "POST",
            headers: {
                "X-XSRF-TOKEN": csrfToken || ""
            },
            credentials: "include",
            body: JSON.stringify({}) // Send empty body for POST
        });
        authVersionRef.current += 1;
        setUser(null);
        setIsLoading(false);
    };

    const refreshUser = async () => {
        authVersionRef.current += 1;
        await fetchUser(authVersionRef.current);
    };

    return (
        <CorporateAuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                isLoading,
                login,
                logout,
                refreshUser,
            }}
        >
            {children}
        </CorporateAuthContext.Provider>
    );
}

export function useCorporateAuth() {
    const context = useContext(CorporateAuthContext);
    if (!context) {
        throw new Error("useCorporateAuth must be used within a CorporateAuthProvider");
    }
    return context;
}
