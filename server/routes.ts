import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { v2 as cloudinary } from "cloudinary";
import { storage } from "./storage.js";
import { db } from "./db.js";
import { sql } from "drizzle-orm";
import {
  insertJobTicketSchema,
  insertInventoryItemSchema,
  insertChallanSchema,
  insertPettyCashRecordSchema,
  insertDueRecordSchema,
  insertProductSchema,
  insertSettingSchema,
  insertPosTransactionSchema,
  insertUserSchema,
  insertServiceRequestSchema,
  insertAttendanceRecordSchema,
  insertOrderSchema,
  insertOrderItemSchema,
  insertProductVariantSchema,
  insertServiceCatalogSchema,
  insertQuoteRequestSchema,
  insertPickupScheduleSchema,
  insertPolicySchema,
  insertCustomerReviewSchema,
  insertInquirySchema,
  insertCustomerAddressSchema,

  insertNotificationSchema,
} from "../shared/schema.js";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { setupCustomerAuth } from "./customerGoogleAuth.js";

// SSE broker for real-time customer updates
const customerSSEClients = new Map<string, Set<Response>>();

function addCustomerSSEClient(customerId: string, res: Response) {
  if (!customerSSEClients.has(customerId)) {
    customerSSEClients.set(customerId, new Set());
  }
  customerSSEClients.get(customerId)!.add(res);
}

function removeCustomerSSEClient(customerId: string, res: Response) {
  const clients = customerSSEClients.get(customerId);
  if (clients) {
    clients.delete(res);
    if (clients.size === 0) {
      customerSSEClients.delete(customerId);
    }
  }
}

function notifyCustomerUpdate(customerId: string, data: any) {
  const clients = customerSSEClients.get(customerId);
  if (clients) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => {
      try {
        res.write(message);
      } catch (e) {
        // Client disconnected
      }
    });
  }
}

// SSE broker for real-time admin updates
const adminSSEClients = new Set<Response>();

function addAdminSSEClient(res: Response) {
  adminSSEClients.add(res);
}

function removeAdminSSEClient(res: Response) {
  adminSSEClients.delete(res);
}

function notifyAdminUpdate(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  adminSSEClients.forEach(res => {
    try {
      res.write(message);
    } catch (e) {
      // Client disconnected
    }
  });
}

declare module "express-session" {
  interface SessionData {
    customerId?: string;
    adminUserId?: string;
  }
}

// Admin authentication schemas
const adminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const adminCreateUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["Super Admin", "Manager", "Cashier", "Technician"]),
  permissions: z.string().optional(),
});

const adminUpdateUserSchema = z.object({
  username: z.string().min(3).optional(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["Super Admin", "Manager", "Cashier", "Technician"]).optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
  permissions: z.string().optional(),
});

// Customer authentication schemas
const customerLoginSchema = z.object({
  phone: z.string().min(10, "Phone number is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const customerRegisterSchema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().min(10, "Phone number is required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Admin auth middleware
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.adminUserId) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  next();
}

// Super Admin only middleware
async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.adminUserId) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  const user = await storage.getUser(req.session.adminUserId);
  if (!user || user.role !== "Super Admin") {
    return res.status(403).json({ error: "Super Admin access required" });
  }
  next();
}

