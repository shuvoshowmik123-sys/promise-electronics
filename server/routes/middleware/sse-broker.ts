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
import { Redis } from 'ioredis';
import type { AdminRealtimeEvent } from '../../../shared/types/admin-realtime.js';
import { randomUUID } from 'crypto';

let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

if (process.env.REDIS_URL) {
    try {
        redisPub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
        redisSub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

        redisSub.subscribe('sse:broker');
        redisSub.on('message', (channel, message) => {
            if (channel === 'sse:broker') {
                try {
                    const payload = JSON.parse(message);
                    switch (payload.action) {
                        case 'notifyCustomer':
                            localNotifyCustomerUpdate(payload.id, payload.data);
                            break;
                        case 'notifyAdmin':
                            localNotifyAdminUpdate(payload.data);
                            break;
                        case 'broadcastAdmin':
                            localBroadcastAdminEvent(payload.data);
                            break;
                        case 'notifySpecificAdmin':
                            localNotifySpecificAdmin(payload.id, payload.data);
                            break;
                        case 'notifyCorporate':
                            localNotifyCorporateClient(payload.id, payload.data, payload.eventType);
                            break;
                    }
                } catch (e) {
                    console.error('[SSE Broker] Error handling Redis message:', e);
                }
            }
        });

        console.log('[SSE Broker] Initialized Redis Pub/Sub for scale-out realtime events.');
    } catch (e) {
        console.error('[SSE Broker] Redis init failed. Falling back to local broker.', e);
        redisPub = null;
        redisSub = null;
    }
}

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

export function notifyCustomerUpdate(customerId: string, data: any): void {
    if (redisPub) {
        redisPub.publish('sse:broker', JSON.stringify({ action: 'notifyCustomer', id: customerId, data })).catch(console.error);
    } else {
        localNotifyCustomerUpdate(customerId, data);
    }
}

function localNotifyCustomerUpdate(customerId: string, data: any): void {
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
 * Map of admin ID to their active SSE connections.
 * Allows targeting specific admins for permission updates.
 */
interface AdminSSEClient {
    res: Response;
    permissions: Record<string, boolean>;
}

const adminSSEClients = new Map<string, Set<AdminSSEClient>>();

function isAdminRealtimeEvent(data: unknown): data is AdminRealtimeEvent {
    if (!data || typeof data !== 'object') return false;

    const candidate = data as AdminRealtimeEvent;
    return candidate.channel === 'admin'
        && typeof candidate.id === 'string'
        && typeof candidate.topic === 'string'
        && typeof candidate.action === 'string'
        && Array.isArray(candidate.invalidate);
}

function hasRequiredAdminPermission(
    clientPermissions: Record<string, boolean>,
    eventPermissions?: string[],
): boolean {
    if (!eventPermissions || eventPermissions.length === 0) {
        return true;
    }

    if (clientPermissions['*']) {
        return true;
    }

    return eventPermissions.some((permission) => clientPermissions[permission]);
}

/**
 * Register an admin's SSE connection.
 */
export function addAdminSSEClient(adminId: string, res: Response, permissions?: Record<string, boolean>): void {
    if (!adminSSEClients.has(adminId)) {
        adminSSEClients.set(adminId, new Set());
    }
    adminSSEClients.get(adminId)!.add({ res, permissions: permissions || {} });
}

/**
 * Unregister an admin's SSE connection.
 */
export function removeAdminSSEClient(adminId: string, res: Response): void {
    const clients = adminSSEClients.get(adminId);
    if (clients) {
        let clientToRemove: AdminSSEClient | null = null;
        clients.forEach(client => {
            if (client.res === res) {
                clientToRemove = client;
            }
        });
        if (clientToRemove) {
            clients.delete(clientToRemove);
        }
        if (clients.size === 0) {
            adminSSEClients.delete(adminId);
        }
    }
}

export function notifyAdminUpdate(data: any): void {
    if (redisPub) {
        redisPub.publish('sse:broker', JSON.stringify({ action: 'notifyAdmin', data })).catch(console.error);
    } else {
        localNotifyAdminUpdate(data);
    }
}

function localNotifyAdminUpdate(data: any): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    const eventPermissions = isAdminRealtimeEvent(data) ? data.permissions : undefined;

    adminSSEClients.forEach(clients => {
        clients.forEach(client => {
            if (!hasRequiredAdminPermission(client.permissions, eventPermissions)) {
                return;
            }

            try {
                client.res.write(message);
            } catch (e) {
                // Client disconnected
            }
        });
    });
}

