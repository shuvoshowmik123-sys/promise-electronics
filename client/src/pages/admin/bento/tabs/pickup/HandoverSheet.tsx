import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Tv, ShieldCheck, Loader2, RotateCcw, CheckCircle, Banknote, Smartphone, Landmark } from "lucide-react";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { adminStageApi, adminPickupsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type HandoverTarget = {
    serviceRequestId: string;
    pickupId?: string;
    device: string;
    customerName?: string;
    phone?: string;
    ticketNumber?: string;
    amountDue?: number;
    // "receive" = customer hands device to us (pickup leg)
    // "delivery" = we hand repaired device back to customer (delivery leg)
    mode: "receive" | "delivery";
};

const OTP_LEN = 6;

/**
 * Handover bottom sheet — wraps the EXISTING custody-OTP flow.
 * Step 1: send OTP to customer phone (sendCustodyOtp).
 * Step 2: staff enters the 6-digit code the customer reads out (confirmCustodyOtp).
 * On success the service-request stage advances (receive → in-custody, delivery → completed).
 */
export function HandoverSheet({
    target,
    onClose,
    onVerified,
}: {
    target: HandoverTarget | null;
    onClose: () => void;
    onVerified?: (mode: "receive" | "delivery") => void;
}) {
    const queryClient = useQueryClient();
    const [step, setStep] = useState<"idle" | "sent">("idle");
    const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
    const [sentPhone, setSentPhone] = useState<string>("");
    const [codCollected, setCodCollected] = useState(false);
    const [codMethod, setCodMethod] = useState<"Cash" | "bKash" | "Nagad" | "Bank">("Cash");
    const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

    const open = !!target;
    const mode = target?.mode ?? "delivery";
    const amountDue = Number(target?.amountDue || 0);
    // COD only applies to the delivery leg with an outstanding balance
    const needsCod = mode === "delivery" && amountDue > 0 && !codCollected;
    const actionVerb = mode === "delivery" ? "Verify & Release" : "Verify & Receive";
    const title = mode === "delivery" ? "Release Device" : "Receive Device";
    const subtitle = mode === "delivery"
        ? "Enter customer OTP to release device"
        : "Enter customer OTP to confirm receipt";

    // Reset when target changes
    useEffect(() => {
        setStep("idle");
        setDigits(Array(OTP_LEN).fill(""));
        setSentPhone("");
        setCodCollected(false);
        setCodMethod("Cash");
    }, [target?.serviceRequestId, target?.mode]);

    const collectMutation = useMutation({
        mutationFn: () => adminPickupsApi.collectPayment(target!.pickupId!, { amount: amountDue, method: codMethod }),
        onSuccess: async () => {
            setCodCollected(true);
            queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
            queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
            queryClient.invalidateQueries({ queryKey: ["activeDrawer"] });
            queryClient.invalidateQueries({ queryKey: ["drawer-active"] });
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            queryClient.invalidateQueries({ queryKey: ["service-requests"] });
            toast.success(`Collected ৳${amountDue.toLocaleString()} (${codMethod})`);
        },
        onError: (e: Error) => toast.error(e.message || "Failed to record payment"),
    });

    const sendMutation = useMutation({
        mutationFn: () => adminStageApi.sendCustodyOtp(target!.serviceRequestId, { action: mode }),
        onSuccess: (res) => {
            setStep("sent");
            setSentPhone(res.phone || target?.phone || "");
            toast.success("OTP sent to customer phone");
            setTimeout(() => inputsRef.current[0]?.focus(), 100);
        },
        onError: (e: Error) => toast.error(e.message || "Failed to send OTP"),
    });

    const confirmMutation = useMutation({
        mutationFn: (code: string) => adminStageApi.confirmCustodyOtp(target!.serviceRequestId, { action: mode, code }),
        onSuccess: async () => {
            if (target?.pickupId) {
                await adminPickupsApi.update(target.pickupId, mode === "delivery"
                    ? { status: "Delivered", deliveredAt: new Date() } as any
                    : { status: "PickedUp", pickedUpAt: new Date() } as any);
            }
            toast.success(mode === "delivery" ? "Device released — verified delivery" : "Device received — custody confirmed");
            queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
            queryClient.invalidateQueries({ queryKey: ["service-requests"] });
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            onVerified?.(mode);
            onClose();
        },
        onError: (e: Error) => {
            toast.error(e.message || "Invalid or expired code");
            setDigits(Array(OTP_LEN).fill(""));
            inputsRef.current[0]?.focus();
        },
    });

    const code = digits.join("");
    const canVerify = code.length === OTP_LEN && !confirmMutation.isPending;

    const handleDigit = (i: number, val: string) => {
        const clean = val.replace(/\D/g, "");
        if (!clean) {
            setDigits((p) => { const n = [...p]; n[i] = ""; return n; });
            return;
        }
        // Support paste of full code
        if (clean.length > 1) {
            const arr = clean.slice(0, OTP_LEN).split("");
            const next = Array(OTP_LEN).fill("").map((_, idx) => arr[idx] || "");
            setDigits(next);
            const lastIdx = Math.min(arr.length, OTP_LEN) - 1;
            inputsRef.current[lastIdx]?.focus();
            return;
        }
        setDigits((p) => { const n = [...p]; n[i] = clean; return n; });
        if (i < OTP_LEN - 1) inputsRef.current[i + 1]?.focus();
    };

    const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[210] bg-slate-900/50 backdrop-blur-sm"
                        onClick={onClose}
                    />
                    <MobileBottomSheetFrame
                        onClose={onClose}
                        className="fixed inset-x-0 bottom-0 z-[210] flex max-h-[92vh] flex-col rounded-t-3xl bg-[#f8fafc] shadow-2xl"
                    >
                        {/* Header */}
                        <div className="shrink-0 bg-white px-5 pt-3 pb-4 rounded-t-3xl border-b border-slate-100">
                            <MobileBottomSheetHandle />
                            <div className="mt-3 flex items-center justify-between">
                                <h3 className="text-lg font-black text-slate-900">{title}</h3>
                                <button onClick={onClose} className="text-slate-400"><X className="h-5 w-5" /></button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 flex flex-col items-center text-center">
                            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
                                <Tv className="w-10 h-10 text-blue-600" />
                            </div>
                            <h2 className="mt-4 text-2xl font-black text-slate-900 leading-tight">{target?.device || "Device"}</h2>
                            {target?.ticketNumber && <p className="mt-0.5 text-xs font-mono text-slate-400">#{target.ticketNumber}</p>}

                            {needsCod ? (
                                <>
                                    <div className="mt-5 w-full rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-left">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-rose-500">Amount Due</p>
                                        <p className="text-3xl font-black text-slate-900 tabular-nums">৳ {amountDue.toLocaleString()}</p>
                                    </div>
                                    <p className="mt-4 text-sm font-bold text-slate-700">Collect payment before release</p>
                                    <div className="mt-3 grid grid-cols-2 gap-2 w-full">
                                        {([
                                            { v: "Cash", icon: Banknote, bg: "#10b981" },
                                            { v: "bKash", icon: Smartphone, bg: "#E2136E" },
                                            { v: "Nagad", icon: Smartphone, bg: "#F06823" },
                                            { v: "Bank", icon: Landmark, bg: "#0ea5e9" },
                                        ] as const).map(({ v, icon: Icon, bg }) => {
                                            const sel = codMethod === v;
                                            return (
                                                <button key={v} type="button" onClick={() => setCodMethod(v)}
                                                    className={cn("h-14 rounded-2xl flex items-center justify-center gap-2 border-2 font-bold text-sm transition-all active:scale-[0.97]", sel ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-600")}
                                                    style={sel ? { background: bg } : {}}>
                                                    <Icon className="h-4 w-4" /> {v}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : step === "idle" ? (
                                <>
                                    <p className="mt-5 text-sm text-slate-500 max-w-[260px]">
                                        We'll send a 6-digit code to the customer's phone. Ask them to read it out, then enter it here.
                                    </p>
                                    {target?.phone && (
                                        <p className="mt-2 text-sm font-bold text-slate-700">{target.phone}</p>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="mt-5 text-sm text-slate-500">{subtitle}</p>
                                    {sentPhone && <p className="mt-1 text-xs text-slate-400">Sent to {sentPhone}</p>}
                                    {/* 6-box OTP */}
                                    <div className="mt-6 flex items-center justify-center gap-2">
                                        {digits.map((d, i) => (
                                            <input
                                                key={i}
                                                ref={(el) => { inputsRef.current[i] = el; }}
                                                inputMode="numeric"
                                                maxLength={OTP_LEN}
                                                value={d}
                                                onChange={(e) => handleDigit(i, e.target.value)}
                                                onKeyDown={(e) => handleKey(i, e)}
                                                className={cn(
                                                    "h-14 w-12 rounded-2xl border-2 bg-white text-center text-2xl font-black text-slate-900 outline-none transition-colors",
                                                    d ? "border-blue-500" : "border-slate-200 focus:border-blue-400",
                                                    i === 2 && "mr-2",
                                                )}
                                            />
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => sendMutation.mutate()}
                                        disabled={sendMutation.isPending}
                                        className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 disabled:opacity-50"
                                    >
                                        {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                        Resend OTP
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Bottom action */}
                        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                            {needsCod ? (
                                <button
                                    type="button"
                                    onClick={() => collectMutation.mutate()}
                                    disabled={collectMutation.isPending || !target?.pickupId}
                                    className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                                >
                                    {collectMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Banknote className="h-5 w-5" />}
                                    Collect ৳{amountDue.toLocaleString()}
                                </button>
                            ) : step === "idle" ? (
                                <button
                                    type="button"
                                    onClick={() => sendMutation.mutate()}
                                    disabled={sendMutation.isPending || !target}
                                    className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                                >
                                    {sendMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                                    Send Verification Code
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => confirmMutation.mutate(code)}
                                    disabled={!canVerify}
                                    className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
                                >
                                    {confirmMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                                    {actionVerb}
                                </button>
                            )}
                        </div>
                    </MobileBottomSheetFrame>
                </>
            )}
        </AnimatePresence>,
        document.body,
    );
}
