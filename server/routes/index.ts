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
import settingsRoutes from './settings.routes.js';
import attendanceRoutes from './attendance.routes.js';
import notificationsRoutes from './notifications.routes.js';
import quotesRoutes from './quotes.routes.js';
import reviewsRoutes from './reviews.routes.js';
import uploadRoutes from './upload.routes.js';
import aiRoutes from './ai.routes.js';
import lensRoutes from './lens.routes.js';
import sparePartsRoutes from './spare-parts.routes.js';

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

    app.use(posRoutes);
    console.log('[Routes] ✓ POS routes registered');

    app.use(financeRoutes);
    console.log('[Routes] ✓ Finance routes registered');

    app.use(challansRoutes);
    console.log('[Routes] ✓ Challans routes registered');

    // Admin routes
    app.use(usersRoutes);
    console.log('[Routes] ✓ Users routes registered');

    app.use(settingsRoutes);
    console.log('[Routes] ✓ Settings routes registered');

    app.use(attendanceRoutes);
    console.log('[Routes] ✓ Attendance routes registered');

    // Additional features
    app.use(notificationsRoutes);
    console.log('[Routes] ✓ Notifications routes registered');

    app.use(quotesRoutes);
    console.log('[Routes] ✓ Quotes routes registered');

    app.use(reviewsRoutes);
    console.log('[Routes] ✓ Reviews routes registered');

    // File upload routes (should be near the end)
    // app.use(uploadRoutes);
    // console.log('[Routes] ✓ Upload routes registered (updated)');

    // AI Routes
    app.use('/api/ai', aiRoutes);
    console.log('[Routes] ✓ AI routes registered');

    app.use('/api/lens', lensRoutes);
    console.log('[Routes] ✓ Lens routes registered');

    app.use(sparePartsRoutes);
    console.log('[Routes] ✓ Spare parts routes registered');

    console.log('[Routes] All route modules registered successfully!');

    return httpServer;
}
