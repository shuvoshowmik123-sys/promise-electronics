import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Mail, Phone, Shield, Lock, Save, Loader2, CheckCircle, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountApi } from "@/lib/api/adminApi";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminMobileMode } from "@/hooks/useAdminMobileMode";

const PERMISSION_LABELS: Record<string, string> = {
    dashboard: "Dashboard",
    jobs: "Jobs",
    inventory: "Inventory",
    pos: "POS",
    finance: "Finance",
    attendance: "Attendance",
    reports: "Reports",
    serviceRequests: "Service Requests",
    orders: "Orders",
    technician: "Technician",
    inquiries: "Inquiries",
    pickup: "Pickup",
    corporate: "Corporate",
    notifications: "Notifications",
    challans: "Challans",
    warrantyClaims: "Warranty",
    refunds: "Refunds",
    canCreate: "Create",
    canEdit: "Edit",
    canExport: "Export",
    canAssignTechnician: "Assign Tech",
    canSetPriority: "Set Priority",
    canViewCustomerPhone: "View Phone",
    canViewFullJobDetails: "Full Job Details",
    canPrintJobTickets: "Print Tickets",
    canAddAssistedBy: "Add Assisted",
    process_payment: "Process Payment",
};

export default function AccountSettingsPage() {
    const queryClient = useQueryClient();
    const { refreshUser, logout } = useAdminAuth();
    const isMobile = useAdminMobileMode();

    const { data: account, isLoading } = useQuery({
        queryKey: ["account"],
        queryFn: accountApi.get,
    });

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [profileInit, setProfileInit] = useState(false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    useEffect(() => {
        if (account && !profileInit) {
            setName(account.name || "");
            setEmail(account.email || "");
            setPhone(account.phone || "");
            setProfileInit(true);
        }
    }, [account, profileInit]);

    const profileMutation = useMutation({
        mutationFn: () => accountApi.updateProfile({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null }),
        onSuccess: () => {
            toast.success("Profile updated");
            queryClient.invalidateQueries({ queryKey: ["account"] });
            refreshUser();
        },
        onError: (e: any) => toast.error(e?.message || "Failed to update profile"),
    });

    const passwordMutation = useMutation({
        mutationFn: () => accountApi.changePassword({ currentPassword, newPassword, confirmPassword }),
        onSuccess: () => {
            toast.success("Password changed. Signing out...");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setTimeout(() => logout(), 1500);
        },
        onError: (e: any) => toast.error(e?.message || "Failed to change password"),
    });

    const profileDirty = account && (name.trim() !== (account.name || "") || email.trim() !== (account.email || "") || phone.trim() !== (account.phone || ""));
    const canSaveProfile = profileDirty && name.trim().length >= 2 && !profileMutation.isPending;
    const canChangePassword = currentPassword.length > 0 && newPassword.length >= 6 && newPassword === confirmPassword && !passwordMutation.isPending;

    let permissionsList: string[] = [];
    if (account?.permissions) {
        try {
            const parsed = typeof account.permissions === "string" ? JSON.parse(account.permissions) : account.permissions;
            permissionsList = Object.entries(parsed).filter(([, v]) => v).map(([k]) => PERMISSION_LABELS[k] || k);
        } catch { /* ignore */ }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!account) {
        return <div className="text-center py-20 text-slate-500">Failed to load account.</div>;
    }

    // ── Mobile layout (portrait + landscape phone) ────────────────────────────
    // Flat flow layout — no h-full/overflow-hidden so the Bento shell's
    // <main> scroll container drives scrolling. Bottom padding clears the dock.
    if (isMobile) {
        return (
            <div
                className="bg-[#f8fafc] px-3 pt-2 space-y-3"
                style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
            >
                <div className="pb-1">
                    <h1 className="text-base font-black text-slate-900">Account Settings</h1>
                    <p className="text-xs text-slate-500">Profile and credentials</p>
                </div>

                {/* Profile */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <User className="h-3.5 w-3.5" />
                        Profile
                    </div>
                    <div className="space-y-2.5">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">Full Name</Label>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="h-10 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">Username</Label>
                            <Input value={account.username} disabled className="h-10 rounded-lg bg-slate-50 text-slate-400" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className="h-10 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className="h-10 rounded-lg" />
                        </div>
                    </div>
                    <Button
                        onClick={() => profileMutation.mutate()}
                        disabled={!canSaveProfile}
                        className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm"
                    >
                        {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" /> Save Changes</>}
                    </Button>
                </div>

                {/* Change Password */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <KeyRound className="h-3.5 w-3.5" />
                        Change Password
                    </div>
                    <div className="space-y-2.5">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">Current Password</Label>
                            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" className="h-10 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">New Password</Label>
                            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" className="h-10 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">Confirm Password</Label>
                            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" className="h-10 rounded-lg" />
                            {confirmPassword && newPassword !== confirmPassword && (
                                <p className="text-xs text-rose-500 font-bold">Passwords do not match</p>
                            )}
                        </div>
                    </div>
                    {passwordMutation.isSuccess && (
                        <div className="flex items-center gap-2 text-sm text-emerald-600 font-bold">
                            <CheckCircle className="h-4 w-4" />
                            Password changed. Signing you out...
                        </div>
                    )}
                    <Button
                        onClick={() => passwordMutation.mutate()}
                        disabled={!canChangePassword}
                        className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm"
                    >
                        {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Lock className="h-4 w-4 mr-1.5" /> Change Password</>}
                    </Button>
                </div>

                {/* Role & Access */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                        <Shield className="h-3.5 w-3.5" />
                        Role & Access
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">Role</Label>
                            <div className="h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center px-3 text-sm font-bold text-slate-700">{account.role}</div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">Status</Label>
                            <div className="h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center px-3 text-sm">
                                <span className={`inline-flex items-center gap-1.5 font-bold ${account.status === "Active" ? "text-emerald-600" : "text-amber-600"}`}>
                                    <span className={`h-2 w-2 rounded-full ${account.status === "Active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                    {account.status}
                                </span>
                            </div>
                        </div>
                    </div>
                    {permissionsList.length > 0 && (
                        <div className="space-y-1">
                            <Label className="text-xs font-bold uppercase text-slate-500">Permissions</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {permissionsList.map((p) => (
                                    <span key={p} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-100">{p}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-slate-400">Role and permissions are managed by Super Admin.</p>
                </div>
            </div>
        );
    }

    // ── Desktop layout (unchanged) ────────────────────────────────────────────
    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-24 md:pb-8">
            <div>
                <h1 className="text-2xl font-black text-slate-900">Account Settings</h1>
                <p className="text-sm text-slate-500 mt-1">Manage your profile and credentials.</p>
            </div>

            {/* Profile Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-400">
                    <User className="h-4 w-4" />
                    Profile
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Full Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="h-10 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Username</Label>
                        <Input value={account.username} disabled className="h-10 rounded-lg bg-slate-50 text-slate-400" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Optional" className="h-10 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className="h-10 rounded-lg" />
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button onClick={() => profileMutation.mutate()} disabled={!canSaveProfile} className="h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5">
                        {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" /> Save Changes</>}
                    </Button>
                </div>
            </div>

            {/* Change Password Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-400">
                    <KeyRound className="h-4 w-4" />
                    Change Password
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">Current Password</Label>
                        <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" className="h-10 rounded-lg max-w-sm" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">New Password</Label>
                        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 6 characters" className="h-10 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Confirm New Password</Label>
                        <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" className="h-10 rounded-lg" />
                        {confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-xs text-rose-500 font-bold">Passwords do not match</p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button onClick={() => passwordMutation.mutate()} disabled={!canChangePassword} className="h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm px-5">
                        {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Lock className="h-4 w-4 mr-1.5" /> Change Password</>}
                    </Button>
                </div>

                {passwordMutation.isSuccess && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 font-bold">
                        <CheckCircle className="h-4 w-4" />
                        Password changed. Signing you out...
                    </div>
                )}
            </div>

            {/* Role & Access Section */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-400">
                    <Shield className="h-4 w-4" />
                    Role & Access
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Role</Label>
                        <div className="h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center px-3 text-sm font-bold text-slate-700">{account.role}</div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Status</Label>
                        <div className="h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center px-3 text-sm">
                            <span className={`inline-flex items-center gap-1.5 font-bold ${account.status === "Active" ? "text-emerald-600" : "text-amber-600"}`}>
                                <span className={`h-2 w-2 rounded-full ${account.status === "Active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                {account.status}
                            </span>
                        </div>
                    </div>
                </div>

                {permissionsList.length > 0 && (
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Permissions</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {permissionsList.map((p) => (
                                <span key={p} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 border border-blue-100">{p}</span>
                            ))}
                        </div>
                    </div>
                )}

                <p className="text-xs text-slate-400">Role and permissions are managed by Super Admin.</p>
            </div>
        </div>
    );
}
