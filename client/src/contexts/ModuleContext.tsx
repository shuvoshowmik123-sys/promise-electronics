import React, { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { modulesApi } from "../lib/api";
import type { SystemModule } from "@shared/schema";

interface ModuleContextType {
    modules: SystemModule[];
    isLoading: boolean;
    error: Error | null;
    isEnabled: (moduleId: string, portal?: "admin" | "customer" | "corporate" | "technician") => boolean;
    toggleModule: (id: string, portal: "admin" | "customer" | "corporate" | "technician", enabled: boolean) => Promise<void>;
    applyPreset: (preset: "admin_only" | "retail" | "b2b" | "full_business" | "max_power") => Promise<void>;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export function ModuleProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();

    const { data: modules = [], isLoading, error } = useQuery<SystemModule[]>({
        queryKey: ["/api/modules"],
        queryFn: () => modulesApi.getAll()
    });

    const toggleMutation = useMutation({
        mutationFn: async ({ id, portal, enabled }: { id: string, portal: "admin" | "customer" | "corporate" | "technician", enabled: boolean }) => {
            return modulesApi.toggle(id, portal, enabled);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
        }
    });

    const presetMutation = useMutation({
        mutationFn: async ({ preset }: { preset: "admin_only" | "retail" | "b2b" | "full_business" | "max_power" }) => {
            return modulesApi.applyPreset(preset);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/modules"] });
        }
    });

    const isEnabled = (moduleId: string, portal: "admin" | "customer" | "corporate" | "technician" = "admin") => {
        // If modules aren't loaded yet or there was an error, assume disabled for safety, 
        // EXCEPT for known core modules to prevent UI flash or total lockout.
        if ((isLoading || error) && !modules.length) {
            const assumedCore = [
                "dashboard", "jobs", "service_requests", "pos", "inventory",
                "finance_petty_cash", "settings", "users", "customers"
            ];
            return assumedCore.includes(moduleId);
        }

        const mod = modules.find(m => m.id === moduleId);
        // If the module object doesn't exist in DB, default to false
        if (!mod) {
            // But provide a hard fallback for dashboard just in case the DB is completely empty/missing records
            if (moduleId === "dashboard") return true;
            return false;
        }

        if (portal === "admin") return mod.enabledAdmin;
        if (portal === "customer") return mod.enabledCustomer;
        if (portal === "corporate") return mod.enabledCorporate;
        if (portal === "technician") return mod.enabledTechnician;

        return false;
    };

    const toggleModule = async (id: string, portal: "admin" | "customer" | "corporate" | "technician", enabled: boolean) => {
        await toggleMutation.mutateAsync({ id, portal, enabled });
    };

    const applyPreset = async (preset: "admin_only" | "retail" | "b2b" | "full_business" | "max_power") => {
        await presetMutation.mutateAsync({ preset });
    };

    return (
        <ModuleContext.Provider value={{ modules, isLoading, error: error as Error | null, isEnabled, toggleModule, applyPreset }}>
            {children}
        </ModuleContext.Provider>
    );
}

export function useModules() {
    const context = useContext(ModuleContext);
    if (context === undefined) {
        throw new Error("useModules must be used within a ModuleProvider");
    }
    return context;
}
