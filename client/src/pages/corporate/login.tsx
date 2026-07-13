import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Loader2, ShieldCheck, Mail, Lock, ArrowRight, KeyRound, Eye, EyeOff } from "lucide-react";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { variants } from "@/lib/motion";
import { corporatePasswordResetApi } from "@/lib/api/corporateApi";
import { useCorporateMobileMode } from "@/hooks/useCorporateMobileMode";
export default function CorporateLoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [trustDevice, setTrustDevice] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showReset, setShowReset] = useState(false);
    const [resetUsername, setResetUsername] = useState("");
    const [resetCode, setResetCode] = useState("");
    const [resetPassword, setResetPassword] = useState("");
    const [resetConfirmPassword, setResetConfirmPassword] = useState("");
    const [resetRequestSent, setResetRequestSent] = useState(false);
    const [isResetLoading, setIsResetLoading] = useState(false);
    const { login } = useCorporateAuth();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const isCorporateMobile = useCorporateMobileMode();

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

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsResetLoading(true);
        try {
            await corporatePasswordResetApi.request(resetUsername);
            setResetRequestSent(true);
            toast({
                title: "Reset Request Sent",
                description: "Call Promise admin and ask for your 6-digit reset code.",
            });
        } catch (error: any) {
            toast({
                title: "Reset Request Failed",
                description: error.message || "Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsResetLoading(false);
        }
    };

    const handleCompleteReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsResetLoading(true);
        try {
            await corporatePasswordResetApi.complete({
                username: resetUsername,
                code: resetCode,
                password: resetPassword,
                confirmPassword: resetConfirmPassword,
            });
            toast({
                title: "Password Updated",
                description: "You can now log in with your new password.",
            });
            setPassword("");
            setUsername(resetUsername);
            setShowReset(false);
            setResetCode("");
            setResetPassword("");
            setResetConfirmPassword("");
            setResetRequestSent(false);
        } catch (error: any) {
            toast({
                title: "Password Reset Failed",
                description: error.message || "The code may be invalid or expired.",
                variant: "destructive",
            });
        } finally {
            setIsResetLoading(false);
        }
    };

    if (isCorporateMobile) {
        return (
            <CorporateMobileLogin
                username={username}
                password={password}
                trustDevice={trustDevice}
                showPassword={showPassword}
                showReset={showReset}
                resetUsername={resetUsername}
                resetCode={resetCode}
                resetPassword={resetPassword}
                resetConfirmPassword={resetConfirmPassword}
                resetRequestSent={resetRequestSent}
                isLoading={isLoading}
                isResetLoading={isResetLoading}
                setUsername={setUsername} setPassword={setPassword} setTrustDevice={setTrustDevice} setShowPassword={setShowPassword}
                setShowReset={setShowReset} setResetUsername={setResetUsername} setResetCode={setResetCode} setResetPassword={setResetPassword} setResetConfirmPassword={setResetConfirmPassword}
                handleLogin={handleLogin} handleRequestReset={handleRequestReset} handleCompleteReset={handleCompleteReset}
            />
        );
    }

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
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                            {showReset ? "Reset " : "Portal "}
                            <span className="text-blue-600">{showReset ? "Password" : "Access"}</span>
                        </h2>
                        <p className="text-slate-500 font-medium">
                            {showReset ? "Ask Promise support for a reset code, then set a new password." : "Sign in to view jobs, messages, and account updates."}
                        </p>
                    </div>

                    {!showReset ? (
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Username or Email</Label>
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
                                    <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Password</Label>
                                    <button type="button" onClick={() => {
                                        setResetUsername(username);
                                        setShowReset(true);
                                    }} className="text-xs font-bold text-blue-600 hover:text-blue-700">Forgot?</button>
                                </div>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                        <Lock className="h-5 w-5" />
                                    </div>
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="h-14 pl-12 pr-12 rounded-2xl bg-white border-slate-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
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
                                    Sign In <ArrowRight className="h-5 w-5" />
                                </>
                            )}
                        </Button>
                    </form>
                    ) : (
                    <div className="space-y-6">
                        <form onSubmit={handleRequestReset} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                            <div className="space-y-2">
                                <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Username or Email</Label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                        <Mail className="h-5 w-5" />
                                    </div>
                                    <Input
                                        value={resetUsername}
                                        onChange={(e) => setResetUsername(e.target.value)}
                                        placeholder="Your corporate username"
                                        className="h-14 pl-12 rounded-2xl bg-white border-slate-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium"
                                        required
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                variant="outline"
                                className="w-full h-12 rounded-2xl border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100 font-black"
                                disabled={isResetLoading || !resetUsername}
                            >
                                {isResetLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Request Reset Code"}
                            </Button>
                            {resetRequestSent && (
                                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                                    Request noted. Call Promise admin, verify yourself, and collect the 6-digit code.
                                </div>
                            )}
                        </form>

                        <form onSubmit={handleCompleteReset} className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase tracking-widest text-slate-400">6-Digit Code</Label>
                                    <div className="relative group">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors">
                                            <KeyRound className="h-5 w-5" />
                                        </div>
                                        <Input
                                            value={resetCode}
                                            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                            placeholder="123456"
                                            inputMode="numeric"
                                            className="h-14 pl-12 rounded-2xl bg-white border-slate-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-mono text-lg tracking-[0.25em]"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase tracking-widest text-slate-400">New Password</Label>
                                    <Input
                                        type="password"
                                        value={resetPassword}
                                        onChange={(e) => setResetPassword(e.target.value)}
                                        className="h-14 rounded-2xl bg-white border-slate-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Confirm Password</Label>
                                    <Input
                                        type="password"
                                        value={resetConfirmPassword}
                                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                                        className="h-14 rounded-2xl bg-white border-slate-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all font-medium"
                                        required
                                    />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3"
                                disabled={isResetLoading || resetCode.length !== 6}
                            >
                                {isResetLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : "Set New Password"}
                            </Button>
                            <Button type="button" variant="ghost" className="w-full rounded-2xl" onClick={() => setShowReset(false)}>
                                Back to Login
                            </Button>
                        </form>
                    </div>
                    )}

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

