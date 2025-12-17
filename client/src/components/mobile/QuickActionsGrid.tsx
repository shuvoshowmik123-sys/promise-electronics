import { Link } from "wouter";
import { Calendar, ShoppingCart, Search, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

export function QuickActionsGrid() {
    const actions = [
        { label: "Book Repair", icon: Calendar, href: "/repair", color: "text-blue-500" },
        { label: "Shop Parts", icon: ShoppingCart, href: "/shop", color: "text-purple-500" },
        { label: "Track Order", icon: Search, href: "/track-order", color: "text-orange-500" },
        { label: "Support", icon: MessageSquare, href: "/support", color: "text-green-500" },
    ];

    return (
        <div className="grid grid-cols-2 gap-4 mb-8">
            {actions.map((action, index) => (
                <Link key={index} href={action.href}>
                    <motion.div
                        whileTap={{ scale: 0.95 }}
                        className="bg-slate-100 rounded-xl p-4 shadow-neumorph flex flex-col items-center justify-center gap-3 aspect-[4/3] active:shadow-neumorph-inset transition-all"
                    >
                        <div className={`p-3 rounded-full bg-slate-100 shadow-neumorph ${action.color}`}>
                            <action.icon className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold text-slate-700">{action.label}</span>
                    </motion.div>
                </Link>
            ))}
        </div>
    );
}
