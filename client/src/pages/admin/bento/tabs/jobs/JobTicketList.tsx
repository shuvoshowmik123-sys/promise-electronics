import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Clock, Eye, MoreVertical, PenTool, Printer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobTicket } from "@shared/schema";

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

interface JobTicketListProps {
    jobs: JobTicket[];
    searchQuery: string;
    isSelectionMode: boolean;
    selectedJobIds: string[];
    onToggleSelection: (id: string) => void;
    onViewDetails: (job: JobTicket) => void;
    onEditJob: (job: JobTicket) => void;
    onAdvanceStage: (job: JobTicket) => void;
    onPrintTicket: (job: JobTicket) => void;
    userRole?: string;
    canEdit: boolean;
}

export function JobTicketList({
    jobs,
    searchQuery,
    isSelectionMode,
    selectedJobIds,
    onToggleSelection,
    onViewDetails,
    onEditJob,
    onAdvanceStage,
    onPrintTicket,
    userRole,
    canEdit
}: JobTicketListProps) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-100">
                    <TableRow>
                        {isSelectionMode && <TableHead className="w-12 text-center"></TableHead>}
                        <TableHead className="font-bold text-slate-600">ID / Info</TableHead>
                        <TableHead className="font-bold text-slate-600">Customer</TableHead>
                        <TableHead className="font-bold text-slate-600">Device & Issue</TableHead>
                        <TableHead className="font-bold text-slate-600">Assigned To</TableHead>
                        <TableHead className="font-bold text-slate-600">Status</TableHead>
                        <TableHead className="text-right font-bold text-slate-600">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {jobs.map((job: any) => {
                        const isTechnician = userRole === "Technician";
                        const showCustomerDetails = !isTechnician || canEdit;
                        return (
                            <TableRow key={job.id} onClick={() => {
                                if (isSelectionMode) onToggleSelection(job.id);
                                else onViewDetails(job);
                            }} className="cursor-pointer hover:bg-slate-50 group transition-colors">
                                {isSelectionMode && (
                                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={selectedJobIds.includes(job.id)}
                                            onCheckedChange={() => onToggleSelection(job.id)}
                                        />
                                    </TableCell>
                                )}
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded border border-blue-100/50 w-fit">#{job.ticketNumber || job.id.slice(-6).toUpperCase()}</span>
                                        <span className="text-[11px] text-slate-400 flex items-center gap-1.5"><Clock className="w-3 h-3" /> {job.createdAt ? format(new Date(job.createdAt), 'MMM dd, yyyy') : 'N/A'}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-700 text-sm">
                                            {showCustomerDetails ? <HighlightMatch text={job.customer} query={searchQuery} /> : (job.customer ? <HighlightMatch text={job.customer.split(' ')[0] + ' ***'} query={searchQuery} /> : 'Unknown')}
                                        </span>
                                        {showCustomerDetails && job.customerPhone && <span className="text-xs text-slate-500 font-mono mt-0.5"><HighlightMatch text={job.customerPhone} query={searchQuery} /></span>}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="max-w-[200px] sm:max-w-xs">
                                        <div className="font-semibold text-sm text-slate-800 truncate"><HighlightMatch text={job.device} query={searchQuery} /></div>
                                        <div className="text-xs text-slate-500 truncate mt-0.5"><HighlightMatch text={job.issue} query={searchQuery} /></div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {!job.technician || job.technician === "Unassigned" ? (
                                        <span className="text-xs italic text-slate-400">Unassigned</span>
                                    ) : (
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-[9px] font-bold shadow-sm shrink-0">{job.technician.charAt(0)}</div>
                                                <span className="text-sm font-medium text-slate-700"><HighlightMatch text={job.technician} query={searchQuery} /></span>
                                            </div>
                                            {(() => {
                                                const names = job.assistedByNames
                                                    ? (typeof job.assistedByNames === 'string' && job.assistedByNames.trim() ? job.assistedByNames.split(',').map((n: string) => n.trim()).filter(Boolean) : [])
                                                    : [];
                                                if (names.length === 0) return null;
                                                return (
                                                    <div className="flex items-center gap-1 flex-wrap">
                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-violet-400 mr-0.5">+</span>
                                                        {names.map((name: string) => (
                                                            <span key={name} className="inline-flex items-center gap-1 text-[10px] bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded-full font-medium">
                                                                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 text-white flex items-center justify-center text-[7px] font-bold shrink-0">{name.charAt(0)}</span>
                                                                {name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1.5 w-fit">
                                        <Badge className={cn("shadow-sm font-bold text-[10px] uppercase tracking-wider border-0 justify-center", job.status === "Completed" ? "bg-emerald-100 text-emerald-700" : job.status === "In Progress" ? "bg-blue-100 text-blue-700" : job.status === "Ready" ? "bg-cyan-100 text-cyan-700" : job.status === "Cancelled" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700")}>{job.status}</Badge>
                                        <Badge variant="outline" className={cn("text-[9px] font-bold uppercase tracking-wider border-0 shadow-sm justify-center", job.priority === 'High' ? "text-red-700 bg-red-100" : job.priority === 'Critical' ? "text-rose-700 bg-rose-100" : "text-slate-600 bg-slate-100")}>{job.priority}</Badge>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-800 rounded-full"><MoreVertical className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl">
                                            <DropdownMenuItem onClick={() => onViewDetails(job)} className="cursor-pointer"><Eye className="w-4 h-4 mr-2" /> View Details</DropdownMenuItem>
                                            {canEdit && <DropdownMenuItem onClick={() => onEditJob(job)} className="cursor-pointer"><PenTool className="w-4 h-4 mr-2" /> Edit Job</DropdownMenuItem>}
                                            {canEdit && job.status !== 'Completed' && job.status !== 'Cancelled' && (
                                                <DropdownMenuItem onClick={() => onAdvanceStage(job)} className="cursor-pointer text-blue-600"><Zap className="w-4 h-4 mr-2" /> Advance Stage</DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => onPrintTicket(job)} className="cursor-pointer"><Printer className="w-4 h-4 mr-2" /> Print Ticket</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
