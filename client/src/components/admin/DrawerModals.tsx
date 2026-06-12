import { useState, type Dispatch, type SetStateAction } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
    Calculator, User, CheckCircle2, AlertTriangle,
    Wallet, TrendingDown, TrendingUp,
    Minus, Plus, RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { drawerApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const modalVariants: Variants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 300, damping: 30 }
    },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

interface DrawerModalsProps {
    type: 'open' | 'drop' | null;
    onClose: () => void;
    drawerSessionId?: string;
    currentUser: { id: string; name: string };
    currencySymbol: string;
}

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
type Denomination = typeof DENOMINATIONS[number];
type DenominationCounts = Record<Denomination, number>;

const createEmptyCounts = (): DenominationCounts => ({
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
});

const calculateDenominationTotal = (counts: DenominationCounts) =>
    DENOMINATIONS.reduce((total, denomination) => total + denomination * counts[denomination], 0);

// Validation Schemas
const openDrawerSchema = z.object({
    startingFloat: z.coerce.number().min(0, "Float amount cannot be negative"),
});

const blindDropSchema = z.object({
    declaredCash: z.coerce.number().min(0, "Cash count cannot be negative"),
});

// Result from blind drop
interface DropResult {
    discrepancyStatus: 'shortage' | 'surplus' | 'exact';
    discrepancyAmount: number;
    declaredCash: number;
    expectedCash: number;
}

