import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Loader2, ShieldCheck, Mail, Lock, ArrowRight, ChevronRight } from "lucide-react";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { variants } from "@/lib/motion";
export default function CorporateLoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [trustDevice, setTrustDevice] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useCorporateAuth();
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await login(username, password, trustDevice);
            toast({
                title: "Welcome Back",
                description: "Initializing your corporate workspace...",
            });
            setLocation("/corporate/dashboard");
        } catch (error: any) {
            toast({
                title: "Authentication Failed",
                description: error.message || "Please verify your credentials and try again.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <motion.div variants={variants.pageEnter} initial="initial" animate="animate" exit="exit" className="min-h-screen bg-slate-50 flex overflow-hidden">
            {/* Left Side: Aesthetic / Branding */}
            <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative items-center justify-center p-24 overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.15),transparent)] pointer-events-none" />
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

                <motion.div
                    variants={variants.sectionEnter}
                    className="relative z-10 space-y-8 max-w-lg"
                >
                    <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(37,99,235,0.3)]">
                        <Building2 className="w-10 h-10 text-white" />
                    </div>
                    <div className="space-y-4">
                        <h1 className="text-5xl font-black text-white tracking-tight leading-[1.1]">
                            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">PROMISE</span> CORPORATE PORTAL
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent"></span>
                            <span className="text-lg font-medium text-slate-400">We Assure Excellence</span>
                            <span className="w-8 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent"></span>
                        </div>
                        <p className="text-xl text-slate-400 font-medium leading-relaxed">
                            Exclusive partner access to enterprise electronics ecosystem
                        </p>
                    </div>
                    <div className="pt-8 flex items-center gap-4">
                        <div className="flex -space-x-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                    {String.fromCharCode(64 + i)}
                                </div>
                            ))}
                        </div>
                        <p className="text-sm font-bold text-slate-500">Trusted by 50+ global enterprise partners</p>
                    </div>
                </motion.div>

                {/* Decorative Grid */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            {/* Right Side: Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-12">
                <motion.div
                    variants={variants.sectionEnter}
                    className="w-full max-w-md space-y-10"
                >
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Portal <span className="text-blue-600">Access</span></h2>
                        <p className="text-slate-500 font-medium">Verify your credentials to enter the workspace.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Internal Identifier</Label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                        <Mail className="h-5 w-5" />
                                    </div>
                                    <Input
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Username or Email"
                                        className="h-14 pl-12 rounded-2xl bg-white border-slate-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Security Key</Label>
                                    <a href="mailto:support@promise-electronics.com" className="text-xs font-bold text-blue-600 hover:text-blue-700">Forgot?</a>
                                </div>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                        <Lock className="h-5 w-5" />
                                    </div>
                                    <Input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="h-14 pl-12 rounded-2xl bg-white border-slate-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div
                            className="flex items-center gap-2 py-2 cursor-pointer group w-fit"
                            onClick={() => setTrustDevice(!trustDevice)}
                        >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                                ${trustDevice ? 'border-blue-500 bg-blue-500' : 'border-slate-200 group-hover:border-blue-500 bg-transparent'}`}
                            >
                                <ShieldCheck className={`w-3 h-3 text-white transition-opacity ${trustDevice ? 'opacity-100' : 'opacity-0'}`} />
                            </div>
                            <span className="text-xs font-bold text-slate-400 select-none group-hover:text-slate-500 transition-colors">
                                Trust this device for 30 days
                            </span>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg transition-all shadow-xl shadow-slate-200 corp-btn-glow flex items-center justify-center gap-3"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                            ) : (
                                <>
                                    Verify & Access <ArrowRight className="h-5 w-5" />
                                </>
                            )}
                        </Button>
                    </form>

                    <div className="pt-10 border-t border-slate-100 flex flex-col items-center gap-6">
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Enterprise Support</p>
                        <div className="flex gap-8">
                            <button
                                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-sm"
                                onClick={() => setLocation("/corporate/messages")}
                            >
                                Incident Report
                            </button>
                            <button
                                className="text-slate-400 hover:text-slate-600 transition-colors font-bold text-sm"
                                onClick={() => setLocation("/corporate/jobs")}
                            >
                                Service Status
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

// Add these to CorporateLoginPage component if needed, but Label is imported from shadcn
const Label = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
        {children}
    </label>
);
