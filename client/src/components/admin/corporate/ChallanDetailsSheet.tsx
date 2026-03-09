import { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
    X, Printer, Package, ArrowUpRight, ArrowDownLeft,
    CheckCircle2, Clock, MapPin, User, Phone, Layers, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { corporateApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ChallanDetailsSheetProps {
    challan: any | null;
    client: any;
    onClose: () => void;
    onReprint: (challan: any) => void;
    isPrinting: boolean;
}

export function ChallanDetailsSheet({ challan, client, onClose, onReprint, isPrinting }: ChallanDetailsSheetProps) {
    const [jobs, setJobs] = useState<any[]>([]);
    const [isLoadingJobs, setIsLoadingJobs] = useState(false);

    useEffect(() => {
        if (challan?.type === 'outgoing' && challan.id) {
            setIsLoadingJobs(true);
            corporateApi.getChallanJobs(challan.id)
                .then(data => setJobs(data))
                .catch(err => console.error("Failed to load challan jobs", err))
                .finally(() => setIsLoadingJobs(false));
        } else {
            setJobs([]);
        }
    }, [challan]);

    // Close on escape key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    };

    if (!challan) return null;

    const isOutgoing = challan.type === "outgoing";

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
                    <div className="flex flex-col border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center justify-between px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm",
                                    isOutgoing ? "bg-indigo-500 shadow-indigo-500/20" : "bg-emerald-500 shadow-emerald-500/20"
                                )}>
                                    {isOutgoing ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                                            Challan {challan.challanNumber}
                                        </h2>
                                        <Badge variant={isOutgoing ? "default" : "secondary"} className={cn(
                                            "text-[10px] uppercase font-bold tracking-wider",
                                            isOutgoing ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                        )}>
                                            {isOutgoing ? "OUT" : "IN"}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                                        <Clock className="w-3.5 h-3.5" />
                                        {format(new Date(challan.createdAt), "MMM dd, yyyy 'at' h:mm a")}
                                    </p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200">
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    <ScrollArea className="flex-1 bg-slate-50/30">
                        <div className="p-6 space-y-6">

                            {/* Meta Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col gap-1">
                                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                        <Building2 className="w-3.5 h-3.5" /> Client
                                    </div>
                                    <div className="text-sm font-semibold text-slate-800 truncate">{client.companyName}</div>
                                    {client.address && (
                                        <div className="text-xs text-slate-500 flex items-start gap-1 mt-1">
                                            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span className="line-clamp-2">{client.address}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col gap-1">
                                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                        <User className="w-3.5 h-3.5" /> {isOutgoing ? "Receiver" : "Sender"}
                                    </div>
                                    <div className="text-sm font-semibold text-slate-800 truncate">
                                        {isOutgoing ? (challan.receiverName || "Not specified") : (challan.receivedBy || "Not specified")}
                                    </div>
                                    {(challan.receiverPhone || challan.senderPhone) && (
                                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                            <Phone className="w-3.5 h-3.5 shrink-0" />
                                            <span>{isOutgoing ? challan.receiverPhone : challan.senderPhone}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                                        <Package className="w-4 h-4 text-indigo-500" />
                                        Challan Items
                                    </h3>
                                    <Badge variant="secondary" className="bg-slate-200/50 text-slate-600 font-bold">
                                        {challan.totalItems || jobs.length} Items
                                    </Badge>
                                </div>

                                {isLoadingJobs ? (
                                    <div className="p-8 text-center flex flex-col items-center justify-center text-slate-400">
                                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                        <p className="text-sm">Loading detailed item list...</p>
                                    </div>
                                ) : isOutgoing && jobs.length > 0 ? (
                                    <div className="divide-y divide-slate-100">
                                        {jobs.map((job: any) => (
                                            <div key={job.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                                                            {job.corporateJobNumber || job.id}
                                                        </span>
                                                        <span className="font-medium text-sm text-slate-800">{job.device}</span>
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px] uppercase font-semibold text-slate-500 border-slate-200">
                                                        {job.status}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 mt-1">
                                                    <div>
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">Serial No</span>
                                                        <span className="text-xs text-slate-600 font-mono">{job.tvSerialNumber || "N/A"}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block mb-0.5">Problem</span>
                                                        <span className="text-xs text-slate-600 truncate block" title={job.reportedDefect}>{job.reportedDefect || "N/A"}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-12 text-center flex flex-col items-center text-slate-400">
                                        <Layers className="w-10 h-10 text-slate-200 mb-3" />
                                        <p className="text-sm font-medium text-slate-600">Item details not recorded</p>
                                        <p className="text-xs max-w-[200px] mt-1">
                                            This challan doesn't have a linked item list in the database.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </ScrollArea>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
                        {isOutgoing ? (
                            <Button
                                onClick={() => onReprint(challan)}
                                disabled={isPrinting}
                                className="w-full sm:w-auto rounded-xl shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
                            >
                                <Printer className="w-4 h-4 mr-2" />
                                {isPrinting ? "Preparing PDF..." : "Reprint Challan (OUT)"}
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                disabled
                                className="w-full sm:w-auto rounded-xl border-slate-200 text-slate-400"
                            >
                                <Printer className="w-4 h-4 mr-2" />
                                Reprint (IN) Not Available
                            </Button>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
// Note: Building2 needs to be imported if not already. I missed it in my imports list above.
// Adding it to lucide-react imports: Building2