// Admin Auth Routes
export function registerAdminAuthRoutes(app: Express) {
  app.get("/api/admin/me", async (req, res) => {
    if (!req.session.adminUserId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.adminUserId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    const { password, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/admin/login", async (req, res) => {
    try {
      console.log("Admin login attempt for:", req.body.username);
      const { username, password } = adminLoginSchema.parse(req.body);
      const user = await storage.getUserByUsername(username);

      if (!user) {
        console.log("Admin login failed: User not found");
        return res.status(401).json({ error: "Invalid username or password" });
      }

      if (!user.password) {
        console.log("Admin login failed: User has no password set");
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.log("Admin login failed: Password mismatch");
        return res.status(401).json({ error: "Invalid username or password" });
      }

      if (user.status !== "Active") {
        console.log("Admin login failed: User inactive");
        return res.status(403).json({ error: "Account is inactive" });
      }

      console.log("Admin login successful for:", username);
      req.session.adminUserId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      console.error("Admin login error:", error);
      if (error instanceof z.ZodError) {
        console.error("Validation error:", JSON.stringify(error.errors));
        return res.status(400).json({ error: error.errors[0].message, details: error.errors });
      }
      res.status(400).json({ error: "Invalid login data" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });
}

// Customer auth middleware - supports both session-based and Google Auth
function requireCustomerAuth(req: any, res: Response, next: NextFunction) {
  // Check Google Auth (Passport)
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.customerId) {
    req.session.customerId = req.user.customerId;
    return next();
  }
  // Check session-based auth
  if (req.session?.customerId) {
    return next();
  }
  return res.status(401).json({ error: "Please login to continue" });
}

// Helper to get customer ID from request (supports both auth methods)
function getCustomerId(req: any): string | undefined {
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.customerId) {
    return req.user.customerId;
  }
  return req.session?.customerId;
}

// Default permissions based on role
function getDefaultPermissions(role: string) {
  switch (role) {
    case "Super Admin":
      return {
        dashboard: true,
        jobs: true,
        inventory: true,
        pos: true,
        challans: true,
        finance: true,
        attendance: true,
        reports: true,
        serviceRequests: true,
        orders: true,
        users: true,
        settings: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canExport: true,
      };
    case "Manager":
      return {
        dashboard: true,
        jobs: true,
        inventory: true,
        pos: true,
        challans: true,
        finance: true,
        attendance: true,
        reports: true,
        serviceRequests: true,
        orders: true,
        users: false,
        settings: false,
        canCreate: true,
        canEdit: true,
        canDelete: false,
        canExport: true,
      };
    case "Cashier":
      return {
        dashboard: true,
        jobs: false,
        inventory: true,
        pos: true,
        challans: false,
        finance: false,
        attendance: true,
        reports: false,
        serviceRequests: false,
        orders: true,
        users: false,
        settings: false,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canExport: false,
      };
    case "Technician":
      return {
        dashboard: true,
        jobs: true,
        inventory: false,
        pos: false,
        challans: true,
        finance: false,
        attendance: true,
        reports: false,
        serviceRequests: true,
        orders: false,
        users: false,
        settings: false,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canExport: false,
      };
    default:
      return {};
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Customer Replit Auth (Google Sign-In)
  await setupCustomerAuth(app);

  // Register Admin Auth Routes
  registerAdminAuthRoutes(app);

  // Health Check Route
  app.get("/api/health", async (req, res) => {
    try {
      const start = Date.now();
      // Simple query to check DB connection
      await db.execute(sql`SELECT 1`);
      const duration = Date.now() - start;
      res.json({ status: "ok", database: "connected", latency: `${duration}ms` });
    } catch (error: any) {
      console.error("Health check failed:", error);
      res.status(500).json({ status: "error", database: "disconnected", error: error.message });
    }
  });

  // Customer Authentication Routes

  // Register
  app.post("/api/customer/register", async (req, res) => {
    try {
      const validated = customerRegisterSchema.parse(req.body);

      const existingUser = await storage.getUserByPhone(validated.phone);
      if (existingUser) {
        return res.status(400).json({ error: "Phone number already registered" });
      }

      const hashedPassword = await bcrypt.hash(validated.password, 10);
      const user = await storage.createUser({
        ...validated,
        password: hashedPassword,
        role: "Customer",
        username: validated.phone, // Use phone as username for customers
        status: "Active",
        permissions: JSON.stringify({}),
      });

      // Set session
      req.session.customerId = user.id;
      req.session.authMethod = 'phone';

      const { password, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Registration failed", details: error.message });
    }
  });

  // Login
  app.post("/api/customer/login", async (req, res) => {
    try {
      const { phone, password } = customerLoginSchema.parse(req.body);

      const user = await storage.getUserByPhone(phone);
      if (!user || !user.password) {
        return res.status(401).json({ error: "Invalid phone or password" });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid phone or password" });
      }

      // Set session
      req.session.customerId = user.id;
      req.session.authMethod = 'phone';

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: "Login failed" });
    }
  });

  // Logout
  app.post("/api/customer/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get Current User (Me)
  app.get("/api/customer/me", async (req, res) => {
    if (!req.session.customerId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const user = await storage.getUser(req.session.customerId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Update Profile
  app.put("/api/customer/profile", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const updates = req.body;
      // Filter allowed updates
      const allowedUpdates: any = {};
      if (updates.name) allowedUpdates.name = updates.name;
      if (updates.phone) allowedUpdates.phone = updates.phone;
      if (updates.address) allowedUpdates.address = updates.address;
      if (updates.email) allowedUpdates.email = updates.email;
      if (updates.profileImageUrl) allowedUpdates.profileImageUrl = updates.profileImageUrl;
      if (updates.preferences) allowedUpdates.preferences = updates.preferences;

      const user = await storage.updateUser(customerId, allowedUpdates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Change Password
  app.post("/api/customer/change-password", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const { currentPassword, newPassword } = z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(6, "New password must be at least 6 characters"),
      }).parse(req.body);

      const user = await storage.getUser(customerId);
      if (!user || !user.password) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ error: "Incorrect current password" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(customerId, { password: hashedPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update password" });
    }
  });

  // Customer Addresses API
  app.get("/api/customer/addresses", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const addresses = await storage.getCustomerAddresses(customerId);
      res.json(addresses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  });

  app.post("/api/customer/addresses", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const validated = insertCustomerAddressSchema.parse({
        ...req.body,
        customerId,
      });

      const address = await storage.createCustomerAddress(validated);
      res.status(201).json(address);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create address" });
    }
  });

  app.patch("/api/customer/addresses/:id", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const address = await storage.updateCustomerAddress(req.params.id, customerId, req.body);
      if (!address) {
        return res.status(404).json({ error: "Address not found" });
      }
      res.json(address);
    } catch (error) {
      res.status(500).json({ error: "Failed to update address" });
    }
  });

  app.delete("/api/customer/addresses/:id", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const success = await storage.deleteCustomerAddress(req.params.id, customerId);
      if (!success) {
        return res.status(404).json({ error: "Address not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete address" });
    }
  });

  // Notifications API
  app.get("/api/notifications", requireCustomerAuth, async (req, res) => {
    console.log("[DEBUG] GET /api/notifications called");
    try {
      const customerId = getCustomerId(req);
      console.log("[DEBUG] Customer ID:", customerId);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const notifications = await storage.getNotifications(customerId);
      console.log("[DEBUG] Fetched notifications count:", notifications.length);
      res.json(notifications);
    } catch (error) {
      console.error("[DEBUG] Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const validated = insertNotificationSchema.parse({
        ...req.body,
        userId: customerId,
      });

      const notification = await storage.createNotification(validated);

      // Notify customer about new notification
      notifyCustomerUpdate(customerId, {
        type: "notification",
        data: notification
      });

      res.status(201).json(notification);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  app.patch("/api/notifications/:id/read", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      res.status(500).json({ error: "Failed to update notification" });
    }
  });

  app.patch("/api/notifications/read-all", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Unauthorized" });

      await storage.markAllNotificationsAsRead(customerId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update notifications" });
    }
  });

  // Job Tickets API
  app.get("/api/job-tickets", async (req, res) => {
    try {
      const jobs = await storage.getAllJobTickets();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job tickets" });
    }
  });

  // Get next auto-generated job number
  app.get("/api/job-tickets/next-number", async (req, res) => {
    try {
      const nextNumber = await storage.getNextJobNumber();
      res.json({ nextNumber });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate job number" });
    }
  });

  app.get("/api/job-tickets/:id", async (req, res) => {
    try {
      const job = await storage.getJobTicket(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job ticket not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job ticket" });
    }
  });

  app.post("/api/job-tickets", async (req, res) => {
    try {
      // Auto-generate job ID if not provided
      let jobData = { ...req.body };
      if (!jobData.id) {
        jobData.id = await storage.getNextJobNumber();
      }

      // Convert deadline string to Date if present
      if (jobData.deadline && typeof jobData.deadline === "string") {
        jobData.deadline = new Date(jobData.deadline);
      }

      const validated = insertJobTicketSchema.parse(jobData);
      const job = await storage.createJobTicket(validated);

      // Notify all admins about new job ticket
      notifyAdminUpdate({
        type: "job_ticket_created",
        data: job,
        createdAt: new Date().toISOString()
      });

      res.status(201).json(job);
    } catch (error: any) {
      console.error("Job ticket validation error:", error.message);
      res.status(400).json({ error: "Invalid job ticket data", details: error.message });
    }
  });

  app.patch("/api/job-tickets/:id", async (req, res) => {
    try {
      let updateData = { ...req.body };

      // Convert all date string fields to Date objects
      const dateFields = ['deadline', 'createdAt', 'completedAt', 'serviceExpiryDate', 'partsExpiryDate'];
      for (const field of dateFields) {
        if (updateData[field] && typeof updateData[field] === "string") {
          updateData[field] = new Date(updateData[field]);
        }
      }

      const job = await storage.updateJobTicket(req.params.id, updateData);
      if (!job) {
        return res.status(404).json({ error: "Job ticket not found" });
      }

      // Notify all admins about job ticket update
      notifyAdminUpdate({
        type: "job_ticket_updated",
        data: job,
        updatedAt: new Date().toISOString()
      });

      res.json(job);
    } catch (error: any) {
      console.error("Failed to update job ticket:", error.message, error);
      res.status(500).json({ error: "Failed to update job ticket", details: error.message });
    }
  });

  app.delete("/api/job-tickets/:id", async (req, res) => {
    try {
      const jobId = req.params.id;
      const success = await storage.deleteJobTicket(jobId);
      if (!success) {
        return res.status(404).json({ error: "Job ticket not found" });
      }

      // Notify all admins about job ticket deletion
      notifyAdminUpdate({
        type: "job_ticket_deleted",
        id: jobId,
        deletedAt: new Date().toISOString()
      });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete job ticket" });
    }
  });

  // Public job tracking endpoint (for QR code scanning)
  app.get("/api/job-tickets/track/:id", async (req, res) => {
    try {
      const job = await storage.getJobTicket(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job ticket not found" });
      }

      // Return limited public info for security
      res.json({
        id: job.id,
        device: job.device,
        screenSize: job.screenSize,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        estimatedCost: job.estimatedCost,
        deadline: job.deadline,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job tracking info" });
    }
  });

  // Inventory API
  app.get("/api/inventory", async (req, res) => {
    try {
      const items = await storage.getAllInventoryItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  });

  app.get("/api/inventory/:id", async (req, res) => {
    try {
      const item = await storage.getInventoryItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inventory item" });
    }
  });

  app.post("/api/inventory", async (req, res) => {
    try {
      const validated = insertInventoryItemSchema.parse(req.body);
      const item = await storage.createInventoryItem(validated);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Inventory validation error:", error.message);
      res.status(400).json({ error: "Invalid inventory item data", details: error.message });
    }
  });

  app.patch("/api/inventory/:id", async (req, res) => {
    try {
      const item = await storage.updateInventoryItem(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update inventory item" });
    }
  });

  app.patch("/api/inventory/:id/stock", async (req, res) => {
    try {
      const { quantity } = req.body;
      if (typeof quantity !== "number") {
        return res.status(400).json({ error: "Quantity must be a number" });
      }
      const item = await storage.updateInventoryStock(req.params.id, quantity);
      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update inventory stock" });
    }
  });

  app.delete("/api/inventory/:id", async (req, res) => {
    try {
      const success = await storage.deleteInventoryItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete inventory item" });
    }
  });

  // Bulk import inventory items
  app.post("/api/inventory/bulk-import", async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items array is required and must not be empty" });
      }

      const errors: string[] = [];
      let imported = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          // Generate ID if not provided
          const id = item.id || `INV-${Date.now()}-${i}`;

          // Validate required fields
          if (!item.name || typeof item.name !== "string" || item.name.trim() === "") {
            errors.push(`Row ${i + 1}: Name is required`);
            continue;
          }
          if (!item.category || typeof item.category !== "string" || item.category.trim() === "") {
            errors.push(`Row ${i + 1}: Category is required`);
            continue;
          }

          // Validate numeric fields strictly
          const price = parseFloat(item.price);
          if (isNaN(price) || price < 0) {
            errors.push(`Row ${i + 1}: Price must be a valid positive number`);
            continue;
          }

          // Validate stock - allow 0 but reject invalid values
          let stock = 0;
          if (item.stock !== undefined && item.stock !== "" && item.stock !== null) {
            stock = parseInt(item.stock, 10);
            if (isNaN(stock) || stock < 0) {
              errors.push(`Row ${i + 1}: Stock must be a valid non-negative integer`);
              continue;
            }
          }

          // Validate lowStockThreshold - allow 0 but reject invalid values
          let lowStockThreshold = 5;
          if (item.lowStockThreshold !== undefined && item.lowStockThreshold !== "" && item.lowStockThreshold !== null) {
            lowStockThreshold = parseInt(item.lowStockThreshold, 10);
            if (isNaN(lowStockThreshold) || lowStockThreshold < 0) {
              errors.push(`Row ${i + 1}: Low stock threshold must be a valid non-negative integer`);
              continue;
            }
          }

          // Validate status if provided
          const validStatuses = ["In Stock", "Low Stock", "Out of Stock"];
          let status = "In Stock";
          if (item.status && item.status.trim() !== "") {
            if (!validStatuses.includes(item.status)) {
              errors.push(`Row ${i + 1}: Status must be one of: ${validStatuses.join(", ")}`);
              continue;
            }
            status = item.status;
          }

          // Parse and validate item
          const validated = insertInventoryItemSchema.parse({
            id,
            name: item.name.trim(),
            category: item.category.trim(),
            description: item.description?.trim() || null,
            stock,
            price: price.toString(),
            status,
            lowStockThreshold,
            images: item.images || null,
            showOnWebsite: item.showOnWebsite === "true" || item.showOnWebsite === true,
          });

          await storage.createInventoryItem(validated);
          imported++;
        } catch (error: any) {
          errors.push(`Row ${i + 1}: ${error.message || "Invalid data"}`);
        }
      }

      res.json({ imported, errors });
    } catch (error: any) {
      console.error("Bulk import error:", error);
      res.status(500).json({ error: "Failed to import inventory items", details: error.message });
    }
  });

  // Website inventory (public endpoint for shop page)
  app.get("/api/shop/inventory", async (req, res) => {
    try {
      const items = await storage.getWebsiteInventoryItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shop inventory items" });
    }
  });

  // Challans API
  app.get("/api/challans", async (req, res) => {
    try {
      const challans = await storage.getAllChallans();
      res.json(challans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch challans" });
    }
  });

  app.get("/api/challans/:id", async (req, res) => {
    try {
      const challan = await storage.getChallan(req.params.id);
      if (!challan) {
        return res.status(404).json({ error: "Challan not found" });
      }
      res.json(challan);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch challan" });
    }
  });

  app.post("/api/challans", async (req, res) => {
    try {
      const validated = insertChallanSchema.parse(req.body);
      const challan = await storage.createChallan(validated);
      res.status(201).json(challan);
    } catch (error) {
      res.status(400).json({ error: "Invalid challan data" });
    }
  });

  app.patch("/api/challans/:id", async (req, res) => {
    try {
      const challan = await storage.updateChallan(req.params.id, req.body);
      if (!challan) {
        return res.status(404).json({ error: "Challan not found" });
      }
      res.json(challan);
    } catch (error) {
      res.status(500).json({ error: "Failed to update challan" });
    }
  });

  app.delete("/api/challans/:id", async (req, res) => {
    try {
      const success = await storage.deleteChalan(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Challan not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete challan" });
    }
  });

  // Petty Cash API
  app.get("/api/petty-cash", async (req, res) => {
    try {
      const records = await storage.getAllPettyCashRecords();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch petty cash records" });
    }
  });

  app.post("/api/petty-cash", async (req, res) => {
    try {
      const validated = insertPettyCashRecordSchema.parse(req.body);
      const record = await storage.createPettyCashRecord(validated);
      res.status(201).json(record);
    } catch (error) {
      res.status(400).json({ error: "Invalid petty cash record data" });
    }
  });

  app.delete("/api/petty-cash/:id", async (req, res) => {
    try {
      const success = await storage.deletePettyCashRecord(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Petty cash record not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete petty cash record" });
    }
  });



  // Products API
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const validated = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validated);
      res.status(201).json(product);
    } catch (error) {
      res.status(400).json({ error: "Invalid product data" });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.updateProduct(req.params.id, req.body);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const success = await storage.deleteProduct(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // Settings API
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validated = insertSettingSchema.parse(req.body);
      const setting = await storage.upsertSetting(validated);
      res.json(setting);
    } catch (error) {
      res.status(400).json({ error: "Invalid setting data" });
    }
  });

  // POS Transactions API
  app.get("/api/pos-transactions", async (req, res) => {
    try {
      const transactions = await storage.getAllPosTransactions();
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch POS transactions" });
    }
  });

  app.get("/api/pos-transactions/:id", async (req, res) => {
    try {
      const transaction = await storage.getPosTransaction(req.params.id);
      if (!transaction) {
        return res.status(404).json({ error: "POS transaction not found" });
      }
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch POS transaction" });
    }
  });

  app.post("/api/pos-transactions", async (req, res) => {
    try {
      const validated = insertPosTransactionSchema.parse(req.body);

      const paymentMethod = (validated as any).paymentMethod;
      const customer = validated.customer;

      if (paymentMethod === "Due" && (!customer || !customer.trim())) {
        return res.status(400).json({ error: "Customer name is required for Due/Credit payments" });
      }

      const validPaymentMethods = ["Cash", "Bank", "bKash", "Nagad", "Due"];
      if (!validPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({ error: "Invalid payment method" });
      }

      const transaction = await storage.createPosTransaction(validated);

      // Handle Inventory Updates
      if (validated.items) {
        const items = JSON.parse(validated.items);
        for (const item of items) {
          if (item.id && item.quantity) {
            await storage.updateInventoryStock(item.id, -item.quantity);
          }
        }
      }

      // Handle Due/Credit Payments
      if (paymentMethod === "Due" && customer) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7); // Default due date 7 days

        await storage.createDueRecord({
          customer: customer,
          amount: validated.total,
          status: "Pending",
          invoice: transaction.invoiceNumber || transaction.id,
          dueDate: dueDate,
        });
      }
      // Handle Immediate Payments (Cash, Bank, etc.) - Record as Income
      else if (["Cash", "Bank", "bKash", "Nagad"].includes(paymentMethod)) {
        await storage.createPettyCashRecord({
          description: `POS Sale - Invoice ${transaction.invoiceNumber || transaction.id}`,
          category: "Sales",
          amount: validated.total,
          type: "Income",
        });
      }

      // Handle Linked Jobs
      if (validated.linkedJobs) {
        const linkedJobs = JSON.parse(validated.linkedJobs);
        for (const job of linkedJobs) {
          if (job.jobId) {
            await storage.updateJobTicket(job.jobId, { status: "Completed" });
          }
        }
      }

      res.status(201).json(transaction);
    } catch (error) {
      res.status(400).json({ error: "Invalid POS transaction data", details: { message: (error as any).message, ...(error as any) } });
    }
  });

  // Users API
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validated);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ error: "Invalid user data" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Service Requests API
  app.get("/api/service-requests", async (req, res) => {
    try {
      const requests = await storage.getAllServiceRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service requests" });
    }
  });

  app.get("/api/service-requests/:id", async (req, res) => {
    try {
      const request = await storage.getServiceRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Service request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service request" });
    }
  });

  app.post("/api/service-requests", async (req, res) => {
    try {
      const validated = insertServiceRequestSchema.parse(req.body);

      // If media is uploaded, set expiresAt to 30 days from now for auto-cleanup
      if (validated.mediaUrls) {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        (validated as any).expiresAt = thirtyDaysFromNow;
      }

      // Create the service request first
      let request = await storage.createServiceRequest(validated);

      // Set initial tracking status based on service preference
      let trackingStatus = "Request Received";
      if (validated.servicePreference === "service_center") {
        trackingStatus = "Awaiting Drop-off";
      } else if (validated.servicePreference === "home_pickup") {
        trackingStatus = "Arriving to Receive";
      }

      // Update with the correct tracking status if not default
      if (trackingStatus !== "Request Received") {
        request = await storage.updateServiceRequest(request.id, { trackingStatus }) || request;
      }

      // Determine customer ID to link (Session > Phone Match)
      let customerIdToLink = req.session?.customerId;

      if (!customerIdToLink && validated.phone) {
        const user = await storage.getUserByPhoneNormalized(validated.phone);
        if (user) {
          customerIdToLink = user.id;
        }
      }

      // If we have a customer ID, link the service request
      if (customerIdToLink) {
        await storage.linkServiceRequestToCustomer(request.id, customerIdToLink);
        const linkedRequest = await storage.getServiceRequest(request.id);
        if (linkedRequest) {
          request = linkedRequest;
        }
      }

      // Notify all admins about new request
      notifyAdminUpdate({
        type: "service_request_created",
        data: request,
        createdAt: new Date().toISOString()
      });

      res.status(201).json(request);
    } catch (error: any) {
      console.error("Service request validation error:", error.message);
      res.status(400).json({ error: "Invalid service request data", details: error.message });
    }
  });

  app.patch("/api/service-requests/:id", async (req, res) => {
    try {
      // Check if status is being changed to "Converted" - auto-create job ticket
      if (req.body.status === "Converted") {
        // First get the original service request to check if already converted
        const originalRequest = await storage.getServiceRequest(req.params.id);
        if (!originalRequest) {
          return res.status(404).json({ error: "Service request not found" });
        }

        // Only create job if not already converted
        if (originalRequest.status !== "Converted" && !originalRequest.convertedJobId) {
          // Generate next job number
          const jobId = await storage.getNextJobNumber();

          // Create job ticket from service request data
          const jobTicketData = {
            id: jobId,
            customer: originalRequest.customerName,
            customerPhone: originalRequest.phone || null,
            customerAddress: originalRequest.address || null,
            device: `${originalRequest.brand}${originalRequest.modelNumber ? ` ${originalRequest.modelNumber}` : ''}`,
            tvSerialNumber: null,
            issue: originalRequest.primaryIssue,
            status: "Pending" as const,
            priority: "Medium" as const,
            technician: "Unassigned",
            screenSize: originalRequest.screenSize || null,
            notes: originalRequest.description || null,
          };

          const newJob = await storage.createJobTicket(jobTicketData);

          // Update service request with the converted job ID
          req.body.convertedJobId = newJob.id;

          // Create timeline event for conversion
          await storage.createServiceRequestEvent({
            serviceRequestId: req.params.id,
            status: "Technician Assigned",
            message: `Converted to Job #${newJob.id}. A technician will be assigned soon.`,
            actor: "Admin",
          });

          // Notify admins about the new job
          notifyAdminUpdate({
            type: "job_ticket_created",
            data: newJob,
            createdAt: new Date().toISOString()
          });
        }
      }

      // Validate "Technician Assigned" tracking status requires converted job with assigned technician
      if (req.body.trackingStatus === "Technician Assigned") {
        const existingRequest = await storage.getServiceRequest(req.params.id);
        if (!existingRequest) {
          return res.status(404).json({ error: "Service request not found" });
        }

        // Check if request is converted to a job (including pending conversion in this update)
        if (existingRequest.status !== "Converted" && req.body.status !== "Converted") {
          return res.status(400).json({
            error: "Cannot set 'Technician Assigned' - request must be converted to a job first"
          });
        }

        // Check if job exists and has an assigned technician
        // Use the incoming convertedJobId if provided, otherwise use the existing one
        const jobId = req.body.convertedJobId || existingRequest.convertedJobId;
        if (!jobId) {
          return res.status(400).json({
            error: "Cannot set 'Technician Assigned' - no job ticket found for this request"
          });
        }

        const jobTicket = await storage.getJobTicket(jobId);
        if (!jobTicket) {
          return res.status(400).json({
            error: "Cannot set 'Technician Assigned' - job ticket not found"
          });
        }

        if (!jobTicket.technician || jobTicket.technician === "Unassigned") {
          return res.status(400).json({
            error: "Cannot set 'Technician Assigned' - please assign a technician to the job first"
          });
        }
      }

      // Convert date strings to Date objects
      const updateData = { ...req.body };
      if (updateData.scheduledPickupDate && typeof updateData.scheduledPickupDate === 'string') {
        updateData.scheduledPickupDate = new Date(updateData.scheduledPickupDate);
      }

      const request = await storage.updateServiceRequest(req.params.id, updateData);
      if (!request) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Create timeline event when tracking status changes
      if (req.body.trackingStatus) {
        const statusMessages: Record<string, string> = {
          "Request Received": "Your request is being reviewed by our team.",
          "Arriving to Receive": "Our team is on the way to collect your TV.",
          "Awaiting Drop-off": "Please bring your TV to our service center.",
          "Received": "Your TV has been received at our service center.",
          "Technician Assigned": "A technician has been assigned to your repair.",
          "Diagnosis Completed": "The issue has been diagnosed. We'll contact you with details.",
          "Parts Pending": "Waiting for replacement parts to arrive.",
          "Repairing": "Repair work is in progress.",
          "Ready for Delivery": "Your device is ready for pickup/delivery!",
          "Delivered": "Your device has been delivered. Thank you!",
          "Cancelled": "This request has been cancelled.",
        };

        await storage.createServiceRequestEvent({
          serviceRequestId: req.params.id,
          status: req.body.trackingStatus,
          message: statusMessages[req.body.trackingStatus] || `Status updated to ${req.body.trackingStatus}`,
          actor: "Admin",
        });
      }

      // Notify customer if they have a linked account and status changed
      console.log("[DEBUG] Service request updated:", {
        id: request.id,
        customerId: request.customerId,
        trackingStatus: req.body.trackingStatus,
        status: req.body.status,
        paymentStatus: req.body.paymentStatus
      });
      if (request.customerId && (req.body.trackingStatus || req.body.paymentStatus || req.body.status)) {
        console.log("[DEBUG] Creating notification for customerId:", request.customerId);
        notifyCustomerUpdate(request.customerId, {
          type: "order_update",
          orderId: request.id,
          ticketNumber: request.ticketNumber,
          trackingStatus: request.trackingStatus,
          paymentStatus: request.paymentStatus,
          status: request.status,
          convertedJobId: request.convertedJobId,
          updatedAt: new Date().toISOString()
        });

        // Create persistent notification
        const notificationTitle = req.body.trackingStatus
          ? `Update: ${req.body.trackingStatus}`
          : req.body.status
            ? `Status: ${req.body.status}`
            : "Service Request Updated";

        const notificationMessage = req.body.trackingStatus
          ? `Your service request #${request.ticketNumber} is now ${req.body.trackingStatus}`
          : `Your service request #${request.ticketNumber} has been updated.`;

        console.log("[DEBUG] Creating notification with data:", {
          userId: request.customerId,
          title: notificationTitle,
          message: notificationMessage,
          type: "repair",
          link: `/native/bookings`,
        });

        const notification = await storage.createNotification({
          userId: request.customerId,
          title: notificationTitle,
          message: notificationMessage,
          type: "repair",
          link: `/native/bookings`,
        });

        console.log("[DEBUG] Notification created:", notification);

        // Send notification event
        notifyCustomerUpdate(request.customerId, {
          type: "notification",
          data: notification
        });
      }

      // Notify all admins about the update
      notifyAdminUpdate({
        type: "service_request_updated",
        data: request,
        updatedAt: new Date().toISOString()
      });

      res.json(request);
    } catch (error) {
      console.error("Failed to update service request:", error);
      res.status(500).json({ error: "Failed to update service request" });
    }
  });

  app.delete("/api/service-requests/:id", async (req, res) => {
    try {
      const requestId = req.params.id;
      const success = await storage.deleteServiceRequest(requestId);
      if (!success) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Notify all admins about the deletion
      notifyAdminUpdate({
        type: "service_request_deleted",
        id: requestId,
        deletedAt: new Date().toISOString()
      });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete service request" });
    }
  });

  // ========================================
  // Stage Transition API (Unified Workflow)
  // ========================================

  // Get valid next stages for a service request
  app.get("/api/admin/service-requests/:id/next-stages", requireAdminAuth, async (req, res) => {
    try {
      const stages = await storage.getNextValidStages(req.params.id);
      res.json({ stages });
    } catch (error: any) {
      console.error("Failed to get next stages:", error);
      res.status(500).json({ error: error.message || "Failed to get next stages" });
    }
  });

  // Transition a service request to a new stage
  app.post("/api/admin/service-requests/:id/transition-stage", requireAdminAuth, async (req, res) => {
    try {
      const { stage, actorName } = req.body;
      if (!stage) {
        return res.status(400).json({ error: "Stage is required" });
      }

      // Get admin user name for actor
      const adminUser = await storage.getUser(req.session.adminUserId!);
      const actor = actorName || adminUser?.name || "Admin";

      const result = await storage.transitionStage(req.params.id, stage, actor);

      // Notify customer if linked
      if (result.serviceRequest.customerId) {
        notifyCustomerUpdate(result.serviceRequest.customerId, {
          type: "order_update",
          orderId: result.serviceRequest.id,
          ticketNumber: result.serviceRequest.ticketNumber,
          stage: result.serviceRequest.stage,
          trackingStatus: result.serviceRequest.trackingStatus,
          updatedAt: new Date().toISOString()
        });
      }

      // Notify all admins
      notifyAdminUpdate({
        type: "service_request_updated",
        data: result.serviceRequest,
        jobTicket: result.jobTicket,
        updatedAt: new Date().toISOString()
      });

      res.json(result);
    } catch (error: any) {
      console.error("Failed to transition stage:", error);
      res.status(400).json({ error: error.message || "Failed to transition stage" });
    }
  });

  // Update expected dates for a service request
  app.put("/api/admin/service-requests/:id/expected-dates", requireAdminAuth, async (req, res) => {
    try {
      const { expectedPickupDate, expectedReturnDate, expectedReadyDate } = req.body;

      const updates: any = {};
      if (expectedPickupDate !== undefined) {
        updates.expectedPickupDate = expectedPickupDate ? new Date(expectedPickupDate) : null;
      }
      if (expectedReturnDate !== undefined) {
        updates.expectedReturnDate = expectedReturnDate ? new Date(expectedReturnDate) : null;
      }
      if (expectedReadyDate !== undefined) {
        updates.expectedReadyDate = expectedReadyDate ? new Date(expectedReadyDate) : null;
      }

      const request = await storage.updateServiceRequest(req.params.id, updates);
      if (!request) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Notify customer if linked
      if (request.customerId) {
        notifyCustomerUpdate(request.customerId, {
          type: "order_update",
          orderId: request.id,
          ticketNumber: request.ticketNumber,
          expectedPickupDate: request.expectedPickupDate,
          expectedReturnDate: request.expectedReturnDate,
          expectedReadyDate: request.expectedReadyDate,
          updatedAt: new Date().toISOString()
        });
      }

      // Notify all admins
      notifyAdminUpdate({
        type: "service_request_updated",
        data: request,
        updatedAt: new Date().toISOString()
      });

      res.json(request);
    } catch (error: any) {
      console.error("Failed to update expected dates:", error);
      res.status(500).json({ error: error.message || "Failed to update expected dates" });
    }
  });

  // Object Storage - File Upload URL endpoint (legacy)
  app.post("/api/objects/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error: any) {
      console.error("Failed to get upload URL:", error.message);
      res.status(500).json({ error: "Failed to generate upload URL. Object storage may not be configured." });
    }
  });

  // Cloudinary Upload - Get signed upload parameters for direct browser upload
  // Supports automatic image/video compression and format optimization
  app.post("/api/cloudinary/upload-params", async (req, res) => {
    try {
      // Check if Cloudinary is configured
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      if (!cloudName || !apiKey || !apiSecret) {
        return res.status(503).json({
          error: "Cloudinary not configured",
          message: "Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET"
        });
      }

      // Configure cloudinary
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });

      const { resourceType = "auto" } = req.body;
      const timestamp = Math.round(new Date().getTime() / 1000);
      const folder = "service-requests";
      const transformation = "q_auto:good,f_auto";

      // All parameters that will be sent must be included in signature
      const paramsToSign: Record<string, any> = {
        timestamp,
        folder,
        transformation,
      };

      // Generate signature with all parameters
      const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        apiSecret
      );

      res.json({
        signature,
        timestamp,
        cloudName,
        apiKey,
        folder,
        transformation,
        resourceType,
      });
    } catch (error: any) {
      console.error("Cloudinary upload params error:", error);
      res.status(500).json({ error: "Failed to generate upload parameters" });
    }
  });

  // Cloudinary - Server-side upload endpoint (for files sent as base64 or URL)
  app.post("/api/cloudinary/upload", async (req, res) => {
    try {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      if (!cloudName || !apiKey || !apiSecret) {
        return res.status(503).json({
          error: "Cloudinary not configured",
          message: "Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET"
        });
      }

      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });

      const { file, resourceType = "auto" } = req.body;

      if (!file) {
        return res.status(400).json({ error: "No file provided" });
      }

      // Upload with automatic compression and format optimization
      const result = await cloudinary.uploader.upload(file, {
        folder: "service-requests",
        resource_type: resourceType,
        transformation: [
          { quality: "auto:good" },
          { fetch_format: "auto" }
        ],
        // For videos, also create an optimized version
        eager: resourceType === "video" ? [
          { quality: "auto", fetch_format: "auto" }
        ] : undefined,
      });

      res.json({
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        resourceType: result.resource_type,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      });
    } catch (error: any) {
      console.error("Cloudinary upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload file" });
    }
  });

  // Object Storage - Serve objects
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "File not found" });
      }
      console.error("Error serving object:", error);
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // Cleanup expired Cloudinary media (called periodically or via cron)
  // Deletes media files older than 30 days from Cloudinary
  app.post("/api/cleanup/expired-media", async (req, res) => {
    try {
      // Check if Cloudinary is configured
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;

      const cloudinaryConfigured = cloudName && apiKey && apiSecret;

      if (cloudinaryConfigured) {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });
      }

      const expired = await storage.getExpiredServiceRequests();
      let deletedMediaCount = 0;
      let updatedRequestCount = 0;
      let skippedLegacy = 0;
      const errors: string[] = [];

      for (const request of expired) {
        if (request.mediaUrls) {
          try {
            const mediaItems = JSON.parse(request.mediaUrls);
            const successfullyDeleted: number[] = [];
            let hasFailures = false;

            for (let i = 0; i < mediaItems.length; i++) {
              const item = mediaItems[i];
              try {
                // Handle both new format (object with publicId) and legacy (just URL string)
                const isNewFormat = typeof item === 'object' && item.publicId;

                if (isNewFormat && cloudinaryConfigured) {
                  // Delete from Cloudinary using publicId
                  await cloudinary.uploader.destroy(item.publicId, {
                    resource_type: item.resourceType || 'image'
                  });
                  successfullyDeleted.push(i);
                  deletedMediaCount++;
                } else if (typeof item === 'string') {
                  // Legacy URL-only format - try ObjectStorage if available
                  try {
                    const objectStorageService = new ObjectStorageService();
                    await objectStorageService.deleteObject(item);
                    successfullyDeleted.push(i);
                    deletedMediaCount++;
                  } catch (e: any) {
                    // ObjectStorage deletion failed - keep for potential retry or manual cleanup
                    if (e.message?.includes("not configured") || e.message?.includes("not found")) {
                      // ObjectStorage not available or file already gone - safe to clear
                      skippedLegacy++;
                      successfullyDeleted.push(i);
                    } else {
                      // Genuine failure - retain for retry
                      hasFailures = true;
                      errors.push(`Legacy file deletion failed: ${item}: ${e.message}`);
                    }
                  }
                } else if (!cloudinaryConfigured) {
                  errors.push(`Cloudinary not configured, cannot delete: ${item.publicId || item}`);
                  hasFailures = true;
                }
              } catch (e: any) {
                hasFailures = true;
                errors.push(`Failed to delete ${typeof item === 'object' ? item.publicId : item}: ${e.message}`);
              }
            }

            // Only clear mediaUrls if ALL items were processed (success or unrecoverable)
            // Keep metadata for retry if any Cloudinary deletions failed
            if (!hasFailures || successfullyDeleted.length === mediaItems.length) {
              await storage.updateServiceRequest(request.id, {
                mediaUrls: null,
                expiresAt: null
              });
              updatedRequestCount++;
            } else if (successfullyDeleted.length > 0) {
              // Partial success - keep remaining items for retry
              const remainingItems = mediaItems.filter((_: any, i: number) => !successfullyDeleted.includes(i));
              await storage.updateServiceRequest(request.id, {
                mediaUrls: JSON.stringify(remainingItems)
              });
            }
          } catch (e: any) {
            errors.push(`Failed to process request ${request.id}: ${e.message}`);
          }
        }
      }

      res.json({
        deletedMedia: deletedMediaCount,
        updatedRequests: updatedRequestCount,
        skippedLegacy,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error: any) {
      console.error("Cleanup error:", error);
      res.status(500).json({ error: "Failed to cleanup expired media" });
    }
  });

  // ========================================
  // Admin Panel Authentication API
  // ========================================

  // Admin login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const validated = adminLoginSchema.parse(req.body);

      // Find user by username
      const user = await storage.getUserByUsername(validated.username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Check if user is active
      if (user.status !== "Active") {
        return res.status(401).json({ error: "Account is inactive. Contact administrator." });
      }

      // Verify password
      const isValid = await bcrypt.compare(validated.password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Set session
      req.session.adminUserId = user.id;

      // Return user without password
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid login data", details: error.errors });
      }
      console.error("Admin login error:", error);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // Admin logout
  app.post("/api/admin/logout", (req, res) => {
    req.session.adminUserId = undefined;
    res.json({ message: "Logged out successfully" });
  });

  // Get current admin user
  app.get("/api/admin/me", async (req, res) => {
    if (!req.session?.adminUserId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const user = await storage.getUser(req.session.adminUserId);
    if (!user) {
      req.session.adminUserId = undefined;
      return res.status(401).json({ error: "User not found" });
    }

    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  // Get dashboard statistics
  app.get("/api/admin/dashboard", requireAdminAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ error: "Failed to load dashboard data" });
    }
  });

  // Job Overview (Live Work Monitoring)
  app.get("/api/admin/job-overview", requireAdminAuth, async (req, res) => {
    try {
      const overview = await storage.getJobOverview();
      res.json(overview);
    } catch (error) {
      console.error("Job overview error:", error);
      res.status(500).json({ error: "Failed to load job overview data" });
    }
  });

  // ========================================
  // Real-time SSE for Admin Updates
  // ========================================

  app.get("/api/admin/events", requireAdminAuth, (req, res) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    // Register client
    addAdminSSEClient(res);

    // Keep-alive heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      removeAdminSSEClient(res);
    });
  });

  // Get all users (Super Admin only)
  app.get("/api/admin/users", requireAdminAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Filter out customers - only show staff users
      const staffRoles = ["Super Admin", "Manager", "Cashier", "Technician"];
      const staffUsers = users.filter(user => staffRoles.includes(user.role));
      // Remove passwords from response
      const safeUsers = staffUsers.map(({ password: _, ...user }) => user);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Create new user (Super Admin only)
  app.post("/api/admin/users", requireSuperAdmin, async (req, res) => {
    try {
      const validated = adminCreateUserSchema.parse(req.body);

      // Check if username already exists
      const existingUsername = await storage.getUserByUsername(validated.username);
      if (existingUsername) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(validated.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validated.password, 12);

      // Create user with default permissions based on role
      const defaultPermissions = getDefaultPermissions(validated.role);
      const user = await storage.createUser({
        username: validated.username,
        name: validated.name,
        email: validated.email,
        password: hashedPassword,
        role: validated.role,
        permissions: validated.permissions || JSON.stringify(defaultPermissions),
      });

      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Create user error:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Update user (Super Admin only, or own profile)
  app.patch("/api/admin/users/:id", requireAdminAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.adminUserId!);
      const targetUserId = req.params.id;

      // Only Super Admin can update other users
      if (currentUser?.role !== "Super Admin" && currentUser?.id !== targetUserId) {
        return res.status(403).json({ error: "Not authorized to update this user" });
      }

      // Non-Super Admin can only update their own password
      if (currentUser?.role !== "Super Admin" && currentUser?.id === targetUserId) {
        const { password, ...otherFields } = req.body;
        if (Object.keys(otherFields).length > 0) {
          return res.status(403).json({ error: "You can only update your password" });
        }
      }

      const validated = adminUpdateUserSchema.parse(req.body);

      // Hash password if provided
      let updates: any = { ...validated };
      if (validated.password) {
        updates.password = await bcrypt.hash(validated.password, 12);
      }

      const user = await storage.updateUser(targetUserId, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Update user error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Delete user (Super Admin only)
  app.delete("/api/admin/users/:id", requireSuperAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.adminUserId!);

      // Cannot delete yourself
      if (currentUser?.id === req.params.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      const success = await storage.deleteUser(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ========================================
  // Customer Portal Authentication API
  // ========================================

  // Register new customer
  app.post("/api/customer/register", async (req, res) => {
    try {
      const validated = customerRegisterSchema.parse(req.body);

      // Check if phone already exists
      const existingUser = await storage.getUserByPhone(validated.phone);
      if (existingUser) {
        return res.status(400).json({ error: "Phone number already registered. Please login instead." });
      }

      // Hash password with bcrypt (12 salt rounds for security)
      const hashedPassword = await bcrypt.hash(validated.password, 12);

      // Create user with Customer role
      const user = await storage.createUser({
        username: validated.phone, // Use phone as username for customers
        name: validated.name,
        phone: validated.phone,
        email: validated.email || null,
        address: validated.address || null,
        password: hashedPassword,
        role: "Customer",
        status: "Active",
        permissions: "{}",
      });

      // Link any existing service requests by phone number
      await storage.linkServiceRequestsByPhone(validated.phone, user.id);

      // Set session with auth method for security
      req.session.customerId = user.id;
      req.session.authMethod = 'phone';

      // Return user without password
      const { password: _, ...safeUser } = user;

      // Notify admins about new customer registration (real-time)
      notifyAdminUpdate({
        type: "customer_created",
        data: safeUser,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json(safeUser);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid registration data", details: error.errors });
      }
      console.error("Registration error:", error);
      res.status(500).json({ error: "Failed to register. Please try again." });
    }
  });

  // Customer login
  app.post("/api/customer/login", async (req, res) => {
    try {
      const validated = customerLoginSchema.parse(req.body);

      // Find user by phone
      const user = await storage.getUserByPhone(validated.phone);
      if (!user) {
        return res.status(401).json({ error: "Invalid phone number or password" });
      }

      // Ensure user is a customer (or at least has a password set)
      if (!user.password) {
        return res.status(401).json({ error: "Please register with a password first" });
      }

      // Verify password
      const isValid = await bcrypt.compare(validated.password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid phone number or password" });
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);

      // Set session with auth method for security
      req.session.customerId = user.id;
      req.session.authMethod = 'phone';

      // Link any existing service requests by phone number
      if (user.phone) {
        await storage.linkServiceRequestsByPhone(user.phone, user.id);
      }

      // Return user without password
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid login data", details: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ error: "Failed to login. Please try again." });
    }
  });

  // Customer logout
  app.post("/api/customer/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current customer session (traditional auth)
  app.get("/api/customer/me", async (req, res) => {
    if (!req.session?.customerId) {
      return res.status(401).json({ error: "Not logged in" });
    }

    const customer = await storage.getCustomer(req.session.customerId);
    if (!customer) {
      req.session.destroy(() => { });
      return res.status(401).json({ error: "Customer not found" });
    }

    const { password: _, ...safeCustomer } = customer;
    res.json(safeCustomer);
  });

  // Update customer profile
  app.put("/api/customer/profile", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { phone, address, name, avatar } = req.body;

      // Build update object
      const updates: any = {};
      if (phone !== undefined) updates.phone = phone;
      if (address !== undefined) updates.address = address;
      if (name !== undefined) updates.name = name;
      if (avatar !== undefined) updates.avatar = avatar;

      // Get old customer data to check if phone is being added for the first time
      const oldCustomer = await storage.getCustomer(customerId);
      const isAddingPhone = phone && !oldCustomer?.phone;

      const customer = await storage.updateCustomer(customerId, updates);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // If phone number was just added, link any existing service requests with this phone
      if (isAddingPhone && customer.phone) {
        const linkedCount = await storage.linkServiceRequestsByPhone(customer.phone, customer.id);
        if (linkedCount > 0) {
          console.log(`Linked ${linkedCount} service request(s) to customer ${customer.id} by phone ${customer.phone}`);
        }
      }

      const { password: _, ...safeCustomer } = customer;
      res.json(safeCustomer);
    } catch (error: any) {
      console.error("Profile update error:", error);

      // Handle duplicate phone number error
      if (error?.code === '23505' && error?.constraint === 'customers_phone_key') {
        return res.status(409).json({
          error: "This phone number is already in use. Please try a different number.",
          code: "PHONE_EXISTS"
        });
      }

      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ========================================
  // Real-time SSE for Customer Order Updates
  // ========================================

  app.get("/api/customer/events", requireCustomerAuth, (req, res) => {
    const customerId = req.session.customerId!;

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    // Register client
    addCustomerSSEClient(customerId, res);

    // Keep-alive heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      removeCustomerSSEClient(customerId, res);
    });
  });

  // ========================================
  // Customer Service Requests Tracking API
  // ========================================

  // Get customer's service requests (repair orders)
  app.get("/api/customer/service-requests", requireCustomerAuth, async (req, res) => {
    try {
      const orders = await storage.getServiceRequestsByCustomerId(req.session.customerId!);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service requests" });
    }
  });

  // Get service request details with timeline
  app.get("/api/customer/service-requests/:id", requireCustomerAuth, async (req, res) => {
    try {
      const order = await storage.getServiceRequest(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Verify customer owns this order
      if (order.customerId !== req.session.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const events = await storage.getServiceRequestEvents(order.id);
      res.json({ ...order, timeline: events });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service request details" });
    }
  });

  // Track order by ticket number (for linking after signup)
  app.get("/api/customer/track/:ticketNumber", async (req, res) => {
    try {
      const order = await storage.getServiceRequestByTicketNumber(req.params.ticketNumber);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // If logged in and phone matches, link the order
      if (req.session?.customerId && order.phone) {
        const customer = await storage.getCustomer(req.session.customerId);
        if (customer && customer.phone === order.phone && !order.customerId) {
          await storage.linkServiceRequestToCustomer(order.id, customer.id);
        }
      }

      // Return limited info if not logged in
      if (!req.session?.customerId) {
        return res.json({
          ticketNumber: order.ticketNumber,
          trackingStatus: order.trackingStatus,
          createdAt: order.createdAt,
          message: "Login to see full details",
        });
      }

      const events = await storage.getServiceRequestEvents(order.id);
      res.json({ ...order, timeline: events });
    } catch (error) {
      res.status(500).json({ error: "Failed to track order" });
    }
  });

  // Link service request to customer account (after signup)
  app.post("/api/customer/service-requests/link", requireCustomerAuth, async (req, res) => {
    try {
      const { ticketNumber } = req.body;
      if (!ticketNumber) {
        return res.status(400).json({ error: "Ticket number is required" });
      }

      const order = await storage.getServiceRequestByTicketNumber(ticketNumber);
      if (!order) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Verify phone matches
      const user = await storage.getUser(req.session.customerId!);
      if (!user || user.phone !== order.phone) {
        return res.status(403).json({ error: "Phone number does not match order" });
      }

      const linked = await storage.linkServiceRequestToCustomer(order.id, user.id);
      res.json(linked);
    } catch (error) {
      res.status(500).json({ error: "Failed to link service request" });
    }
  });

  // Get customer's warranties (job tickets with warranty info)
  app.get("/api/customer/warranties", requireCustomerAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.customerId!);
      if (!user || !user.phone) {
        return res.json([]);
      }

      // Find job tickets by customer phone that have warranty info
      const jobs = await storage.getJobTicketsByCustomerPhone(user.phone);

      // Filter to only completed jobs with warranty and calculate status
      const now = new Date();
      const warranties = jobs
        .filter(job => job.status === "Completed" && ((job.serviceWarrantyDays || 0) > 0 || (job.partsWarrantyDays || 0) > 0))
        .map(job => {
          const serviceActive = job.serviceExpiryDate ? new Date(job.serviceExpiryDate) > now : false;
          const partsActive = job.partsExpiryDate ? new Date(job.partsExpiryDate) > now : false;

          const serviceRemainingDays = job.serviceExpiryDate
            ? Math.max(0, Math.ceil((new Date(job.serviceExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : 0;
          const partsRemainingDays = job.partsExpiryDate
            ? Math.max(0, Math.ceil((new Date(job.partsExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : 0;

          return {
            jobId: job.id,
            device: job.device,
            issue: job.issue,
            completedAt: job.completedAt,
            serviceWarranty: {
              days: job.serviceWarrantyDays,
              expiryDate: job.serviceExpiryDate,
              isActive: serviceActive,
              remainingDays: serviceRemainingDays,
            },
            partsWarranty: {
              days: job.partsWarrantyDays,
              expiryDate: job.partsExpiryDate,
              isActive: partsActive,
              remainingDays: partsRemainingDays,
            },
          };
        });

      res.json(warranties);
    } catch (error) {
      console.error("Error fetching warranties:", error);
      res.status(500).json({ error: "Failed to fetch warranties" });
    }
  });

  // ===== ATTENDANCE API =====

  // Get all attendance records (admin only)
  app.get("/api/admin/attendance", requireAdminAuth, async (req, res) => {
    try {
      const records = await storage.getAllAttendanceRecords();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  // Get attendance by date
  app.get("/api/admin/attendance/date/:date", requireAdminAuth, async (req, res) => {
    try {
      const records = await storage.getAttendanceByDate(req.params.date);
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  // Get attendance for a specific user
  app.get("/api/admin/attendance/user/:userId", requireAdminAuth, async (req, res) => {
    try {
      const records = await storage.getAttendanceByUserId(req.params.userId);
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attendance records" });
    }
  });

  // Get today's attendance for current logged-in admin user
  app.get("/api/admin/attendance/today", requireAdminAuth, async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const record = await storage.getTodayAttendanceForUser(req.session.adminUserId!, today);
      res.json(record || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch today's attendance" });
    }
  });

  // Mark attendance (check-in)
  app.post("/api/admin/attendance/check-in", requireAdminAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.adminUserId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const today = new Date().toISOString().split('T')[0];

      // Check if already checked in today
      const existing = await storage.getTodayAttendanceForUser(user.id, today);
      if (existing) {
        return res.status(400).json({ error: "Already checked in today", record: existing });
      }

      const record = await storage.createAttendanceRecord({
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        date: today,
        notes: req.body.notes || null,
      });

      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark attendance" });
    }
  });

  // Mark attendance (check-out)
  app.post("/api/admin/attendance/check-out", requireAdminAuth, async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const existing = await storage.getTodayAttendanceForUser(req.session.adminUserId!, today);

      if (!existing) {
        return res.status(400).json({ error: "No check-in record found for today" });
      }

      if (existing.checkOutTime) {
        return res.status(400).json({ error: "Already checked out today" });
      }

      const updated = await storage.updateAttendanceRecord(existing.id, {
        checkOutTime: new Date(),
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to mark check-out" });
    }
  });

  // Get jobs assigned to a technician
  app.get("/api/admin/jobs/technician/:name", requireAdminAuth, async (req, res) => {
    try {
      const jobs = await storage.getJobTicketsByTechnician(req.params.name);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch technician jobs" });
    }
  });

  // ===== REPORTS API =====

  // Get report data with period filter
  app.get("/api/admin/reports", requireAdminAuth, async (req, res) => {
    try {
      const period = req.query.period as string || "this_month";
      const now = new Date();
      let startDate: Date;
      let endDate: Date = now;

      switch (period) {
        case "this_week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
          startDate.setHours(0, 0, 0, 0);
          break;
        case "last_month":
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
          break;
        case "this_year":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case "this_month":
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }

      const reportData = await storage.getReportData(startDate, endDate);
      res.json(reportData);
    } catch (error) {
      console.error("Failed to fetch report data:", error);
      res.status(500).json({ error: "Failed to fetch report data" });
    }
  });

  // ===== ORDERS API =====

  // Create order (public - requires customer auth)
  app.post("/api/orders", requireCustomerAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.customerId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const { items, address, phone, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Order must have at least one item" });
      }

      if (!address || typeof address !== "string" || address.trim() === "") {
        return res.status(400).json({ error: "Delivery address is required" });
      }

      if (!phone || typeof phone !== "string" || phone.trim() === "") {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Calculate totals
      let subtotal = 0;
      const orderItems = [];

      for (const item of items) {
        const product = await storage.getInventoryItem(item.productId);
        if (!product) {
          return res.status(400).json({ error: `Product ${item.productId} not found` });
        }

        let price = product.price;
        let variantName = null;

        // Check if variant is specified
        if (item.variantId) {
          const variant = await storage.getProductVariant(item.variantId);
          if (!variant) {
            return res.status(400).json({ error: `Variant ${item.variantId} not found` });
          }
          price = variant.price;
          variantName = variant.variantName;
        }

        const quantity = Number(item.quantity) || 1;
        const itemTotal = price * quantity;
        subtotal += itemTotal;

        orderItems.push({
          productId: product.id,
          productName: product.name,
          variantId: item.variantId || null,
          variantName,
          quantity,
          price: price,
          total: itemTotal,
        });
      }

      const total = subtotal; // No VAT for COD orders initially

      const order = await storage.createOrder(
        {
          customerId: user.id,
          customerName: user.name,
          customerPhone: phone,
          customerAddress: address,
          status: "Pending",
          paymentMethod: "COD",
          subtotal: subtotal,
          total: total,
          notes: notes || null,
        },
        orderItems
      );

      // Notify admins about new order
      notifyAdminUpdate({
        type: "order_created",
        data: order,
        createdAt: new Date().toISOString(),
      });

      // Notify customer
      // Notify customer
      notifyCustomerUpdate(user.id, {
        type: "order_created",
        data: order,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json(order);
    } catch (error: any) {
      console.error("Order creation error:", error);
      res.status(500).json({ error: "Failed to create order", details: error.message });
    }
  });

  // Get customer's orders (public - requires customer auth)
  app.get("/api/customer/orders", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Customer ID not found" });
      }
      const orders = await storage.getOrdersByCustomerId(customerId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Get customer's order by ID (public - requires customer auth)
  app.get("/api/customer/orders/:id", requireCustomerAuth, async (req, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Customer ID not found" });
      }

      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Verify the order belongs to this customer
      if (order.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const items = await storage.getOrderItems(order.id);
      res.json({ ...order, items });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Get order by order number (public - for tracking)
  app.get("/api/orders/track/:orderNumber", async (req, res) => {
    try {
      const order = await storage.getOrderByOrderNumber(req.params.orderNumber);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const items = await storage.getOrderItems(order.id);
      res.json({ ...order, items });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // ===== ADMIN ORDERS API =====

  // Get all orders (admin)
  app.get("/api/admin/orders", requireAdminAuth, async (req, res) => {
    try {
      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Get order details (admin)
  app.get("/api/admin/orders/:id", requireAdminAuth, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const items = await storage.getOrderItems(order.id);
      res.json({ ...order, items });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Update order status (admin)
  app.patch("/api/admin/orders/:id", requireAdminAuth, async (req, res) => {
    try {
      const { status, declineReason, notes } = req.body;

      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const updates: any = {};
      if (status) {
        updates.status = status;
      }
      if (declineReason !== undefined) {
        updates.declineReason = declineReason;
      }
      if (notes !== undefined) {
        updates.notes = notes;
      }

      const updated = await storage.updateOrder(req.params.id, updates);

      // Notify customer about order update
      if (updated && updated.customerId) {
        notifyCustomerUpdate(updated.customerId, {
          type: "order_updated",
          data: updated,
          updatedAt: new Date().toISOString(),
        });
      }

      // Notify admins about order update
      notifyAdminUpdate({
        type: "order_updated",
        data: updated,
        updatedAt: new Date().toISOString(),
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update order" });
    }
  });

  // Accept order (admin shortcut)
  app.post("/api/admin/orders/:id/accept", requireAdminAuth, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== "Pending") {
        return res.status(400).json({ error: "Only pending orders can be accepted" });
      }

      const updated = await storage.updateOrder(req.params.id, { status: "Accepted" });

      // Notify customer
      if (updated && updated.customerId) {
        notifyCustomerUpdate(updated.customerId, {
          type: "order_accepted",
          data: updated,
          updatedAt: new Date().toISOString(),
        });
      }

      // Notify admins about order acceptance
      notifyAdminUpdate({
        type: "order_accepted",
        data: updated,
        updatedAt: new Date().toISOString(),
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to accept order" });
    }
  });

  // Decline order (admin shortcut)
  app.post("/api/admin/orders/:id/decline", requireAdminAuth, async (req, res) => {
    try {
      const { reason } = req.body;

      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== "Pending") {
        return res.status(400).json({ error: "Only pending orders can be declined" });
      }

      const updated = await storage.updateOrder(req.params.id, {
        status: "Declined",
        declineReason: reason || "Order declined by admin",
      });

      // Notify customer
      if (updated && updated.customerId) {
        notifyCustomerUpdate(updated.customerId, {
          type: "order_declined",
          data: updated,
          updatedAt: new Date().toISOString(),
        });
      }

      // Notify admins about order decline
      notifyAdminUpdate({
        type: "order_declined",
        data: updated,
        updatedAt: new Date().toISOString(),
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to decline order" });
    }
  });

  // ===== ADMIN CUSTOMERS API =====

  // Get all customers (admin) - NOW USERS WITH ROLE CUSTOMER
  app.get("/api/admin/customers", requireAdminAuth, async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const customers = allUsers.filter(u => u.role === "Customer");

      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          const orders = await storage.getOrdersByCustomerId(customer.id);
          const serviceRequests = await storage.getServiceRequestsByCustomerId(customer.id);
          return {
            ...customer,
            password: undefined,
            totalOrders: orders.length,
            totalServiceRequests: serviceRequests.length,
          };
        })
      );
      res.json(customersWithStats);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Get customer details with orders and service requests (admin)
  app.get("/api/admin/customers/:id", requireAdminAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const orders = await storage.getOrdersByCustomerId(user.id);
      const serviceRequests = await storage.getServiceRequestsByCustomerId(user.id);

      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await storage.getOrderItems(order.id);
          return { ...order, items };
        })
      );

      res.json({
        ...user,
        password: undefined,
        orders: ordersWithItems,
        serviceRequests,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customer details" });
    }
  });

  // Update customer (admin)
  app.patch("/api/admin/customers/:id", requireAdminAuth, async (req, res) => {
    try {
      const { name, email, phone, address, isVerified } = req.body;
      const updates: any = {};

      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (address !== undefined) updates.address = address;
      if (isVerified !== undefined) updates.isVerified = isVerified;

      const updated = await storage.updateUser(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ ...updated, password: undefined });
    } catch (error) {
      res.status(500).json({ error: "Failed to update customer" });
    }
  });

  // Delete customer (admin)
  app.delete("/api/admin/customers/:id", requireAdminAuth, async (req, res) => {
    try {
      const success = await storage.deleteUser(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete customer" });
    }
  });

  // ===== PRODUCT VARIANTS API =====

  // Get product variants (public)
  app.get("/api/products/:productId/variants", async (req, res) => {
    try {
      const variants = await storage.getProductVariants(req.params.productId);
      res.json(variants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product variants" });
    }
  });

  // Create product variant (admin)
  app.post("/api/admin/products/:productId/variants", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertProductVariantSchema.parse({
        ...req.body,
        productId: req.params.productId,
      });
      const variant = await storage.createProductVariant(validated);
      res.status(201).json(variant);
    } catch (error: any) {
      console.error("Variant creation error:", error);
      res.status(400).json({ error: "Invalid variant data", details: error.message });
    }
  });

  // Update product variant (admin)
  app.patch("/api/admin/products/:productId/variants/:variantId", requireAdminAuth, async (req, res) => {
    try {
      const variant = await storage.updateProductVariant(req.params.variantId, req.body);
      if (!variant) {
        return res.status(404).json({ error: "Variant not found" });
      }
      res.json(variant);
    } catch (error) {
      res.status(500).json({ error: "Failed to update variant" });
    }
  });

  // Delete product variant (admin)
  app.delete("/api/admin/products/:productId/variants/:variantId", requireAdminAuth, async (req, res) => {
    try {
      const success = await storage.deleteProductVariant(req.params.variantId);
      if (!success) {
        return res.status(404).json({ error: "Variant not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete variant" });
    }
  });

  // Delete all variants for a product (admin)
  app.delete("/api/admin/products/:productId/variants", requireAdminAuth, async (req, res) => {
    try {
      await storage.deleteProductVariantsByProductId(req.params.productId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete variants" });
    }
  });

  // ===== SERVICE CATALOG API =====

  // Get all active services (public - for customer portal)
  // Returns services from inventory items where itemType = 'service'
  app.get("/api/services", async (req, res) => {
    try {
      const inventoryServices = await storage.getActiveServicesFromInventory();
      const services = inventoryServices.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        category: item.category,
        icon: item.icon || "Wrench",
        minPrice: item.minPrice || item.price,
        maxPrice: item.maxPrice || item.price,
        estimatedDays: item.estimatedDays || "3-5 days",
        isActive: item.showOnWebsite,
        displayOrder: item.displayOrder || 0,
        images: item.images,
        features: item.features,
      }));
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch services" });
    }
  });

  // Get all services (admin) - includes inventory services
  app.get("/api/admin/services", requireAdminAuth, async (req, res) => {
    try {
      const inventoryServices = await storage.getServicesFromInventory();
      const services = inventoryServices.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description || "",
        category: item.category,
        icon: item.icon || "Wrench",
        minPrice: item.minPrice || item.price,
        maxPrice: item.maxPrice || item.price,
        estimatedDays: item.estimatedDays || "3-5 days",
        isActive: item.showOnWebsite,
        displayOrder: item.displayOrder || 0,
        images: item.images,
        features: item.features,
      }));
      res.json(services);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch services" });
    }
  });

  // Get single service (from inventory)
  app.get("/api/services/:id", async (req, res) => {
    try {
      const item = await storage.getInventoryItem(req.params.id);
      if (!item || item.itemType !== 'service') {
        return res.status(404).json({ error: "Service not found" });
      }
      const service = {
        id: item.id,
        name: item.name,
        description: item.description || "",
        category: item.category,
        icon: item.icon || "Wrench",
        minPrice: item.minPrice || item.price,
        maxPrice: item.maxPrice || item.price,
        estimatedDays: item.estimatedDays || "3-5 days",
        isActive: item.showOnWebsite,
        displayOrder: item.displayOrder || 0,
        images: item.images,
        features: item.features,
      };
      res.json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service" });
    }
  });

  // Create service (admin)
  app.post("/api/admin/services", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertServiceCatalogSchema.parse(req.body);
      const service = await storage.createServiceCatalogItem(validated);
      res.status(201).json(service);
    } catch (error: any) {
      console.error("Service creation error:", error);
      res.status(400).json({ error: "Invalid service data", details: error.message });
    }
  });

  // Update service (admin)
  app.patch("/api/admin/services/:id", requireAdminAuth, async (req, res) => {
    try {
      const service = await storage.updateServiceCatalogItem(req.params.id, req.body);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to update service" });
    }
  });

  // Delete service (admin)
  app.delete("/api/admin/services/:id", requireAdminAuth, async (req, res) => {
    try {
      const success = await storage.deleteServiceCatalogItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete service" });
    }
  });

  // ===== SERVICE CATEGORIES API =====

  // Get all service categories (public)
  app.get("/api/service-categories", async (req, res) => {
    try {
      const categories = await storage.getAllServiceCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service categories" });
    }
  });

  // Create service category (admin)
  app.post("/api/admin/service-categories", requireAdminAuth, async (req, res) => {
    try {
      const { name, displayOrder } = req.body;
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: "Category name is required" });
      }
      const category = await storage.createServiceCategory({
        name: name.trim(),
        displayOrder: displayOrder || 0
      });
      res.status(201).json(category);
    } catch (error: any) {
      if (error.message?.includes('unique')) {
        return res.status(400).json({ error: "Category name already exists" });
      }
      console.error("Service category creation error:", error);
      res.status(500).json({ error: "Failed to create service category" });
    }
  });

  // Update service category (admin)
  app.patch("/api/admin/service-categories/:id", requireAdminAuth, async (req, res) => {
    try {
      const category = await storage.updateServiceCategory(req.params.id, req.body);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Failed to update service category" });
    }
  });

  // Delete service category (admin)
  app.delete("/api/admin/service-categories/:id", requireAdminAuth, async (req, res) => {
    try {
      const success = await storage.deleteServiceCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete service category" });
    }
  });

  // ===== ADMIN DATA MANAGEMENT =====

  // Delete all business data (Super Admin only - temporary feature for clearing demo data)
  app.delete("/api/admin/data/all", requireSuperAdmin, async (req, res) => {
    try {
      const { confirmation } = req.body;

      // Require explicit confirmation
      if (confirmation !== "DELETE ALL") {
        return res.status(400).json({
          error: "Confirmation required. Send { confirmation: 'DELETE ALL' } to proceed."
        });
      }

      const result = await storage.deleteAllBusinessData();

      console.log("All business data deleted by Super Admin. Counts:", result.deletedCounts);

      res.json({
        success: true,
        message: "All business data has been deleted successfully.",
        deletedCounts: result.deletedCounts
      });
    } catch (error: any) {
      console.error("Error deleting all data:", error);
      res.status(500).json({ error: "Failed to delete data", details: error.message });
    }
  });

  // ===== QUOTE REQUEST API =====

  // Submit a quote request (customer)
  app.post("/api/quotes", async (req, res) => {
    try {
      const validated = insertQuoteRequestSchema.parse(req.body);

      // Check if customer is logged in and link the quote to their account
      const customerId = req.session?.customerId || null;

      // Create service request with quote flag and customer link
      const quoteRequest = await storage.createServiceRequest({
        ...validated,
        customerId, // Link to logged-in customer if available
        isQuote: true,
        quoteStatus: "Pending",
        status: "Pending",
        servicePreference: validated.servicePreference || null,
        requestIntent: validated.requestIntent || "quote",
        serviceMode: validated.serviceMode || null,
        stage: "intake" as const, // Start at intake stage
      });

      // Notify admins about new quote request
      notifyAdminUpdate({
        type: "quote_request_created",
        data: quoteRequest,
        createdAt: new Date().toISOString()
      });

      res.status(201).json(quoteRequest);
    } catch (error: any) {
      console.error("Quote request error:", error);
      res.status(400).json({ error: "Invalid quote request", details: error.message });
    }
  });

  // Get all quote requests (admin)
  app.get("/api/admin/quotes", requireAdminAuth, async (req, res) => {
    try {
      const quotes = await storage.getQuoteRequests();
      res.json(quotes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quotes" });
    }
  });

  // Update quote with pricing (admin)
  app.patch("/api/admin/quotes/:id/price", requireAdminAuth, async (req, res) => {
    try {
      const { quoteAmount, quoteNotes } = req.body;
      if (!quoteAmount) {
        return res.status(400).json({ error: "Quote amount is required" });
      }

      const updated = await storage.updateQuote(req.params.id, quoteAmount, quoteNotes);
      if (!updated) {
        return res.status(404).json({ error: "Quote not found" });
      }

      // Notify customer about quote update
      if (updated.customerId) {
        notifyCustomerUpdate(updated.customerId, {
          type: "quote_updated",
          data: updated,
          updatedAt: new Date().toISOString()
        });
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update quote" });
    }
  });

  // Accept quote (customer)
  app.post("/api/quotes/:id/accept", async (req, res) => {
    try {
      const { pickupTier, servicePreference, address, scheduledVisitDate } = req.body;

      // Validate service preference
      if (!servicePreference || !["home_pickup", "service_center"].includes(servicePreference)) {
        return res.status(400).json({ error: "Valid service preference is required (home_pickup or service_center)" });
      }

      if (servicePreference === "home_pickup" && !pickupTier) {
        return res.status(400).json({ error: "Pickup tier is required for home pickup service" });
      }

      // Validate pickup tier is valid
      const validTiers = ["Regular", "Priority", "Emergency"];
      if (servicePreference === "home_pickup" && !validTiers.includes(pickupTier)) {
        return res.status(400).json({ error: "Invalid pickup tier. Must be Regular, Priority, or Emergency" });
      }

      // If service center visit, set pickupTier to null
      const actualPickupTier = servicePreference === "service_center" ? null : pickupTier;

      // For service center, use "Queued" to start the service center flow
      const trackingStatus = servicePreference === "home_pickup" ? "Arriving to Receive" : "Queued";

      // Parse scheduled visit date for service center
      const parsedScheduledVisitDate = (servicePreference === "service_center" && scheduledVisitDate)
        ? new Date(scheduledVisitDate)
        : null;

      const updated = await storage.acceptQuote(
        req.params.id,
        actualPickupTier,
        address || "",
        servicePreference,
        parsedScheduledVisitDate
      );
      if (!updated) {
        return res.status(404).json({ error: "Quote not found" });
      }

      // Update tracking status using the proper type
      await storage.updateServiceRequest(req.params.id, { trackingStatus: trackingStatus as any });

      // Create timeline event for the status change
      let eventMessage = servicePreference === "home_pickup"
        ? "Our team is on the way to collect your TV."
        : "Your service request has been queued. Please bring your TV to our service center.";

      if (servicePreference === "service_center" && scheduledVisitDate) {
        const visitDate = new Date(scheduledVisitDate);
        eventMessage = `Your visit is scheduled for ${visitDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Please bring your TV to our service center.`;
      }

      await storage.createServiceRequestEvent({
        serviceRequestId: req.params.id,
        status: trackingStatus,
        message: eventMessage,
        actor: "System",
      });

      // Notify admins about quote acceptance
      notifyAdminUpdate({
        type: "quote_accepted",
        data: { ...updated, servicePreference, trackingStatus, scheduledVisitDate },
        acceptedAt: new Date().toISOString()
      });

      res.json({ ...updated, servicePreference, trackingStatus, scheduledPickupDate: parsedScheduledVisitDate });
    } catch (error) {
      console.error("Error accepting quote:", error);
      res.status(500).json({ error: "Failed to accept quote" });
    }
  });

  // Decline quote (customer)
  app.post("/api/quotes/:id/decline", async (req, res) => {
    try {
      const updated = await storage.declineQuote(req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "Quote not found" });
      }

      // Notify admins about quote decline
      notifyAdminUpdate({
        type: "quote_declined",
        data: updated,
        declinedAt: new Date().toISOString()
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to decline quote" });
    }
  });

  // Convert accepted quote to service request (customer)
  app.post("/api/quotes/:id/convert", async (req, res) => {
    try {
      const updated = await storage.convertQuoteToServiceRequest(req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "Quote not found" });
      }

      // Notify admins about conversion
      notifyAdminUpdate({
        type: "quote_converted",
        data: updated,
        convertedAt: new Date().toISOString()
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to convert quote" });
    }
  });

  // ===== PICKUP SCHEDULES API =====

  // Get all pickup schedules (admin)
  app.get("/api/admin/pickups", requireAdminAuth, async (req, res) => {
    try {
      const { status } = req.query;
      let pickups;
      if (status && typeof status === "string") {
        pickups = await storage.getPickupSchedulesByStatus(status);
      } else {
        pickups = await storage.getAllPickupSchedules();
      }
      res.json(pickups);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pickup schedules" });
    }
  });

  // Get pending pickups (admin)
  app.get("/api/admin/pickups/pending", requireAdminAuth, async (req, res) => {
    try {
      const pickups = await storage.getPendingPickupSchedules();
      res.json(pickups);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending pickups" });
    }
  });

  // Get pickup by service request ID
  app.get("/api/pickups/by-request/:serviceRequestId", async (req, res) => {
    try {
      const pickup = await storage.getPickupScheduleByServiceRequestId(req.params.serviceRequestId);
      if (!pickup) {
        return res.status(404).json({ error: "Pickup schedule not found" });
      }
      res.json(pickup);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pickup schedule" });
    }
  });

  // Update pickup schedule (admin - for scheduling dates)
  app.patch("/api/admin/pickups/:id", requireAdminAuth, async (req, res) => {
    try {
      const updates: any = { ...req.body };

      // Convert date strings to Date objects
      if (updates.scheduledDate && typeof updates.scheduledDate === "string") {
        updates.scheduledDate = new Date(updates.scheduledDate);
      }
      if (updates.pickedUpAt && typeof updates.pickedUpAt === "string") {
        updates.pickedUpAt = new Date(updates.pickedUpAt);
      }
      if (updates.deliveredAt && typeof updates.deliveredAt === "string") {
        updates.deliveredAt = new Date(updates.deliveredAt);
      }

      const pickup = await storage.updatePickupSchedule(req.params.id, updates);
      if (!pickup) {
        return res.status(404).json({ error: "Pickup schedule not found" });
      }

      // Notify about pickup update
      notifyAdminUpdate({
        type: "pickup_updated",
        data: pickup,
        updatedAt: new Date().toISOString()
      });

      res.json(pickup);
    } catch (error) {
      res.status(500).json({ error: "Failed to update pickup schedule" });
    }
  });

  // Update pickup status (admin)
  app.patch("/api/admin/pickups/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      const updates: any = { status };

      // Auto-set timestamps based on status
      if (status === "PickedUp") {
        updates.pickedUpAt = new Date();
      } else if (status === "Delivered") {
        updates.deliveredAt = new Date();
      }

      const pickup = await storage.updatePickupSchedule(req.params.id, updates);
      if (!pickup) {
        return res.status(404).json({ error: "Pickup schedule not found" });
      }

      // Update service request tracking status if delivered
      if (status === "Delivered") {
        await storage.updateServiceRequest(pickup.serviceRequestId, {
          trackingStatus: "Delivered"
        } as any);
      }

      res.json(pickup);
    } catch (error) {
      res.status(500).json({ error: "Failed to update pickup status" });
    }
  });

  // ==================== POLICIES API ====================

  const validPolicySlugs = ["privacy", "warranty", "terms"] as const;

  // Public: Get published policy by slug
  app.get("/api/policies/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      if (!validPolicySlugs.includes(slug as any)) {
        return res.status(400).json({ error: "Invalid policy slug. Must be one of: privacy, warranty, terms" });
      }
      const policy = await storage.getPolicyBySlug(slug);
      if (!policy || !policy.isPublished) {
        return res.status(404).json({ error: "Policy not found" });
      }
      res.json(policy);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch policy" });
    }
  });

  // Admin: List all policies
  app.get("/api/admin/policies", requireAdminAuth, async (req, res) => {
    try {
      const policies = await storage.getAllPolicies();
      res.json(policies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch policies" });
    }
  });

  // Admin: Get single policy by slug
  app.get("/api/admin/policies/:slug", requireAdminAuth, async (req, res) => {
    try {
      const { slug } = req.params;
      if (!validPolicySlugs.includes(slug as any)) {
        return res.status(400).json({ error: "Invalid policy slug. Must be one of: privacy, warranty, terms" });
      }
      const policy = await storage.getPolicyBySlug(slug);
      if (!policy) {
        return res.status(404).json({ error: "Policy not found" });
      }
      res.json(policy);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch policy" });
    }
  });

  // Admin: Create/update policy (upsert by slug)
  app.post("/api/admin/policies", requireAdminAuth, async (req, res) => {
    try {
      const { slug, title, content, isPublished } = req.body;
      if (!slug || !validPolicySlugs.includes(slug)) {
        return res.status(400).json({ error: "Invalid policy slug. Must be one of: privacy, warranty, terms" });
      }
      if (!title || typeof title !== "string") {
        return res.status(400).json({ error: "Title is required" });
      }
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required" });
      }
      const policy = await storage.upsertPolicy({
        slug,
        title,
        content,
        isPublished: isPublished !== false,
      });
      res.status(201).json(policy);
    } catch (error) {
      res.status(500).json({ error: "Failed to save policy" });
    }
  });

  // Admin: Delete policy
  app.delete("/api/admin/policies/:slug", requireAdminAuth, async (req, res) => {
    try {
      const { slug } = req.params;
      if (!validPolicySlugs.includes(slug as any)) {
        return res.status(400).json({ error: "Invalid policy slug. Must be one of: privacy, warranty, terms" });
      }
      const success = await storage.deletePolicy(slug);
      if (!success) {
        return res.status(404).json({ error: "Policy not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete policy" });
    }
  });

  // =================== CUSTOMER REVIEWS API ===================

  // Public: Get approved reviews for homepage
  app.get("/api/reviews", async (req, res) => {
    try {
      const reviews = await storage.getApprovedReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  // Customer: Submit a review (requires login)
  app.post("/api/reviews", requireCustomerAuth, async (req: any, res) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) {
        return res.status(401).json({ error: "Please login to submit a review" });
      }

      const user = await storage.getUser(customerId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { rating, title, content } = req.body;

      if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      if (!content || typeof content !== "string" || content.trim().length < 10) {
        return res.status(400).json({ error: "Review content must be at least 10 characters" });
      }

      const review = await storage.createCustomerReview({
        customerId,
        customerName: user.name,
        rating,
        title: title?.trim() || null,
        content: content.trim(),
      });

      res.status(201).json(review);
    } catch (error: any) {
      console.error("Failed to submit review:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  // Admin: Get all reviews for moderation
  app.get("/api/admin/reviews", requireAdminAuth, async (req, res) => {
    try {
      const reviews = await storage.getAllReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  // Admin: Update review approval status
  app.patch("/api/admin/reviews/:id/approval", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { isApproved } = req.body;

      if (typeof isApproved !== "boolean") {
        return res.status(400).json({ error: "isApproved must be a boolean" });
      }

      const review = await storage.updateReviewApproval(id, isApproved);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }
      res.json(review);
    } catch (error) {
      res.status(500).json({ error: "Failed to update review approval" });
    }
  });

  // Admin: Delete a review
  app.delete("/api/admin/reviews/:id", requireAdminAuth, async (req, res) => {
    try {
      const success = await storage.deleteCustomerReview(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Review not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete review" });
    }
  });

  // =================== PETTY CASH API ===================

  // Get all petty cash records (admin)
  app.get("/api/petty-cash", requireAdminAuth, async (req, res) => {
    try {
      const records = await storage.getAllPettyCashRecords();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch petty cash records" });
    }
  });

  // Create petty cash record (admin)
  app.post("/api/petty-cash", requireAdminAuth, async (req, res) => {
    try {
      const validated = insertPettyCashRecordSchema.parse(req.body);
      const record = await storage.createPettyCashRecord(validated);
      res.status(201).json(record);
    } catch (error) {
      res.status(400).json({ error: "Invalid petty cash data" });
    }
  });

  // Delete petty cash record (admin)
  app.delete("/api/petty-cash/:id", requireAdminAuth, async (req, res) => {
    try {
      const success = await storage.deletePettyCashRecord(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Record not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete record" });
    }
  });

  // =================== DUE RECORDS API ===================

  // Get all due records (admin)
  app.get("/api/due-records", requireAdminAuth, async (req, res) => {
    try {
      const records = await storage.getAllDueRecords();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch due records" });
    }
  });

  // Update due record (partial payment)
  app.patch("/api/due-records/:id", requireAdminAuth, async (req, res) => {
    try {
      const { paymentAmount, paymentMethod } = req.body;
      const id = req.params.id;

      const dueRecord = await storage.getDueRecord(id);
      if (!dueRecord) {
        return res.status(404).json({ error: "Due record not found" });
      }

      const currentPaid = Number(dueRecord.paidAmount || 0);
      const totalAmount = Number(dueRecord.amount);
      const payment = Number(paymentAmount);

      if (isNaN(payment) || payment <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      if (currentPaid + payment > totalAmount) {
        return res.status(400).json({ error: "Payment exceeds due amount" });
      }

      const newPaidAmount = currentPaid + payment;
      const newStatus = newPaidAmount >= totalAmount ? "Paid" : "Pending";

      const updatedRecord = await storage.updateDueRecord(id, {
        paidAmount: newPaidAmount.toString(),
        status: newStatus,
      });

      // If fully paid, update the linked POS transaction status
      if (newStatus === "Paid" && dueRecord.invoice) {
        await storage.updatePosTransactionStatusByInvoice(dueRecord.invoice, "Paid");
      }

      // Create Petty Cash Record for the payment
      if (paymentMethod && ["Cash", "Bank", "bKash", "Nagad"].includes(paymentMethod)) {
        await storage.createPettyCashRecord({
          description: `Due Payment - ${dueRecord.customer} - Invoice ${dueRecord.invoice}`,
          category: "Due Collection",
          amount: payment, // Pass as number
          type: paymentMethod, // Use specific payment method as type
          dueRecordId: id,
        });
      }

      res.json(updatedRecord);
    } catch (error) {
      console.error("Failed to update due record:", error);
      res.status(500).json({ error: "Failed to update due record" });
    }
  });


  // Inquiries API
  app.post("/api/inquiries", async (req, res) => {
    try {
      const validated = insertInquirySchema.parse(req.body);
      const inquiry = await storage.createInquiry(validated);
      res.status(201).json(inquiry);
    } catch (error: any) {
      res.status(400).json({ error: "Invalid inquiry data", details: error.message });
    }
  });

  app.get("/api/inquiries", requireAdminAuth, async (req, res) => {
    try {
      const inquiries = await storage.getAllInquiries();
      res.json(inquiries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });

  app.patch("/api/inquiries/:id/status", requireAdminAuth, async (req, res) => {
    try {
      const { status, reply } = req.body;
      if (status && !["Pending", "Read", "Replied"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updates: any = {};
      if (status) updates.status = status;
      if (reply) updates.reply = reply;

      const updated = await storage.updateInquiry(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ error: "Inquiry not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update inquiry status" });
    }
  });

  // Get inquiries for a specific customer (by phone)
  app.get("/api/customer/inquiries", requireCustomerAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.customerId!);
      if (!user || !user.phone) {
        return res.json([]);
      }
      const inquiries = await storage.getInquiriesByPhone(user.phone);
      res.json(inquiries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });
  // ============ PUSH NOTIFICATION ROUTES ============

  // Register device token for push notifications
  app.post("/api/push/register", async (req, res) => {
    try {
      const { userId, token, platform } = req.body;

      if (!userId || !token) {
        return res.status(400).json({ error: "userId and token are required" });
      }

      // Import dynamically to avoid circular deps
      const { pushService } = await import("./pushService.js");
      await pushService.registerDeviceToken(userId, token, platform || "android");

      res.json({ success: true, message: "Token registered" });
    } catch (error) {
      console.error("Push registration error:", error);
      res.status(500).json({ error: "Failed to register token" });
    }
  });

  // Unregister device token (on logout)
  app.post("/api/push/unregister", async (req, res) => {
    try {
      const { userId, token } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const { pushService } = await import("./pushService.js");
      await pushService.removeUserTokens(userId, token);

      res.json({ success: true, message: "Token removed" });
    } catch (error) {
      console.error("Push unregister error:", error);
      res.status(500).json({ error: "Failed to unregister token" });
    }
  });

  // Admin: Send promotional notification (Super Admin only)
  app.post("/api/admin/push/send", requireSuperAdmin, async (req, res) => {
    try {
      const { userId, title, body, route } = req.body;

      if (!userId || !title || !body) {
        return res.status(400).json({ error: "userId, title, and body are required" });
      }

      const { pushService } = await import("./pushService.js");
      const sent = await pushService.notifyPromotional(userId, title, body, route);

      res.json({ success: true, sent });
    } catch (error) {
      console.error("Push send error:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  return httpServer;
}
