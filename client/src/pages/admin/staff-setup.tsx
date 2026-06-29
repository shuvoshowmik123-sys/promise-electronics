import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, AlertTriangle, Clock, Loader2, ShieldCheck, User, Lock, Zap, XCircle, Check, Truck, Wrench, Receipt, ClipboardList, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { staffInvitesApi } from "@/lib/api/adminApi";

function formatTimeLeft(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
}

const ROLE_TIPS: Record<string, { Icon: LucideIcon; color: string; tips: string[] }> = {
    Driver: {
        Icon: Truck,
        color: "from-blue-600 to-blue-700",
        tips: [
            "View today's pickup and delivery tasks.",
            "Call customers and navigate to their address.",
            "Use OTP when receiving or delivering a device.",
        ],
    },
    Technician: {
        Icon: Wrench,
        color: "from-indigo-600 to-indigo-700",
        tips: [
            "View assigned repair jobs.",
            "Diagnose and report repair result.",
            "Mark Needs Parts, Repair OK, or Not Repairable.",
        ],
    },
    Cashier: {
        Icon: Receipt,
        color: "from-emerald-600 to-emerald-700",
        tips: [
            "Open POS and collect payments.",
            "Confirm job and customer before billing.",
            "Payment updates repair history.",
        ],
    },
    Manager: {
        Icon: ClipboardList,
        color: "from-violet-600 to-violet-700",
        tips: [
            "Review service requests and jobs.",
            "Coordinate technicians and pickup flow.",
            "Monitor customer questions and delays.",
        ],
    },
};

