import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User, UserPermissions } from "@shared/schema";

type SafeUser = Omit<User, "password">;

interface AdminAuthContextType {
  user: SafeUser | null;
  permissions: UserPermissions;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: keyof UserPermissions) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const permissions: UserPermissions = user?.permissions 
    ? (typeof user.permissions === "string" ? JSON.parse(user.permissions) : user.permissions)
    : {};

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/admin/me", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to fetch admin user:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Login failed");
    }

    const data = await res.json();
    setUser(data);
  };

  const logout = async () => {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
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
        isAuthenticated: !!user,
        isLoading,
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
