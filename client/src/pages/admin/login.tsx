import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth, getRoleLandingPath } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { Loader2, Lock, User, Zap, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { variants } from "@/lib/motion";

export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const { user, login, isAuthenticated, isLoading: authLoading } = useAdminAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      setLocation(getRoleLandingPath(user.role));
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
      const loggedInUser = await login(username, password, rememberMe);
      toast.success("Login successful!");
      setLocation(getRoleLandingPath(loggedInUser.role));
    } catch (error: unknown) {
      setHasError(true);
      toast.error(error instanceof Error ? error.message : "Login failed");
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
      className="min-h-screen flex flex-col lg:flex-row overflow-x-hidden lg:overflow-hidden bg-slate-50 lg:bg-white"
    >
      {/* Left Panel - Brand (desktop only) */}
      <div className="hidden lg:flex relative lg:w-1/2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 items-center justify-center p-8 lg:p-16 lg:min-h-screen">
        {/* Decorative Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/5 rounded-full blur-[100px]" />
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
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500/10 backdrop-blur-sm rounded-3xl border border-blue-500/20 mb-6">
              <Zap className="w-10 h-10 text-blue-400" />
            </div>

            <div>
              <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
                PROMISE
              </h1>
              <h2 className="text-4xl lg:text-5xl font-black text-blue-400 tracking-tight">
                ELECTRONICS
              </h2>
              <p className="text-slate-400 text-lg mt-2 font-medium">Admin Control Center</p>
              <p className="text-slate-500 text-sm mt-4 max-w-xs">TV repair shop management — jobs, inventory, POS, and operations in one place.</p>
            </div>
          </motion.div>

        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-5 py-8 lg:p-16 bg-slate-50 relative z-10"
        style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <motion.div
          variants={variants.sectionEnter}
          initial="initial"
          animate="animate"
          className="w-full max-w-md"
        >
          {/* Mobile brand row (mobile only) */}
          <div className="lg:hidden flex flex-col items-center text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/25 mb-3">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight leading-none text-slate-900">
              PROMISE <span className="text-blue-600">ELECTRONICS</span>
            </h1>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-1.5">Admin Control</p>
          </div>

          {/* Login card — card chrome on mobile, transparent on desktop */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(37,99,235,0.08)] p-6 space-y-7 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none lg:p-0 lg:space-y-8">
          {/* Header */}
          <div className="space-y-1.5 text-center lg:text-left">
            <h2 className="text-2xl lg:text-3xl font-black text-slate-900">Welcome back</h2>
            <p className="text-sm lg:text-base text-slate-600">Use your admin credentials to continue.</p>
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
                    className="h-12 pl-12 rounded-xl border-slate-200 bg-white focus:border-blue-500 focus:ring-blue-500/20"
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
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 pl-12 pr-12 rounded-xl border-slate-200 bg-white focus:border-blue-500 focus:ring-blue-500/20"
                    disabled={isLoading}
                    data-testid="input-admin-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </motion.div>
              </motion.div>

              <motion.div variants={variants.staggerItem}>
                <button
                  type="button"
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-2.5 py-1 group w-fit"
                  aria-pressed={rememberMe}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${rememberMe ? 'border-blue-600 bg-blue-600' : 'border-slate-300 group-hover:border-blue-500 bg-transparent'}`}>
                    <ShieldCheck className={`w-3 h-3 text-white transition-opacity ${rememberMe ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                  <span className="text-left select-none">
                    <span className="block text-sm font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Remember this device</span>
                    <span className="block text-xs text-slate-400">Stay signed in for 30 days</span>
                  </span>
                </button>
              </motion.div>
            </motion.div>

            <motion.div variants={variants.staggerItem} initial="initial" animate="animate">
              <motion.button
                {...variants.buttonTap}
                type="submit"
                className="w-full flex items-center justify-center h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-base shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/40 disabled:opacity-70 disabled:cursor-not-allowed"
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
          </div>

          {/* Footer — outside the card */}
          <div className="text-center mt-6">
            <p className="text-xs font-semibold text-slate-400">Authorized staff only</p>
            <p className="text-[11px] text-slate-400 mt-1">
              © {new Date().getFullYear()} Promise Electronics BD. All rights reserved.
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