function StateScreen({ icon, title, message, color = "amber" }: { icon: React.ReactNode; title: string; message: string; color?: string }) {
    const [, setLocation] = useLocation();
    const bg = color === "rose" ? "bg-rose-50" : color === "emerald" ? "bg-emerald-50" : "bg-amber-50";
    const text = color === "rose" ? "text-rose-500" : color === "emerald" ? "text-emerald-500" : "text-amber-500";
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-blue-950">
            <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
                <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-xl ${bg}`}>
                    <span className={text}>{icon}</span>
                </div>
                <h2 className="mt-5 text-2xl font-black text-slate-900">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>
                <Button className="mt-6 w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold" onClick={() => setLocation("/admin/login")}>
                    Go to Sign In
                </Button>
            </div>
        </div>
    );
}

const STEPS = ["Invite", "Profile", "Password", "Ready"] as const;

function StepIndicator({ current }: { current: number }) {
    return (
        <div className="flex items-center gap-1">
            {STEPS.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <div key={label} className="flex items-center gap-1">
                        {i > 0 && <div className={`h-px w-4 sm:w-6 ${done ? "bg-blue-500" : "bg-slate-200"}`} />}
                        <div className="flex flex-col items-center gap-0.5">
                            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black
                                ${done ? "bg-blue-600 text-white" : active ? "bg-blue-100 text-blue-700 ring-2 ring-blue-500" : "bg-slate-100 text-slate-400"}`}>
                                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </div>
                            <span className={`text-[9px] font-bold ${done ? "text-blue-600" : active ? "text-blue-700" : "text-slate-400"}`}>{label}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function StaffSetupPage() {
    const [, params] = useRoute("/admin/setup/:token");
    const [, setLocation] = useLocation();
    const token = params?.token || "";

    const [name, setName] = useState("");
    const [username, setUsername] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [timeLeft, setTimeLeft] = useState("");

    const { data: invite, isLoading, isError } = useQuery({
        queryKey: ["staffSetup", token],
        queryFn: () => staffInvitesApi.getSetup(token),
        enabled: Boolean(token),
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (!invite?.expiresAt || invite.expired) return;
        const interval = setInterval(() => {
            const left = formatTimeLeft(invite.expiresAt!);
            setTimeLeft(left);
            if (left === "Expired") clearInterval(interval);
        }, 1000);
        return () => clearInterval(interval);
    }, [invite?.expiresAt, invite?.expired]);

    const acceptMutation = useMutation({
        mutationFn: () => staffInvitesApi.acceptSetup(token, { name, username, password, phone: phone || undefined, email: email || undefined }),
        onError: () => {},
    });

    const canSubmit = name.trim().length >= 2 && username.trim().length >= 3 && password.length >= 6 && password === confirmPassword && !acceptMutation.isPending;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-blue-950">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (isError || !invite) {
        return <StateScreen icon={<AlertTriangle className="h-6 w-6" />} title="Invalid Setup Link" message="This setup link is not valid. Please ask your admin for a new one." color="rose" />;
    }

    if (invite.status === "accepted") {
        return <StateScreen icon={<CheckCircle className="h-6 w-6" />} title="Already Used" message="This setup link has already been used to create an account. If this was you, sign in with your credentials." color="emerald" />;
    }

    if (invite.status === "revoked" || invite.status === "regenerated") {
        return <StateScreen icon={<XCircle className="h-6 w-6" />} title="Link Revoked" message="This setup link is no longer valid. Your admin has either revoked it or generated a new one. Please ask for the latest link." color="rose" />;
    }

    if (invite.expired || invite.status !== "pending") {
        return <StateScreen icon={<Clock className="h-6 w-6" />} title="Link Expired" message="This setup link has expired. Setup links are valid for 5 minutes. Please ask your admin to generate a new one." />;
    }

    const roleInfo = ROLE_TIPS[invite.role] || { Icon: User, color: "from-slate-600 to-slate-700", tips: ["Sign in to get started."] };
    const countdown = timeLeft || formatTimeLeft(invite.expiresAt!);

    const profileDone = name.trim().length >= 2 && username.trim().length >= 3;
    const passwordDone = password.length >= 6 && password === confirmPassword;
    const currentStep = acceptMutation.isSuccess ? 3 : passwordDone && profileDone ? 2 : profileDone ? 2 : name.trim() || username.trim() ? 1 : 1;

    if (acceptMutation.isSuccess) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:bg-gradient-to-br md:from-slate-950 md:via-slate-900 md:to-blue-950">
                <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-6 text-white text-center">
                        <CheckCircle className="mx-auto h-10 w-10" />
                        <h2 className="mt-3 text-2xl font-black">Your {invite.role} Account is Ready</h2>
                    </div>
                    <div className="p-6 space-y-5">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400">What you can do</p>
                        <ul className="space-y-3">
                            {roleInfo.tips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                                    {tip}
                                </li>
                            ))}
                        </ul>
                        <Button className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base" onClick={() => setLocation("/admin/login")}>
                            Continue to Sign In
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const formContent = (
        <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) acceptMutation.mutate(); }} className="space-y-4">
            {acceptMutation.isError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                    {(acceptMutation.error as any)?.message || "Setup failed. Please try again."}
                </div>
            )}
            <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-500">Full Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-500">Username *</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Choose a username (min 3 chars)" className="h-11 rounded-xl" />
            </div>
            {!invite.phone && (
                <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase text-slate-500">Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className="h-11 rounded-xl" />
                </div>
            )}
            {!invite.email && (
                <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase text-slate-500">Email</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className="h-11 rounded-xl" />
                </div>
            )}
            <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-500">Password *</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-slate-500">Confirm Password *</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" className="h-11 rounded-xl" />
                {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-rose-500 font-bold">Passwords do not match</p>
                )}
            </div>
            <Button type="submit" disabled={!canSubmit} className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-base">
                {acceptMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Complete Setup"}
            </Button>
        </form>
    );

    return (
        <>
            {/* ── MOBILE ── */}
            <div className="md:hidden min-h-screen bg-slate-50">
                <div className={`bg-gradient-to-r ${roleInfo.color} px-5 py-5 text-white`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><roleInfo.Icon className="h-5 w-5" /></div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Promise Electronics</p>
                                <h1 className="text-lg font-black">Staff Setup</h1>
                            </div>
                        </div>
                        <div className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold">{countdown}</div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <User className="h-4 w-4 opacity-70" />
                        <span className="text-sm font-bold">{invite.role} Account</span>
                    </div>
                </div>

                <div className="px-4 py-4 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">What you will do</p>
                        <ul className="space-y-2">
                            {roleInfo.tips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                                    <Zap className="h-3.5 w-3.5 shrink-0 text-blue-500 mt-0.5" />
                                    {tip}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-4 flex justify-center"><StepIndicator current={currentStep} /></div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Set up your account</p>
                        {formContent}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 px-1 pb-6">
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        <span>This link is one-time use and expires in 5 minutes. Your password is encrypted.</span>
                    </div>
                </div>
            </div>

            {/* ── DESKTOP ── */}
            <div className="hidden md:flex min-h-screen">
                <div className={`w-[480px] shrink-0 bg-gradient-to-br ${roleInfo.color} p-10 flex flex-col justify-between text-white`}>
                    <div>
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="h-8 w-8" />
                            <div>
                                <p className="text-xs font-bold uppercase tracking-wider opacity-70">Promise Electronics</p>
                                <h1 className="text-2xl font-black">Staff Account Setup</h1>
                            </div>
                        </div>

                        <div className="mt-8 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20"><roleInfo.Icon className="h-6 w-6" /></div>
                            <div>
                                <p className="text-lg font-black">{invite.role}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Clock className="h-4 w-4 opacity-70" />
                                    <span className="text-sm font-bold opacity-80">{countdown} remaining</span>
                                </div>
                            </div>
                        </div>

                        {invite.note && (
                            <div className="mt-6 rounded-xl bg-white/10 p-4 text-sm">{invite.note}</div>
                        )}

                        <div className="mt-8">
                            <p className="text-xs font-black uppercase tracking-wider opacity-60">What you will do</p>
                            <ul className="mt-4 space-y-3">
                                {roleInfo.tips.map((tip, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm leading-6 opacity-90">
                                        <CheckCircle className="h-5 w-5 shrink-0 opacity-70 mt-0.5" />
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs opacity-50">
                        <Lock className="h-4 w-4" />
                        <span>One-time link · Expires in 5 minutes · Password encrypted</span>
                    </div>
                </div>

                <div className="flex-1 bg-slate-50 flex items-center justify-center p-10">
                    <div className="w-full max-w-md">
                        <div className="mb-6"><StepIndicator current={currentStep} /></div>
                        <h2 className="text-2xl font-black text-slate-900">Create your account</h2>
                        <p className="mt-2 text-sm text-slate-500">Fill in your details to complete your {invite.role} account setup.</p>
                        <div className="mt-6">{formContent}</div>
                    </div>
                </div>
            </div>
        </>
    );
}
