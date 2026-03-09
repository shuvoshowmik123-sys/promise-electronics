import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Clock, User, Wrench, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobTicket } from "@shared/schema";

// ─── Column Config ────────────────────────────────────────────────────────────
const KANBAN_COLUMNS: { id: string; label: string; color: string; dot: string }[] = [
    { id: "Pending", label: "Pending", color: "bg-slate-50  border-slate-200", dot: "bg-slate-400" },
    { id: "In Progress", label: "In Progress", color: "bg-blue-50   border-blue-200", dot: "bg-blue-500" },
    { id: "Waiting for Parts", label: "Waiting for Parts", color: "bg-amber-50  border-amber-200", dot: "bg-amber-500" },
    { id: "Ready", label: "Ready to Deliver", color: "bg-green-50  border-green-200", dot: "bg-green-500" },
    { id: "Delivered", label: "Delivered", color: "bg-slate-50  border-slate-200", dot: "bg-emerald-400" },
];

const PRIORITY_STYLES: Record<string, string> = {
    Critical: "bg-red-100    text-red-700",
    High: "bg-orange-100 text-orange-700",
    Medium: "bg-slate-100  text-slate-600",
    Low: "bg-sky-100    text-sky-700",
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface KanbanBoardProps {
    jobs: JobTicket[];
    onStatusChange: (jobId: string, newStatus: string) => void;
    onJobClick: (job: JobTicket) => void;
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function KanbanCard({
    job,
    onDragStart,
    onClick,
}: {
    job: JobTicket;
    onDragStart: (e: React.DragEvent, jobId: string) => void;
    onClick: (job: JobTicket) => void;
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            draggable
            onDragStart={(e) => onDragStart(e as any, job.id)}
            onClick={() => onClick(job)}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing group select-none"
        >
            <div className="p-3.5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                    <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 tracking-wide truncate">
                        #{job.id.slice(-6).toUpperCase()}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {job.priority && job.priority !== "Medium" && (
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 h-4 font-bold uppercase tracking-wider border-0",
                                PRIORITY_STYLES[job.priority] ?? "bg-slate-100 text-slate-600")}>
                                {job.priority}
                            </Badge>
                        )}
                        <GripVertical className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />
                    </div>
                </div>

                {/* Device */}
                <p className="text-sm font-bold text-slate-800 leading-snug line-clamp-1 mb-1">
                    {job.device || "Unknown Device"}
                </p>

                {/* Issue */}
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
                    {job.issue || job.reportedDefect || "No description"}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                    <div className="flex items-center gap-1 min-w-0">
                        <div className={cn("w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[8px] font-black text-white shadow-sm",
                            job.technician && job.technician !== "Unassigned"
                                ? "bg-gradient-to-br from-blue-500 to-indigo-600"
                                : "bg-slate-200")}>
                            {job.technician && job.technician !== "Unassigned"
                                ? job.technician.charAt(0).toUpperCase()
                                : <User className="w-3 h-3 text-slate-400" />}
                        </div>
                        <span className="text-[10px] font-medium text-slate-500 truncate">
                            {job.technician && job.technician !== "Unassigned" ? job.technician : "Unassigned"}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                        <Clock className="w-3 h-3" />
                        {job.createdAt ? format(new Date(job.createdAt), "MMM d") : "—"}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Column ───────────────────────────────────────────────────────────────────
function KanbanColumn({
    column,
    jobs,
    onDragStart,
    onDrop,
    onJobClick,
}: {
    column: (typeof KANBAN_COLUMNS)[0];
    jobs: JobTicket[];
    onDragStart: (e: React.DragEvent, jobId: string) => void;
    onDrop: (e: React.DragEvent, status: string) => void;
    onJobClick: (job: JobTicket) => void;
}) {
    const [isDragOver, setIsDragOver] = useState(false);

    return (
        <div
            className={cn(
                "flex flex-col rounded-2xl border-2 transition-all duration-150 min-h-[200px] w-[300px] shrink-0 snap-start",
                column.color,
                isDragOver ? "border-blue-400 shadow-lg shadow-blue-500/10 scale-[1.01]" : ""
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => { setIsDragOver(false); onDrop(e, column.id); }}
        >
            {/* Column header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
                <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", column.dot)} />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {column.label}
                    </span>
                </div>
                <span className={cn(
                    "text-xs font-black tabular-nums px-2 py-0.5 rounded-full",
                    jobs.length > 0 ? "bg-white text-slate-700 shadow-sm" : "bg-transparent text-slate-400"
                )}>
                    {jobs.length}
                </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-3 p-3 flex-1 overflow-y-auto max-h-[calc(100vh-320px)]">
                <AnimatePresence mode="popLayout">
                    {jobs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2 opacity-50">
                            <Wrench className="w-6 h-6 text-slate-400" />
                            <p className="text-xs text-slate-400 font-medium">No jobs here</p>
                        </div>
                    ) : (
                        jobs.map((job) => (
                            <KanbanCard
                                key={job.id}
                                job={job}
                                onDragStart={onDragStart}
                                onClick={onJobClick}
                            />
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─── Board ────────────────────────────────────────────────────────────────────
export function KanbanBoard({ jobs, onStatusChange, onJobClick }: KanbanBoardProps) {
    const draggingJobId = useRef<string | null>(null);

    const handleDragStart = (e: React.DragEvent, jobId: string) => {
        draggingJobId.current = jobId;
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = (e: React.DragEvent, newStatus: string) => {
        e.preventDefault();
        const jobId = draggingJobId.current;
        if (!jobId) return;
        const job = jobs.find(j => j.id === jobId);
        if (job && job.status !== newStatus) {
            onStatusChange(jobId, newStatus);
        }
        draggingJobId.current = null;
    };

    const jobsByColumn = KANBAN_COLUMNS.reduce<Record<string, JobTicket[]>>((acc, col) => {
        acc[col.id] = jobs.filter(j => j.status === col.id);
        return acc;
    }, {});

    return (
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory px-1 -mx-1">
            {KANBAN_COLUMNS.map((col) => (
                <KanbanColumn
                    key={col.id}
                    column={col}
                    jobs={jobsByColumn[col.id] ?? []}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onJobClick={onJobClick}
                />
            ))}
        </div>
    );
}
