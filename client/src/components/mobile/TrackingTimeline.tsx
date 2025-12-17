import { motion } from "framer-motion";
import { CheckCircle2, Circle, Clock, MapPin, Package, Search, Truck, User, Wrench } from "lucide-react";
import type { ServiceRequest } from "@shared/schema";

interface TrackingTimelineProps {
    order: ServiceRequest;
}

export function TrackingTimeline({ order }: TrackingTimelineProps) {
    // Simplified stages for mobile view
    const stages = [
        { id: "received", label: "Received", icon: Package, activeStates: ["Request Received", "Arriving to Receive", "Awaiting Drop-off", "Received", "intake", "assessment", "device_received"] },
        { id: "diagnosing", label: "Diagnosing", icon: Search, activeStates: ["Technician Assigned", "Diagnosis Completed", "assessment", "authorized"] },
        { id: "repairing", label: "Repairing", icon: Wrench, activeStates: ["Parts Pending", "Repairing", "in_repair"] },
        { id: "ready", label: "Ready", icon: CheckCircle2, activeStates: ["Ready for Delivery", "Delivered", "ready", "completed", "out_for_delivery"] },
    ];

    const getCurrentStageIndex = () => {
        // Check order.stage (new system) or order.trackingStatus (legacy)
        const currentStatus = order.stage || order.trackingStatus || "";

        // Find the last stage that contains the current status
        // This is a simplified logic for the demo; in production, we'd map exact states
        for (let i = stages.length - 1; i >= 0; i--) {
            if (stages[i].activeStates.some(s => s === currentStatus || currentStatus.includes(s))) {
                return i;
            }
        }
        return 0; // Default to first stage
    };

    const activeIndex = getCurrentStageIndex();

    return (
        <div className="px-4 py-6">
            <div className="relative">
                {/* Vertical Line */}
                <div className="absolute left-6 top-4 bottom-10 w-1 bg-slate-200 rounded-full" />

                <div className="space-y-8 relative">
                    {stages.map((stage, index) => {
                        const isActive = index === activeIndex;
                        const isCompleted = index < activeIndex;
                        const Icon = stage.icon;

                        return (
                            <motion.div
                                key={stage.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex items-center gap-4"
                            >
                                {/* Icon Circle */}
                                <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${isActive ? "bg-primary text-white shadow-lg scale-110" :
                                        isCompleted ? "bg-green-500 text-white" : "bg-slate-100 text-slate-300 border-2 border-slate-200"
                                    }`}>
                                    <Icon className="w-5 h-5" />
                                    {isActive && (
                                        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                                    )}
                                </div>

                                {/* Text */}
                                <div className={`p-4 rounded-xl flex-1 transition-all duration-300 ${isActive ? "bg-white shadow-neumorph" : "opacity-60"
                                    }`}>
                                    <h4 className={`font-bold ${isActive ? "text-slate-800" : "text-slate-500"}`}>
                                        {stage.label}
                                    </h4>
                                    {isActive && (
                                        <p className="text-xs text-primary font-medium mt-1">Current Stage</p>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Technician Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8 bg-slate-100 rounded-2xl p-4 shadow-neumorph flex items-center gap-4"
            >
                <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Technician" />
                </div>
                <div className="flex-1">
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Your Technician</p>
                    <h3 className="font-bold text-slate-800">Karim Ahmed</h3>
                    <div className="flex items-center gap-1 text-xs text-orange-500">
                        <span>★★★★★</span>
                        <span className="text-slate-400">(4.9)</span>
                    </div>
                </div>
                <button className="p-3 rounded-full bg-green-500 text-white shadow-lg active:scale-95 transition-transform">
                    <User className="w-5 h-5" />
                </button>
            </motion.div>
        </div>
    );
}
