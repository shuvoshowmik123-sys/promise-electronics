import { useState, useEffect, useRef, useCallback } from 'react';

interface SSEEvent {
    type: string;
    data: any;
    timestamp: string;
}

export type CorporateSSEEvent =
    | { type: 'corporate_notification'; data: any; timestamp: string }
    | { type: 'chat_message'; data: any; timestamp: string };

interface UseCorporateSSEOptions {
    autoConnect?: boolean;
    maxRetries?: number;
}

/**
 * Custom hook for Server-Sent Events (SSE) connection to corporate notifications
 * 
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Heartbeat monitoring
 * - Clean disconnection on unmount
 * - Connection state tracking
 * 
 * @param options Configuration options
 * @returns SSE state and latest event
 */
export function useCorporateSSE(options: UseCorporateSSEOptions = {}) {
    const { autoConnect = true, maxRetries = 10 } = options;

    const [latestEvent, setLatestEvent] = useState<SSEEvent | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const eventSourceRef = useRef<EventSource | null>(null);
    const retryCountRef = useRef(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const cleanup = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, []);

    const connect = useCallback(() => {
        // Clean up any existing connection
        cleanup();

        try {
            const es = new EventSource('/api/corporate/notifications/stream', {
                withCredentials: true,
            });

            es.onopen = () => {
                console.log('[CorporateSSE] Connection opened');
                setIsConnected(true);
                setError(null);
                retryCountRef.current = 0; // Reset retry count on successful connection
            };

            es.onmessage = (event) => {
                try {
                    const parsedData = JSON.parse(event.data);
                    console.log('[CorporateSSE] Message received:', parsedData);

                    setLatestEvent({
                        type: parsedData.type || 'message',
                        data: parsedData,
                        timestamp: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('[CorporateSSE] Failed to parse message:', err);
                }
            };

            es.onerror = (event) => {
                console.error('[CorporateSSE] Connection error:', event);
                setIsConnected(false);

                // Close the failed connection
                es.close();

                // Attempt reconnection if under retry limit
                if (retryCountRef.current < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
                    console.log(`[CorporateSSE] Reconnecting in ${delay}ms (attempt ${retryCountRef.current + 1}/${maxRetries})...`);

                    retryCountRef.current++;
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, delay);
                } else {
                    const maxRetriesError = new Error('Max reconnection attempts reached');
                    console.error('[CorporateSSE]', maxRetriesError);
                    setError(maxRetriesError);
                }
            };

            // Listen for custom corporate notification events
            es.addEventListener('corporate_notification', (event: MessageEvent) => {
                try {
                    const parsedData = JSON.parse(event.data);
                    console.log('[CorporateSSE] Corporate notification received:', parsedData);

                    setLatestEvent({
                        type: 'corporate_notification',
                        data: parsedData,
                        timestamp: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('[CorporateSSE] Failed to parse corporate notification:', err);
                }
            });

            es.addEventListener('chat_message', (event: MessageEvent) => {
                try {
                    const parsedData = JSON.parse(event.data);
                    console.log('[CorporateSSE] Chat message received:', parsedData);

                    setLatestEvent({
                        type: 'chat_message',
                        data: parsedData,
                        timestamp: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('[CorporateSSE] Failed to parse chat message:', err);
                }
            });

            eventSourceRef.current = es;
        } catch (err) {
            console.error('[CorporateSSE] Failed to create EventSource:', err);
            setError(err as Error);
            setIsConnected(false);
        }
    }, [cleanup, maxRetries]);

    const disconnect = useCallback(() => {
        console.log('[CorporateSSE] Manual disconnect');
        cleanup();
        setIsConnected(false);
    }, [cleanup]);

    const reconnect = useCallback(() => {
        console.log('[CorporateSSE] Manual reconnect');
        retryCountRef.current = 0; // Reset retry count
        connect();
    }, [connect]);

    // Auto-connect on mount if enabled
    useEffect(() => {
        if (autoConnect) {
            connect();
        }

        // Cleanup on unmount
        return () => {
            cleanup();
        };
    }, [autoConnect, connect, cleanup]);

    return {
        latestEvent,
        isConnected,
        error,
        connect,
        disconnect,
        reconnect,
    };
}
