import { useState } from "react";
import { JobCard } from "./JobCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Search,
    Filter,
    LayoutGrid,
    List,
    Plus,
    SlidersHorizontal,
    ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// Mock Data for the Board
const mockJobs = Array.from({ length: 12 }).map((_, i) => ({
    id: `JOB-2026-${1020 + i}`,
    customer: ["Rahim Ahmed", "Karim Uddin", "Sokina Begum", "Jamal Hossain"][i % 4],
    device: ["Samsung 55\" QLED", "iPhone 13 Pro", "Dell XPS 15", "Sony Bravia OLED"][i % 4],
    issue: ["Display not working", "Battery replacement", "Overheating issue", "No power"][i % 4],
    status: ["Pending", "In Progress", "Completed", "Urgent"][i % 4],
    priority: ["Medium", "High", "Low", "Urgent"][i % 4] as "Medium" | "High" | "Low" | "Urgent",
    technician: ["Masud", "Rahim", "Unassigned", "Karim"][i % 4],
    deadline: "2026-02-15",
    cost: 4500
}));

export function JobBoard() {
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [searchTerm, setSearchTerm] = useState("");
    const [activeFilter, setActiveFilter] = useState("All");

    const filteredJobs = mockJobs.filter(job =>
        (activeFilter === "All" || job.status === activeFilter) &&
        (job.device.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="h-full flex flex-col gap-6">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by Job ID, Device, or Client..."
                        className="pl-9 bg-white border-slate-200 shadow-sm focus-visible:ring-indigo-500 rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                        <Button
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("grid")}
                            className="h-7 w-7 p-0"
                        >
                            <LayoutGrid size={14} />
                        </Button>
                        <Button
                            variant={viewMode === "list" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setViewMode("list")}
                            className="h-7 w-7 p-0"
                        >
                            <List size={14} />
                        </Button>
                    </div>

                    <Button variant="outline" size="sm" className="hidden sm:flex border-slate-200 shadow-sm rounded-lg text-slate-600 gap-2">
                        <SlidersHorizontal size={14} />
                        Filters
                    </Button>

                    <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 rounded-xl gap-2 ml-auto">
                        <Plus size={16} />
                        New Job
                    </Button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex gap-6 flex-1 min-h-0">

                {/* Left Rail - Smart Filters */}
                <div className="w-64 hidden lg:flex flex-col gap-6 shrink-0">
                    {/* Status Buckets */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">Status</h3>
                        <div className="space-y-1">
                            {["All", "Pending", "In Progress", "Completed", "Urgent"].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setActiveFilter(status)}
                                    className={cn(
                                        "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex justify-between items-center group",
                                        activeFilter === status
                                            ? "bg-indigo-50 text-indigo-700"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    {status}
                                    <span className={cn(
                                        "text-xs px-2 py-0.5 rounded-full",
                                        activeFilter === status ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400 group-hover:text-slate-600"
                                    )}>
                                        {status === "All" ? mockJobs.length : mockJobs.filter((j: any) => j.status === status).length}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tech Filter */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex-1">
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-2">Technicians</h3>
                        <div className="space-y-3">
                            {["Masud", "Rahim", "Karim"].map(tech => (
                                <div key={tech} className="flex items-center gap-3 px-2 py-1 cursor-pointer hover:bg-slate-50 rounded-lg transition-colors">
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 font-semibold text-xs border border-indigo-50">
                                        {tech[0]}
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-slate-700">{tech}</div>
                                        <div className="text-[10px] text-slate-400">12 Active Jobs</div>
                                    </div>
                                    <div className="h-2 w-2 rounded-full bg-green-500 ring-2 ring-white"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Board / Grid */}
                <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <motion.div
                        layout
                        className={cn(
                            "grid gap-4 pb-20",
                            viewMode === "grid"
                                ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                                : "grid-cols-1"
                        )}
                    >
                        <AnimatePresence>
                            {filteredJobs.map(job => (
                                <JobCard key={job.id} job={job} />
                            ))}
                        </AnimatePresence>
                    </motion.div>

                    {filteredJobs.length === 0 && (
                        <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                            <Filter className="h-10 w-10 mb-2 opacity-20" />
                            <p>No jobs found matching your filters</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
