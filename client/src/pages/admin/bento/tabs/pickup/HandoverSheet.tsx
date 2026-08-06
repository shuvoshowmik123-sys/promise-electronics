import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Tv, ShieldCheck, Loader2, RotateCcw, CheckCircle, Banknote, Smartphone, Landmark, Camera, AlertTriangle } from "lucide-react";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { adminStageApi, adminPickupsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type HandoverTarget = {
    serviceRequestId: string;
    pickupId?: string;
    device: string;
    customerName?: string;
    phone?: string;
    ticketNumber?: string;
    amountDue?: number;
    mode: "receive" | "delivery";
};

const OTP_LEN = 6;
const MAX_ATTEMPTS = 3;

/**
 * Driver-facing handover sheet: large 6-digit entry, delivery report,
 * attempts remaining, and explicit audited no-code path when no channel works.
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
    const [step, setStep] = useState<"idle" | "sent" | "no_code">("idle");
    const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
    const [sentPhone, setSentPhone] = useState<string>("");
    /**
      * Issuance status, not delivery channels.
      *
      * The old shape reported inApp/sms/push as if they were delivery. They were
      * not: SMS is no longer part of custody at all, and a push is only a
      * reminder that never carries the code. The only fact that matters to the
      * driver is that the code is waiting in the customer's portal.
      */
    const [issuance, setIssuance] = useState<{ portalNotified: boolean; pushAccepted: boolean } | null>(null);
    const [remainingAttempts, setRemainingAttempts] = useState(MAX_ATTEMPTS);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [codCollected, setCodCollected] = useState(false);
    const [codMethod, setCodMethod] = useState<"Cash" | "bKash" | "Nagad" | "Bank">("Cash");
    const [noCodeReason, setNoCodeReason] = useState("");
    const [noCodePhotoUrl, setNoCodePhotoUrl] = useState("");
    const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

    const open = !!target;
    const mode = target?.mode ?? "delivery";
    const amountDue = Number(target?.amountDue || 0);
    const needsCod = mode === "delivery" && amountDue > 0 && !codCollected;
    const actionVerb = mode === "delivery" ? "Verify & Release" : "Verify & Receive";
    const title = mode === "delivery" ? "Release Device" : "Receive Device";
    const subtitle = mode === "delivery"
        ? "Enter the 6-digit code the customer shows you"
        : "Enter the 6-digit code the customer shows you";

    useEffect(() => {
        setStep("idle");
        setDigits(Array(OTP_LEN).fill(""));
        setSentPhone("");
        setIssuance(null);
        setRemainingAttempts(MAX_ATTEMPTS);
        setVerifyError(null);
        setCodCollected(false);
        setCodMethod("Cash");
        setNoCodeReason("");
        setNoCodePhotoUrl("");
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
            setIssuance({ portalNotified: res.customerPortalNotified, pushAccepted: res.pushReminderAccepted });
            setRemainingAttempts(res.maxAttempts ?? MAX_ATTEMPTS);
            setVerifyError(null);
            if (res.needsNoCodeHandover || !res.codeIssued) {
                setStep("no_code");
                toast.message("Code could not be delivered", {
                    description: "Use the no-code handover with reason and photo proof.",
                });
                return;
            }
            setStep("sent");
            toast.success("Online code is available in the customer's repair page");
            setTimeout(() => inputsRef.current[0]?.focus(), 100);
        },
        onError: (e: Error) => toast.error(e.message || "Failed to send code"),
    });

    const confirmMutation = useMutation({
        mutationFn: (code: string) => adminStageApi.confirmCustodyOtp(target!.serviceRequestId, { action: mode, code }),
        onSuccess: async () => {
            /**
             * No second mutation. The server completes the handover.
             *
             * This used to PATCH /api/admin/pickups with Delivered/PickedUp
             * straight after a successful confirmation — the client deciding,
             * on its own, that custody had changed. For delivery that request
             * could never succeed: the route guards on the service request
             * reaching completed/closed, which the job lifecycle forbids
             * anything but the job to set. The OTP was consumed and the pickup
             * stayed unfinished.
             *
             * Confirmation now completes the job, the logistics task and the
             * pickup record server-side, so the client's only remaining job is
             * to refetch and show the truth.
             */
            toast.success(mode === "delivery" ? "Device released — verified delivery" : "Device received — custody confirmed");
            queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
            queryClient.invalidateQueries({ queryKey: ["service-requests"] });
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            queryClient.invalidateQueries({ queryKey: ["logistics-tasks"] });
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            onVerified?.(mode);
            onClose();
        },
        onError: (e: any) => {
            const data = e?.data && typeof e.data === "object" ? e.data : {};
            const remaining = typeof data.remainingAttempts === "number"
                ? data.remainingAttempts
                : remainingAttempts - 1;
            setRemainingAttempts(Math.max(0, remaining));
            setVerifyError(e?.message || "Invalid or expired code");
            setDigits(Array(OTP_LEN).fill(""));
            inputsRef.current[0]?.focus();
            toast.error(e?.message || "Invalid or expired code");
        },
    });

    const noCodeMutation = useMutation({
        mutationFn: () => adminStageApi.noCodeCustodyHandover(target!.serviceRequestId, {
            action: mode,
            reason: noCodeReason.trim(),
            proofPhotoUrl: noCodePhotoUrl.trim(),
        }),
        onSuccess: async () => {
            // Same rule as the coded path: the server completes the handover,
            // the client only refetches. This follow-up could never succeed for
            // delivery anyway — the pickup route guards on a stage the job
            // lifecycle forbids anything but the job to set.
            toast.success("Lower-assurance handover recorded");
            queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
            queryClient.invalidateQueries({ queryKey: ["logistics-tasks"] });
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            queryClient.invalidateQueries({ queryKey: ["service-requests"] });
            onVerified?.(mode);
            onClose();
        },
        onError: (e: Error) => toast.error(e.message || "Failed to record handover"),
    });

    const code = digits.join("");
    const canVerify = code.length === OTP_LEN && !confirmMutation.isPending && remainingAttempts > 0;
    const canNoCode = noCodeReason.trim().length >= 8
        && /^https?:\/\//i.test(noCodePhotoUrl.trim())
        && !noCodeMutation.isPending;

    const handleDigit = (i: number, val: string) => {
        const clean = val.replace(/\D/g, "");
        if (!clean) {
            setDigits((p) => { const n = [...p]; n[i] = ""; return n; });
            return;
        }
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
                        className="fixed inset-x-0 bottom-0 z-[210] flex max-h-[92vh] flex-col rounded-t-3xl bg-[#f8fafc] shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2"
                    >
                        <div className="shrink-0 bg-white px-5 pt-3 pb-4 rounded-t-3xl border-b border-slate-100">
                            <MobileBottomSheetHandle />
                            <div className="mt-3 flex items-center justify-between">
                                <h3 className="text-lg font-black text-slate-900">{title}</h3>
                                <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center text-slate-400" aria-label="Close">
                                    <X className="h-5 w-5" />
                                </button>
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
                                    <p className="mt-5 text-sm text-slate-500 max-w-[280px]">
                                        {/* No SMS. The code exists only in the customer's authenticated
                                            account — see the security note further down, and the comment at
                                            the top of this file. Telling a driver SMS "may" arrive sends
                                            them waiting for a message that is never sent, instead of
                                            directing the customer to My Repairs. */}
                                        Send a 6-digit code to the customer&apos;s account. Ask them to open My Repairs and read it out — never guess the code yourself.
                                    </p>
                                    {target?.phone && (
                                        <p className="mt-2 text-sm font-bold text-slate-700">{target.phone}</p>
                                    )}
                                </>
                            ) : step === "no_code" ? (
                                <div className="mt-5 w-full text-left space-y-3">
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2">
                                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                                        <p className="text-sm text-amber-900">
                                            No code could be delivered. Record a lower-assurance handover with a reason and photo proof. This is audited.
                                        </p>
                                    </div>
                                    {issuance && (
                                        <p className="text-xs text-slate-500">
                                            Portal code {issuance.portalNotified ? "issued" : "not issued"} · Reminder{" "}
                                            {issuance.pushAccepted ? "accepted" : "unavailable"}
                                        </p>
                                    )}
                                    <div>
                                        <label className="text-xs font-bold uppercase text-slate-500">Reason (required)</label>
                                        <Textarea
                                            value={noCodeReason}
                                            onChange={(e) => setNoCodeReason(e.target.value)}
                                            className="mt-1 min-h-24 rounded-2xl"
                                            placeholder="Why the code path could not be used (min 8 characters)"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-slate-500">Photo proof URL (required)</label>
                                        <Input
                                            value={noCodePhotoUrl}
                                            onChange={(e) => setNoCodePhotoUrl(e.target.value)}
                                            className="mt-1 h-12 rounded-2xl"
                                            placeholder="https://… device + customer photo"
                                            inputMode="url"
                                        />
                                        <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                                            <Camera className="h-3 w-3" /> Paste image URL from upload
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => sendMutation.mutate()}
                                        disabled={sendMutation.isPending}
                                        className="text-sm font-bold text-blue-600"
                                    >
                                        Retry code delivery
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <p className="mt-5 text-sm text-slate-500">{subtitle}</p>
                                    {/* Permanent instruction, not a conditional warning.
                                        The code lives only in the customer's portal, so the
                                        driver ALWAYS has to ask them to open it — there is no
                                        longer any channel that could have delivered it
                                        another way. */}
                                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                        <p className="text-xs leading-relaxed text-blue-900">
                                            <strong>Ask the customer to open My Repairs and tell you the handover
                                            code.</strong> The code is shown only in their account — it is never sent
                                            by SMS and never shown to you.
                                        </p>
                                    </div>
                                    {issuance && (
                                        <p className="mt-2 text-xs text-slate-500">
                                            Portal code {issuance.portalNotified ? "issued" : "not issued"}
                                            {" · "}
                                            Reminder {issuance.pushAccepted ? "accepted" : "unavailable"}
                                        </p>
                                    )}
                                    <p className="mt-3 text-sm font-bold text-slate-700" data-testid="handover-attempts-remaining">
                                        Attempts remaining: {remainingAttempts}
                                    </p>
                                    {verifyError && (
                                        <p className="mt-2 text-sm font-medium text-rose-600" data-testid="handover-verify-error">{verifyError}</p>
                                    )}
                                    <div className="mt-6 flex items-center justify-center gap-2">
                                        {digits.map((d, i) => (
                                            <input
                                                key={i}
                                                ref={(el) => { inputsRef.current[i] = el; }}
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                autoComplete="one-time-code"
                                                maxLength={OTP_LEN}
                                                value={d}
                                                onChange={(e) => handleDigit(i, e.target.value)}
                                                onKeyDown={(e) => handleKey(i, e)}
                                                aria-label={`Digit ${i + 1}`}
                                                className={cn(
                                                    "h-14 w-12 min-h-[56px] min-w-[48px] rounded-2xl border-2 bg-white text-center text-2xl font-black text-slate-900 outline-none transition-colors",
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
                                        className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-blue-600 disabled:opacity-50"
                                    >
                                        {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                        Resend code
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStep("no_code")}
                                        className="mt-3 text-xs font-semibold text-slate-500 underline"
                                    >
                                        Cannot get a code? No-code handover
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                            {needsCod ? (
                                <button
                                    type="button"
                                    onClick={() => collectMutation.mutate()}
                                    disabled={collectMutation.isPending || !target?.pickupId}
                                    className="w-full min-h-12 py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                                >
                                    {collectMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Banknote className="h-5 w-5" />}
                                    Collect ৳{amountDue.toLocaleString()}
                                </button>
                            ) : step === "idle" ? (
                                <button
                                    type="button"
                                    onClick={() => sendMutation.mutate()}
                                    disabled={sendMutation.isPending || !target}
                                    data-testid="button-send-custody-code"
                                    className="w-full min-h-12 py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                                >
                                    {sendMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                                    Send Verification Code
                                </button>
                            ) : step === "no_code" ? (
                                <button
                                    type="button"
                                    onClick={() => noCodeMutation.mutate()}
                                    disabled={!canNoCode}
                                    data-testid="button-no-code-handover"
                                    className="w-full min-h-12 py-3.5 rounded-2xl bg-amber-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
                                >
                                    {noCodeMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
                                    Record no-code handover
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => confirmMutation.mutate(code)}
                                    disabled={!canVerify}
                                    data-testid="button-verify-custody-code"
                                    className="w-full min-h-12 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-40"
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
