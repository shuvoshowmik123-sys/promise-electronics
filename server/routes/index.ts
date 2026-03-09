/**
 * Main Routes Index
 * 
 * This file aggregates all route modules and registers them with the Express app.
 * It also sets up the customer Google auth and health check endpoint.
 */

import type { Express } from 'express';
import type { Server } from 'http';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

// Import customer auth setup
import { setupCustomerAuth } from '../customerGoogleAuth.js';
import * as sseBroker from './middleware/sse-broker.js';

// Import all route modules
import authRoutes from './auth.routes.js';
import customerRoutes from './customer.routes.js';
import jobsRoutes from './jobs.routes.js';
import inventoryRoutes from './inventory.routes.js';
import serviceRequestsRoutes from './service-requests.routes.js';
import ordersRoutes from './orders.routes.js';
import posRoutes from './pos.routes.js';
import financeRoutes from './finance.routes.js';
import challansRoutes from './challans.routes.js';
import usersRoutes from './users.routes.js';
import modulesRoutes from './modules.routes.js';
import settingsRoutes from './settings.routes.js';
import attendanceRoutes from './attendance.routes.js';
import mobileRoutes from './mobile.routes.js';
import notificationsRoutes from './notifications.routes.js';
import quotesRoutes from './quotes.routes.js';
import reviewsRoutes from './reviews.routes.js';
import otpRoutes from './otp.routes.js';
import uploadRoutes from './upload.routes.js';
import aiRoutes from './ai.routes.js';
import lensRoutes from './lens.routes.js';
import brainRoutes from './brain.routes.js';
import sparePartsRoutes from './spare-parts.routes.js';
import messengerRoutes from './messenger.routes.js';
import technicianRoutes from './technician.routes.js';
import auditRoutes from './audit.routes.js';
import adminNotificationsRoutes from './admin-notifications.routes.js';
import searchRoutes from './search.routes.js';
import purchaseOrdersRoutes from './purchase-orders.routes.js';
import quotationRoutes from './quotation.routes.js';

import corporateAuthRoutes from './corporate-auth.routes.js';
import corporateRoutes from './corporate.routes.js';
import corporatePortalRoutes from './corporate-portal.routes.js';
import warrantyRoutes from './warranty.routes.js';
import refundsRoutes from './refunds.routes.js';
import approvalsRoutes from './approvals.routes.js';
import { analyticsRoutes } from './analytics.routes.js';
import corporateNotificationsRoutes from './corporate-notifications.routes.js';
import corporateMessagesRoutes from './corporate-messages.routes.js';
import adminCorporateMessagesRoutes from './admin-corporate-messages.routes.js';
import adminBackupRoutes from './admin-backup.routes.js';
import leaveRoutes from './leave.routes.js';
import payrollRoutes from './payroll.routes.js';
import { drawerRouter } from './drawer.routes.js'; // Phase 7: Financial Engine
import offlineSyncRoutes from './offline-sync.routes.js'; // Phase 3: Offline Data Sync

/**
 * Register all routes with the Express application.
 * 
 * @param httpServer - The HTTP server instance
 * @param app - The Express application
 * @returns The HTTP server instance
 */
