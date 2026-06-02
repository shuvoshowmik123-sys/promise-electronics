import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
    QrCode, FileText, Clock, User, Monitor, AlertCircle,
    PenTool, Users, Edit, Printer, ShoppingCart,
    ArrowLeft, MoreVertical, Phone, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { getPrimaryAction, getStatusVisual } from "./jobActions";

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
    onOutsidePurchase?: () => void;
    onAdvanceStage?: (job: any) => void;
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
    onPrintTicket,
    onOutsidePurchase,
    onAdvanceStage,
}: JobDetailsSheetProps) {
    const isMobile = useIsMobile();

    if (typeof document === 'undefined') return null;

    const isTechnician = userRole === "Technician";
    const showCustomerDetails = !!job && (!isTechnician || canEdit);
    const customerLabel = job
        ? (showCustomerDetails
            ? (job.customer || "Unknown")
            : (job.customer ? `${job.customer.split(" ")[0]} ***` : "Unknown"))
        : "";

    const action = job ? getPrimaryAction(job, canEdit) : null;
    const ActionIcon = action?.Icon;
    const handlePrimaryAction = () => {
        if (!job || !action) return;
        if (action.type === "advance") { onClose(); onAdvanceStage?.(job); }
        else if (action.type === "edit") { onClose(); onEditJob(job); }
        else if (action.type === "print") onPrintTicket(job);
        else onClose(); // view: already open
    };

    const assistNames = (name: any): string[] =>
        name
            ? (typeof name === "string" && name.trim() ? name.split(",").map((n: string) => n.trim()).filter(Boolean) : [])
            : [];

    // ---------- MOBILE: bottom sheet ----------
    if (isMobile) {
        const warrantyText = job
            ? (job.warrantyExpiryDate
                ? format(new Date(job.warrantyExpiryDate), "MMM d, yyyy")
                : (job.warrantyDays ? `${job.warrantyDays} days` : "—"))
            : "—";
        const names = job ? assistNames(job.assistedByNames) : [];

        return createPortal(
            <AnimatePresence>
                {isOpen && job && (
                    <div className="fixed inset-0 z-[200]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={onClose}
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", stiffness: 340, damping: 34 }}
                            className="absolute inset-x-0 bottom-0 top-10 flex flex-col rounded-t-3xl bg-slate-50 overflow-hidden shadow-2xl"
                        >
                            {/* Dark header */}
                            <div className="relative shrink-0 bg-slate-900 px-5 pt-3 pb-6 text-white overflow-hidden rounded-t-3xl">
                                <div className="absolute -right-6 top-2 text-slate-800/40 rotate-12 pointer-events-none">
                                    <QrCode className="w-40 h-40" />
                                </div>
                                <div className="relative z-10">
                                    <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-600" />
                                    <div className="flex items-center justify-between">
                                        <button onClick={onClose} className="h-9 w-9 -ml-1 flex items-center justify-center rounded-full text-slate-300 active:bg-white/10">
                                            <ArrowLeft className="w-5 h-5" />
                                        </button>
                                        <span className="text-base font-bold">Job Detail</span>
                                        <button
                                            onClick={() => onPrintTicket(job)}
                                            className="h-9 w-9 -mr-1 flex items-center justify-center rounded-full text-slate-300 active:bg-white/10"
                                            aria-label="Print ticket"
                                        >
                                            <MoreVertical className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="mt-4 flex items-end justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Job Ticket</p>
                                            <p className="font-mono text-2xl font-black tracking-tight text-white">
                                                #{job.ticketNumber || job.id.slice(-6).toUpperCase()}
                                            </p>
                                        </div>
                                        <Badge className={cn(
                                            "px-3 py-1 font-bold uppercase tracking-wider border-0 backdrop-blur-md",
                                            getStatusVisual(job.status).badge,
                                        )}>
                                            {getStatusVisual(job.status).label}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Scroll body */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-28">
                                {/* Customer */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
                                            <p className="text-lg font-bold text-slate-900 mt-0.5 truncate">{customerLabel}</p>
                                            {showCustomerDetails && job.customerPhone && (
                                                <a
                                                    href={`tel:${job.customerPhone}`}
                                                    className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold font-mono text-blue-700 active:bg-blue-100"
                                                >
                                                    <Phone className="w-4 h-4" /> {job.customerPhone}
                                                </a>
                                            )}
                                        </div>
                                        <User className="w-6 h-6 text-slate-300 shrink-0" />
                                    </div>
                                </div>

                                {/* Device */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device</p>
                                    <p className="text-lg font-bold text-slate-900 mt-0.5">{job.device}</p>
                                    {job.screenSize && (
                                        <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-mono text-slate-600 border border-slate-200">
                                            {job.screenSize} inch
                                        </span>
                                    )}
                                </div>

                                {/* Reported problem */}
                                <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-4 pl-5 overflow-hidden">
                                    <span className="absolute left-0 top-0 h-full w-1.5 bg-red-500" aria-hidden />
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reported Problem</p>
                                        {(job.priority === "High" || job.priority === "Critical") && (
                                            <Badge className={cn(
                                                "text-[10px] px-2 py-0.5 font-bold uppercase border-0",
                                                job.priority === "Critical" ? "bg-rose-100 text-rose-700" : "bg-red-100 text-red-700",
                                            )}>
                                                <AlertCircle className="w-3 h-3 mr-1" />{job.priority}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-[15px] leading-relaxed text-slate-700">{job.issue}</p>
                                </div>

                                {/* Technician notes */}
                                {job.notes && (
                                    <div className="relative bg-amber-50 rounded-2xl border border-amber-100 shadow-sm p-4 pl-5 overflow-hidden">
                                        <span className="absolute left-0 top-0 h-full w-1.5 bg-amber-400" aria-hidden />
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5 mb-2">
                                            <PenTool className="w-3.5 h-3.5" /> Technician Notes
                                        </p>
                                        <p className="text-[15px] leading-relaxed text-slate-700">{job.notes}</p>
                                    </div>
                                )}

                                {/* Estimated cost */}
                                {job.estimatedCost != null && job.estimatedCost !== "" && (
                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimated Cost</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Parts & Labour</p>
                                        </div>
                                        <p className="text-2xl font-black font-mono text-slate-900">
                                            {currencySymbol}{Number(job.estimatedCost).toLocaleString()}
                                        </p>
                                    </div>
                                )}

                                {/* Assigned tech + warranty */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Tech</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                                                {job.technician && job.technician !== "Unassigned" ? job.technician.charAt(0) : "?"}
                                            </div>
                                            <span className="text-sm font-bold text-slate-800 truncate">{job.technician || "Unassigned"}</span>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                            <ShieldCheck className="w-3.5 h-3.5" /> Warranty
                                        </p>
                                        <p className="text-sm font-bold text-slate-800 mt-1.5">{warrantyText}</p>
                                    </div>
                                </div>

                                {/* Assist team */}
                                {names.length > 0 && (
                                    <div className="bg-violet-50 rounded-2xl border border-violet-100 shadow-sm p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500 flex items-center gap-1.5 mb-2">
                                            <Users className="w-3.5 h-3.5" /> Assist Team
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {names.map((name) => (
                                                <span key={name} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-slate-700 border border-violet-100">
                                                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 text-white flex items-center justify-center text-[10px] font-bold">{name.charAt(0)}</span>
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Secondary actions */}
                                {canEdit && (
                                    <div className="flex gap-2 pt-1">
                                        {onOutsidePurchase && (
                                            <Button
                                                variant="outline"
                                                onClick={() => { onClose(); onOutsidePurchase(); }}
                                                className="flex-1 h-11 rounded-xl border-slate-200 text-slate-700 gap-1.5 font-medium"
                                            >
                                                <ShoppingCart className="w-4 h-4" /> Purchase
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            onClick={() => { onClose(); onEditJob(job); }}
                                            className="flex-1 h-11 rounded-xl border-slate-200 text-slate-700 gap-1.5 font-medium"
                                        >
                                            <Edit className="w-4 h-4" /> Edit
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => onPrintTicket(job)}
                                            className="flex-1 h-11 rounded-xl border-slate-200 text-slate-700 gap-1.5 font-medium"
                                        >
                                            <Printer className="w-4 h-4" /> Print
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Sticky contextual action */}
                            {action && ActionIcon && (
                                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-8">
                                    <Button
                                        onClick={handlePrimaryAction}
                                        className={cn(
                                            "w-full h-14 rounded-2xl gap-2 text-base font-bold shadow-lg shadow-blue-600/20",
                                            action.type === "edit"
                                                ? "bg-blue-600 hover:bg-blue-700 text-white"
                                                : "bg-blue-600 hover:bg-blue-700 text-white",
                                        )}
                                    >
                                        <ActionIcon className="w-5 h-5" />
                                        {action.label}
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>,
            document.body,
        );
    }

    // ---------- DESKTOP: centered modal (unchanged) ----------
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
                                        {customerLabel}
                                    </span>
                                    {showCustomerDetails && job.customerPhone && (
                                        <span className="font-mono text-sm font-semibold text-blue-600">{job.customerPhone}</span>
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
                                    const names = assistNames(job.assistedByNames);
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

                        <div className="p-4 sm:p-5 bg-white border-t border-slate-100 shrink-0 flex flex-row justify-between items-center rounded-b-2xl gap-2">
                            {/* Left: dismiss — always visible, understated */}
                            <Button
                                variant="outline"
                                onClick={onClose}
                                className="rounded-xl h-10 px-4 border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 font-medium text-sm"
                            >
                                Close
                            </Button>

                            {/* Right: actions — consistent height/radius/weight */}
                            <div className="flex items-center gap-2">
                                {canEdit && onOutsidePurchase && (
                                    <Button
                                        onClick={() => { onClose(); onOutsidePurchase(); }}
                                        variant="outline"
                                        className="rounded-xl h-10 border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 text-sm font-medium"
                                        title="Log outside/petty-cash part purchase for this job"
                                    >
                                        <ShoppingCart className="w-4 h-4 shrink-0" />
                                        <span className="hidden sm:inline">Purchase</span>
                                    </Button>
                                )}
                                {canEdit && (
                                    <Button
                                        onClick={() => { onClose(); onEditJob(job); }}
                                        variant="outline"
                                        className="rounded-xl h-10 border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 text-sm font-medium"
                                    >
                                        <Edit className="w-4 h-4 shrink-0" />
                                        <span className="hidden sm:inline">Edit</span>
                                    </Button>
                                )}
                                <Button
                                    onClick={() => onPrintTicket(job)}
                                    className="rounded-xl h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm gap-1.5 shadow-sm transition-all"
                                >
                                    <Printer className="w-4 h-4 shrink-0" />
                                    <span>Print</span>
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
