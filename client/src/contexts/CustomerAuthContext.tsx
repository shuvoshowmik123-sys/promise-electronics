import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { customerAuthApi, type CustomerSession } from "@/lib/api";
import { fetchApi } from "@/lib/api/httpClient";
import { storeAuthSession, clearAuthSession, getStoredAuthSession } from "@/lib/authStorage";
import { Capacitor } from "@capacitor/core";
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface CustomerAuthContextType {
  customer: CustomerSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsProfileCompletion: boolean;
  login: (phone: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (data: { name: string; phone: string; email?: string; address?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  updateProfile: (data: { phone?: string; address?: string; name?: string; email?: string; profileImageUrl?: string; preferences?: string }) => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const session = await customerAuthApi.me();
      setCustomer(session);
    } catch {
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Restore session from stored auth (for native apps)
  const restoreSession = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const storedAuth = await getStoredAuthSession();
      if (!storedAuth) {
        return false;
      }

      // Try to verify the session with the server
      const session = await customerAuthApi.me();
      if (session) {
        setCustomer(session);
        return true;
      }

      // If server session expired, clear stored auth
      await clearAuthSession();
      return false;
    } catch {
      // Session invalid, clear stored auth
      await clearAuthSession();
      return false;
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (phone: string, password: string) => {
    const session = await customerAuthApi.login({ phone, password });
    setCustomer(session);

    // Store auth for persistent session on native
    if (Capacitor.isNativePlatform() && session.id && session.phone) {
      await storeAuthSession(session.id, session.phone);
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const idToken = await cred.user.getIdToken();

    // Use fetchApi: in the split deploy (frontend on Vercel, backend on Render)
    // a raw relative fetch hit the Vercel origin with no auth cookie and failed.
    // fetchApi targets the API base URL and sends credentials + CSRF.
    const { user } = await fetchApi<{ user: CustomerSession }>("/auth/firebase", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    setCustomer(user as CustomerSession);
  };

  const register = async (data: { name: string; phone: string; email?: string; address?: string; password: string }) => {
    const session = await customerAuthApi.register(data);
    setCustomer(session);

    // Store auth for persistent session on native
    if (Capacitor.isNativePlatform() && session.id && session.phone) {
      await storeAuthSession(session.id, session.phone);
    }
  };

  const logout = async () => {
    try {
      await customerAuthApi.logout();
    } catch {
      // Ignore logout errors
    }
    // Firebase sign-out (no-op if not signed in via Firebase)
    try { await firebaseSignOut(auth); } catch { /* ignore */ }

    try {
      await fetchApi("/auth/firebase/logout", { method: "POST" });
    } catch { /* ignore */ }

    // Clear stored auth on native
    if (Capacitor.isNativePlatform()) {
      await clearAuthSession();
    }

    setCustomer(null);
  };

  const updateProfile = async (data: { phone?: string; address?: string; name?: string; email?: string; profileImageUrl?: string; preferences?: string }) => {
    console.log("updateProfile called with:", data);
    try {
      const updated = await customerAuthApi.updateProfile(data);
      console.log("updateProfile response:", updated);
      setCustomer(updated);
    } catch (error) {
      console.error("updateProfile error:", error);
      throw error;
    }
  };

  // Check if profile needs completion (no phone number)
  const needsProfileCompletion = !!customer && !customer.phone;

  return (
    <CustomerAuthContext.Provider
      value={{
        customer,
        isLoading,
        isAuthenticated: !!customer,
        needsProfileCompletion,
        login,
        loginWithGoogle,
        register,
        logout,
        checkAuth,
        restoreSession,
        updateProfile,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (context === undefined) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return context;
}

