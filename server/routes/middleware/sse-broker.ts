/**
 * SSE (Server-Sent Events) Broker
 * 
 * This module manages real-time connections for both customers and admins.
 * It maintains client registries and provides notification functions.
 * 
 * IMPORTANT: This is a singleton module. All route files that need SSE
 * functionality should import from this file to share the same state.
 */

import type { Response } from 'express';

// ============================================
// Customer SSE Client Registry
// ============================================

/**
 * Map of customer ID to their active SSE connections.
 * A customer can have multiple connections (e.g., multiple browser tabs).
 */
const customerSSEClients = new Map<string, Set<Response>>();

/**
 * Register a customer's SSE connection.
 */
export function addCustomerSSEClient(customerId: string, res: Response): void {
    if (!customerSSEClients.has(customerId)) {
        customerSSEClients.set(customerId, new Set());
    }
    customerSSEClients.get(customerId)!.add(res);
}

/**
 * Unregister a customer's SSE connection.
 */
export function removeCustomerSSEClient(customerId: string, res: Response): void {
    const clients = customerSSEClients.get(customerId);
    if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
            customerSSEClients.delete(customerId);
        }
    }
}

/**
 * Send a real-time update to a specific customer.
 * The message is sent to all their active connections.
 */
export function notifyCustomerUpdate(customerId: string, data: any): void {
    const clients = customerSSEClients.get(customerId);
    if (clients) {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        clients.forEach(res => {
            try {
                res.write(message);
            } catch (e) {
                // Client disconnected, will be cleaned up on close event
            }
        });
    }
}

// ============================================
// Admin SSE Client Registry
// ============================================

/**
 * Set of all active admin SSE connections.
 * All admins receive the same broadcast updates.
 */
const adminSSEClients = new Set<Response>();

/**
 * Register an admin's SSE connection.
 */
export function addAdminSSEClient(res: Response): void {
    adminSSEClients.add(res);
}

/**
 * Unregister an admin's SSE connection.
 */
export function removeAdminSSEClient(res: Response): void {
    adminSSEClients.delete(res);
}

/**
 * Broadcast a real-time update to all connected admins.
 */
export function notifyAdminUpdate(data: any): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    adminSSEClients.forEach(res => {
        try {
            res.write(message);
        } catch (e) {
            // Client disconnected, will be cleaned up on close event
        }
    });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get count of connected customers (for monitoring).
 */
export function getCustomerConnectionCount(): number {
    let count = 0;
    customerSSEClients.forEach(clients => {
        count += clients.size;
    });
    return count;
}

/**
 * Get count of connected admins (for monitoring).
 */
export function getAdminConnectionCount(): number {
    return adminSSEClients.size;
}
