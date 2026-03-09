import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
    X, Printer, CreditCard, Clock, CheckCircle2,
    FileText, CalendarDays, Loader2, DollarSign, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { corporateApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface BillDetailsSheetProps {
    billId: string | null;
    onClose: () => void;
}

export function BillDetailsSheet({ billId, onClose }: BillDetailsSheetProps) {
    const { data: bill, isLoading } = useQuery({
        queryKey: ["corporateBillDetails", billId],
        queryFn: () => billId ? corporateApi.getBill(billId) : Promise.resolve(null),
        enabled: !!billId,
    });

    // Close on escape key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };

    if (!billId) return null;

    return (
        <AnimatePresence>
            <div
                className="fixed inset-0 z-40 flex justify-end"
                onKeyDown={handleKeyDown}
                tabIndex={-1}
            >
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
                />

                {/* Sliding Panel */}
                <motion.div
                    initial={{ x: "100%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "100%", opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-slate-800">Invoice {bill?.billNumber}</h2>
                                <p className="text-sm text-slate-500 flex items-center gap-1">
                                    <CalendarDays className="w-3.5 h-3.5" />
                                    {bill ? format(new Date(bill.createdAt), "MMM dd, yyyy") : "..."}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {bill?.paymentStatus === 'paid' ? (
                                <Badge variant="default" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Paid
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                    <Clock className="w-3.5 h-3.5 mr-1" /> Pending
                                </Badge>
                            )}
                            <div className="w-px h-6 bg-slate-200 mx-2" />
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    <ScrollArea className="flex-1 bg-slate-50/30">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                                <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                                <p>Loading invoice details...</p>
                            </div>
                        ) : bill ? (
                            <div className="p-6 space-y-8">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
                                        <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
                                            <CalendarDays className="w-4 h-4 text-blue-500" /> Billing Period
                                        </div>
                                        <div className="text-base font-semibold text-slate-800">
                                            {format(new Date(bill.billingPeriodStart), "MMM d")} - {format(new Date(bill.billingPeriodEnd), "MMM d, yyyy")}
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
                                        <div className="text-sm font-medium text-slate-500 mb-1 flex items-center gap-2">
                                            <DollarSign className="w-4 h-4 text-emerald-500" /> Total Amount
                                        </div>
                                        <div className="text-2xl font-bold text-slate-800 tracking-tight">
                                            ৳ {bill.grandTotal?.toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                {/* Line Items Table (simplified generic layout since actual structure varies) */}
                                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                                        <h3 className="font-semibold text-slate-700">Line Items</h3>
                                    </div>
                                    {bill.items && bill.items.length > 0 ? (
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                                <tr>
                                                    <th className="py-2.5 px-5 text-left font-medium">Description</th>
                                                    <th className="py-2.5 px-5 text-right font-medium">Qty</th>
                                                    <th className="py-2.5 px-5 text-right font-medium">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {bill.items.map((item: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50/50">
                                                        <td className="py-3 px-5 text-slate-800">{item.description || item.jobId}</td>
                                                        <td className="py-3 px-5 text-right text-slate-600">{item.quantity || 1}</td>
                                                        <td className="py-3 px-5 text-right font-medium text-slate-800 tabular-nums">৳ {item.amount?.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="p-8 text-center text-slate-400 text-sm">
                                            Item breakdown not available for this legacy bill.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                                <FileText className="w-12 h-12 text-slate-200 mb-4" />
                                <p>Failed to load invoice details.</p>
                            </div>
                        )}
                    </ScrollArea>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-slate-100 bg-white flex items-center gap-3 shrink-0">
                        <Button
                            variant="outline"
                            className="flex-1 rounded-xl h-11 border-slate-200 hover:bg-slate-50"
                            onClick={() => window.open(`/admin/corporate/bills/${billId}/print`, '_blank')}
                            disabled={!bill || isLoading}
                        >
                            <Printer className="w-4 h-4 mr-2" /> Print Invoice
                        </Button>
                        <Button
                            variant="default"
                            className={cn(
                                "flex-1 rounded-xl h-11 text-white shadow-sm",
                                bill?.paymentStatus === 'paid'
                                    ? "bg-slate-200 hover:bg-slate-200 text-slate-500 cursor-not-allowed"
                                    : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                            )}
                            disabled={!bill || isLoading || bill?.paymentStatus === 'paid'}
                            onClick={() => {
                                // Payment logic to be implemented
                                alert("Payment integration placeholder");
                            }}
                        >
                            {bill?.paymentStatus === 'paid' ? (
                                <><CheckCircle2 className="w-4 h-4 mr-2" /> Already Paid</>
                            ) : (
                                <><CreditCard className="w-4 h-4 mr-2" /> Mark as Paid</>
                            )}
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
