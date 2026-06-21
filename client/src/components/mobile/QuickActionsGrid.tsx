import { Link } from "wouter";
import { Calendar, MessageSquare, Search, ShoppingCart } from "lucide-react";
import { motion } from "framer-motion";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

export function QuickActionsGrid() {
  const { t } = useCustomerLanguage();

  const actions = [
    { label: t("qa.bookRepair"), helper: t("qa.scheduleService"), icon: Calendar, href: "/repair" },
    { label: t("qa.trackJob"),   helper: t("qa.statusUpdates"),   icon: Search,   href: "/track-order" },
    { label: t("qa.support"),    helper: t("qa.getHelp"),         icon: MessageSquare, href: "/support" },
    { label: t("qa.shopParts"),  helper: t("qa.buyParts"),        icon: ShoppingCart,  href: "/shop" },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3">
      {actions.map((action, index) => (
        <Link key={index} href={action.href}>
          <motion.div
            whileTap={{ scale: 0.95 }}
            className="flex min-h-[116px] flex-col justify-between rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm transition-all active:bg-emerald-50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <action.icon className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-sm font-bold text-slate-900">{action.label}</span>
              <span className="mt-1 block text-xs font-medium text-slate-500">{action.helper}</span>
            </div>
          </motion.div>
        </Link>
      ))}
    </div>
  );
}
