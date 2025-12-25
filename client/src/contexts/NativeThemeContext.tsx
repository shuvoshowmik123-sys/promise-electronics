import { createContext, useContext, useState, useEffect, useLayoutEffect, ReactNode } from "react";

type Theme = "light" | "dark" | "system";

interface NativeThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    isDark: boolean;
}

const NativeThemeContext = createContext<NativeThemeContextType | undefined>(undefined);

const STORAGE_KEY = "native-app-theme";

// Add type declaration for View Transitions API
declare global {
    interface Document {
        startViewTransition?: (callback: () => void) => {
            ready: Promise<void>;
            finished: Promise<void>;
            updateCallbackDone: Promise<void>;
        };
    }
}

export function NativeThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem(STORAGE_KEY) as Theme;
            return stored || "light";
        }
        return "light";
    });

    const [systemDark, setSystemDark] = useState(() => {
        if (typeof window !== "undefined") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches;
        }
        return false;
    });

    // Listen for system theme changes
    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);

        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
    }, []);

    // Helper function to apply theme class synchronously
    // Only applies dark mode on native routes, admin/web always use light theme
    const applyThemeClass = (dark: boolean) => {
        const root = document.documentElement;
        const isNativeRoute = window.location.pathname.startsWith("/native");

        // Only apply dark mode on native app routes
        const shouldBeDark = dark && isNativeRoute;

        if (shouldBeDark) {
            root.classList.add("native-dark");
            root.classList.add("dark");
        } else {
            root.classList.remove("native-dark");
            root.classList.remove("dark");
        }
    };

    // Persist theme to localStorage and apply class synchronously
    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(STORAGE_KEY, newTheme);

        const willBeDark = newTheme === "dark" || (newTheme === "system" && systemDark);

        // Check if View Transitions API is supported
        if (!document.startViewTransition) {
            applyThemeClass(willBeDark);
            return;
        }

        document.startViewTransition(() => {
            applyThemeClass(willBeDark);
        });
    };

    // Calculate if we're in dark mode
    const isDark = theme === "dark" || (theme === "system" && systemDark);

    // Apply dark class on initial mount and when system preference changes
    // Use useLayoutEffect to run before paint and prevent flash
    useLayoutEffect(() => {
        applyThemeClass(isDark);
    }, [isDark]);

    // Re-apply theme when route changes (to handle admin vs native routes)
    useEffect(() => {
        const handleRouteChange = () => {
            applyThemeClass(isDark);
        };

        // Listen to popstate for browser navigation
        window.addEventListener("popstate", handleRouteChange);

        return () => window.removeEventListener("popstate", handleRouteChange);
    }, [isDark]);

    return (
        <NativeThemeContext.Provider value={{ theme, setTheme, isDark }}>
            {children}
        </NativeThemeContext.Provider>
    );
}

export function useNativeTheme() {
    const context = useContext(NativeThemeContext);
    if (!context) {
        throw new Error("useNativeTheme must be used within a NativeThemeProvider");
    }
    return context;
}
