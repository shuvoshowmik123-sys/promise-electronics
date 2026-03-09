import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { Loader2, Lock, User, Zap, TrendingUp, Users, Activity, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { variants, transitions } from "@/lib/motion";

export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const { user, login, isAuthenticated, isLoading: authLoading } = useAdminAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      if (user.role === 'Technician') {
        setLocation("/tech");
      } else {
        setLocation("/admin");
      }
    }
  }, [authLoading, isAuthenticated, user, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setHasError(true);
      toast.error("Please enter username and password");
      setTimeout(() => setHasError(false), 500); // Reset shake
      return;
    }

    setIsLoading(true);
    setHasError(false);
    try {
      const loggedInUser = await login(username, password);
      toast.success("Login successful!");
      if (loggedInUser && loggedInUser.role === 'Technician') {
        setLocation("/tech");
      } else {
        setLocation("/admin");
      }
    } catch (error: any) {
      setHasError(true);
      toast.error(error.message || "Login failed");
      setTimeout(() => setHasError(false), 500);
    } finally {
      setIsLoading(false);
    }
  };



  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      variants={variants.pageEnter}
      initial="initial"
      animate="animate"
      exit="exit"
      className="min-h-screen flex flex-col lg:flex-row overflow-hidden"
    >
      {/* Left Panel - Brand & Stats (Desktop) / Top Hero (Mobile) */}
      <div className="relative lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8 lg:p-16 lg:min-h-screen">
        {/* Decorative Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-600/5 rounded-full blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
          />
        </div>

        <div className="relative z-10 w-full max-w-md space-y-8">
          {/* Brand Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/10 backdrop-blur-sm rounded-3xl border border-emerald-500/20 mb-6">
              <Zap className="w-10 h-10 text-emerald-400" />
            </div>

            <div>
              <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
                PROMISE
              </h1>
              <h2 className="text-4xl lg:text-5xl font-black text-emerald-400 tracking-tight">
                ELECTRONICS
              </h2>
              <p className="text-slate-400 text-lg mt-2 font-medium">Admin Control Center</p>
            </div>
          </motion.div>

          {/* Bento Grid Stats - Hidden on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:grid grid-cols-2 gap-4"
          >
            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/50 hover:bg-slate-800/60 transition-all duration-300">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Jobs</p>
                </div>
                <p className="text-3xl font-black text-white">247</p>
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <TrendingUp className="w-3 h-3" />
                  <span>+12% today</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/50 hover:bg-slate-800/60 transition-all duration-300">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Technicians</p>
                </div>
                <p className="text-3xl font-black text-white">12</p>
                <p className="text-xs text-slate-500">8 active now</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/50 hover:bg-slate-800/60 transition-all duration-300">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">System Uptime</p>
                </div>
                <p className="text-3xl font-black text-white">99.9%</p>
                <p className="text-xs text-slate-500">Last 30 days</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/40 backdrop-blur-sm border-slate-700/50 hover:bg-slate-800/60 transition-all duration-300">
              <CardContent className="p-6 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">24/7 Support</p>
                </div>
                <p className="text-3xl font-black text-white">Live</p>
                <p className="text-xs text-emerald-400">Always available</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-16 bg-slate-50 relative rounded-t-3xl lg:rounded-none -mt-8 lg:mt-0 shadow-[0_-10px_30px_rgba(0,0,0,0.15)] lg:shadow-none z-10 min-h-[60vh] lg:min-h-0 overflow-y-auto">
        <motion.div
          variants={variants.sectionEnter}
          initial="initial"
          animate="animate"
          className="w-full max-w-md space-y-8"
        >
          {/* Header */}
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-3xl font-black text-slate-900">Welcome back</h2>
            <p className="text-slate-600">Sign in to your admin dashboard</p>
          </div>

          {/* Login Form */}
          <motion.form
            onSubmit={handleSubmit}
            className="space-y-6"
            animate={hasError ? variants.errorShake.animate : ""}
            variants={variants.errorShake}
          >
            <motion.div
              variants={variants.staggerContainer}
              initial="initial"
              animate="animate"
              className="space-y-4"
            >
              <motion.div variants={variants.staggerItem} className="space-y-2">
                <Label htmlFor="username" className="text-sm font-bold text-slate-700">Username</Label>
                <motion.div {...variants.fieldFocus} className="relative rounded-xl">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-12 pl-12 rounded-xl border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/20"
                    disabled={isLoading}
                    data-testid="input-admin-username"
                  />
                </motion.div>
              </motion.div>

              <motion.div variants={variants.staggerItem} className="space-y-2">
                <Label htmlFor="password" className="text-sm font-bold text-slate-700">Password</Label>
                <motion.div {...variants.fieldFocus} className="relative rounded-xl">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pl-12 rounded-xl border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/20"
                    disabled={isLoading}
                    data-testid="input-admin-password"
                  />
                </motion.div>
              </motion.div>
            </motion.div>

            <motion.div variants={variants.staggerItem} initial="initial" animate="animate">
              <motion.button
                {...variants.buttonTap}
                type="submit"
                className="w-full flex items-center justify-center h-12 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-base shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40 disabled:opacity-70 disabled:cursor-not-allowed"
                disabled={isLoading}
                data-testid="button-admin-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </motion.button>
            </motion.div>
          </motion.form>



          {/* Footer */}
          <div className="text-center pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} Promise Electronics BD. All rights reserved.
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