/**
 * Broadcasts a standardized realtime event to all connected admin clients
 * who have at least one of the required permissions (or to all if none required).
 */
export function broadcastAdminEvent(
    eventData: Omit<AdminRealtimeEvent, "id" | "channel" | "occurredAt">
): void {
    const event: AdminRealtimeEvent = {
        id: randomUUID(),
        channel: "admin",
        occurredAt: new Date().toISOString(),
        ...eventData
    };

    if (redisPub) {
        redisPub.publish('sse:broker', JSON.stringify({ action: 'broadcastAdmin', data: event })).catch(console.error);
    } else {
        localBroadcastAdminEvent(event);
    }
}

function localBroadcastAdminEvent(event: AdminRealtimeEvent): void {
    const message = `data: ${JSON.stringify(event)}\n\n`;

    adminSSEClients.forEach(clients => {
        clients.forEach(client => {
            if (!hasRequiredAdminPermission(client.permissions, event.permissions)) {
                return;
            }

            try {
                client.res.write(message);
            } catch (e) {
                // Client disconnected
            }
        });
    });
}

export function notifySpecificAdmin(adminId: string, data: any): void {
    if (redisPub) {
        redisPub.publish('sse:broker', JSON.stringify({ action: 'notifySpecificAdmin', id: adminId, data })).catch(console.error);
    } else {
        localNotifySpecificAdmin(adminId, data);
    }
}

function localNotifySpecificAdmin(adminId: string, data: any): void {
    const clients = adminSSEClients.get(adminId);
    if (clients) {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        clients.forEach(client => {
            try {
                client.res.write(message);
            } catch (e) {
                // Client disconnected
            }
        });
    }
}

// ============================================
// Corporate Client SSE Registry
// ============================================

/**
 * Map of corporate client ID to their active SSE connections.
 * A corporate client can have multiple connections (e.g., multiple browser tabs).
 */
const corporateSSEClients = new Map<string, Set<Response>>();

/**
 * Register a corporate client's SSE connection.
 */
export function addCorporateSSEClient(corporateClientId: string, res: Response): void {
    if (!corporateSSEClients.has(corporateClientId)) {
        corporateSSEClients.set(corporateClientId, new Set());
    }
    corporateSSEClients.get(corporateClientId)!.add(res);
}

/**
 * Unregister a corporate client's SSE connection.
 */
export function removeCorporateSSEClient(corporateClientId: string, res: Response): void {
    const clients = corporateSSEClients.get(corporateClientId);
    if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
            corporateSSEClients.delete(corporateClientId);
        }
    }
}

export function notifyCorporateClient(corporateClientId: string, data: any, eventType: string = 'corporate_notification'): void {
    if (redisPub) {
        redisPub.publish('sse:broker', JSON.stringify({ action: 'notifyCorporate', id: corporateClientId, data, eventType })).catch(console.error);
    } else {
        localNotifyCorporateClient(corporateClientId, data, eventType);
    }
}

function localNotifyCorporateClient(corporateClientId: string, data: any, eventType: string): void {
    const clients = corporateSSEClients.get(corporateClientId);
    if (clients) {
        const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
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
    let count = 0;
    adminSSEClients.forEach(clients => {
        count += clients.size;
    });
    return count;
}

/**
 * Get count of connected corporate clients (for monitoring).
 */
export function getCorporateConnectionCount(): number {
    let count = 0;
    corporateSSEClients.forEach(clients => {
        count += clients.size;
    });
    return count;
}
