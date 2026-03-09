import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
    Wrench, ClipboardList, CheckCircle2, Clock, Star,
    AlertTriangle, ChevronDown, ChevronUp, User, Zap, Phone,
    Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants, tableRowVariants } from "../shared/animations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { jobTicketsApi, usersApi } from "@/lib/api";
import type { JobTicket } from "@shared/schema";

// ── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

const STATUS_STYLES: Record<string, string> = {
    "Pending": "bg-amber-50 text-amber-700 border-amber-200",
    "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
    "Ready": "bg-violet-50 text-violet-700 border-violet-200",
    "Completed": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Delivered": "bg-slate-50 text-slate-500 border-slate-200",
};

const PRIORITY_DOT: Record<string, string> = {
    High: "bg-rose-500",
    Medium: "bg-orange-400",
    Low: "bg-blue-400",
    Normal: "bg-slate-300",
};

// ── Technician Expandable Card (Mobile) ────────────────────────────────────────
function TechCard({ tech, jobs }: { tech: any; jobs: JobTicket[] }) {
    const [open, setOpen] = useState(false);
    const myJobs = jobs.filter(j =>
        j.assignedTechnicianId === tech.id ||
        (j.technician && j.technician.toLowerCase().includes(tech.name?.toLowerCase()))
    );
    const activeJobs = myJobs.filter(j => !["Completed", "Delivered"].includes(j.status ?? "")).length;
    const completedJobs = myJobs.filter(j => ["Completed", "Delivered"].includes(j.status ?? "")).length;

    return (
        <motion.div layout className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <button className="w-full p-4 flex items-center justify-between gap-3 text-left" onClick={() => setOpen(v => !v)}>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Avatar className="h-10 w-10 border-2 border-slate-100 shrink-0">
                            <AvatarFallback className="text-xs font-bold bg-slate-50 text-slate-500">{getInitials(tech.name || "?")}</AvatarFallback>
                        </Avatar>
                        <span className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
                            activeJobs > 0 ? "bg-amber-500" : "bg-emerald-500"
                        )} />
                    </div>
                    <div>
                        <p className="font-bold text-slate-700 text-sm">{tech.name}</p>
                        <p className="text-[10px] text-slate-400 font-semibold capitalize">{tech.role}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                        <div className="text-xs font-black text-slate-700">{activeJobs} active</div>
                        <div className="text-[10px] text-slate-400">{completedJobs} done</div>
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="px-4 pb-4 space-y-3">
                            <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
                                <div className="bg-blue-50 rounded-xl p-2">
                                    <div className="font-black text-blue-700 text-base">{activeJobs}</div>
                                    <div className="text-blue-600">Active Jobs</div>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-2">
                                    <div className="font-black text-slate-800 text-base">{completedJobs}</div>
                                    <div className="text-slate-500">Completed</div>
                                </div>
                            </div>
                            {tech.phone && (
                                <a href={`tel:${tech.phone}`} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700">
                                    <Phone className="w-3.5 h-3.5" /> {tech.phone}
                                </a>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function TechnicianTab() {
    const [statusFilter, setStatusFilter] = useState("all");

    // ── Real API Data ──────────────────────────────────────────────────────────
    const { data: usersData, isLoading: usersLoading } = useQuery({
        queryKey: ["admin-users"],
        queryFn: () => usersApi.getAll(),
    });

    const { data: jobsData, isLoading: jobsLoading } = useQuery({
        queryKey: ["job-tickets-technician-view"],
        queryFn: () => jobTicketsApi.getAll("all"),
        refetchInterval: 30_000, // refresh every 30s to stay current
    });

    const isLoading = usersLoading || jobsLoading;

    // Filter to only technician-role users
    const usersList = Array.isArray(usersData) ? usersData : (usersData as any)?.items ?? [];
    const techOnly = usersList.filter((u: any) => u.role === "Technician");

    const allJobs: JobTicket[] = jobsData?.items ?? [];
    const activeJobsList = allJobs.filter(j => !["Completed", "Delivered"].includes(j.status ?? ""));
    const completedToday = allJobs.filter(j => {
        const done = j.completedAt ? new Date(j.completedAt) : null;
        const today = new Date();
        return ["Completed", "Delivered"].includes(j.status ?? "") &&
            done && done.toDateString() === today.toDateString();
    }).length;
    const availableTechs = techOnly.filter((t: any) => {
        const hasActive = allJobs.some(j =>
            (j.assignedTechnicianId === t.id ||
                (j.technician && j.technician.toLowerCase().includes(t.name?.toLowerCase()))) &&
            !["Completed", "Delivered"].includes(j.status ?? "")
        );
        return !hasActive;
    }).length;

    // Filter jobs to show in queue
    const filteredJobs = statusFilter === "all"
        ? activeJobsList
        : allJobs.filter(j => j.status === statusFilter);

    // Compute workload % per technician (active/total jobs)
    const getWorkload = (tech: any) => {
        const myJobs = allJobs.filter(j =>
            j.assignedTechnicianId === tech.id ||
            (j.technician && j.technician.toLowerCase().includes(tech.name?.toLowerCase()))
        );
        if (myJobs.length === 0) return 0;
        const active = myJobs.filter(j => !["Completed", "Delivered"].includes(j.status ?? "")).length;
        return Math.min(100, Math.round((active / Math.max(myJobs.length, 1)) * 100));
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm font-medium">Loading technician data…</p>
            </div>
        );
    }

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
            {/* Header */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">Technician View</h2>
                    <p className="text-sm text-slate-500">Live job queue, assignments and technician workload</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-slate-400 font-semibold">Live • refreshes every 30s</span>
                </div>
            </motion.div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Active Jobs", value: activeJobsList.length, sub: "In progress now", from: "from-blue-500", to: "to-indigo-600", shadow: "shadow-blue-500/30", icon: Wrench },
                    { label: "Done Today", value: completedToday, sub: "Completed today", from: "from-emerald-500", to: "to-teal-600", shadow: "shadow-emerald-500/30", icon: CheckCircle2 },
                    { label: "Technicians", value: techOnly.length, sub: "Total on team", from: "from-amber-500", to: "to-orange-600", shadow: "shadow-amber-500/30", icon: Star },
                    { label: "Available", value: availableTechs, sub: "Ready to assign", from: "from-violet-500", to: "to-purple-600", shadow: "shadow-violet-500/30", icon: User },
                ].map(({ label, value, sub, from, to, shadow, icon: Icon }) => (
                    <motion.div key={label} variants={itemVariants}>
                        <BentoCard variant="vibrant" className={`bg-gradient-to-br ${from} ${to} ${shadow} h-[130px]`}>
                            <div className="flex flex-col justify-between h-full text-white">
                                <div className="flex items-center justify-between">
                                    <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">{label}</span>
                                    <Icon className="w-4 h-4 text-white/60" />
                                </div>
                                <div>
                                    <div className="text-2xl font-black">{value}</div>
                                    <p className="text-white/70 text-[11px] mt-0.5">{sub}</p>
                                </div>
                            </div>
                        </BentoCard>
                    </motion.div>
                ))}
            </div>

            {/* Main Grid */}
            <div className="grid gap-6 lg:grid-cols-5">
                {/* Job Queue */}
                <motion.div variants={itemVariants} className="lg:col-span-3">
                    <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm rounded-[1.5rem] p-0 overflow-hidden h-full" disableHover>
                        <div className="p-4 sm:p-5 border-b border-slate-50">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4 text-blue-500" />
                                    <h3 className="font-bold text-slate-700 text-sm">Job Queue</h3>
                                </div>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold">
                                    {filteredJobs.length} shown
                                </Badge>
                            </div>
                            {/* Filters */}
                            <div className="flex flex-wrap gap-1.5">
                                {["all", "Pending", "In Progress", "Ready", "Completed"].map(f => (
                                    <button key={f} onClick={() => setStatusFilter(f)}
                                        className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all capitalize",
                                            statusFilter === f
                                                ? "bg-slate-900 text-white border-slate-900"
                                                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                        )}>
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <ScrollArea className="h-[380px]">
                            {filteredJobs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                                    <AlertTriangle className="w-6 h-6" />
                                    <p className="text-sm font-medium">No jobs found</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    <AnimatePresence>
                                        {filteredJobs.slice(0, 50).map((job, i) => (
                                            <motion.div
                                                key={job.id}
                                                variants={tableRowVariants}
                                                initial="hidden"
                                                animate="visible"
                                                exit={{ opacity: 0, x: -10 }}
                                                custom={i}
                                                className="px-4 sm:px-5 py-3.5 hover:bg-slate-50/60 transition-colors group"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                        <div className="flex items-center gap-1.5 pt-1 shrink-0">
                                                            <div className={cn("w-2 h-2 rounded-full shrink-0",
                                                                (job as any).priority === "High" ? PRIORITY_DOT.High :
                                                                    (job as any).priority === "Medium" ? PRIORITY_DOT.Medium : PRIORITY_DOT.Normal
                                                            )} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <p className="text-xs font-black text-slate-400 font-mono">{job.id}</p>
                                                                {job.corporateClientId && (
                                                                    <Badge variant="secondary" className="bg-[var(--corp-blue)] text-white text-[9px] font-black px-1.5 py-0 h-4 border-none">B2B</Badge>
                                                                )}
                                                                <Badge variant="outline"
                                                                    className={cn("text-[9px] font-bold capitalize",
                                                                        STATUS_STYLES[job.status ?? ""] || "bg-slate-50 text-slate-500 border-slate-200"
                                                                    )}>
                                                                    {job.status}
                                                                </Badge>
                                                            </div>
                                                            <p className="font-bold text-slate-700 text-sm mt-0.5 truncate">{job.device}</p>
                                                            <p className="text-[11px] text-slate-400 mt-0.5">{job.customer}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-[10px] font-bold text-slate-500">
                                                            {job.technician ? job.technician.split(" ")[0] : "Unassigned"}
                                                        </p>
                                                        {job.deadline && (
                                                            <p className="text-[10px] font-semibold mt-0.5 text-slate-400">
                                                                {new Date(job.deadline).toLocaleDateString("en-BD", { month: "short", day: "numeric" })}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </ScrollArea>
                    </BentoCard>
                </motion.div>

                {/* Right Panel */}
                <motion.div variants={itemVariants} className="lg:col-span-2 flex flex-col gap-5">
                    {/* Technician Roster — Desktop */}
                    <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm rounded-[1.5rem] p-0 overflow-hidden hidden md:flex flex-col" disableHover>
                        <div className="p-4 border-b border-slate-50 flex items-center gap-2">
                            <User className="w-4 h-4 text-violet-500" />
                            <h3 className="font-bold text-slate-700 text-sm">Technicians ({techOnly.length})</h3>
                        </div>
                        {techOnly.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 text-sm">No technicians found</div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {techOnly.map((tech: any, i: number) => {
                                    const myActive = allJobs.filter(j =>
                                        (j.assignedTechnicianId === tech.id ||
                                            (j.technician && j.technician.toLowerCase().includes(tech.name?.toLowerCase()))) &&
                                        !["Completed", "Delivered"].includes(j.status ?? "")
                                    ).length;
                                    const isBusy = myActive > 0;
                                    return (
                                        <motion.div key={tech.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.07 }}
                                            className="px-4 py-3.5 hover:bg-slate-50/60 transition-colors group flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className="relative">
                                                    <Avatar className="h-9 w-9 border border-slate-100 transition-transform group-hover:scale-110">
                                                        <AvatarFallback className="text-[10px] font-bold bg-slate-50 text-slate-500">{getInitials(tech.name || "?")}</AvatarFallback>
                                                    </Avatar>
                                                    <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white",
                                                        isBusy ? "bg-amber-500" : "bg-emerald-500"
                                                    )} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-700 text-sm leading-tight">{tech.name}</p>
                                                    <p className="text-[10px] text-slate-400">{myActive} active job{myActive !== 1 ? "s" : ""}</p>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className={cn("text-[9px] font-bold capitalize",
                                                isBusy
                                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            )}>
                                                {isBusy ? "Busy" : "Available"}
                                            </Badge>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </BentoCard>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <User className="w-4 h-4 text-violet-500" />
                            <h3 className="font-bold text-slate-700 text-sm">Technicians</h3>
                        </div>
                        {techOnly.map((tech: any) => <TechCard key={tech.id} tech={tech} jobs={allJobs} />)}
                    </div>

                    {/* Workload Overview */}
                    {techOnly.length > 0 && (
                        <BentoCard variant="glass" className="border-slate-200/60 bg-white hidden md:flex flex-col" disableHover>
                            <h3 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500" /> Workload Overview
                            </h3>
                            <div className="space-y-3">
                                {techOnly.map((tech: any) => {
                                    const workload = getWorkload(tech);
                                    return (
                                        <div key={tech.id}>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-slate-600 font-semibold">{(tech.name || "?").split(" ")[0]}</span>
                                                <span className="font-bold text-slate-800">{workload}%</span>
                                            </div>
                                            <Progress value={workload} className="h-2" />
                                        </div>
                                    );
                                })}
                            </div>
                        </BentoCard>
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
}
