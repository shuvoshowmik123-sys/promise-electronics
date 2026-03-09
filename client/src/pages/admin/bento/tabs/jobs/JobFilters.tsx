import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface JobFiltersProps {
    show: boolean;
    statusFilter: string;
    setStatusFilter: (val: string) => void;
    priorityFilter: string;
    setPriorityFilter: (val: string) => void;
    technicianFilter: string;
    setTechnicianFilter: (val: string) => void;
    hasActiveFilters: boolean;
    clearFilters: () => void;
    technicians: Array<{ id: string; name: string }>;
}

export function JobFilters({
    show,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    technicianFilter,
    setTechnicianFilter,
    hasActiveFilters,
    clearFilters,
    technicians
}: JobFiltersProps) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100 mt-2">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-slate-500 font-medium ml-1">Status</span>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[140px] bg-white border-slate-200"><SelectValue placeholder="All Status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="In Progress">In Progress</SelectItem>
                                    <SelectItem value="Ready">Ready</SelectItem>
                                    <SelectItem value="Delivered">Delivered</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-slate-500 font-medium ml-1">Priority</span>
                            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                <SelectTrigger className="w-[140px] bg-white border-slate-200"><SelectValue placeholder="All Priority" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Priority</SelectItem>
                                    <SelectItem value="High">High</SelectItem>
                                    <SelectItem value="Medium">Medium</SelectItem>
                                    <SelectItem value="Low">Low</SelectItem>
                                    <SelectItem value="Critical">Critical</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs text-slate-500 font-medium ml-1">Technician</span>
                            <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                                <SelectTrigger className="w-[160px] bg-white border-slate-200"><SelectValue placeholder="All Technicians" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Techs</SelectItem>
                                    <SelectItem value="Unassigned">Unassigned</SelectItem>
                                    {technicians.map((tech) => <SelectItem key={tech.id} value={tech.name}>{tech.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {hasActiveFilters && (
                            <div className="flex items-end flex-1 justify-end">
                                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500 hover:text-slate-800">
                                    <X className="w-4 h-4 mr-1" /> Clear
                                </Button>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