export function DrawerModals({ type, onClose, drawerSessionId, currentUser, currencySymbol }: DrawerModalsProps) {
    const queryClient = useQueryClient();
    const isOpen = type !== null;
    const [dropResult, setDropResult] = useState<DropResult | null>(null);
    const [openCounts, setOpenCounts] = useState<DenominationCounts>(() => createEmptyCounts());
    const [dropCounts, setDropCounts] = useState<DenominationCounts>(() => createEmptyCounts());
    const openingTotal = calculateDenominationTotal(openCounts);
    const blindDropTotal = calculateDenominationTotal(dropCounts);

    // Open Drawer Mutation
    const openMutation = useMutation({
        mutationFn: (data: z.infer<typeof openDrawerSchema>) =>
            drawerApi.open({
                startingFloat: data.startingFloat,
                openedBy: currentUser.id,
                openedByName: currentUser.name,
            }),
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ["activeDrawer"] });
            queryClient.invalidateQueries({ queryKey: ["drawer-active"] });

            const baseline = response.openingBaselineFloat;
            const difference = response.openingDifference;
            const status = response.openingVarianceStatus;

            if (typeof baseline === "number" && typeof difference === "number" && status) {
                const opened = Number(response.startingFloat ?? 0);
                const absDiff = Math.abs(difference).toFixed(2);
                if (status === "balanced") {
                    toast.success(
                        `Register opened. Opening float is balanced with last baseline (${currencySymbol}${baseline.toFixed(2)}).`,
                        { icon: <CheckCircle2 className="h-5 w-5 text-green-500" /> }
                    );
                } else if (status === "surplus") {
                    toast.warning(
                        `Opening surplus +${currencySymbol}${absDiff}. Baseline ${currencySymbol}${baseline.toFixed(2)} vs opened ${currencySymbol}${opened.toFixed(2)}.`
                    );
                } else {
                    toast.warning(
                        `Opening shortage -${currencySymbol}${absDiff}. Baseline ${currencySymbol}${baseline.toFixed(2)} vs opened ${currencySymbol}${opened.toFixed(2)}.`
                    );
                }
            } else {
                toast.success("Register opened successfully", {
                    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />
                });
            }
            onClose();
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to open register");
        }
    });

    // Blind Drop Mutation
    const dropMutation = useMutation({
        mutationFn: (data: z.infer<typeof blindDropSchema>) => {
            if (!drawerSessionId) throw new Error("No active drawer session");
            return drawerApi.drop(drawerSessionId, data.declaredCash);
        },
        onSuccess: (response) => {
            queryClient.invalidateQueries({ queryKey: ["activeDrawer"] });
            queryClient.invalidateQueries({ queryKey: ["drawer-active"] });
            queryClient.invalidateQueries({ queryKey: ["drawerHistory"] });

            // Show the result instead of closing immediately
            setDropResult({
                discrepancyStatus: response.discrepancyStatus || 'exact',
                discrepancyAmount: response.discrepancyAmount || 0,
                declaredCash: response.declaredCash,
                expectedCash: response.expectedCash ?? response.startingFloat,
            });
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to submit blind drop");
        }
    });

    // Finalize close-day mutation after blind drop result is shown
    const closeDayMutation = useMutation({
        mutationFn: (payload: { mode: "reconciled" | "under_review"; note?: string }) => {
            if (!drawerSessionId) throw new Error("No active drawer session");
            return drawerApi.closeDay(drawerSessionId, payload);
        },
        onSuccess: (result, payload) => {
            queryClient.invalidateQueries({ queryKey: ["activeDrawer"] });
            queryClient.invalidateQueries({ queryKey: ["drawer-active"] });
            queryClient.invalidateQueries({ queryKey: ["drawerHistory"] });

            if (!result.executed) {
                toast.error(result.reason ? `Unable to close register: ${result.reason}` : "Unable to close register");
                return;
            }

            toast.success(
                payload.mode === "reconciled"
                    ? "Register closed successfully"
                    : "Register closed for day and moved to review"
            );
            handleClose();
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to close register");
        },
    });

    const openForm = useForm<z.infer<typeof openDrawerSchema>>({
        resolver: zodResolver(openDrawerSchema),
        defaultValues: { startingFloat: 0 },
    });

    const dropForm = useForm<z.infer<typeof blindDropSchema>>({
        resolver: zodResolver(blindDropSchema),
        defaultValues: { declaredCash: 0 },
    });

    const handleClose = () => {
        setDropResult(null);
        setOpenCounts(createEmptyCounts());
        setDropCounts(createEmptyCounts());
        onClose();
    };

    const handleFinalizeClose = () => {
        if (!dropResult) return;

        const mode: "reconciled" | "under_review" =
            dropResult.discrepancyStatus === 'exact' ? 'reconciled' : 'under_review';
        const note = mode === 'reconciled'
            ? "Balanced blind drop closed from POS."
            : `${dropResult.discrepancyStatus} detected during POS close. Awaiting Super Admin reconciliation.`;

        closeDayMutation.mutate({ mode, note });
    };

    const updateCount = (
        setCounts: Dispatch<SetStateAction<DenominationCounts>>,
        denomination: Denomination,
        nextCount: number,
    ) => {
        setCounts((previous) => ({
            ...previous,
            [denomination]: Math.max(0, Math.min(999, Number.isFinite(nextCount) ? Math.floor(nextCount) : 0)),
        }));
    };

    const DenominationCounter = ({
        counts,
        setCounts,
        mode,
    }: {
        counts: DenominationCounts;
        setCounts: Dispatch<SetStateAction<DenominationCounts>>;
        mode: "open" | "drop";
    }) => {
        const total = calculateDenominationTotal(counts);
        const noteTotal = [1000, 500, 200, 100, 50, 20].reduce((sum, denomination) => sum + denomination * counts[denomination as Denomination], 0);
        const smallCashTotal = total - noteTotal;
        const activeCount = DENOMINATIONS.filter((denomination) => counts[denomination] > 0).length;

        return (
            <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
                <div className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-none flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                                {mode === "open" ? "Opening Cash Count" : "Blind Cash Count"}
                            </p>
                            <h3 className="mt-1 text-xl font-black text-slate-950">Cash counter pad</h3>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Tap counts. Total is calculated automatically.
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-xl gap-2"
                            onClick={() => setCounts(createEmptyCounts())}
                        >
                            <RefreshCcw className="h-4 w-4" />
                            Clear
                        </Button>
                    </div>

                    <div className="mt-4 grid min-h-0 grid-cols-2 gap-3 overflow-y-auto pr-1 xl:grid-cols-3">
                        {DENOMINATIONS.map((denomination) => {
                            const count = counts[denomination];
                            const subtotal = count * denomination;
                            const isActive = count > 0;
                            const isSmallCash = denomination <= 10;

                            return (
                                <div
                                    key={denomination}
                                    className={cn(
                                        "rounded-2xl border p-3 transition-colors",
                                        isActive
                                            ? "border-blue-200 bg-blue-50/80 shadow-sm"
                                            : isSmallCash
                                                ? "border-slate-200 bg-slate-50/70"
                                                : "border-slate-200 bg-white",
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-lg font-black tabular-nums text-slate-950">
                                                {currencySymbol}{denomination}
                                            </div>
                                            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                                {isSmallCash ? "Small cash" : "Note"}
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "rounded-full px-2 py-1 text-[11px] font-black tabular-nums",
                                            isActive ? "bg-white text-blue-700" : "bg-slate-100 text-slate-400",
                                        )}>
                                            {currencySymbol}{subtotal}
                                        </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-[34px_1fr_34px] items-center gap-2">
                                        <button
                                            type="button"
                                            className="flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm active:scale-95"
                                            onClick={() => updateCount(setCounts, denomination, count - 1)}
                                        >
                                            <Minus className="h-4 w-4" />
                                        </button>
                                        <Input
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            value={count}
                                            onChange={(event) => updateCount(setCounts, denomination, Number(event.target.value))}
                                            className="h-9 rounded-xl border-slate-200 bg-white text-center text-base font-black tabular-nums"
                                        />
                                        <button
                                            type="button"
                                            className={cn(
                                                "flex h-9 items-center justify-center rounded-xl text-white shadow-sm active:scale-95",
                                                mode === "drop" ? "bg-slate-900" : "bg-blue-600",
                                            )}
                                            onClick={() => updateCount(setCounts, denomination, count + 1)}
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/40">
                        {mode === "open" ? "Total Opening Float" : "Total Counted Cash"}
                    </p>
                    <div className="mt-2 text-4xl font-black tabular-nums">
                        {currencySymbol}{total.toLocaleString()}
                    </div>
                    <div className="mt-5 space-y-3 text-sm">
                        <div className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2">
                            <span className="text-white/50">Notes total</span>
                            <span className="font-black tabular-nums">{currencySymbol}{noteTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2">
                            <span className="text-white/50">Small cash</span>
                            <span className="font-black tabular-nums">{currencySymbol}{smallCashTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2">
                            <span className="text-white/50">Rows used</span>
                            <span className="font-black tabular-nums">{activeCount}</span>
                        </div>
                    </div>
                    <div className="mt-auto pt-5">
                        {mode === "drop" ? (
                        <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs font-semibold leading-relaxed text-amber-100">
                            Expected cash is hidden until submit. Any shortage or surplus moves to review.
                        </div>
                        ) : (
                        <div className="mt-5 rounded-2xl border border-blue-300/20 bg-blue-400/10 p-3 text-xs font-semibold leading-relaxed text-blue-100">
                            This amount becomes the starting float for the active POS session.
                        </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Result card after blind drop
    const DropResultCard = () => {
        if (!dropResult) return null;

        const isShortage = dropResult.discrepancyStatus === 'shortage';
        const isSurplus = dropResult.discrepancyStatus === 'surplus';
        const isExact = dropResult.discrepancyStatus === 'exact';

        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="p-6 space-y-4"
            >
                {/* Status Icon */}
                <div className="flex flex-col items-center text-center space-y-3">
                    <div className={`flex h-20 w-20 items-center justify-center rounded-full ${isShortage ? 'bg-red-100' : isSurplus ? 'bg-amber-100' : 'bg-emerald-100'
                        }`}>
                        {isShortage && <TrendingDown className="h-10 w-10 text-red-600" />}
                        {isSurplus && <TrendingUp className="h-10 w-10 text-amber-600" />}
                        {isExact && <CheckCircle2 className="h-10 w-10 text-emerald-600" />}
                    </div>

                    <h3 className={`text-2xl font-black ${isShortage ? 'text-red-700' : isSurplus ? 'text-amber-700' : 'text-emerald-700'
                        }`}>
                        {isExact ? 'Perfect Match!' : isShortage ? 'Cash Shortage' : 'Cash Surplus'}
                    </h3>

                    {!isExact && (
                        <div className={`text-4xl font-black tabular-nums ${isShortage ? 'text-red-600' : 'text-amber-600'
                            }`}>
                            {isShortage ? '-' : '+'}{currencySymbol}{dropResult.discrepancyAmount.toFixed(2)}
                        </div>
                    )}
                </div>

                {/* Details */}
                <div className={`rounded-2xl p-4 space-y-2 ${isShortage ? 'bg-red-50 border border-red-100' :
                        isSurplus ? 'bg-amber-50 border border-amber-100' :
                            'bg-emerald-50 border border-emerald-100'
                    }`}>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">System Expected</span>
                        <span className="font-bold text-slate-900">{currencySymbol}{Number(dropResult.expectedCash).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Your Count</span>
                        <span className="font-bold text-slate-900">{currencySymbol}{Number(dropResult.declaredCash).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Difference</span>
                        <span className={`font-bold ${isShortage ? 'text-red-700' : isSurplus ? 'text-amber-700' : 'text-emerald-700'}`}>
                            {isShortage ? '-' : isSurplus ? '+' : ''}{currencySymbol}{Number(dropResult.discrepancyAmount).toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Status Message */}
                {isShortage && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">
                            <p className="font-semibold mb-1">Super Admin Notified</p>
                            <p>A shortage alert has been sent. If this was a legitimate unrecorded expense, the Super Admin can justify it to resolve the discrepancy.</p>
                        </div>
                    </div>
                )}

                {isSurplus && (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <TrendingUp className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800">
                            <p className="font-semibold mb-1">Extra Cash Logged</p>
                            <p>There is more cash than expected. Admin has been notified for review.</p>
                        </div>
                    </div>
                )}

                {isExact && (
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-emerald-800">
                            <p className="font-semibold">All Accounted For</p>
                            <p>Your cash count matches the system perfectly.</p>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <Button
                        className={`w-full h-12 text-base font-bold rounded-xl ${isExact ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"} text-white`}
                        onClick={handleFinalizeClose}
                        disabled={closeDayMutation.isPending}
                    >
                        {closeDayMutation.isPending
                            ? "Closing..."
                            : isExact
                                ? "Close Register"
                                : "Close for Day (Under Review)"}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full h-10 rounded-xl"
                        onClick={handleClose}
                        disabled={closeDayMutation.isPending}
                    >
                        Cancel
                    </Button>
                </div>
            </motion.div>
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
                    <DialogContent className={cn(
                        "p-0 overflow-hidden bg-white/60 backdrop-blur-xl border-white/40 shadow-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:z-30 [&>button]:h-10 [&>button]:w-10 [&>button]:rounded-full [&>button]:bg-white [&>button]:shadow-md [&>button]:ring-1 [&>button]:ring-slate-200",
                        type === "drop" && dropResult
                            ? "sm:max-w-[425px]"
                            : "h-[calc(100vh-2rem)] max-h-[860px] w-[calc(100vw-2rem)] max-w-[1280px]",
                    )}>
                        <motion.div
                            variants={modalVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="flex h-full min-h-0 flex-col bg-white/80"
                        >
                            {/* Show result card if blind drop is done */}
                            {type === 'drop' && dropResult ? (
                                <DropResultCard />
                            ) : (
                                <>
                                    <DialogHeader className="flex-none p-6 pb-0 pr-16">
                                        {type === 'open' ? (
                                            <>
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-start gap-4">
                                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100">
                                                            <Wallet className="h-7 w-7 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <DialogTitle className="text-2xl font-black text-slate-950">Open Register</DialogTitle>
                                                            <DialogDescription className="mt-1 text-slate-500">
                                                                Count the starting cash. The register opens with the calculated float.
                                                            </DialogDescription>
                                                        </div>
                                                    </div>
                                                    <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-rose-700">
                                                        Closed
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-start gap-4">
                                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100">
                                                            <Calculator className="h-7 w-7 text-rose-600" />
                                                        </div>
                                                        <div>
                                                            <DialogTitle className="text-2xl font-black text-slate-950">Close Register</DialogTitle>
                                                            <DialogDescription className="mt-1 text-slate-500">
                                                                Submit a blind physical cash count. Expected cash stays hidden.
                                                            </DialogDescription>
                                                        </div>
                                                    </div>
                                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
                                                        Live
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </DialogHeader>

                                    <div className="flex min-h-0 flex-1 flex-col p-6 pt-5">
                                        <div className="mb-5 flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
                                                <User className="h-4 w-4 text-slate-500" />
                                                <span className="text-sm font-bold text-slate-700">{currentUser.name}</span>
                                            </div>
                                            {type === "drop" && (
                                                <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    One submit only
                                                </div>
                                            )}
                                        </div>

                                        {type === 'open' ? (
                                            <form onSubmit={openForm.handleSubmit(() => openMutation.mutate({ startingFloat: openingTotal }))} className="flex min-h-0 flex-1 flex-col gap-5">
                                                <DenominationCounter counts={openCounts} setCounts={setOpenCounts} mode="open" />
                                                <DialogFooter className="flex-none border-t border-slate-100 pt-5 gap-3">
                                                    <Button type="button" variant="outline" onClick={handleClose} className="h-11 rounded-xl">
                                                        Cancel
                                                    </Button>
                                                    <Button type="submit" className="h-11 rounded-xl bg-blue-600 px-6 font-black hover:bg-blue-700" disabled={openMutation.isPending}>
                                                        {openMutation.isPending ? "Opening..." : "Confirm Float & Open"}
                                                    </Button>
                                                </DialogFooter>
                                            </form>
                                        ) : (
                                            <form onSubmit={dropForm.handleSubmit(() => dropMutation.mutate({ declaredCash: blindDropTotal }))} className="flex min-h-0 flex-1 flex-col gap-5">
                                                <DenominationCounter counts={dropCounts} setCounts={setDropCounts} mode="drop" />
                                                <DialogFooter className="flex-none border-t border-slate-100 pt-5 gap-3">
                                                    <Button type="button" variant="outline" onClick={handleClose} className="h-11 rounded-xl">
                                                        Cancel
                                                    </Button>
                                                    <Button type="submit" className="h-11 rounded-xl bg-slate-900 px-6 font-black hover:bg-slate-800" disabled={dropMutation.isPending}>
                                                        {dropMutation.isPending ? "Submitting..." : "Submit Blind Count"}
                                                    </Button>
                                                </DialogFooter>
                                            </form>
                                        )}
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </DialogContent>
                </Dialog>
            )}
        </AnimatePresence>
    );
}
