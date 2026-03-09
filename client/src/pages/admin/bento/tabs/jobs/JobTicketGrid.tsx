import { motion } from "framer-motion";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BentoCard } from "../../shared";
import { Clock, Eye, MoreVertical, PenTool, Phone, Printer, QrCode, User, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobTicket } from "@shared/schema";

// We need a local or imported HighlightMatch. Let's assume it exists in JobTicketsTab or we can recreate it.
// Assuming HighlightMatch from JobTicketsTab can be imported if it was exported, or we'll recreate a simple one.
const HighlightMatch = ({ text, query }: { text: string | undefined | null; query: string }) => {
    if (!text) return null;
    if (!query) return <>{text}</>;
    const textStr = String(text);
    const regex = new RegExp(`(${query})`, "gi");
    const parts = textStr.split(regex);
    return (
        <>
            {parts.map((part, i) =>
                regex.test(part) ? (
                    <span key={i} className="bg-blue-100 text-blue-900 font-bold rounded px-0.5">
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </>
    );
};

export const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05, duration: 0.3 } }
};

export const tableRowVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } as any }
};

interface JobTicketGridProps {
    jobs: JobTicket[];
    searchQuery: string;
    isSelectionMode: boolean;
    selectedJobIds: string[];
    onToggleSelection: (id: string) => void;
    onViewDetails: (job: JobTicket) => void;
    onEditJob: (job: JobTicket) => void;
    onAdvanceStage: (job: JobTicket) => void;
    onPrintTicket: (job: JobTicket) => void;
    onGenerateQr: (job: JobTicket) => void;
    userRole?: string;
    canEdit: boolean;
}

