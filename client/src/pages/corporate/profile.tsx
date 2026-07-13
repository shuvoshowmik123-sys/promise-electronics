
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { useCorporateMobileMode } from "@/hooks/useCorporateMobileMode";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
    User,
    Mail,
    ShieldCheck,
    Building2,
    KeyRound,
    LogOut,
    Fingerprint,
    Bell,
    Globe,
    ChevronRight
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SoundSelector } from "@/components/corporate/SoundSelector";
import { EditProfileDialog } from "@/components/corporate/EditProfileDialog";


export default function CorporateProfile() {
    const { user, isLoading, logout } = useCorporateAuth();
    const isCorporateMobile = useCorporateMobileMode();
    const [isSoundSelectorOpen, setIsSoundSelectorOpen] = useState(false);
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

    if (isLoading) {
        return (
            <div className="flex flex-col justify-center items-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-slate-400 font-bold animate-pulse">Syncing Profile...</p>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center">
                <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-500">
                    <ShieldCheck className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900">Session Expired</h2>
                    <p className="text-slate-500">Please log in again to access your corporate profile.</p>
                </div>
                <Button onClick={() => window.location.href = "/corporate/login"} className="bg-[var(--corp-blue)] text-white font-bold h-12 px-8 rounded-xl corp-btn-glow">
                    Return to Login
                </Button>
            </div>
        );
    }



    if (isCorporateMobile) {
        return (
            <CorporateProfileMobile
                user={user}
                onEdit={() => setIsEditProfileOpen(true)}
                onSound={() => setIsSoundSelectorOpen(true)}
                onLogout={() => setIsLogoutConfirmOpen(true)}
                isLogoutConfirmOpen={isLogoutConfirmOpen}
                onCancelLogout={() => setIsLogoutConfirmOpen(false)}
                onConfirmLogout={logout}
                soundSelector={<SoundSelector open={isSoundSelectorOpen} onOpenChange={setIsSoundSelectorOpen} />}
                editProfileDialog={<EditProfileDialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen} />}
            />
        );
    }

    return (
        <div
            className="max-w-5xl mx-auto pb-24 space-y-10 animate-in fade-in slide-in-from-bottom-2"
        >
            {/* Header / Hero Section */}
            <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 px-5 py-6 sm:px-8 sm:py-12 md:px-12 md:py-16 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 delay-100">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-600/20 to-transparent pointer-events-none" />

                {isCorporateMobile ? (
                    /* Mobile: compact horizontal layout */
                    <div className="relative flex items-center gap-4">
                        <Avatar className="h-16 w-16 shrink-0 border-2 border-white/10 shadow-xl">
                            <AvatarImage src="" />
                            <AvatarFallback className="text-2xl font-black bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                                {user?.name?.[0]}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-xl font-black tracking-tight leading-tight truncate">{user?.name}</h1>
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                <Globe className="h-3 w-3" /> {user?.username}
                            </p>
                            <Badge className="mt-1 bg-blue-500/20 text-blue-300 border-none px-2 py-0.5 text-[10px] font-bold">
                                {user?.role || "Corporate Partner"}
                            </Badge>
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                            <Button
                                onClick={() => setIsEditProfileOpen(true)}
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 rounded-lg border-white/10 bg-white/5 hover:bg-white hover:text-slate-900 text-xs font-bold"
                            >
                                Edit
                            </Button>
                            <Button
                                onClick={() => logout()}
                                size="sm"
                                className="h-8 px-3 rounded-lg font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white border-none text-xs"
                            >
                                <LogOut className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Desktop: original full layout */
                    <div className="relative flex flex-col md:flex-row items-center gap-10">
                        <div className="relative group">
                            <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-white/10 shadow-2xl transition-transform duration-500 group-hover:scale-105">
                                <AvatarImage src="" />
                                <AvatarFallback className="text-4xl font-black bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                                    {user?.name?.[0]}
                                </AvatarFallback>
                            </Avatar>
                        </div>

                        <div className="text-center md:text-left space-y-4">
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                                    <h1 className="text-4xl md:text-5xl font-black tracking-tight">{user?.name}</h1>
                                    <Badge className="bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border-none px-3 py-1 font-bold">
                                        {user?.role || "Corporate Partner"}
                                    </Badge>
                                </div>
                                <p className="text-slate-400 font-medium flex items-center justify-center md:justify-start gap-2">
                                    <Globe className="h-4 w-4" /> Account ID: {user?.username}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                                <Button
                                    onClick={() => setIsEditProfileOpen(true)}
                                    variant="outline"
                                    className="h-11 px-6 rounded-xl border-white/10 bg-white/5 hover:bg-white hover:text-slate-900 transition-all font-bold"
                                >
                                    Edit Profile
                                </Button>
                                <Button
                                    onClick={() => logout()}
                                    variant="destructive"
                                    className="h-11 px-6 rounded-xl font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white transition-all border-none"
                                >
                                    <LogOut className="mr-2 h-4 w-4" /> Sign Out
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Account Details */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="animate-in fade-in slide-in-from-bottom-4 delay-200">
                        <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
                            <CardHeader className="px-8 pt-8 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 rounded-xl text-[var(--corp-blue)]">
                                        <User className="h-5 w-5" />
                                    </div>
                                    <CardTitle className="text-xl font-black">Personal Oversight</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="px-8 pb-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black uppercase text-slate-400 tracking-wider">Legal Name</Label>
                                        <div className="h-12 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center font-bold text-slate-700">
                                            {user?.name}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black uppercase text-slate-400 tracking-wider">Email Address</Label>
                                        <div className="h-12 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center font-bold text-slate-700 gap-3">
                                            <Mail className="h-4 w-4 text-slate-300" />
                                            {user?.email}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black uppercase text-slate-400 tracking-wider">Organization ID</Label>
                                        <div className="h-12 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center font-mono text-xs font-bold text-[var(--corp-blue)] gap-3">
                                            <Building2 className="h-4 w-4 text-slate-300" />
                                            {user?.corporateClientShortCode || user?.corporateClientId || "NOT_ASSIGNED"}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black uppercase text-slate-400 tracking-wider">System Username</Label>
                                        <div className="h-12 px-4 rounded-xl bg-slate-50 border border-slate-100 flex items-center font-bold text-slate-700 gap-3">
                                            <Fingerprint className="h-4 w-4 text-slate-300" />
                                            @{user?.username}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="animate-in fade-in slide-in-from-bottom-4 delay-300">
                        <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden">
                            <CardHeader className="px-8 pt-8 pb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
                                            <ShieldCheck className="h-5 w-5" />
                                        </div>
                                        <CardTitle className="text-xl font-black">Security & Privacy</CardTitle>
                                    </div>
                                    <Badge variant="outline" className="border-amber-200 text-amber-600 bg-amber-50/50 font-bold">Action Required</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="px-8 pb-8 space-y-1">
                                <div className="group flex items-center justify-between py-4 border-b border-slate-50 transition-all hover:px-2 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                            <KeyRound className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800">Account Password</p>
                                            <p className="text-xs text-slate-400">Manage your login credentials</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="group flex items-center justify-between py-4 border-b border-slate-50 transition-all hover:px-2 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                            <Bell className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800">Notifications</p>
                                            <p className="text-xs text-slate-400">Customize portal alerts</p>
                                        </div>
                                    </div>
                                    <Button onClick={() => setIsSoundSelectorOpen(true)} variant="ghost" className="text-[var(--corp-blue)] font-black text-xs hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all">
                                        Configure
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <SoundSelector open={isSoundSelectorOpen} onOpenChange={setIsSoundSelectorOpen} />
                <EditProfileDialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen} />


                {/* Right Column: Side Stats / Info */}
                <div className="space-y-8">
                    <div className="animate-in fade-in slide-in-from-bottom-4 delay-200">
                        <Card className="border-none shadow-sm rounded-3xl bg-gradient-to-br from-[var(--corp-blue)] to-indigo-700 text-white overflow-hidden p-8 space-y-6">
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold opacity-70 uppercase tracking-widest">Enterprise Tier</h4>
                                <h3 className="text-2xl font-black">Platinum Partner</h3>
                            </div>

                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 space-y-3">
                                <p className="text-xs font-medium opacity-80">You have active SLAs for 4 location clusters.</p>
                                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                    <div className="w-3/4 h-full bg-white" />
                                </div>
                                <div className="flex justify-between text-[10px] font-black uppercase opacity-60">
                                    <span>Quota Used</span>
                                    <span>75% Capacity</span>
                                </div>
                            </div>

                        </Card>
                    </div>

                </div>
            </div>
        </div>
    );
}

