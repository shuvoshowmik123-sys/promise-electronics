import { motion } from "framer-motion";
import {
    Clock,
    MoreVertical,
    Phone,
    MapPin,
    Calendar,
    User,
    AlertCircle,
    MessageSquare,
    ArrowRight
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export interface JobCardProps {
    job: {
        id: string;
        customer: string;
        device: string;
        issue: string;
        status: string;
        priority: "Low" | "Medium" | "High" | "Urgent";
        technician?: string;
        deadline?: string;
        cost?: number;
    };
    onClick?: () => void;
}

const statusColors: Record<string, string> = {
    "Pending": "bg-orange-100 text-orange-700 border-orange-200",
    "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
    "Completed": "bg-green-100 text-green-700 border-green-200",
    "Cancelled": "bg-slate-100 text-slate-700 border-slate-200",
    "Delivered": "bg-purple-100 text-purple-700 border-purple-200",
};

const priorityColors: Record<string, string> = {
    "Low": "border-l-slate-300",
    "Medium": "border-l-blue-400",
    "High": "border-l-orange-500",
    "Urgent": "border-l-red-500",
};

export function JobCard({ job, onClick }: JobCardProps) {
    return (
        <motion.div
            layoutId={job.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, boxShadow: "0 10px 30px -10px rgba(0,0,0,0.1)" }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onClick={onClick}
            className={cn(
                "group relative bg-white p-4 rounded-xl border border-slate-100 shadow-sm cursor-pointer overflow-hidden",
                "border-l-[4px]",
                priorityColors[job.priority] || "border-l-slate-200"
            )}
        >
            {/* Hover Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-slate-50/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            {/* Header */}
            <div className="flex justify-between items-start mb-3 relative z-10">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-slate-400 font-medium tracking-wider uppercase">
                            {job.id}
                        </span>
                        {job.priority === "Urgent" && (
                            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                    </div>
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight line-clamp-1">
                        {job.device}
                    </h3>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-slate-300 hover:text-slate-600">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit Details</DropdownMenuItem>
                        <DropdownMenuItem>Print Ticket</DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">Cancel Job</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Body */}
            <div className="space-y-3 relative z-10">
                {/* Issue Bubble */}
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        <span className="font-medium text-slate-900 mr-1">Issue:</span>
                        {job.issue}
                    </p>
                </div>

                {/* Customer Info */}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <div className="h-6 w-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                        <User size={12} />
                    </div>
                    <span className="truncate max-w-[120px] font-medium text-slate-700">{job.customer}</span>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6 border-2 border-white shadow-sm ring-1 ring-slate-100">
                        <AvatarFallback className={cn("text-[10px]", job.technician === "Unassigned" ? "bg-slate-100 text-slate-400" : "bg-blue-50 text-blue-600")}>
                            {job.technician?.substring(0, 2).toUpperCase() || "NA"}
                        </AvatarFallback>
                    </Avatar>
                    <div className="text-[10px] text-slate-400">
                        {job.technician === "Unassigned" ? "No Tech" : job.technician}
                    </div>
                </div>

                <Badge className={cn("text-[10px] px-2 py-0.5 h-5 font-semibold shadow-none", statusColors[job.status] || "bg-slate-100 text-slate-600")}>
                    {job.status}
                </Badge>
            </div>

            {/* Hover Action */}
            <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 pointer-events-none">
                <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg">
                    <ArrowRight size={14} />
                </div>
            </div>
        </motion.div>
    );
}
