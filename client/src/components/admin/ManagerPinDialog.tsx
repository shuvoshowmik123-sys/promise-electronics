/**
 * ManagerPinDialog
 * 
 * A 4-digit PIN pad modal that gates dangerous actions.
 * Opens when a protected action is triggered; resolves only when Manager PIN is verified.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Delete, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ManagerPinDialogProps {
    open: boolean;
    action: string;           // e.g. "Delete Job #2026-0042"
    onConfirmed: () => void;
    onCancel: () => void;
}

const PAD_KEYS = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "⌫"],
];

export function ManagerPinDialog({ open, action, onConfirmed, onCancel }: ManagerPinDialogProps) {
    const [digits, setDigits] = useState<string[]>([]);
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleKey = useCallback((key: string) => {
        if (key === "⌫") {
            setDigits(prev => prev.slice(0, -1));
            setError(null);
            return;
        }
        if (key === "") return;
        if (digits.length >= 4) return;

        const next = [...digits, key];
        setDigits(next);

        if (next.length === 4) {
            // Auto-submit when 4 digits entered
            setIsVerifying(true);
            setError(null);
            fetch("/api/admin/pin/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ pin: next.join("") }),
            })
                .then(r => r.json())
                .then(data => {
                    if (data.valid) {
                        setDigits([]);
                        onConfirmed();
                    } else {
                        setError("Incorrect PIN. Try again.");
                        setDigits([]);
                    }
                })
                .catch(() => {
                    setError("Verification failed. Try again.");
                    setDigits([]);
                })
                .finally(() => setIsVerifying(false));
        }
    }, [digits, onConfirmed]);

    const handleCancel = () => {
        setDigits([]);
        setError(null);
        onCancel();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="pin-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={handleCancel}
                >
                    <motion.div
                        key="pin-dialog"
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: "spring", stiffness: 350, damping: 28 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-center">
                            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                                <ShieldCheck className="w-6 h-6 text-blue-400" />
                            </div>
                            <h2 className="font-bold text-white text-lg">Manager Authorisation</h2>
                            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                                Enter Manager PIN to{" "}
                                <span className="text-white font-semibold">{action}</span>
                            </p>
                        </div>

                        {/* PIN dots */}
                        <div className="px-6 pt-5 pb-2">
                            <div className="flex justify-center gap-3 mb-2">
                                {[0, 1, 2, 3].map(i => (
                                    <motion.div
                                        key={i}
                                        animate={digits[i] ? { scale: [1, 1.3, 1] } : {}}
                                        transition={{ duration: 0.15 }}
                                        className={`w-4 h-4 rounded-full border-2 transition-all ${digits[i]
                                                ? "bg-blue-600 border-blue-600"
                                                : "bg-transparent border-slate-300"
                                            }`}
                                    />
                                ))}
                            </div>

                            {/* Error message */}
                            <AnimatePresence>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="flex items-center justify-center gap-1.5 text-red-500 text-xs font-medium mb-1"
                                    >
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        {error}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Number pad */}
                        <div className="px-4 pb-4">
                            {isVerifying ? (
                                <div className="h-40 flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                </div>
                            ) : (
                                <div className="grid grid-rows-4 gap-2">
                                    {PAD_KEYS.map((row, ri) => (
                                        <div key={ri} className="grid grid-cols-3 gap-2">
                                            {row.map((key, ki) => (
                                                <button
                                                    key={ki}
                                                    onClick={() => handleKey(key)}
                                                    disabled={!key}
                                                    className={`h-12 rounded-xl font-bold text-lg transition-all active:scale-95 ${key === "⌫"
                                                            ? "bg-red-50 text-red-500 hover:bg-red-100"
                                                            : key === ""
                                                                ? "opacity-0 pointer-events-none"
                                                                : "bg-slate-100 text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                                                        }`}
                                                >
                                                    {key === "⌫" ? <Delete className="w-4 h-4 mx-auto" /> : key}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Cancel */}
                        <div className="border-t border-slate-100 p-3">
                            <Button
                                variant="ghost"
                                className="w-full text-slate-500 hover:text-slate-700"
                                onClick={handleCancel}
                            >
                                Cancel
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
