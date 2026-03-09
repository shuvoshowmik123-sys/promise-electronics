import { useState, useEffect, useCallback } from "react";
import { useNetworkStatus } from "./useNetworkStatus";

export interface QueueMessage {
    id: string;
    text: string;
    date: Date;
    threadId: string;
    status: 'pending' | 'sending' | 'failed';
    attempts: number;
    error?: string;
    lastAttempt?: number;
}

interface UseMessageQueueProps {
    onSend: (message: QueueMessage) => Promise<void>;
}

export function useMessageQueue({ onSend }: UseMessageQueueProps) {
    const { isOnline } = useNetworkStatus();
    const [queue, setQueue] = useState<QueueMessage[]>(() => {
        // Load from local storage on mount
        try {
            const saved = localStorage.getItem("pending_messages");
            if (saved) {
                return JSON.parse(saved).map((m: any) => ({
                    ...m,
                    date: new Date(m.date),
                    status: m.status === 'sending' ? 'pending' : m.status // Reset sending to pending on reload
                }));
            }
        } catch (e) {
            console.error("Failed to load message queue", e);
        }
        return [];
    });

    // Persist queue to local storage
    useEffect(() => {
        localStorage.setItem("pending_messages", JSON.stringify(queue));
    }, [queue]);

    const addToQueue = useCallback((text: string, threadId: string) => {
        const newMessage: QueueMessage = {
            id: Math.random().toString(36).substr(2, 9),
            text,
            date: new Date(),
            threadId,
            status: 'pending',
            attempts: 0,
            lastAttempt: 0
        };
        setQueue(prev => [...prev, newMessage]);
        return newMessage;
    }, []);

    const removeFromQueue = useCallback((id: string) => {
        setQueue(prev => prev.filter(m => m.id !== id));
    }, []);

    const updateMessageStatus = useCallback((id: string, status: QueueMessage['status'], error?: string) => {
        setQueue(prev => prev.map(m =>
            m.id === id ? {
                ...m,
                status,
                error,
                attempts: status === 'failed' ? m.attempts + 1 : m.attempts,
                lastAttempt: status === 'failed' ? Date.now() : m.lastAttempt
            } : m
        ));
    }, []);

    const calculateBackoff = (attempts: number) => {
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s max
        const delay = Math.min(30000, 1000 * Math.pow(2, attempts || 0));
        return delay;
    };

    const processQueue = useCallback(async () => {
        if (!isOnline) return;

        const now = Date.now();
        const pendingMessages = queue.filter(m => {
            if (m.status === 'sending') return false;
            if (m.status === 'pending') return true;
            if (m.status === 'failed') {
                // Check backoff
                const backoff = calculateBackoff(m.attempts);
                return (now - (m.lastAttempt || 0)) > backoff;
            }
            return false;
        });

        if (pendingMessages.length === 0) return;

        for (const message of pendingMessages) {
            // double check status inside loop in case it changed
            // (though for loop is synchronous, async operations happen)

            updateMessageStatus(message.id, 'sending');

            try {
                await onSend(message);
                removeFromQueue(message.id);
            } catch (error) {
                console.error("Failed to send queued message", error);

                // If it's a 401, we might want to stop processing entirely
                // but for now we just fail this message
                const errMessage = (error as Error).message;
                updateMessageStatus(message.id, 'failed', errMessage);
            }
        }
    }, [isOnline, queue, onSend, removeFromQueue, updateMessageStatus]);

    // Auto-process when coming online or when queue changes
    useEffect(() => {
        if (isOnline) {
            processQueue();
        }
    }, [isOnline, processQueue, queue]);

    // Polling for retries
    useEffect(() => {
        if (!isOnline) return;

        const interval = setInterval(() => {
            // Only trigger if we have failed messages that might be ready for retry
            // AND we aren't already processing (status check in processQueue handles this)
            const hasFailed = queue.some(m => m.status === 'failed');
            if (hasFailed) {
                processQueue();
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [isOnline, queue, processQueue]);

    return {
        queue,
        addToQueue,
        removeFromQueue,
        retryMessage: (id: string) => {
            // Reset attempts to 0 for manual retry or just reset status?
            // User requested retry -> force immediate try
            setQueue(prev => prev.map(m => m.id === id ? { ...m, status: 'pending', lastAttempt: 0, attempts: 0 } : m));
            // Trigger process in next tick via effect or call directly
            // Effect on queue change will trigger processQueue
        },
        clearQueue: () => setQueue([])
    };
}