export async function registerRoutes(
    httpServer: Server,
    app: Express
): Promise<Server> {
    console.log('[Routes] Registering route modules...');

    // ============================================
    // Register Routes
    // ============================================

    // Audit routes - PRIORITY CHECK
    app.use(auditRoutes);
    console.log('[Routes] ✓ Audit routes registered (PRIORITY)');

    // File upload routes (moved to top for priority)
    app.use(uploadRoutes);
    console.log('[Routes] ✓ Upload routes registered (priority)');
    // Setup Customer Authentication (Google OAuth)
    // ============================================
    await setupCustomerAuth(app);

    // ============================================
    // Health Check Endpoint
    // ============================================
    app.get('/api/health', async (req, res) => {
        try {
            const start = Date.now();
            await db.execute(sql`SELECT 1`);
            const latency = Date.now() - start;
            res.json({
                status: 'ok',
                database: 'connected',
                latency: `${latency}ms`,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                connections: {
                    customers: sseBroker.getCustomerConnectionCount(),
                    admins: sseBroker.getAdminConnectionCount(),
                    corporate: sseBroker.getCorporateConnectionCount(),
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error: any) {
            console.error('Health check failed:', error);
            res.status(500).json({
                status: 'error',
                database: 'disconnected',
                error: error.message,
            });
        }
    });

    // ============================================
    // Register Route Modules
    // ============================================

    // Auth routes (admin login/logout) - FIRST to avoid conflicts
    app.use(authRoutes);
    console.log('[Routes] ✓ Auth routes registered');

    // Customer routes (customer auth, profile, SSE)
    app.use(customerRoutes);
    console.log('[Routes] ✓ Customer routes registered');

    // Core business routes
    app.use(jobsRoutes);
    console.log('[Routes] ✓ Jobs routes registered');

    app.use(inventoryRoutes);
    console.log('[Routes] ✓ Inventory routes registered');

    app.use(serviceRequestsRoutes);
    console.log('[Routes] ✓ Service requests routes registered');

    app.use(ordersRoutes);
    console.log('[Routes] ✓ Orders routes registered');

    app.use(quotationRoutes);
    console.log('[Routes] ✓ Quotation routes registered');

    app.use(posRoutes);
    console.log('[Routes] ✓ POS routes registered');

    // Phase 7: Blind Drop Cash Drawer
    app.use(drawerRouter);
    console.log('[Routes] ✓ Drawer routes registered');

    app.use(financeRoutes);
    console.log('[Routes] ✓ Finance routes registered');

    app.use(challansRoutes);
    console.log('[Routes] ✓ Challans routes registered');

    // Admin routes
    app.use(usersRoutes);
    console.log('[Routes] ✓ Users routes registered');

    app.use(modulesRoutes);
    console.log('[Routes] ✓ Modules routes registered');

    app.use(searchRoutes);
    console.log('[Routes] ✓ Global Search routes registered');

    // Offline Synchronization (Phase 3)
    app.use("/api/offline", offlineSyncRoutes);
    console.log('[Routes] ✓ Offline synchronization routes registered');

    app.use(settingsRoutes);
    console.log('[Routes] ✓ Settings routes registered');

    app.use(attendanceRoutes);
    console.log('[Routes] ✓ Attendance routes registered');

    app.use(mobileRoutes);
    console.log('[Routes] ✓ Mobile workforce routes registered');

    // HR & Payroll
    app.use(leaveRoutes);
    console.log('[Routes] ✓ Leave application routes registered');

    app.use(payrollRoutes);
    console.log('[Routes] ✓ Payroll routes registered');


    // Technician personal dashboard routes
    app.use(technicianRoutes);
    console.log('[Routes] ✓ Technician routes registered');

    // Additional features
    app.use(notificationsRoutes);
    console.log('[Routes] ✓ Notifications routes registered');

    // Admin Notifications (SSE + REST)
    app.use(adminNotificationsRoutes);
    console.log('[Routes] ✓ Admin notifications routes registered');

    // Corporate B2B
    // Corporate B2B (Admin & Portal)
    // Note: CSRF protection removed from corporate routes as it was blocking GET requests
    // Individual routes can apply csrfProtection middleware to state-changing operations (POST/PUT/DELETE) as needed
    app.use("/api/corporate/auth", corporateAuthRoutes);
    app.use("/api/corporate", corporateRoutes);
    app.use("/api/corporate", corporatePortalRoutes);
    app.use("/api/corporate", corporateNotificationsRoutes);
    app.use("/api/corporate", corporateMessagesRoutes);
    // Admin Corporate Messages
    app.use("/api/admin/corporate-messages", adminCorporateMessagesRoutes);

    // Admin Backup Routes
    app.use("/api/admin", adminBackupRoutes);
    console.log('[Routes] ✓ Admin backup routes registered');

    console.log('[Routes] ✓ Corporate B2B routes registered');

    // Analytics (Phase 6)
    app.use("/api/analytics", analyticsRoutes);
    console.log('[Routes] ✓ Analytics routes registered');

    // Warranty Claims
    app.use(warrantyRoutes);
    console.log('[Routes] ✓ Warranty claims routes registered');

    // Refunds Management
    app.use(refundsRoutes);
    console.log('[Routes] ✓ Refunds routes registered');

    // Approvals (Super Admin verification workflow)
    app.use("/api/approvals", approvalsRoutes);
    console.log('[Routes] ✓ Approvals routes registered');

    app.use(quotesRoutes);
    console.log('[Routes] ✓ Quotes routes registered');

    app.use(reviewsRoutes);
    console.log('[Routes] ✓ Reviews routes registered');

    // OTP Routes (Phone Verification)
    app.use(otpRoutes);
    console.log('[Routes] ✓ OTP routes registered');

    // File upload routes (should be near the end)
    // app.use(uploadRoutes);
    // console.log('[Routes] ✓ Upload routes registered (updated)');

    // AI Routes
    app.use('/api/ai', aiRoutes);
    console.log('[Routes] ✓ AI routes registered');

    app.use('/api/brain', brainRoutes);
    console.log('[Routes] ✓ Brain routes registered');

    app.use('/api/lens', lensRoutes);
    console.log('[Routes] ✓ Lens routes registered');

    app.use(sparePartsRoutes);

    console.log('[Routes] ✓ Spare parts routes registered');

    app.use(purchaseOrdersRoutes);
    console.log('[Routes] ✓ Purchase Orders routes registered');

    app.use('/api/messenger', messengerRoutes);
    console.log('[Routes] ✓ Messenger webhook registered');

    console.log('[Routes] All route modules registered successfully!');

    return httpServer;
}