export function JobTicketGrid({
    jobs,
    searchQuery,
    isSelectionMode,
    selectedJobIds,
    onToggleSelection,
    onViewDetails,
    onEditJob,
    onAdvanceStage,
    onPrintTicket,
    onGenerateQr,
    userRole,
    canEdit
}: JobTicketGridProps) {
    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {jobs.map((job: any) => {
                const isTechnician = userRole === "Technician";
                const showCustomerDetails = !isTechnician || canEdit;
                return (
                    <motion.div
                        variants={tableRowVariants}
                        key={job.id}
                        layoutId={`job-card-${job.id}`}
                        onClick={() => {
                            if (isSelectionMode) {
                                onToggleSelection(job.id);
                            } else {
                                onViewDetails(job);
                            }
                        }}
                        className="relative group h-full cursor-pointer z-0"
                    >
                        <BentoCard className={cn("h-full flex flex-col justify-between transition-all border p-5 overflow-hidden", isSelectionMode && selectedJobIds.includes(job.id) ? "border-blue-500 bg-blue-50/10 ring-2 ring-blue-500/20" : "border-slate-200/60 bg-white")}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                    <div className="flex gap-2 items-center flex-wrap">
                                        {isSelectionMode && (
                                            <Checkbox
                                                checked={selectedJobIds.includes(job.id)}
                                                className="mr-1 h-5 w-5 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white rounded shadow-sm border-slate-300 transition-all pointer-events-none"
                                            />
                                        )}
                                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100/50 tracking-wide truncate">
                                            #<HighlightMatch text={(job as any).ticketNumber || job.id.slice(-6).toUpperCase()} query={searchQuery} />
                                        </span>
                                        <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold uppercase tracking-wider border-0 shadow-sm",
                                            job.priority === 'High' ? "text-red-700 bg-red-100" :
                                                job.priority === 'Critical' ? "text-rose-700 bg-rose-100" : "text-slate-600 bg-slate-100")}>
                                            {job.priority}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                                        <Clock className="w-3 h-3" />
                                        <span>{job.createdAt ? format(new Date(job.createdAt), 'MMM dd, yyyy') : 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Badge className={cn("shadow-sm font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border-0 mr-1",
                                        job.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                                            job.status === "In Progress" ? "bg-blue-100 text-blue-700" :
                                                job.status === "Ready" ? "bg-cyan-100 text-cyan-700" :
                                                    job.status === "Cancelled" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                                    )}>
                                        {job.status}
                                    </Badge>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:bg-slate-100 hover:text-slate-800 rounded-full" onClick={(e) => e.stopPropagation()}>
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 rounded-xl bg-white/95 backdrop-blur-xl border-white/20 shadow-xl" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenuLabel className="font-bold text-[10px] uppercase text-slate-500 tracking-wider">Actions</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => onViewDetails(job)} className="font-medium cursor-pointer"><Eye className="w-4 h-4 mr-2" /> View Details</DropdownMenuItem>
                                            {canEdit && <DropdownMenuItem onClick={() => onEditJob(job)} className="font-medium cursor-pointer"><PenTool className="w-4 h-4 mr-2" /> Edit Job</DropdownMenuItem>}
                                            {canEdit && job.status !== 'Completed' && job.status !== 'Cancelled' && (
                                                <DropdownMenuItem onClick={() => onAdvanceStage(job)} className="font-medium cursor-pointer text-blue-600">
                                                    <Zap className="w-4 h-4 mr-2" /> Advance Stage
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => onPrintTicket(job)} className="font-medium cursor-pointer"><Printer className="w-4 h-4 mr-2" /> Print Ticket</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => onGenerateQr(job)} className="font-medium cursor-pointer"><QrCode className="w-4 h-4 mr-2" /> Generate QR</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            <div className="flex-1 mb-5">
                                <h3 className="text-sm font-bold text-slate-800 flex items-start justify-between gap-3">
                                    <span className="flex-1 leading-snug line-clamp-2"><HighlightMatch text={job.device} query={searchQuery} /></span>
                                    <span
                                        className="p-1.5 bg-slate-50 hover:bg-blue-50 rounded-lg text-slate-300 hover:text-blue-600 transition-colors cursor-pointer group/qr"
                                        onClick={(e) => { e.stopPropagation(); onGenerateQr(job); }}
                                    >
                                        <QrCode className="w-5 h-5 shrink-0" />
                                    </span>
                                </h3>
                                {job.screenSize && <span className="text-[10px] px-1.5 py-0.5 bg-slate-50/80 rounded text-slate-500 font-mono border border-slate-200 mt-1.5 inline-block">{job.screenSize}"</span>}
                                <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 leading-relaxed font-medium">
                                    <HighlightMatch text={job.issue} query={searchQuery} />
                                </p>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                                <div className="flex flex-col gap-1 max-w-[50%]">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Customer</span>
                                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 truncate">
                                        <User className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span className="truncate">{showCustomerDetails ? <HighlightMatch text={job.customer} query={searchQuery} /> : (job.customer ? <HighlightMatch text={job.customer.split(' ')[0] + ' ***'} query={searchQuery} /> : 'Unknown')}</span>
                                    </span>
                                    {showCustomerDetails && job.customerPhone && (
                                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 truncate mt-0.5">
                                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                            <span className="truncate text-blue-600"><HighlightMatch text={job.customerPhone} query={searchQuery} /></span>
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col items-end gap-1 max-w-[45%] text-right">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Technician</span>
                                    {!job.technician || job.technician === "Unassigned" ? (
                                        <span className="text-[11px] italic text-slate-400 flex items-center gap-1 mt-0.5">Unassigned</span>
                                    ) : (
                                        <div className="flex items-center gap-1.5 truncate mt-0.5">
                                            <div className="w-4 h-4 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-[8px] font-bold shadow-sm">
                                                {job.technician.charAt(0)}
                                            </div>
                                            <span className="text-[11px] font-bold text-slate-700 truncate"><HighlightMatch text={job.technician} query={searchQuery} /></span>
                                        </div>
                                    )}
                                    {(() => {
                                        const names = job.assistedByNames
                                            ? (typeof job.assistedByNames === 'string' && job.assistedByNames.trim() ? job.assistedByNames.split(',').map((n: string) => n.trim()).filter(Boolean) : [])
                                            : [];
                                        if (names.length === 0) return null;
                                        return (
                                            <div className="flex flex-col items-end gap-0.5 mt-1">
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-violet-400">+ Assist</span>
                                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                                    {names.map((name: string) => (
                                                        <div key={name} className="flex items-center gap-1">
                                                            <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 text-white flex items-center justify-center text-[7px] font-bold shadow-sm shrink-0">
                                                                {name.charAt(0)}
                                                            </div>
                                                            <span className="text-[10px] text-violet-700 font-medium truncate max-w-[70px]">{name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </BentoCard>
                    </motion.div>
                );
            })}
        </motion.div>
    );
}
