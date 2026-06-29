import { useState, useEffect, type UIEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, MoreHorizontal, Shield, Mail, Loader2,
    Trash2, Edit, Users, UserCheck, UserCog, HardHat,
    Activity, Truck, Link, Copy, RefreshCw, X, Clock, CheckCircle
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUsersApi, staffInvitesApi, type SafeUser, type StaffInvite } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// Shared Bento Components
import { BentoCard } from "../shared/BentoCard";
import { StatusBadge } from "../shared/StatusBadge";
import { containerVariants, itemVariants } from "../shared/animations";
import { DashboardSkeleton } from "../shared/DashboardSkeleton";
import { MobileKpiGrid } from "../shared";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CoverageHealth } from "@/components/admin/CoverageHealth";
import { PermissionDesigner } from "@/components/admin/PermissionDesigner";
import { InviteWizard } from "@/components/admin/InviteWizard";

const ROLES = ["Super Admin", "Manager", "Cashier", "Technician", "Driver"] as const;

export default function UsersTab() {
    const queryClient = useQueryClient();
    const { user: currentUser, hasPermission, refreshUser } = useAdminAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [designerTarget, setDesignerTarget] = useState<{ id: string; name: string; role: string } | null>(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        const anyDialogOpen = isEditOpen || isDeleteOpen || isInviteOpen || showLinkDialog;
        // eslint-disable-next-line -- all dialog states used in deps below
        if (isMobile && anyDialogOpen) {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
            return () => {
                window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
            };
        }
    }, [isEditOpen, isDeleteOpen, isInviteOpen, showLinkDialog, isMobile]);

    const [formData, setFormData] = useState({
        username: "",
        name: "",
        email: "",
        role: "Cashier" as typeof ROLES[number],
    });

    // Invite state
    const [inviteRole, setInviteRole] = useState<string>("Cashier");
    const [invitePhone, setInvitePhone] = useState("");
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteNote, setInviteNote] = useState("");
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    const { data: users = [], isLoading, isError, error, refetch } = useQuery({
        queryKey: ["admin-users"],
        queryFn: adminUsersApi.getAll,
        enabled: !!currentUser,
        retry: false,
    });

    const isSuperAdminEarly = currentUser?.role === "Super Admin";
    const { data: invites = [] } = useQuery({
        queryKey: ["staff-invites"],
        queryFn: staffInvitesApi.list,
        enabled: !!currentUser && isSuperAdminEarly,
    });

    const createInviteMutation = useMutation({
        mutationFn: staffInvitesApi.create,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["staff-invites"] });
            setIsInviteOpen(false);
            const fullUrl = `${window.location.origin}${result.setupUrl}`;
            setCopiedLink(fullUrl);
            setShowLinkDialog(true);
            setInviteRole("Cashier");
            setInvitePhone("");
            setInviteEmail("");
            setInviteNote("");
        },
        onError: (e: Error) => toast.error(e.message || "Failed to create setup link"),
    });

    const revokeInviteMutation = useMutation({
        mutationFn: staffInvitesApi.revoke,
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-invites"] }); toast.success("Setup link revoked"); },
        onError: (e: Error) => toast.error(e.message),
    });

    const regenerateInviteMutation = useMutation({
        mutationFn: staffInvitesApi.regenerate,
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["staff-invites"] });
            const fullUrl = `${window.location.origin}${result.setupUrl}`;
            setCopiedLink(fullUrl);
            setShowLinkDialog(true);
            toast.success("New setup link generated");
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const copyLink = async () => {
        if (!copiedLink) return;
        try { await navigator.clipboard.writeText(copiedLink); toast.success("Link copied!"); } catch { toast.error("Copy failed"); }
    };

    const inviteRoles = ["Manager", "Cashier", "Technician", "Driver"] as const;

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminUsersApi.update>[1] }) =>
            adminUsersApi.update(id, data),
        onSuccess: async (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });

            if (variables.id === currentUser?.id) {
                await refreshUser();
            }

            toast.success("User updated successfully");
            setIsEditOpen(false);
            setSelectedUser(null);
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to update user.");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: adminUsersApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            toast.success("User deleted successfully");
            setIsDeleteOpen(false);
            setSelectedUser(null);
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const handleEdit = () => {
        if (!selectedUser) return;
        const updates: Parameters<typeof adminUsersApi.update>[1] = {};
        if (formData.name && formData.name !== selectedUser.name) updates.name = formData.name;
        if (formData.email && formData.email !== selectedUser.email) updates.email = formData.email;
        if (formData.username && formData.username !== selectedUser.username) updates.username = formData.username;
        if (formData.role && formData.role !== selectedUser.role) updates.role = formData.role;
        updateMutation.mutate({ id: selectedUser.id, data: updates });
    };

    const handleToggleStatus = (user: SafeUser) => {
        const newStatus = user.status === "Active" ? "Inactive" : "Active";
        updateMutation.mutate({ id: user.id, data: { status: newStatus } });
    };

    const openEditDialog = (user: SafeUser) => {
        setSelectedUser(user);
        setFormData({
            username: user.username || "",
            name: user.name,
            email: user.email || "",
            role: user.role as typeof ROLES[number],
        });
        setIsEditOpen(true);
    };

    const getInitials = (name: string) => {
        return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    };

    const formatStatus = (s?: string) => {
        if (!s) return "Unknown";
        switch (s.toLowerCase()) {
            case "pending_compensation": return "Pending Compensation";
            case "on_notice": return "On Notice";
            case "resigned": return "Resigned";
            case "terminated": return "Terminated";
            case "active": return "Active";
            case "inactive": return "Inactive";
            default: return s;
        }
    };

    const filteredUsers = users.filter((user) =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.username || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isSuperAdmin = currentUser?.role === "Super Admin";
    const handleMobileScroll = (event: UIEvent<HTMLDivElement>) => {
        if (window.innerWidth >= 768) return;
        window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
            detail: { scrollTop: event.currentTarget.scrollTop },
        }));
    };

    if (isLoading) return <DashboardSkeleton />;

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            onScroll={handleMobileScroll}
            className="h-full min-h-0 space-y-6 overflow-y-auto overflow-x-hidden px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:h-auto md:overflow-visible md:px-0 md:pb-8"
        >
            <MobileKpiGrid
                collapsible
                summaryLabel="Staff pulse"
                items={[
                    { label: "Total", value: users.length, meta: "System accounts", icon: <Users className="h-4 w-4" />, tone: "blue" },
                    { label: "Active", value: users.filter(u => (u.employmentStatus === "active" || (!u.employmentStatus && u.status === "Active"))).length, meta: "Available", icon: <UserCheck className="h-4 w-4" />, tone: "emerald" },
                    { label: "Drivers", value: users.filter(u => u.role === "Driver").length, meta: "Pickup staff", icon: <Truck className="h-4 w-4" />, tone: "violet" },
                    { label: "Techs", value: users.filter(u => u.role === "Technician").length, meta: "Repair staff", icon: <HardHat className="h-4 w-4" />, tone: "amber" },
                ]}
            />

            {/* Compact KPI Strip */}
            <div className="hidden md:flex gap-3">
                {[
                    { label: "Total Users", value: users.length, sub: "System accounts", icon: <Users size={16} />, color: "text-blue-600 bg-blue-50 border-blue-200" },
                    { label: "Active", value: users.filter(u => (u.employmentStatus === "active" || (!u.employmentStatus && u.status === "Active"))).length, sub: "Available", icon: <UserCheck size={16} />, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                    { label: "Drivers", value: users.filter(u => u.role === "Driver").length, sub: "Pickup staff", icon: <Truck size={16} />, color: "text-violet-600 bg-violet-50 border-violet-200" },
                    { label: "Technicians", value: users.filter(u => u.role === "Technician").length, sub: "Repair staff", icon: <HardHat size={16} />, color: "text-amber-600 bg-amber-50 border-amber-200" },
                ].map(kpi => (
                    <div key={kpi.label} className={`flex items-center gap-3 rounded-xl border ${kpi.color} px-3 py-2.5 flex-1`}>
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.color.split(" ").slice(1).join(" ")}`}>{kpi.icon}</div>
                        <div className="min-w-0">
                            <p className="text-lg font-black leading-tight">{kpi.value}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{kpi.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* COVERAGE HEALTH (Super Admin only) */}
            {isSuperAdmin && (
                <motion.div variants={itemVariants}>
                    <CoverageHealth />
                </motion.div>
            )}

            {/* MAIN CONTENT Area */}
            <motion.div variants={itemVariants}>
                <BentoCard
                    variant="ghost"
                    className="bg-white border-slate-200 shadow-sm"
                    disableHover
                >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 tracking-tight">Staff Directory</h3>
                            <p className="text-sm text-slate-500">Manage user roles, permissions and account status</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Search users..."
                                    className="pl-10 h-10 bg-slate-50/50 border-slate-200 focus:bg-white transition-all rounded-xl"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            {isSuperAdmin && (
                                <Button className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 gap-2" onClick={() => setIsInviteOpen(true)}>
                                    <Link className="w-4 h-4" />
                                    <span className="hidden sm:inline">Create Setup Link</span>
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* DESKTOP TABLE */}
                    <div className="hidden md:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-slate-100">
                                    <TableHead className="w-[300px] text-slate-500 font-bold uppercase text-[10px] tracking-widest">User Details</TableHead>
                                    <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Role</TableHead>
                                    <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Status</TableHead>
                                    <TableHead className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Last Activity</TableHead>
                                    <TableHead className="text-right text-slate-500 font-bold uppercase text-[10px] tracking-widest">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.id} className="group hover:bg-slate-50/50 transition-colors border-slate-100">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-10 w-10 border-2 border-slate-100 shadow-sm ring-2 ring-white transition-transform group-hover:scale-110">
                                                        <AvatarFallback className="bg-slate-50 text-slate-500 text-xs font-bold">{getInitials(user.name)}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-700">{user.name}</span>
                                                        <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                                                            <Mail className="w-3 h-3" /> {user.email}
                                                        </span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                        "p-1.5 rounded-lg",
                                                        user.role === "Super Admin" ? "bg-indigo-50 text-indigo-600" :
                                                            user.role === "Technician" ? "bg-orange-50 text-orange-600" :
                                                                user.role === "Driver" ? "bg-blue-50 text-blue-600" :
                                                                "bg-slate-100 text-slate-600"
                                                    )}>
                                                        <Shield size={14} />
                                                    </div>
                                                    <span className="text-sm font-semibold text-slate-600">{user.role}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge
                                                    status={user.employmentStatus ? formatStatus(user.employmentStatus) : user.status}
                                                />
                                            </TableCell>
                                            <TableCell className="text-slate-400 text-sm font-medium">
                                                {user.lastLogin ? format(new Date(user.lastLogin), "MMM d, h:mm a") : "Never"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-400">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48 rounded-2xl p-2 border-slate-100 shadow-xl shadow-slate-200/50">
                                                        <DropdownMenuLabel className="text-slate-500 py-2 px-3 text-[10px] font-bold uppercase tracking-widest">Manager</DropdownMenuLabel>
                                                        {(isSuperAdmin || hasPermission("canEdit")) && (
                                                            <DropdownMenuItem onClick={() => openEditDialog(user)} className="rounded-xl flex items-center gap-2 py-2.5 px-3 cursor-pointer">
                                                                <Edit className="w-4 h-4 text-blue-500" /> Edit Profile
                                                            </DropdownMenuItem>
                                                        )}
                                                        {isSuperAdmin && user.id !== currentUser?.id && user.role !== "Super Admin" && (
                                                            <DropdownMenuItem onClick={() => setDesignerTarget({ id: user.id, name: user.name, role: user.role })} className="rounded-xl flex items-center gap-2 py-2.5 px-3 cursor-pointer">
                                                                <UserCog className="w-4 h-4 text-blue-500" /> Edit Access
                                                            </DropdownMenuItem>
                                                        )}
                                                        {(isSuperAdmin || hasPermission("canEdit")) && (
                                                            <DropdownMenuItem onClick={() => handleToggleStatus(user)} className="rounded-xl flex items-center gap-2 py-2.5 px-3 cursor-pointer text-amber-600">
                                                                <Activity className="w-4 h-4" /> {user.status === "Active" ? "Deactivate" : "Activate"}
                                                            </DropdownMenuItem>
                                                        )}
                                                        {isSuperAdmin && user.id !== currentUser?.id && (
                                                            <>
                                                                <DropdownMenuSeparator className="my-1 border-slate-50" />
                                                                <DropdownMenuItem onClick={() => { setSelectedUser(user); setIsDeleteOpen(true); }} className="rounded-xl flex items-center gap-2 py-2.5 px-3 cursor-pointer text-rose-600">
                                                                    <Trash2 className="w-4 h-4" /> Delete Account
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    </div>

                    {/* MOBILE CARDS */}
                    <div className="md:hidden space-y-4">
                        {filteredUsers.map((user) => (
                            <div key={user.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarFallback className="bg-white text-slate-500 font-bold">{getInitials(user.name)}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-700">{user.name}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{user.role}</span>
                                        </div>
                                    </div>
                                    <StatusBadge status={user.employmentStatus ? formatStatus(user.employmentStatus) : user.status} />
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div className="p-2 rounded-xl bg-white/60 border border-slate-100 flex flex-col gap-1">
                                        <span className="text-slate-400 uppercase font-black tracking-tight">Email</span>
                                        <span className="text-slate-600 truncate">{user.email || "N/A"}</span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-white/60 border border-slate-100 flex flex-col gap-1">
                                        <span className="text-slate-400 uppercase font-black tracking-tight">Active</span>
                                        <span className="text-slate-600">{user.lastLogin ? format(new Date(user.lastLogin), "MMM d") : "Never"}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 rounded-xl h-9 border-slate-200 text-slate-600 text-xs font-bold"
                                        onClick={() => openEditDialog(user)}
                                    >
                                        Edit
                                    </Button>
                                    {isSuperAdmin && user.id !== currentUser?.id && user.role !== "Super Admin" && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="px-3 rounded-xl h-9 border-blue-100 text-blue-600 hover:bg-blue-50"
                                            onClick={() => setDesignerTarget({ id: user.id, name: user.name, role: user.role })}
                                        >
                                            <UserCog size={16} />
                                        </Button>
                                    )}
                                    {isSuperAdmin && user.id !== currentUser?.id && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="px-3 rounded-xl h-9 border-rose-100 text-rose-500 hover:bg-rose-50"
                                            onClick={() => { setSelectedUser(user); setIsDeleteOpen(true); }}
                                        >
                                            <Trash2 size={16} />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </BentoCard>
            </motion.div>

            {/* EDIT USER DIALOG - Similar pattern */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="!left-0 !right-0 !top-auto !bottom-0 !translate-x-0 !translate-y-0 !max-h-none !max-w-none w-full rounded-t-[2rem] rounded-b-none border-none shadow-2xl p-0 overflow-hidden h-auto md:!left-[50%] md:!right-auto md:!top-[50%] md:!bottom-auto md:!translate-x-[-50%] md:!translate-y-[-50%] md:!max-h-[calc(100dvh-2rem)] md:!max-w-[425px] md:rounded-[2rem]">
                    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 md:p-8 text-white relative overflow-hidden">
                        <Edit className="absolute top-[-20%] right-[-10%] w-48 h-48 text-white/10 rotate-12" />
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tighter">Edit Staff Profile</DialogTitle>
                            <DialogDescription className="text-white/70 font-medium">Update account information for {selectedUser?.name}.</DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="p-6 md:p-8 space-y-4 overflow-y-auto">
                        {isSuperAdmin && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Username</Label>
                                    <Input
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Role</Label>
                                    <Select
                                        value={formData.role}
                                        onValueChange={(value) => setFormData({ ...formData, role: value as typeof ROLES[number] })}
                                    >
                                        <SelectTrigger className="rounded-xl bg-slate-50 border-slate-100">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
                                            {ROLES.map((role) => (
                                                <SelectItem key={role} value={role} className="rounded-xl">{role}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Full Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white"
                            />
                        </div>
                    </div>
                    <div className="p-6 md:p-8 pt-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-8 flex gap-3">
                        <Button variant="ghost" className="flex-1 rounded-xl h-12 font-bold text-slate-500" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                        <Button
                            className="flex-[2] rounded-xl h-12 font-black uppercase tracking-widest bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-500/20"
                            onClick={handleEdit}
                            disabled={updateMutation.isPending}
                        >
                            {updateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save Changes"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* DELETE ALERT */}
            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent className="rounded-[2rem] border-none shadow-2xl p-8">
                    <AlertDialogHeader>
                        <div className="h-16 w-16 bg-rose-50 rounded-[2rem] flex items-center justify-center text-rose-500 mb-4">
                            <Trash2 size={32} />
                        </div>
                        <AlertDialogTitle className="text-2xl font-black tracking-tighter text-slate-800">Terminating Access</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500 font-medium text-base">
                            You are about to permanently delete the account for <span className="font-bold text-slate-700">{selectedUser?.name}</span>. This will revoke all system access immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-8 gap-3">
                        <AlertDialogCancel className="h-12 rounded-xl flex-1 font-bold text-slate-500 border-slate-100" onClick={() => setSelectedUser(null)}>Retain Account</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => selectedUser && deleteMutation.mutate(selectedUser.id)}
                            className="h-12 rounded-xl flex-1 bg-rose-500 hover:bg-rose-600 text-white font-black uppercase tracking-widest shadow-lg shadow-rose-500/20"
                        >
                            Confirm Termination
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* SETUP LINK INVITES LIST */}
            {isSuperAdmin && (
                <motion.div variants={itemVariants}>
                    <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm mt-6" disableHover>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Setup Links</h3>
                            <Badge variant="outline" className="text-xs">{invites.filter(i => i.status === "pending" && new Date(i.expiresAt) > new Date()).length} active</Badge>
                        </div>
                        {invites.length === 0 ? (
                            <div className="py-8 text-center text-sm text-slate-400">
                                <Link className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                                <p>No setup links yet. Create one to onboard new staff.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {invites.slice(0, 20).map((inv) => {
                                    const expired = new Date(inv.expiresAt) < new Date();
                                    const isPending = inv.status === "pending" && !expired;
                                    const statusLabel = isPending ? "Pending" : inv.status === "accepted" ? "Accepted" : expired && inv.status === "pending" ? "Expired" : inv.status.charAt(0).toUpperCase() + inv.status.slice(1);
                                    return (
                                        <div key={inv.id} className={cn("rounded-xl border p-3", isPending ? "border-blue-200 bg-blue-50/30" : inv.status === "accepted" ? "border-emerald-100 bg-emerald-50/30" : "border-slate-100")}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", inv.status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : isPending ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-500")}>{statusLabel}</Badge>
                                                        <span className="text-sm font-bold text-slate-700">{inv.role}</span>
                                                        {inv.phone && <span className="text-xs text-slate-400 truncate">{inv.phone}</span>}
                                                        {inv.email && <span className="text-xs text-slate-400 truncate">{inv.email}</span>}
                                                    </div>
                                                    {inv.note && <p className="text-[11px] text-slate-500 mt-1 truncate">{inv.note}</p>}
                                                    <p className="text-[10px] text-slate-400 mt-1">
                                                        {format(new Date(inv.createdAt), "MMM d, h:mm a")}
                                                        {isPending && <> · expires {format(new Date(inv.expiresAt), "h:mm:ss a")}</>}
                                                        {inv.status === "accepted" && inv.redeemedAt && <> · used {format(new Date(inv.redeemedAt), "MMM d")}</>}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {(isPending || expired || inv.status === "regenerated" || inv.status === "revoked") && (
                                                        <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-lg px-2" onClick={() => regenerateInviteMutation.mutate(inv.id)} disabled={regenerateInviteMutation.isPending}>
                                                            <RefreshCw className="h-3 w-3 mr-1" />New
                                                        </Button>
                                                    )}
                                                    {isPending && (
                                                        <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-lg px-2 text-rose-600 border-rose-200" onClick={() => revokeInviteMutation.mutate(inv.id)} disabled={revokeInviteMutation.isPending}>
                                                            <X className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </BentoCard>
                </motion.div>
            )}

            {/* INVITE WIZARD */}
            {isInviteOpen && (
                <InviteWizard
                    onClose={() => setIsInviteOpen(false)}
                    onCreated={() => {
                        queryClient.invalidateQueries({ queryKey: ["staffInvites"] });
                        queryClient.invalidateQueries({ queryKey: ["permCoverage"] });
                    }}
                />
            )}
            {/* PERMISSION DESIGNER */}
            {designerTarget && (
                <PermissionDesigner
                    userId={designerTarget.id}
                    userName={designerTarget.name}
                    userRole={designerTarget.role}
                    onClose={() => setDesignerTarget(null)}
                    onSaved={() => queryClient.invalidateQueries({ queryKey: ["permCoverage"] })}
                />
            )}
        </motion.div>
    );
}
