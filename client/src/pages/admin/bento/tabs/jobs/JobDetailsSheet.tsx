import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
    QrCode, FileText, Clock, User, Monitor, AlertCircle,
    PenTool, Users, Edit, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface JobDetailsSheetProps {
    job: any | null;
    isOpen: boolean;
    onClose: () => void;
    viewMode: string;
    userRole?: string;
    canEdit: boolean;
    currencySymbol: string;
    onEditJob: (job: any) => void;
    onPrintTicket: (job: any) => void;
}

export function JobDetailsSheet({
    job,
    isOpen,
    onClose,
    viewMode,
    userRole,
    canEdit,
    currencySymbol,
    onEditJob,
    onPrintTicket
}: JobDetailsSheetProps) {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && job && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 pointer-events-auto">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Center Pop-up Card */}
                    <motion.div
                        layoutId={viewMode === "grid" ? `job-card-${job.id}` : undefined}
                        initial={viewMode === "list" ? { scale: 0.95, opacity: 0, y: 15 } : { opacity: 0 }}
                        animate={viewMode === "list" ? { scale: 1, opacity: 1, y: 0 } : { opacity: 1 }}
                        exit={viewMode === "list" ? { scale: 0.95, opacity: 0, y: -15 } : { opacity: 0 }}
                        transition={{ type: "spring", stiffness: 350, damping: 30, opacity: { duration: 0.15 } }}
                        style={{ originX: 0.5, originY: 0.5 }}
                        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10"
                    >
                        <div className="bg-slate-900 p-6 text-white shrink-0 relative overflow-hidden">
                            <div className="absolute -right-10 -top-10 text-slate-800 opacity-20 transform rotate-12 pointer-events-none">
                                <QrCode className="w-48 h-48" />
                            </div>
                            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                                <div>
                                    <h2 className="text-2xl font-bold font-heading flex items-center gap-2">
                                        <FileText className="w-6 h-6 text-blue-400" />
                                        Job <span className="font-mono text-blue-300">#{job?.ticketNumber || job?.id.slice(-6).toUpperCase()}</span>
                                    </h2>
                                    <div className="flex items-center gap-2 mt-2 text-slate-400 text-xs font-mono">
                                        <Clock className="w-3 h-3" /> {job.createdAt ? format(new Date(job.createdAt), "PPP 'at' p") : "Unknown Date"}
                                    </div>
                                </div>
                                <div className="flex flex-col items-start sm:items-end gap-2">
                                    <Badge className={cn("px-3 py-1 font-bold tracking-wider uppercase border-0 backdrop-blur-md shadow-sm",
                                        job.status === "Completed" ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50" :
                                            job.status === "In Progress" ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50" :
                                                job.status === "Ready" ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/50" : "bg-white/10 text-white ring-1 ring-white/20"
                                    )}>{job.status}</Badge>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                            {/* Summary Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-1.5 transition-all hover:shadow-md">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Customer</span>
                                    <span className="font-bold text-slate-800 text-lg leading-tight mt-1">
                                        {(!userRole || userRole === "Technician") && !canEdit ?
                                            (job.customer ? job.customer.split(' ')[0] + ' ***' : 'Unknown') :
                                            job.customer}
                                    </span>
                                    {(!userRole || userRole === "Technician") && !canEdit ? null : (
                                        job.customerPhone && <span className="font-mono text-sm font-semibold text-blue-600">{job.customerPhone}</span>
                                    )}
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-1.5 transition-all hover:shadow-md">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5" /> Device</span>
                                    <span className="font-bold text-slate-800 text-lg leading-tight mt-1 truncate">{job.device}</span>
                                    {job.screenSize && <span className="font-mono text-xs text-slate-500 bg-slate-50 w-fit px-2 py-0.5 rounded border border-slate-100 mt-1">Size: {job.screenSize}"</span>}
                                </div>
                            </div>

                            {/* Issue Block */}
                            <div className="bg-white p-5 rounded-xl border border-red-100/60 shadow-sm relative overflow-hidden group/issue">
                                <div className="absolute top-0 left-0 w-1 h-full bg-red-400 group-hover/issue:bg-red-500 transition-colors"></div>
                                <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider flex items-center gap-1.5 mb-2"><AlertCircle className="w-3.5 h-3.5" /> Reported Problem</span>
                                <p className="text-sm text-slate-700 leading-relaxed font-medium">{job.issue}</p>
                            </div>

                            {/* Tech Notes Block */}
                            {job.notes && (
                                <div className="bg-yellow-50/40 p-5 rounded-xl border border-yellow-200/60 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-yellow-400"></div>
                                    <span className="text-[10px] uppercase font-bold text-yellow-600 tracking-wider flex items-center gap-1.5 mb-2"><PenTool className="w-3.5 h-3.5" /> Technician Notes</span>
                                    <p className="text-sm text-slate-700 font-medium leading-relaxed">{job.notes}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-3 shadow-sm">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/50 text-blue-600 flex items-center justify-center font-bold text-xl shadow-inner">{job.technician ? job.technician.charAt(0) : "?"}</div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Assigned Tech</span>
                                        <span className="font-bold text-slate-800 text-[15px]">{job.technician || "Unassigned"}</span>
                                    </div>
                                </div>
                                {/* Assist Team card */}
                                {(() => {
                                    const names: string[] = job.assistedByNames
                                        ? (typeof job.assistedByNames === 'string' && job.assistedByNames.trim()
                                            ? job.assistedByNames.split(',').map((n: string) => n.trim()).filter(Boolean)
                                            : [])
                                        : [];
                                    if (names.length === 0) return null;
                                    return (
                                        <div className="bg-violet-50 p-4 rounded-xl border border-violet-100 shadow-sm">
                                            <span className="text-[10px] uppercase font-bold text-violet-500 tracking-wider flex items-center gap-1.5 mb-2">
                                                <Users className="w-3.5 h-3.5" /> Assist Team
                                            </span>
                                            <div className="flex flex-col gap-1.5">
                                                {names.map((name: string) => (
                                                    <div key={name} className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 text-white flex items-center justify-center text-[11px] font-bold shadow-sm shrink-0">
                                                            {name.charAt(0)}
                                                        </div>
                                                        <span className="font-semibold text-slate-700 text-sm">{name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                                {job.estimatedCost && (
                                    <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col justify-center items-end sm:items-start shadow-sm">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Estimated Cost</span>
                                        <span className="font-bold text-emerald-600 text-2xl font-mono mt-1">{currencySymbol} {job.estimatedCost}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 sm:p-5 bg-white border-t border-slate-100 shrink-0 flex flex-col-reverse sm:flex-row justify-between items-center rounded-b-2xl gap-3">
                            <Button variant="ghost" onClick={onClose} className="rounded-xl text-slate-500 w-full sm:w-auto hover:bg-slate-100">Dismiss</Button>
                            <div className="flex gap-2 w-full sm:w-auto">
                                {canEdit && (
                                    <Button onClick={() => { onClose(); onEditJob(job); }} variant="outline" className="rounded-xl flex-1 sm:flex-none border-slate-200 bg-white shadow-sm hover:bg-slate-50">
                                        <Edit className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Quick Edit</span>
                                    </Button>
                                )}
                                <Button onClick={() => onPrintTicket(job)} className="rounded-xl px-6 flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-md transition-all bc-hover bc-rise">
                                    <Printer className="w-4 h-4 sm:mr-2" /> <span>Print Ticket</span>
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}
