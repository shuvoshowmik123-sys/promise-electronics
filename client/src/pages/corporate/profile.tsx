
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
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
    Camera
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SoundSelector } from "@/components/corporate/SoundSelector";
import { EditProfileDialog } from "@/components/corporate/EditProfileDialog";


export default function CorporateProfile() {
    const { user, isLoading, logout } = useCorporateAuth();
    const [isSoundSelectorOpen, setIsSoundSelectorOpen] = useState(false);
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

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



    return (
        <div
            className="max-w-5xl mx-auto pb-24 space-y-10 animate-in fade-in slide-in-from-bottom-2"
        >
            {/* Header / Hero Section */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-slate-900 px-8 py-12 md:px-12 md:py-16 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 delay-100">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-600/20 to-transparent pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative flex flex-col md:flex-row items-center gap-10">
                    <div className="relative group">
                        <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-white/10 shadow-2xl transition-transform duration-500 group-hover:scale-105">
                            <AvatarImage src="" />
                            <AvatarFallback className="text-4xl font-black bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                                {user?.name?.[0]}
                            </AvatarFallback>
                        </Avatar>
                        <button
                            className="absolute bottom-1 right-1 w-10 h-10 bg-white text-slate-900 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95"
                            aria-label="Change profile picture"
                        >
                            <Camera className="h-5 w-5" />
                        </button>
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
                                    <Button variant="ghost" className="text-[var(--corp-blue)] font-black text-xs hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all">
                                        Update
                                    </Button>
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

                            <Button className="w-full h-12 rounded-xl bg-white text-blue-700 font-black shadow-xl shadow-blue-900/20 hover:bg-slate-50 transition-all">
                                Upgrade Support
                            </Button>
                        </Card>
                    </div>

                    <div className="animate-in fade-in slide-in-from-bottom-4 delay-300">
                        <Card className="border-none shadow-sm rounded-3xl bg-white overflow-hidden p-6 space-y-4">
                            <h4 className="font-black text-slate-900 uppercase text-xs tracking-tighter">Quick Resources</h4>
                            <div className="space-y-2">
                                <a href="#" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-sm font-medium text-slate-600">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[var(--corp-blue)]">
                                        <Globe className="h-4 w-4" />
                                    </div>
                                    Documentation
                                </a>
                                <a href="#" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-sm font-medium text-slate-600">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[var(--corp-blue)]">
                                        <Building2 className="h-4 w-4" />
                                    </div>
                                    Corporate Guidelines
                                </a>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
