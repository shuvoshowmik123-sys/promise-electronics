/**
 * useManagerPin
 * 
 * Hook that provides a `requirePin(action)` function.
 * Opens the ManagerPinDialog and resolves a Promise when the PIN is confirmed.
 * 
 * Usage:
 *   const { requirePin, PinDialog } = useManagerPin();
 *   // In JSX: {PinDialog}
 *   // In handler: await requirePin("Delete Job #123")  → throws if cancelled
 */

import { useState, useCallback } from "react";
import { ManagerPinDialog } from "@/components/admin/ManagerPinDialog";

export function useManagerPin() {
    const [state, setState] = useState<{
        open: boolean;
        action: string;
        resolve: (() => void) | null;
        reject: (() => void) | null;
    }>({ open: false, action: "", resolve: null, reject: null });

    const requirePin = useCallback((action: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            setState({ open: true, action, resolve, reject });
        });
    }, []);

    const handleConfirmed = useCallback(() => {
        setState(prev => {
            prev.resolve?.();
            return { open: false, action: "", resolve: null, reject: null };
        });
    }, []);

    const handleCancel = useCallback(() => {
        setState(prev => {
            prev.reject?.();
            return { open: false, action: "", resolve: null, reject: null };
        });
    }, []);

    const PinDialog = (
        <ManagerPinDialog
            open={state.open}
            action={state.action}
            onConfirmed={handleConfirmed}
            onCancel={handleCancel}
        />
    );

    return { requirePin, PinDialog };
}