function CorporateMobileLogin(props: any) {
    const fieldClass = "h-12 rounded-xl border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:ring-blue-500";
    return (
        <main className="min-h-[100dvh] overflow-y-auto bg-slate-50 px-4 py-6">
            <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col justify-center">
                <section className="mb-7 rounded-2xl bg-slate-900 p-5 text-white shadow-lg shadow-slate-200">
                    <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600"><Building2 className="h-5 w-5" /></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200">Promise Electronics</p><h1 className="text-lg font-bold">Corporate Portal</h1></div></div>
                    <p className="mt-4 text-sm leading-5 text-slate-300">Jobs, service requests and messages for your organization.</p>
                </section>

                {!props.showReset ? <form onSubmit={props.handleLogin} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div><h2 className="text-xl font-bold text-slate-900">Sign in</h2><p className="mt-1 text-sm text-slate-500">Use your corporate account credentials.</p></div>
                    <div className="space-y-2"><Label>Username or email</Label><Input value={props.username} onChange={(event) => props.setUsername(event.target.value)} autoComplete="username" className={fieldClass} required /></div>
                    <div className="space-y-2"><div className="flex items-center justify-between"><Label>Password</Label><button type="button" onClick={() => { props.setResetUsername(props.username); props.setShowReset(true); }} className="min-h-11 text-xs font-semibold text-[var(--corp-blue)]">Forgot password?</button></div><div className="relative"><Input type={props.showPassword ? "text" : "password"} value={props.password} onChange={(event) => props.setPassword(event.target.value)} autoComplete="current-password" className={`${fieldClass} pr-12`} required /><button type="button" onClick={() => props.setShowPassword(!props.showPassword)} className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center text-slate-500" aria-label={props.showPassword ? "Hide password" : "Show password"}>{props.showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></div>
                    <button type="button" onClick={() => props.setTrustDevice(!props.trustDevice)} className="flex min-h-11 items-center gap-2 text-left text-sm text-slate-600" aria-pressed={props.trustDevice}><span className={`flex h-5 w-5 items-center justify-center rounded-md border ${props.trustDevice ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`}>{props.trustDevice && <ShieldCheck className="h-3.5 w-3.5" />}</span>Trust this device for 30 days</button>
                    <Button type="submit" disabled={props.isLoading} className="min-h-12 w-full rounded-xl bg-[var(--corp-blue)] text-sm font-bold">{props.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign in"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
                </form> : <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div><h2 className="text-xl font-bold text-slate-900">Reset password</h2><p className="mt-1 text-sm text-slate-500">Request a code, then choose a new password.</p></div>
                    <form onSubmit={props.handleRequestReset} className="space-y-3"><div className="space-y-2"><Label>Username or email</Label><Input value={props.resetUsername} onChange={(event) => props.setResetUsername(event.target.value)} className={fieldClass} required /></div><Button type="submit" variant="outline" disabled={props.isResetLoading} className="min-h-11 w-full rounded-xl">Request reset code</Button></form>
                    {props.resetRequestSent && <form onSubmit={props.handleCompleteReset} className="space-y-3 border-t border-slate-100 pt-4"><div className="space-y-2"><Label>6-digit code</Label><Input value={props.resetCode} onChange={(event) => props.setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} className={fieldClass} required /></div><div className="space-y-2"><Label>New password</Label><Input type="password" value={props.resetPassword} onChange={(event) => props.setResetPassword(event.target.value)} className={fieldClass} required /></div><div className="space-y-2"><Label>Confirm password</Label><Input type="password" value={props.resetConfirmPassword} onChange={(event) => props.setResetConfirmPassword(event.target.value)} className={fieldClass} required /></div><Button type="submit" disabled={props.isResetLoading || props.resetCode.length !== 6} className="min-h-12 w-full rounded-xl bg-[var(--corp-blue)] font-bold">{props.isResetLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Set new password"}</Button></form>}
                    <Button type="button" variant="ghost" onClick={() => props.setShowReset(false)} className="min-h-11 w-full">Back to sign in</Button>
                </div>}
            </div>
        </main>
    );
}

// Add these to CorporateLoginPage component if needed, but Label is imported from shadcn
const Label = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
        {children}
    </label>
);
