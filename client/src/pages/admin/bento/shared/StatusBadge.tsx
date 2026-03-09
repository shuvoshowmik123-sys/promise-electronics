import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
    const styles: Record<string, string> = {
        // Job & Service Request Statuses
        "Completed": "bg-emerald-100 text-emerald-700 border-emerald-200",
        "Active": "bg-emerald-100 text-emerald-700 border-emerald-200",
        "Inactive": "bg-slate-100 text-slate-500 border-slate-200",
        "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
        "Pending": "bg-amber-100 text-amber-700 border-amber-200",
        "New": "bg-blue-100 text-blue-700 border-blue-200",
        "Reviewed": "bg-sky-100 text-sky-700 border-sky-200",
        "Under Review": "bg-amber-100 text-amber-700 border-amber-200",
        "Approved": "bg-emerald-100 text-emerald-700 border-emerald-200",
        "Converted": "bg-teal-100 text-teal-700 border-teal-200",
        "Work Order": "bg-violet-100 text-violet-700 border-violet-200",
        "Resolved": "bg-teal-100 text-teal-700 border-teal-200",
        "Closed": "bg-slate-100 text-slate-700 border-slate-200",
        "Cancelled": "bg-rose-100 text-rose-700 border-rose-200",
        "Unrepairable": "bg-rose-100 text-rose-700 border-rose-200",
        "Ready": "bg-lime-100 text-lime-700 border-lime-200",

        // Order Statuses
        "Accepted": "bg-green-100 text-green-700 border-green-200",
        "Processing": "bg-indigo-100 text-indigo-700 border-indigo-200",
        "Shipped": "bg-violet-100 text-violet-700 border-violet-200",
        "Delivered": "bg-emerald-100 text-emerald-700 border-emerald-200",
        "Declined": "bg-red-100 text-red-700 border-red-200",
        "Pending Verification": "bg-orange-100 text-orange-700 border-orange-200",

        // Challan/Pickup Statuses
        "Received": "bg-cyan-100 text-cyan-700 border-cyan-200",
        "Dispatched": "bg-purple-100 text-purple-700 border-purple-200",
        "Returned": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",

        // Quote Statuses
        "Quoted": "bg-yellow-100 text-yellow-700 border-yellow-200",
        "Rejected": "bg-red-100 text-red-700 border-red-200",

        // HR & Offboarding Statuses
        "Pending Compensation": "bg-amber-100 text-amber-700 border-amber-200",
        "On Notice": "bg-orange-100 text-orange-700 border-orange-200",
        "Resigned": "bg-rose-100 text-rose-700 border-rose-200",
        "Terminated": "bg-red-100 text-red-800 border-red-300",

        // Draft & Misc
        "Draft": "bg-slate-100 text-slate-500 border-slate-200",
        "Sent": "bg-blue-100 text-blue-700 border-blue-200",
    };

    return (
        <span className={cn(
            "px-2.5 py-1 rounded-full text-xs font-semibold border",
            styles[status] || "bg-slate-100 text-slate-600 border-slate-200",
            className
        )}>
            {status}
        </span>
    )
}