function CorporateProfileMobile({ user, onEdit, onSound, onLogout, isLogoutConfirmOpen, onCancelLogout, onConfirmLogout, soundSelector, editProfileDialog }: any) {
    const rows = [
        { icon: User, label: "Account holder", value: user.name || "Corporate user" },
        { icon: Mail, label: "Email address", value: user.email || "Not provided" },
        { icon: Building2, label: "Organization", value: user.corporateClientShortCode || user.corporateClientId || "Not assigned" },
        { icon: Fingerprint, label: "Username", value: `@${user.username || "account"}` },
    ];

    return (
        <div className="space-y-4 pb-4">
            <section className="rounded-2xl bg-slate-900 px-5 py-5 text-white">
                <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 border-2 border-white/10"><AvatarFallback className="bg-blue-600 text-lg font-bold text-white">{user.name?.[0] || "C"}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1"><p className="truncate text-lg font-bold">{user.name}</p><p className="mt-0.5 truncate text-xs text-slate-300">{user.role || "Corporate partner"}</p></div>
                    <Button type="button" onClick={onEdit} variant="outline" className="min-h-11 border-white/20 bg-white/10 px-3 text-xs font-bold text-white hover:bg-white hover:text-slate-900">Edit</Button>
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {rows.map(({ icon: Icon, label, value }, index) => <div key={label} className={`flex min-h-16 items-center gap-3 px-4 ${index ? "border-t border-slate-100" : ""}`}><Icon className="h-5 w-5 shrink-0 text-[var(--corp-blue)]" /><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="truncate text-sm font-semibold text-slate-800">{value}</p></div></div>)}
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button type="button" onClick={onSound} className="flex min-h-14 w-full items-center justify-between px-4 text-left"><span className="flex items-center gap-3 text-sm font-semibold text-slate-800"><Bell className="h-5 w-5 text-[var(--corp-blue)]" />Notification sound</span><ChevronRight className="h-4 w-4 text-slate-400" /></button>
                <button type="button" onClick={onLogout} className="flex min-h-14 w-full items-center gap-3 border-t border-slate-100 px-4 text-left text-sm font-semibold text-red-600"><LogOut className="h-5 w-5" />Log out</button>
            </section>

            {isLogoutConfirmOpen && <div role="dialog" aria-modal="true" aria-labelledby="corporate-logout-title" className="rounded-2xl border border-red-100 bg-red-50 p-4"><h2 id="corporate-logout-title" className="text-sm font-bold text-slate-900">Log out of this corporate account?</h2><p className="mt-1 text-sm text-slate-600">You will need your credentials to sign in again.</p><div className="mt-4 grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={onCancelLogout} className="min-h-11">Cancel</Button><Button type="button" variant="destructive" onClick={onConfirmLogout} className="min-h-11">Log out</Button></div></div>}
            {soundSelector}
            {editProfileDialog}
        </div>
    );
}
