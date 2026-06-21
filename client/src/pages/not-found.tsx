import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Search, ShoppingCart, MessageCircle, ArrowLeft, Wrench } from "lucide-react";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

export default function NotFound() {
  const [, navigate] = useLocation();
  const { t } = useCustomerLanguage();
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowEasterEgg(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  const quickLinks = [
    { label: t("notFound.home"), icon: Home, path: "/", desc: t("notFound.homeDesc") },
    { label: t("notFound.trackRepair"), icon: Search, path: "/track-order", desc: t("notFound.trackDesc") },
    { label: t("notFound.shop"), icon: ShoppingCart, path: "/shop", desc: t("notFound.shopDesc") },
    { label: t("notFound.support"), icon: MessageCircle, path: "/support", desc: t("notFound.supportDesc") },
  ];

  return (
    <>
      <div className="md:hidden min-h-[85vh] w-full flex align-middle justify-center p-4 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="max-w-lg w-full mx-auto flex flex-col gap-4" data-testid="not-found-mobile">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {t("notFound.quickLinks")}
            </h3>

            <div className="grid grid-cols-2 gap-3" data-testid="mobile-quick-links">
              {quickLinks.map((link, i) => (
                <motion.div
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className="group relative flex flex-col items-center gap-2 p-3 bg-white border border-slate-100 rounded-xl cursor-pointer hover:border-blue-200 hover:shadow-md transition-all duration-300 text-center"
                  whileHover={{ y: -2 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + (i * 0.08) }}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <link.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-slate-800 group-hover:text-blue-600 transition-colors">
                      {link.label}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {link.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="flex flex-col items-center text-center gap-3"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            data-testid="mobile-header"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100/50 text-blue-600 text-xs font-semibold shadow-sm">
              <Wrench className="w-3.5 h-3.5" />
              <span>{t("notFound.error")}</span>
            </div>

            <h1 className="text-4xl font-heading font-extrabold text-slate-800 tracking-tight leading-tight">
              {t("notFound.title")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500">{t("notFound.titleAccent")}</span>
            </h1>

            <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
              {t("notFound.desc")}
            </p>
          </motion.div>

          <motion.img
            src="/images/daktar-vai-404.png"
            alt="Daktar Vai Troubleshooting"
            className="w-28 h-auto object-contain mx-auto"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: [0, -6, 0] }}
            transition={{ opacity: { delay: 0.3, duration: 0.5 }, y: { duration: 3, repeat: Infinity, ease: "easeInOut" } }}
            data-testid="mobile-illustration"
          />

          <motion.button
            onClick={() => window.history.back()}
            className="flex items-center justify-center gap-2 text-slate-500 hover:text-blue-600 font-medium transition-colors w-full group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            data-testid="mobile-go-back"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            {t("notFound.goBack")}
          </motion.button>

          <AnimatePresence>
            {showEasterEgg && (
              <motion.div
                className="mx-auto text-center bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white shadow-sm"
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <p className="text-xs font-medium text-slate-600">
                  <span className="text-blue-600 font-bold">Daktar Vai says:</span> "Even the best circuits have loose connections sometimes!" 🔌
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="hidden md:block min-h-[85vh] w-full flex align-middle justify-center p-4 sm:p-8">
        <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <motion.div
            className="flex flex-col gap-6"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100/50 text-blue-600 text-sm font-semibold mb-2 shadow-sm">
                <Wrench className="w-4 h-4" />
                <span>{t("notFound.error")}</span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-heading font-extrabold text-slate-800 tracking-tight leading-tight">
                {t("notFound.title")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500">{t("notFound.titleAccent")}</span>
              </h1>

              <p className="text-lg text-slate-500 max-w-md leading-relaxed">
                {t("notFound.desc")}
              </p>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-slate-200 to-transparent my-2" />

            <div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                {t("notFound.quickLinks")}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {quickLinks.map((link, i) => (
                  <motion.div
                    key={link.path}
                    onClick={() => navigate(link.path)}
                    className="group relative flex items-start gap-3 p-4 bg-white border border-slate-100 rounded-2xl cursor-pointer hover:border-blue-200 hover:shadow-lg transition-all duration-300"
                    whileHover={{ y: -3 }}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + (i * 0.1) }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <link.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {link.label}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {link.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.button
              onClick={() => window.history.back()}
              className="mt-4 flex items-center gap-2 text-slate-500 hover:text-blue-600 font-medium transition-colors w-fit group"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              {t("notFound.goBack")}
            </motion.button>
          </motion.div>

          <motion.div
            className="relative lg:h-[600px] w-full rounded-[2.5rem] bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50/30 border border-white shadow-xl shadow-blue-900/5 flex flex-col items-center justify-center p-8 overflow-hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-400/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

            <motion.img
              src="/images/daktar-vai-404.png"
              alt="Daktar Vai Troubleshooting"
              className="relative z-10 w-full max-w-sm object-contain drop-shadow-2xl"
              initial={{ y: 20 }}
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />

            <AnimatePresence>
              {showEasterEgg && (
                <motion.div
                  className="absolute bottom-8 text-center bg-white/80 backdrop-blur-md px-6 py-3 rounded-full border border-white shadow-sm z-20"
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <p className="text-sm font-medium text-slate-600">
                    <span className="text-blue-600 font-bold">Daktar Vai says:</span> "Even the best circuits have loose connections sometimes!" 🔌
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </>
  );
}
