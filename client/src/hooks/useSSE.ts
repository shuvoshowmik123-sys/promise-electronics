/**
 * SSE Auto-Reconnect Hook
 * 
 * Provides automatic reconnection for Server-Sent Events connections.
 * Essential for production environments like Vercel where serverless functions timeout.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseSSEOptions {
    /** SSE endpoint URL */
    url: string;
    /** Called when a message is received */
    onMessage?: (event: MessageEvent) => void;
    /** Called when a specific event type is received */
    onEvent?: (type: string, data: any) => void;
    /** Called when connection opens */
    onOpen?: () => void;
    /** Called when an error occurs */
    onError?: (error: Event) => void;
    /** Initial delay before first reconnect attempt (ms) */
    reconnectDelay?: number;
    /** Maximum delay between reconnect attempts (ms) */
    maxReconnectDelay?: number;
    /** Whether to automatically connect on mount */
    autoConnect?: boolean;
    /** Custom headers (note: EventSource doesn't support custom headers) */
    withCredentials?: boolean;
}

interface UseSSEReturn {
    /** Current connection status */
    isConnected: boolean;
    /** Whether reconnection is in progress */
    isReconnecting: boolean;
    /** Number of reconnection attempts */
    reconnectAttempts: number;
    /** Manually close the connection */
    disconnect: () => void;
    /** Manually reconnect */
    reconnect: () => void;
    /** Last error that occurred */
    lastError: Event | null;
}

/**
 * Hook for managing SSE connections with automatic reconnection
 * 
 * @example
 * ```tsx
 * const { isConnected, reconnectAttempts } = useSSE({
 *   url: '/api/admin/events',
 *   onEvent: (type, data) => {
 *     if (type === 'job_ticket_created') {
 *       queryClient.invalidateQueries(['jobs']);
 *     }
 *   },
 *   reconnectDelay: 2000,
 * });
 * ```
 */
