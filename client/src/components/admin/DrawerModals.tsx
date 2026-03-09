import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
    Calculator, User, X, CheckCircle2, AlertTriangle,
    LockKeyhole, Wallet, TrendingDown, TrendingUp, Equal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { drawerApi } from "@/lib/api";

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

    // Keep a single leading zero only when it is the whole number or decimal prefix (e.g., "0" or "0.5")
    const normalizeMoneyInput = (rawValue: string) => {
        if (rawValue === "") return "";
        if (rawValue.startsWith(".")) return `0${rawValue}`;

        if (rawValue.includes(".")) {
            const [integerPart, decimalPart] = rawValue.split(".", 2);
            const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "");
            const safeInteger = normalizedInteger === "" ? "0" : normalizedInteger;
            return `${safeInteger}.${decimalPart ?? ""}`;
        }

        const normalizedInteger = rawValue.replace(/^0+(?=\d)/, "");
        return normalizedInteger === "" ? "0" : normalizedInteger;
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
                    <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden bg-white/60 backdrop-blur-xl border-white/40 shadow-2xl">
                        <motion.div
                            variants={modalVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            className="bg-white/80"
                        >
                            {/* Show result card if blind drop is done */}
                            {type === 'drop' && dropResult ? (
                                <DropResultCard />
                            ) : (
                                <>
                                    <DialogHeader className="p-6 pb-0">
                                        {type === 'open' ? (
                                            <>
                                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 mb-4">
                                                    <Wallet className="h-8 w-8 text-blue-600" />
                                                </div>
                                                <DialogTitle className="text-center text-2xl font-bold text-slate-900">Open Register</DialogTitle>
                                                <DialogDescription className="text-center text-slate-500 mt-2">
                                                    Count and enter the starting cash float for this shift.
                                                </DialogDescription>
                                            </>
                                        ) : (
                                            <>
                                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 mb-4">
                                                    <Calculator className="h-8 w-8 text-rose-600" />
                                                </div>
                                                <DialogTitle className="text-center text-2xl font-bold text-slate-900">Blind Drop</DialogTitle>
                                                <DialogDescription className="text-center text-slate-500 mt-2">
                                                    Count all cash in the drawer and submit. <br />
                                                    <span className="font-semibold text-rose-600">The expected amount is hidden.</span>
                                                </DialogDescription>
                                            </>
                                        )}
                                    </DialogHeader>

                                    <div className="p-6">
                                        {/* Current User Badge */}
                                        <div className="flex items-center justify-center gap-2 mb-6 px-4 py-2 bg-slate-100 rounded-full w-fit mx-auto border border-slate-200">
                                            <User className="h-4 w-4 text-slate-500" />
                                            <span className="text-sm font-medium text-slate-700">{currentUser.name}</span>
                                        </div>

                                        {type === 'open' ? (
                                            <Form {...openForm}>
                                                <form onSubmit={openForm.handleSubmit((d) => openMutation.mutate(d))} className="space-y-6">
                                                    <FormField
                                                        control={openForm.control}
                                                        name="startingFloat"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-slate-700">Starting Cash Float</FormLabel>
                                                                <div className="relative">
                                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                                        <span className="text-slate-500 font-medium sm:text-lg">{currencySymbol}</span>
                                                                    </div>
                                                                    <FormControl>
                                                                        <Input
                                                                            type="text"
                                                                            inputMode="decimal"
                                                                            className="pl-12 h-14 text-2xl font-bold text-slate-900 bg-white/50 border-slate-200"
                                                                            placeholder="0.00"
                                                                            value={field.value === undefined || field.value === null ? "" : String(field.value)}
                                                                            onChange={(e) => field.onChange(normalizeMoneyInput(e.target.value))}
                                                                            onBlur={field.onBlur}
                                                                            name={field.name}
                                                                            ref={field.ref}
                                                                        />
                                                                    </FormControl>
                                                                </div>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <DialogFooter className="sm:justify-between pt-4 gap-3">
                                                        <Button type="button" variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                                                            Cancel
                                                        </Button>
                                                        <Button type="submit" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700" disabled={openMutation.isPending}>
                                                            {openMutation.isPending ? "Opening..." : "Confirm Float & Open"}
                                                        </Button>
                                                    </DialogFooter>
                                                </form>
                                            </Form>
                                        ) : (
                                            <Form {...dropForm}>
                                                <form onSubmit={dropForm.handleSubmit((d) => dropMutation.mutate(d))} className="space-y-6">
                                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                                                        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                                        <div className="text-sm text-amber-800">
                                                            <p className="font-semibold mb-1">Accountability Warning</p>
                                                            <p>You cannot change this amount once submitted. Any discrepancies will require manager reconciliation.</p>
                                                        </div>
                                                    </div>

                                                    <FormField
                                                        control={dropForm.control}
                                                        name="declaredCash"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel className="text-slate-700">Total Counted Cash</FormLabel>
                                                                <div className="relative">
                                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                                        <span className="text-slate-500 font-medium sm:text-lg">{currencySymbol}</span>
                                                                    </div>
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            className="pl-12 h-14 text-2xl font-bold text-slate-900 bg-white/50 border-rose-200 focus-visible:ring-rose-500"
                                                                            placeholder="0.00"
                                                                            step="0.01"
                                                                            min="0"
                                                                            {...field}
                                                                        />
                                                                    </FormControl>
                                                                </div>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <DialogFooter className="sm:justify-between pt-4 gap-3">
                                                        <Button type="button" variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                                                            Cancel
                                                        </Button>
                                                        <Button type="submit" className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800" disabled={dropMutation.isPending}>
                                                            {dropMutation.isPending ? "Submitting..." : "Submit Blind Count"}
                                                        </Button>
                                                    </DialogFooter>
                                                </form>
                                            </Form>
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
