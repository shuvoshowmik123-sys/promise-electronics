import { Router, Request, Response } from "express";
import { storage } from "../storage.js";
import { z } from "zod";
import { requireAdminAuth } from "./middleware/auth.js";

const router = Router();

// Inline Super Admin auth check — bypasses any middleware caching issues
async function checkSuperAdmin(req: Request, res: Response): Promise<string | null> {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return null;
    }

    try {
        const user = await storage.getUser(adminUserId);
        if (!user || user.role !== "Super Admin") {
            res.status(403).json({ error: "Forbidden: Super Admin access required" });
            return null;
        }
        return adminUserId;
    } catch (e) {
        res.status(500).json({ error: "Internal Server Error" });
        return null;
    }
}

// GET all modules - Public read (used by customer/corporate portals via ModuleContext)
router.get("/api/modules", async (req, res) => {
    try {
        const modules = await storage.getAllModules();
        res.json(modules);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET single module - Public read
router.get("/api/modules/:id", async (req, res) => {
    try {
        const mod = await storage.getModule(req.params.id);
        if (!mod) {
            return res.status(404).json({ error: "Module not found" });
        }
        res.json(mod);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

const toggleSchema = z.object({
    portal: z.enum(["admin", "customer", "corporate", "technician"]),
    enabled: z.boolean()
});

// PUT toggle module portal state
router.put("/api/modules/:id/toggle", async (req, res) => {
    try {
        const userId = await checkSuperAdmin(req, res);
        if (!userId) return; // Response already sent

        const { portal, enabled } = toggleSchema.parse(req.body);

        const mod = await storage.getModule(req.params.id);
        if (!mod) {
            return res.status(404).json({ error: "Module not found" });
        }

        // Core modules cannot be disabled for admin
        if (mod.isCore && portal === "admin" && !enabled) {
            return res.status(400).json({ error: "Cannot disable core modules in admin panel" });
        }

        const updated = await storage.toggleModule(req.params.id, portal, enabled, userId);
        console.log(`[ModuleToggle] ${req.params.id} -> ${portal} = ${enabled}`);
        res.json(updated);
    } catch (error: any) {
        console.error(`[ModuleToggle] Error:`, error);
        res.status(400).json({ error: error.message || "Invalid request body" });
    }
});

const presetSchema = z.object({
    preset: z.enum(["admin_only", "retail", "b2b", "full_business", "max_power"])
});

// POST apply preset
router.post("/api/modules/bulk-preset", async (req, res) => {
    try {
        const userId = await checkSuperAdmin(req, res);
        if (!userId) return; // Response already sent

        const { preset } = presetSchema.parse(req.body);

        const allModules = await storage.getAllModules();

        // Developer tools to be excluded in presets 1-4
        const devInfraModules = ["system_health", "ai_brain", "audit_logs"];

        await Promise.all(allModules.map(async (mod: any) => {
            let enableAdmin = false;
            let enableCustomer = false;
            let enableCorporate = false;
            let enableTechnician = false;

            // Target states based on preset
            switch (preset) {
                case "admin_only":
                    enableAdmin = true;
                    break;
                case "retail":
                    enableAdmin = true;
                    enableCustomer = true;
                    break;
                case "b2b":
                    enableAdmin = true;
                    enableCorporate = true;
                    break;
                case "full_business":
                    enableAdmin = true;
                    enableCustomer = true;
                    enableCorporate = true;
                    break;
                case "max_power":
                    enableAdmin = true;
                    enableCustomer = true;
                    enableCorporate = true;
                    enableTechnician = true;
                    break;
            }

            // Exclude dev infra unless max_power
            if (preset !== "max_power" && devInfraModules.includes(mod.id)) {
                enableAdmin = false;
                enableCustomer = false;
                enableCorporate = false;
                enableTechnician = false;
            }

            // Core modules must always remain ON for Admin
            if (mod.isCore) {
                enableAdmin = true;
            }

            // Scope limits: Don't enable a portal if the module isn't scoped for it
            const scopes = mod.portalScope?.split(',') || [];
            if (!scopes.includes("admin")) enableAdmin = false;
            if (!scopes.includes("customer")) enableCustomer = false;
            if (!scopes.includes("corporate")) enableCorporate = false;
            if (!scopes.includes("technician")) enableTechnician = false;

            // Only update what changed to avoid spamming the database
            const updates = [];
            if (mod.enabledAdmin !== enableAdmin) updates.push(storage.toggleModule(mod.id, "admin", enableAdmin, userId));
            if (mod.enabledCustomer !== enableCustomer) updates.push(storage.toggleModule(mod.id, "customer", enableCustomer, userId));
            if (mod.enabledCorporate !== enableCorporate) updates.push(storage.toggleModule(mod.id, "corporate", enableCorporate, userId));
            if (mod.enabledTechnician !== enableTechnician) updates.push(storage.toggleModule(mod.id, "technician", enableTechnician, userId));

            await Promise.all(updates);
        }));

        const updatedModules = await storage.getAllModules();
        console.log(`[ModulePreset] Applied ${preset}`);
        res.json(updatedModules);
    } catch (error: any) {
        console.error(`[ModulePreset] Error:`, error);
        res.status(400).json({ error: error.message || "Invalid request body" });
    }
});

export default router;
