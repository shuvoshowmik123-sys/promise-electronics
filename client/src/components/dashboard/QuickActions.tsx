import { Button } from "@/components/ui/button";
import { Plus, FileText, UserPlus, Settings, Wrench, ShoppingCart } from "lucide-react";
import { useLocation } from "wouter";
import { BentoCard, BentoHeader } from "@/components/ui/bento-grid";

export const QuickActions = () => {
    const [, setLocation] = useLocation();

    const actions = [
        {
            label: "New Job",
            icon: Wrench,
            onClick: () => setLocation("/admin/jobs/new"),
            color: "text-blue-500",
            bg: "bg-blue-50 dark:bg-blue-900/20",
        },
        {
            label: "New POS Sale",
            icon: ShoppingCart,
            onClick: () => setLocation("/admin/pos"),
            color: "text-green-500",
            bg: "bg-green-50 dark:bg-green-900/20",
        },
        {
            label: "Add Customer",
            icon: UserPlus,
            onClick: () => setLocation("/admin/users?new=true"),
            color: "text-purple-500",
            bg: "bg-purple-50 dark:bg-purple-900/20",
        },
        {
            label: "Create Quote",
            icon: FileText,
            onClick: () => setLocation("/admin/service-requests"),
            color: "text-orange-500",
            bg: "bg-orange-50 dark:bg-orange-900/20",
        },
    ];

    return (
        <BentoCard colSpan={2} noPadding>
            <div className="p-6">
                <BentoHeader title="Quick Actions" icon={Plus} />
                <div className="grid grid-cols-2 gap-4">
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 group text-left"
                        >
                            <div className={`p-2.5 rounded-lg ${action.bg} ${action.color} group-hover:scale-110 transition-transform`}>
                                <action.icon className="w-5 h-5" />
                            </div>
                            <span className="font-medium text-sm text-slate-700 dark:text-slate-300">{action.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </BentoCard>
    );
};
