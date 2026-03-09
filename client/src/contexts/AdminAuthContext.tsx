import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User, UserPermissions } from "@shared/schema";
import { adminAuthApi } from "@/lib/api";

type SafeUser = Omit<User, "password">;

interface AdminAuthContextType {
  user: SafeUser | null;
  permissions: UserPermissions;
  isAuthenticated: boolean;
  status: "pending" | "authenticated" | "unauthenticated";
  isLoading: boolean; // backward compatibility
  login: (username: string, password: string) => Promise<SafeUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: keyof UserPermissions) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [status, setStatus] = useState<"pending" | "authenticated" | "unauthenticated">("pending");

  const permissions: UserPermissions = (() => {
    if (!user?.permissions) return {};
    try {
      return typeof user.permissions === "string"
        ? JSON.parse(user.permissions)
        : user.permissions;
    } catch (e) {
      console.error("Failed to parse permissions:", e);
      return {};
    }
  })();

  const fetchUser = async () => {
    try {
      const data = await adminAuthApi.me();
      setUser(data);
      setStatus("authenticated");
    } catch (error: any) {
      if (error?.statusCode !== 401) {
        // Only log if it's not a standard unauthorized response
        console.error("Failed to fetch admin user:", error);
      }
      setUser(null);
      setStatus("unauthenticated");
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const login = async (username: string, password: string): Promise<SafeUser> => {
    const data = await adminAuthApi.login({ username, password });
    setUser(data);
    setStatus("authenticated");
    return data;
  };

  const logout = async () => {
    try {
      await adminAuthApi.logout();
    } catch (err) {
      console.warn("Logout request failed but proceeding to clear session", err);
    }
    setUser(null);
    setStatus("unauthenticated");
    localStorage.removeItem("adminDashboardSnapshot");
    window.location.href = '/admin/login';
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const hasPermission = (permission: keyof UserPermissions): boolean => {
    if (user?.role === "Super Admin") return true;
    return permissions[permission] === true;
  };

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        permissions,
        isAuthenticated: !!user && status === "authenticated",
        status,
        isLoading: status === "pending",
        login,
        logout,
        refreshUser,
        hasPermission,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
