import { motion } from "framer-motion";
import { CheckCircle2, Package, Phone, Search, Wrench } from "lucide-react";
import type { ServiceRequest } from "@shared/schema";

interface TrackingTimelineProps {
    order: ServiceRequest;
}

export function TrackingTimeline({ order }: TrackingTimelineProps) {
    const stages = [
        { id: "received", label: "Received", icon: Package, activeStates: ["Request Received", "Arriving to Receive", "Awaiting Drop-off", "Received", "intake", "assessment", "device_received"] },
        { id: "diagnosing", label: "Diagnosing", icon: Search, activeStates: ["Technician Assigned", "Diagnosis Completed", "assessment", "authorized"] },
        { id: "repairing", label: "Repairing", icon: Wrench, activeStates: ["Parts Pending", "Repairing", "in_repair"] },
        { id: "ready", label: "Ready", icon: CheckCircle2, activeStates: ["Ready for Delivery", "Delivered", "ready", "completed", "out_for_delivery"] },
    ];

    const currentStatus = order.stage || order.trackingStatus || "";
    let activeIndex = 0;
    for (let index = stages.length - 1; index >= 0; index -= 1) {
        if (stages[index].activeStates.some((state) => state === currentStatus || currentStatus.includes(state))) {
            activeIndex = index;
            break;
        }
    }

    return (
        <div className="px-2 py-6">
            <div className="relative">
                <div className="absolute bottom-10 left-6 top-4 w-1 rounded-full bg-emerald-100" />

                <div className="relative space-y-8">
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
                                <div className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full transition-all duration-500 ${isActive
                                    ? "scale-110 bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                                    : isCompleted
                                        ? "bg-emerald-500 text-white"
                                        : "border-2 border-emerald-100 bg-white text-slate-300"
                                    }`}>
                                    <Icon className="h-5 w-5" />
                                    {isActive && (
                                        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/30" />
                                    )}
                                </div>

                                <div className={`flex-1 rounded-3xl p-4 transition-all duration-300 ${isActive ? "border border-emerald-100 bg-white shadow-sm" : "opacity-60"}`}>
                                    <h4 className={`font-bold ${isActive ? "text-slate-800" : "text-slate-500"}`}>
                                        {stage.label}
                                    </h4>
                                    {isActive && (
                                        <p className="mt-1 text-xs font-medium text-emerald-700">Current Stage</p>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="mt-8 flex items-center gap-4 rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm"
            >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <Phone className="h-6 w-6" />
                </div>
                <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Need help?</p>
                    <h3 className="font-bold text-slate-800">Call Promise Electronics</h3>
                    <p className="text-xs text-slate-500">We will confirm technician details by phone.</p>
                </div>
                <a
                    href="tel:+8801700000000"
                    className="rounded-full bg-emerald-600 p-3 text-white shadow-lg shadow-emerald-200 transition-transform active:scale-95"
                    aria-label="Call support"
                >
                    <Phone className="h-5 w-5" />
                </a>
            </motion.div>
        </div>
    );
}
