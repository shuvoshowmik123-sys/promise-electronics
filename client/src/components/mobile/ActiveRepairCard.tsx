import { motion } from "framer-motion";
import { CheckCircle2, Clock, Wrench, Truck } from "lucide-react";

interface ActiveRepairCardProps {
    device?: string;
    status?: "received" | "diagnosing" | "repairing" | "ready";
    progress?: number;
    ticketId?: string;
}

export function ActiveRepairCard({
    device = "Sony Bravia 55\" 4K",
    status = "repairing",
    progress = 65,
    ticketId = "TR-8821"
}: ActiveRepairCardProps) {

    const getStatusColor = (s: string) => {
        switch (s) {
            case "received": return "text-slate-500";
            case "diagnosing": return "text-orange-500";
            case "repairing": return "text-blue-500";
            case "ready": return "text-green-500";
            default: return "text-slate-500";
        }
    };

    const getStatusLabel = (s: string) => {
        switch (s) {
            case "received": return "Received";
            case "diagnosing": return "Diagnosing";
            case "repairing": return "Repairing";
            case "ready": return "Ready for Pickup";
            default: return "Pending";
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-100 rounded-2xl p-5 shadow-neumorph mb-6 relative overflow-hidden"
        >
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">{device}</h3>
                    <p className="text-xs text-slate-500 font-mono">{ticketId}</p>
                </div>
                <div className={`px-2 py-1 rounded-lg bg-white shadow-neumorph-inset text-xs font-bold ${getStatusColor(status)}`}>
                    {getStatusLabel(status)}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-3 bg-slate-200 rounded-full shadow-neumorph-inset overflow-hidden mb-2">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="absolute top-0 left-0 h-full bg-primary rounded-full"
                />
            </div>

            <div className="flex justify-between text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                <span>Received</span>
                <span>Ready</span>
            </div>

            {/* Decor */}
            <div className="absolute -right-4 -bottom-4 text-slate-200/50 rotate-12">
                <Wrench className="w-24 h-24" />
            </div>
        </motion.div>
    );
}
