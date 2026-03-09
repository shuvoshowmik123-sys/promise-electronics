import { useState, useEffect } from "react";
import { formatDistanceToNow, isPast, differenceInHours } from "date-fns";
import { Clock, AlertTriangle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SlaTimerProps {
    deadline: string | Date | null;
    status: string; // To stop the timer if delivered/completed
    className?: string;
}

export function SlaTimer({ deadline, status, className }: SlaTimerProps) {
    const [timeLeft, setTimeLeft] = useState<string>("");
    const [urgency, setUrgency] = useState<"safe" | "warning" | "critical" | "breached" | "done">("safe");

    useEffect(() => {
        if (!deadline) return;

        // If job is already finished, freeze the timer visually
        if (["Ready", "Delivered", "Completed", "Cancelled"].includes(status)) {
            setUrgency("done");
            setTimeLeft("");
            return;
        }

        const calculateTime = () => {
            const targetDate = new Date(deadline);
            const now = new Date();

            if (isPast(targetDate)) {
                setUrgency("breached");
                setTimeLeft(`Breached by ${formatDistanceToNow(targetDate)}`);
                return;
            }

            const hoursLeft = differenceInHours(targetDate, now);

            if (hoursLeft <= 4) {
                setUrgency("critical");
            } else if (hoursLeft <= 24) {
                setUrgency("warning");
            } else {
                setUrgency("safe");
            }

            setTimeLeft(formatDistanceToNow(targetDate, { addSuffix: true }));
        };

        calculateTime();
        const interval = setInterval(calculateTime, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [deadline, status]);

    if (!deadline || urgency === "done") return null;

    const styles = {
        safe: "bg-emerald-50 text-emerald-700 border-emerald-200",
        warning: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse",
        critical: "bg-red-50 text-red-700 border-red-200 animate-pulse font-bold flex items-center gap-1",
        breached: "bg-red-600 text-white shadow-sm shadow-red-500/50 font-bold flex items-center gap-1 animate-pulse",
        done: "hidden" // Shouldn't render anyway based on early return
    };

    const icons = {
        safe: <Clock className="w-3 h-3 mr-1" />,
        warning: <AlertCircle className="w-3 h-3 mr-1" />,
        critical: <AlertTriangle className="w-3 h-3 mr-1" />,
        breached: <AlertTriangle className="w-3 h-3 mr-1" />,
        done: null
    };

    return (
        <Badge variant="outline" className={cn("text-[10px] tracking-wide", styles[urgency], className)}>
            {icons[urgency]}
            {urgency === "breached" ? "" : "SLA: "} {timeLeft}
        </Badge>
    );
}