export function useSSE(options: UseSSEOptions): UseSSEReturn {
    const {
        url,
        onMessage,
        onEvent,
        onOpen,
        onError,
        reconnectDelay = 2000,
        maxReconnectDelay = 30000,
        autoConnect = true,
        withCredentials = true,
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [lastError, setLastError] = useState<Event | null>(null);

    const eventSourceRef = useRef<EventSource | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    // Calculate delay with exponential backoff
    const getReconnectDelay = useCallback((attempt: number) => {
        const delay = reconnectDelay * Math.pow(2, attempt);
        return Math.min(delay, maxReconnectDelay);
    }, [reconnectDelay, maxReconnectDelay]);

    // Close current connection
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        setIsConnected(false);
        setIsReconnecting(false);
    }, []);

    // Connect to SSE endpoint
    const connect = useCallback(() => {
        if (!mountedRef.current) return;

        // Close existing connection
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        try {
            const eventSource = new EventSource(url, { withCredentials });
            eventSourceRef.current = eventSource;

            eventSource.onopen = () => {
                if (!mountedRef.current) return;

                console.log('[SSE] Connected to', url);
                setIsConnected(true);
                setIsReconnecting(false);
                setReconnectAttempts(0);
                setLastError(null);
                onOpen?.();
            };

            eventSource.onmessage = (event) => {
                if (!mountedRef.current) return;

                onMessage?.(event);

                // Try to parse as JSON and call onEvent
                if (onEvent) {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type) {
                            onEvent(data.type, data);
                        }
                    } catch {
                        // Not JSON, ignore
                    }
                }
            };

            eventSource.onerror = (error) => {
                if (!mountedRef.current) return;

                console.warn('[SSE] Connection error, will attempt to reconnect...');
                setIsConnected(false);
                setLastError(error);
                onError?.(error);

                // Close the failed connection
                eventSource.close();
                eventSourceRef.current = null;

                // Schedule reconnection
                setIsReconnecting(true);
                setReconnectAttempts((prev) => {
                    const newAttempts = prev + 1;
                    const delay = getReconnectDelay(newAttempts);

                    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${newAttempts})`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (mountedRef.current) {
                            connect();
                        }
                    }, delay);

                    return newAttempts;
                });
            };

        } catch (error) {
            console.error('[SSE] Failed to create EventSource:', error);
            setIsReconnecting(true);

            const delay = getReconnectDelay(reconnectAttempts);
            reconnectTimeoutRef.current = setTimeout(() => {
                if (mountedRef.current) {
                    connect();
                }
            }, delay);
        }
    }, [url, withCredentials, onOpen, onMessage, onEvent, onError, getReconnectDelay, reconnectAttempts]);

    // Manual reconnect
    const reconnect = useCallback(() => {
        disconnect();
        setReconnectAttempts(0);
        connect();
    }, [disconnect, connect]);

    // Auto-connect on mount
    useEffect(() => {
        mountedRef.current = true;

        if (autoConnect) {
            connect();
        }

        return () => {
            mountedRef.current = false;
            disconnect();
        };
    }, [autoConnect, connect, disconnect]);

    return {
        isConnected,
        isReconnecting,
        reconnectAttempts,
        disconnect,
        reconnect,
        lastError,
    };
}

/**
 * Hook for admin SSE updates
 * 
 * @example
 * ```tsx
 * const { isConnected } = useAdminSSE({
 *   onJobCreated: (job) => queryClient.invalidateQueries(['jobs']),
 *   onOrderCreated: (order) => queryClient.invalidateQueries(['orders']),
 * });
 * ```
 */
export function useAdminSSE(options?: {
    onJobCreated?: (job: any) => void;
    onJobUpdated?: (job: any) => void;
    onOrderCreated?: (order: any) => void;
    onOrderUpdated?: (order: any) => void;
    onServiceRequestCreated?: (request: any) => void;
    onServiceRequestUpdated?: (request: any) => void;
    onQuoteCreated?: (quote: any) => void;
    onConnected?: () => void;
    onError?: (error: Event) => void;
}) {
    return useSSE({
        url: '/api/admin/events',
        onEvent: (type, data) => {
            switch (type) {
                case 'connected':
                    options?.onConnected?.();
                    break;
                case 'job_ticket_created':
                    options?.onJobCreated?.(data.data);
                    break;
                case 'job_ticket_updated':
                    options?.onJobUpdated?.(data.data);
                    break;
                case 'order_created':
                    options?.onOrderCreated?.(data.data);
                    break;
                case 'order_updated':
                case 'order_accepted':
                case 'order_declined':
                    options?.onOrderUpdated?.(data.data);
                    break;
                case 'service_request_created':
                case 'quote_request_created':
                    options?.onServiceRequestCreated?.(data.data);
                    options?.onQuoteCreated?.(data.data);
                    break;
                case 'service_request_updated':
                    options?.onServiceRequestUpdated?.(data.data);
                    break;
            }
        },
        onError: options?.onError,
    });
}

/**
 * Hook for customer SSE updates
 * 
 * @example
 * ```tsx
 * const { isConnected } = useCustomerSSE({
 *   onOrderUpdate: (order) => refetch(),
 *   onNotification: (notification) => toast(notification.title),
 * });
 * ```
 */
export function useCustomerSSE(options?: {
    onOrderUpdate?: (order: any) => void;
    onNotification?: (notification: any) => void;
    onQuoteUpdate?: (quote: any) => void;
    onConnected?: () => void;
    onError?: (error: Event) => void;
}) {
    return useSSE({
        url: '/api/customer/events',
        onEvent: (type, data) => {
            switch (type) {
                case 'connected':
                    options?.onConnected?.();
                    break;
                case 'order_update':
                case 'order_created':
                case 'order_accepted':
                case 'order_declined':
                    options?.onOrderUpdate?.(data);
                    break;
                case 'notification':
                    options?.onNotification?.(data.data);
                    break;
                case 'quote_updated':
                    options?.onQuoteUpdate?.(data.data);
                    break;
            }
        },
        onError: options?.onError,
    });
}

export default useSSE;
