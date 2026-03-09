import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LayoutDashboard, ClipboardList, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Corporate Portal 404 — "Disconnected Node"
 *
 * A professional, minimal 404 page for corporate users.
 * Features an animated SVG network graph where one node blinks "disconnected".
 */
export default function CorporateNotFound() {
    const [, navigate] = useLocation();

    const actions = [
        { label: "Dashboard", icon: LayoutDashboard, path: "/corporate/dashboard" },
        { label: "Job Tracker", icon: ClipboardList, path: "/corporate/jobs" },
        { label: "Contact Support", icon: MessageSquare, path: "/corporate/messages" },
    ];

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
            {/* ── Animated Network Graph ── */}
            <motion.div
                className="mb-8"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6 }}
            >
                <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Disconnected network visualization">
                    {/* Connecting lines */}
                    <line x1="100" y1="80" x2="40" y2="30" stroke="var(--corp-blue)" strokeWidth="2" strokeOpacity="0.3" />
                    <line x1="100" y1="80" x2="160" y2="30" stroke="var(--corp-blue)" strokeWidth="2" strokeOpacity="0.3" />
                    <line x1="100" y1="80" x2="40" y2="130" stroke="var(--corp-blue)" strokeWidth="2" strokeOpacity="0.3" />

                    {/* Dashed line to disconnected node */}
                    <motion.line
                        x1="100" y1="80" x2="160" y2="130"
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        initial={{ strokeDashoffset: 0 }}
                        animate={{ strokeDashoffset: [0, 20] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    />

                    {/* Center node (hub) */}
                    <motion.circle
                        cx="100" cy="80" r="14"
                        fill="var(--corp-blue)"
                        initial={{ scale: 1 }}
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <circle cx="100" cy="80" r="6" fill="white" />

                    {/* Connected nodes */}
                    <motion.circle cx="40" cy="30" r="10" fill="var(--corp-blue)" fillOpacity="0.8"
                        animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
                    />
                    <motion.circle cx="160" cy="30" r="10" fill="var(--corp-blue)" fillOpacity="0.8"
                        animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.6 }}
                    />
                    <motion.circle cx="40" cy="130" r="10" fill="var(--corp-blue)" fillOpacity="0.8"
                        animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.9 }}
                    />

                    {/* Disconnected node — blinks red/amber */}
                    <motion.circle
                        cx="160" cy="130" r="10"
                        animate={{
                            fill: ["#ef4444", "#f59e0b", "#ef4444"],
                            opacity: [1, 0.5, 1],
                        }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                    />

                    {/* Small "X" on disconnected node */}
                    <motion.g
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                    >
                        <line x1="156" y1="126" x2="164" y2="134" stroke="white" strokeWidth="2" strokeLinecap="round" />
                        <line x1="164" y1="126" x2="156" y2="134" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </motion.g>
                </svg>
            </motion.div>

            {/* ── 404 Text ── */}
            <motion.h1
                className="text-6xl sm:text-7xl font-heading font-extrabold text-[var(--corp-blue)] mb-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
            >
                404
            </motion.h1>

            {/* ── Message ── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.5 }}
            >
                <h2 className="text-lg sm:text-xl font-heading font-semibold text-slate-800 mb-2">
                    This page isn't available
                </h2>
                <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    The page you requested could not be found. It may have been moved or no longer exists.
                </p>
            </motion.div>

            {/* ── Action Buttons ── */}
            <motion.div
                className="flex flex-wrap items-center justify-center gap-3 mt-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
            >
                {actions.map((action) => (
                    <Button
                        key={action.path}
                        variant="outline"
                        className="corp-btn-glow gap-2"
                        onClick={() => navigate(action.path)}
                    >
                        <action.icon className="h-4 w-4" />
                        {action.label}
                    </Button>
                ))}
            </motion.div>

            {/* ── Footer ── */}
            <motion.p
                className="mt-10 text-xs text-slate-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
            >
                © {new Date().getFullYear()} Promise Electronics BD
            </motion.p>
        </div>
    );
}
