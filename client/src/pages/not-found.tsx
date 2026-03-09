import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Search, ShoppingCart, MessageCircle, ArrowLeft, Wrench } from "lucide-react";

/**
 * Custom 404 page – Integrated Bento/Split Design
 * Matches the native blue / bento aesthetic of Promise Electronics
 */
export default function NotFound() {
  const [, navigate] = useLocation();
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowEasterEgg(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  const quickLinks = [
    { label: "Home Page", icon: Home, path: "/", desc: "Return to the main dashboard" },
    { label: "Track Repair", icon: Search, path: "/track-order", desc: "Check your device status" },
    { label: "Shop", icon: ShoppingCart, path: "/shop", desc: "Browse latest electronics" },
    { label: "Support", icon: MessageCircle, path: "/support", desc: "Get help from Daktar Vai" },
  ];

  return (
    <div className="min-h-[85vh] w-full flex align-middle justify-center p-4 sm:p-8">
      <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">

        {/* Left Side: Content & Navigation Bento */}
        <motion.div
          className="flex flex-col gap-6"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Header Block */}
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100/50 text-blue-600 text-sm font-semibold mb-2 shadow-sm">
              <Wrench className="w-4 h-4" />
              <span>System Error 404</span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-heading font-extrabold text-slate-800 tracking-tight leading-tight">
              Page Not <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-teal-500">Found</span>
            </h1>

            <p className="text-lg text-slate-500 max-w-md leading-relaxed">
              We couldn't locate the page you're looking for. It might have been moved, deleted, or you may have mistyped the address.
            </p>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-slate-200 to-transparent my-2" />

          {/* Quick Links Bento Block */}
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
              Try these quick links
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
            Go back to previous page
          </motion.button>
        </motion.div>

        {/* Right Side: Illustration Bento */}
        <motion.div
          className="relative lg:h-[600px] w-full rounded-[2.5rem] bg-gradient-to-br from-blue-50 via-slate-50 to-teal-50/30 border border-white shadow-xl shadow-blue-900/5 flex flex-col items-center justify-center p-8 overflow-hidden"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
        >
          {/* Background decorative elements */}
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
  );
}

