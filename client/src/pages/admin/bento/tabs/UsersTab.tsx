import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, UserPlus, MoreHorizontal, Shield, Mail, Loader2,
    Trash2, Edit, Eye, EyeOff, Users, UserCheck, UserCog, HardHat,
    Activity, Zap
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminUsersApi, type SafeUser } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import type { UserPermissions } from "@shared/schema";
import { cn } from "@/lib/utils";

// Shared Bento Components
import { BentoCard } from "../shared/BentoCard";
import { StatusBadge } from "../shared/StatusBadge";
import { containerVariants, itemVariants } from "../shared/animations";
import { DashboardSkeleton } from "../shared/DashboardSkeleton";

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
import { Checkbox } from "@/components/ui/checkbox";

const ROLES = ["Super Admin", "Manager", "Cashier", "Technician"] as const;

const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
    "Super Admin": {
        dashboard: true, jobs: true, inventory: true, pos: true, challans: true,
        finance: true, attendance: true, reports: true, serviceRequests: true,
        orders: true, technician: true, inquiries: true, systemHealth: true,
        users: true, settings: true, canCreate: true, canEdit: true, canDelete: true, canExport: true,
        canViewFullJobDetails: true, canPrintJobTickets: true, process_payment: true,
        corporate: true, notifications: true, knowledgeBase: true, warrantyClaims: true, refunds: true,
        canAssignTechnician: true, canSetPriority: true, canSetDeadline: true,
        canSetWarranty: true, canViewCustomerPhone: true, canAddAssistedBy: true,
    },
    "Manager": {
        dashboard: true, jobs: true, inventory: true, pos: true, challans: true,
        finance: true, attendance: true, reports: true, serviceRequests: true,
        orders: true, technician: false, inquiries: true, systemHealth: false,
        users: false, settings: false, canCreate: true, canEdit: true, canDelete: false, canExport: true,
        canViewFullJobDetails: true, canPrintJobTickets: true, process_payment: true,
        corporate: true, notifications: true, knowledgeBase: true, warrantyClaims: true, refunds: true,
        canAssignTechnician: true, canSetPriority: true, canSetDeadline: true,
        canSetWarranty: true, canViewCustomerPhone: true, canAddAssistedBy: true,
    },
    "Cashier": {
        dashboard: true, jobs: false, inventory: true, pos: true, challans: false,
        finance: false, attendance: true, reports: false, serviceRequests: false,
        orders: true, technician: false, inquiries: false, systemHealth: false,
        users: false, settings: false, canCreate: true, canEdit: false, canDelete: false, canExport: false,
        canViewFullJobDetails: false, canPrintJobTickets: false, process_payment: true,
        canAssignTechnician: false, canSetPriority: false, canSetDeadline: false,
        canSetWarranty: false, canViewCustomerPhone: true, canAddAssistedBy: false,
    },
    "Technician": {
        dashboard: false, jobs: true, inventory: false, pos: false, challans: true,
        finance: false, attendance: true, reports: false, serviceRequests: true,
        orders: false, technician: true, inquiries: false, systemHealth: false,
        users: false, settings: false, canCreate: false, canEdit: true, canDelete: false, canExport: false,
        canViewFullJobDetails: false, canPrintJobTickets: false, process_payment: false,
        canAssignTechnician: false, canSetPriority: false, canSetDeadline: false,
        canSetWarranty: false, canViewCustomerPhone: false, canAddAssistedBy: true,
    },
};

const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
    dashboard: "Dashboard",
    jobs: "Job Management",
    inventory: "Inventory",
    pos: "Point of Sale",
    challans: "Challans",
    finance: "Finance",
    attendance: "Attendance",
    reports: "Reports",
    serviceRequests: "Service Requests",
    orders: "Shop Orders",
    technician: "Technician View",
    inquiries: "Inquiries",
    systemHealth: "System Health",
    warrantyClaims: "Warranty Claims",
    refunds: "Refunds",
    corporate: "Managed Clients",
    notifications: "Notifications",
    knowledgeBase: "Knowledge Base",
    users: "User Management",
    settings: "Settings",
    canCreate: "Can Create",
    canEdit: "Can Edit",
    canDelete: "Can Delete",
    canExport: "Can Export",
    canViewFullJobDetails: "View Full Job Details",
    canPrintJobTickets: "Print Job Tickets",
    process_payment: "Process Payment",
    canAssignTechnician: "Assign Technician",
    canSetPriority: "Set Priority",
    canSetDeadline: "Set Deadline",
    canSetWarranty: "Set Warranty",
    canViewCustomerPhone: "View Customer Phone",
    canAddAssistedBy: "Add Assisted By",
    quality: "Quality Control",
    salary: "Salary & HR",
    purchasing: "Purchasing",
    wastage: "Wastage Management",
    auditLogs: "Audit Logs",
    brain: "System Brain Analytics",
    canViewUsers: "View Users List",
};

export default function UsersTab() {
    const queryClient = useQueryClient();
    const { user: currentUser, hasPermission, refreshUser } = useAdminAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const [formData, setFormData] = useState({
        username: "",
        name: "",
        email: "",
        password: "",
        role: "Cashier" as typeof ROLES[number],
        employmentType: "full_time" as "full_time" | "part_time",
        joinDate: format(new Date(), "yyyy-MM-dd"),
        initialSalary: {
            basicSalary: 0,
            houseRentAllowance: 0,
            medicalAllowance: 0,
            conveyanceAllowance: 0,
            otherAllowances: 0,
            incomeTaxPercent: 0,
        }
    });

    const [editPermissions, setEditPermissions] = useState<UserPermissions>({});

    const { data: users = [], isLoading, isError, error, refetch } = useQuery({
        queryKey: ["admin-users"],
        queryFn: adminUsersApi.getAll,
        enabled: !!currentUser,
        retry: false,
    });

    const createMutation = useMutation({
        mutationFn: adminUsersApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            toast.success("User created successfully");
            setIsCreateOpen(false);
            resetForm();
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminUsersApi.update>[1] }) =>
            adminUsersApi.update(id, data),
        onSuccess: async (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });

            if (variables.id === currentUser?.id) {
                await refreshUser();
            }

            if (variables.data.permissions) {
                toast.success("Permissions updated successfully");
                setIsPermissionsOpen(false);
            } else {
                toast.success("User updated successfully");
                setIsEditOpen(false);
            }
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

    const resetForm = () => {
        setFormData({
            username: "", name: "", email: "", password: "", role: "Cashier",
            employmentType: "full_time",
            joinDate: format(new Date(), "yyyy-MM-dd"),
            initialSalary: { basicSalary: 0, houseRentAllowance: 0, medicalAllowance: 0, conveyanceAllowance: 0, otherAllowances: 0, incomeTaxPercent: 0 }
        });
        setShowPassword(false);
    };

    const handleCreate = () => {
        if (!formData.username || !formData.name || !formData.email || !formData.password) {
            toast.error("Please fill in all fields");
            return;
        }

        const payload: any = {
            username: formData.username,
            name: formData.name,
            email: formData.email,
            password: formData.password,
            role: formData.role,
            permissions: JSON.stringify(DEFAULT_PERMISSIONS[formData.role]),
        };

        if (formData.role !== "Super Admin" && formData.initialSalary.basicSalary > 0) {
            payload.employmentType = formData.employmentType;
            payload.joinDate = formData.joinDate;
            payload.initialSalary = { ...formData.initialSalary, effectiveFrom: formData.joinDate };
        }

        createMutation.mutate(payload);
    };

    const handleEdit = () => {
        if (!selectedUser) return;
        const updates: Parameters<typeof adminUsersApi.update>[1] = {};
        if (formData.name && formData.name !== selectedUser.name) updates.name = formData.name;
        if (formData.email && formData.email !== selectedUser.email) updates.email = formData.email;
        if (formData.username && formData.username !== selectedUser.username) updates.username = formData.username;
        if (formData.role && formData.role !== selectedUser.role) updates.role = formData.role;
        if (formData.password) updates.password = formData.password;
        updateMutation.mutate({ id: selectedUser.id, data: updates });
    };

    const handleSavePermissions = () => {
        if (!selectedUser) return;
        updateMutation.mutate({
            id: selectedUser.id,
            data: { permissions: JSON.stringify(editPermissions) },
        });
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
            password: "",
            role: user.role as typeof ROLES[number],
            employmentType: "full_time",
            joinDate: format(new Date(), "yyyy-MM-dd"),
            initialSalary: { basicSalary: 0, houseRentAllowance: 0, medicalAllowance: 0, conveyanceAllowance: 0, otherAllowances: 0, incomeTaxPercent: 0 }
        });
        setIsEditOpen(true);
    };

    const openPermissionsDialog = (user: SafeUser) => {
        setSelectedUser(user);
        try {
            const storedPerms = typeof user.permissions === "string" ? JSON.parse(user.permissions) : user.permissions;
            const defaultPerms = DEFAULT_PERMISSIONS[user.role] || {};
            setEditPermissions({ ...defaultPerms, ...(storedPerms || {}) });
        } catch {
            setEditPermissions(DEFAULT_PERMISSIONS[user.role] || {});
        }
        setIsPermissionsOpen(true);
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

    if (isLoading) return <DashboardSkeleton />;

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 pb-24 md:pb-8"
        >
            {/* KPI ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <motion.div variants={itemVariants}>
                    <BentoCard
                        variant="vibrant"
                        className="bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/30 h-full"
                        title="Total Users"
                        icon={<Users size={20} className="text-white" />}
                    >
                        <div className="text-3xl font-bold text-white mt-2">{users.length}</div>
                        <div className="text-xs font-medium text-white/80 mt-1">Total system accounts</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        variant="vibrant"
                        className="bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30 h-full"
                        title="Active Now"
                        icon={<UserCheck size={20} className="text-white" />}
                    >
                        <div className="text-3xl font-bold text-white mt-2">{users.filter(u => (u.employmentStatus === "active" || (!u.employmentStatus && u.status === "Active"))).length}</div>
                        <div className="text-xs font-medium text-white/80 mt-1">Users with active status</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        variant="vibrant"
                        className="bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/30 h-full"
                        title="Admins"
                        icon={<UserCog size={20} className="text-white" />}
                    >
                        <div className="text-3xl font-bold text-white mt-2">{users.filter(u => u.role === "Super Admin").length}</div>
                        <div className="text-xs font-medium text-white/80 mt-1">Full system access</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        variant="vibrant"
                        className="bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/30 h-full"
                        title="Technicians"
                        icon={<HardHat size={20} className="text-white" />}
                    >
                        <div className="text-3xl font-bold text-white mt-2">{users.filter(u => u.role === "Technician").length}</div>
                        <div className="text-xs font-medium text-white/80 mt-1">Repair & service staff</div>
                    </BentoCard>
                </motion.div>
            </div>

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
                                <Button className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 gap-2" onClick={() => setIsCreateOpen(true)}>
                                    <UserPlus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Add User</span>
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
                                                        {isSuperAdmin && (
                                                            <DropdownMenuItem onClick={() => openPermissionsDialog(user)} className="rounded-xl flex items-center gap-2 py-2.5 px-3 cursor-pointer">
                                                                <Shield className="w-4 h-4 text-violet-500" /> Permissions
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
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="px-3 rounded-xl h-9 border-slate-200 text-slate-600"
                                        onClick={() => openPermissionsDialog(user)}
                                    >
                                        <Shield size={16} />
                                    </Button>
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

            {/* CREATE/EDIT/DELETE DIALOGS - Matching design-concept style */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className={cn(
                    "rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden transition-all duration-300",
                    formData.role === "Super Admin" ? "sm:max-w-[425px]" : "sm:max-w-[700px] lg:max-w-[800px]"
                )}>
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white relative overflow-hidden">
                        <Zap className="absolute top-[-20%] right-[-10%] w-48 h-48 text-white/10 rotate-12" />
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tighter">Add New Staff</DialogTitle>
                            <DialogDescription className="text-white/70 font-medium">Create a new user account with role-based access.</DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className={cn("p-8 gap-8", formData.role === "Super Admin" ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2")}>
                        {/* LEFT COLUMN: Personal Details */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Username</Label>
                                    <Input
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        placeholder="johndoe"
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
                                            {ROLES.filter(r => r !== "Super Admin").map((role) => (
                                                <SelectItem key={role} value={role} className="rounded-xl">{role}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Full Name</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="John Doe"
                                    className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Email</Label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="john@example.com"
                                    className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Password</Label>
                                <div className="relative">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="Min 6 characters"
                                        className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white pr-10"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full hover:bg-transparent text-slate-400"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Salary Details (Conditional) */}
                        {formData.role !== "Super Admin" && (
                            <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 md:pl-8 pt-6 md:pt-0">
                                <div className="mb-4">
                                    <h4 className="text-sm font-bold tracking-tight text-slate-800 flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                            <Activity className="w-3.5 h-3.5" />
                                        </div>
                                        Salary Setup (Optional)
                                    </h4>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1.5">
                                        If left blank, the employee will be marked as <span className="font-bold text-amber-600 bg-amber-50 px-1 rounded">Pending Compensation</span>.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Join Date</Label>
                                    <Input
                                        type="date"
                                        value={formData.joinDate}
                                        onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                                        className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white h-10"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-1">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Basic Salary</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">৳</span>
                                            <Input
                                                type="number"
                                                value={formData.initialSalary.basicSalary || ""}
                                                onChange={(e) => setFormData({ ...formData, initialSalary: { ...formData.initialSalary, basicSalary: Number(e.target.value) } })}
                                                placeholder="0"
                                                className="pl-7 rounded-xl bg-slate-50 border-slate-100 focus:bg-white h-10 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">HRA</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">৳</span>
                                            <Input
                                                type="number"
                                                value={formData.initialSalary.houseRentAllowance || ""}
                                                onChange={(e) => setFormData({ ...formData, initialSalary: { ...formData.initialSalary, houseRentAllowance: Number(e.target.value) } })}
                                                placeholder="0"
                                                className="pl-7 rounded-xl bg-slate-50 border-slate-100 focus:bg-white h-10 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Medical</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">৳</span>
                                            <Input
                                                type="number"
                                                value={formData.initialSalary.medicalAllowance || ""}
                                                onChange={(e) => setFormData({ ...formData, initialSalary: { ...formData.initialSalary, medicalAllowance: Number(e.target.value) } })}
                                                placeholder="0"
                                                className="pl-7 rounded-xl bg-slate-50 border-slate-100 focus:bg-white h-10 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Conveyance</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">৳</span>
                                            <Input
                                                type="number"
                                                value={formData.initialSalary.conveyanceAllowance || ""}
                                                onChange={(e) => setFormData({ ...formData, initialSalary: { ...formData.initialSalary, conveyanceAllowance: Number(e.target.value) } })}
                                                placeholder="0"
                                                className="pl-7 rounded-xl bg-slate-50 border-slate-100 focus:bg-white h-10 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Other</Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">৳</span>
                                            <Input
                                                type="number"
                                                value={formData.initialSalary.otherAllowances || ""}
                                                onChange={(e) => setFormData({ ...formData, initialSalary: { ...formData.initialSalary, otherAllowances: Number(e.target.value) } })}
                                                placeholder="0"
                                                className="pl-7 rounded-xl bg-slate-50 border-slate-100 focus:bg-white h-10 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Tax %</Label>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                value={formData.initialSalary.incomeTaxPercent || ""}
                                                onChange={(e) => setFormData({ ...formData, initialSalary: { ...formData.initialSalary, incomeTaxPercent: Number(e.target.value) } })}
                                                placeholder="0"
                                                className="pr-7 rounded-xl bg-slate-50 border-slate-100 focus:bg-white h-10 shadow-sm"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-8 pt-0 flex gap-3">
                        <Button variant="ghost" className="flex-1 rounded-xl h-12 font-bold text-slate-500" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button
                            className="flex-[2] rounded-xl h-12 font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                            onClick={handleCreate}
                            disabled={createMutation.isPending}
                        >
                            {createMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify & Create"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* EDIT USER DIALOG - Similar pattern */}
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                <DialogContent className="sm:max-w-[425px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
                    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white relative overflow-hidden">
                        <Edit className="absolute top-[-20%] right-[-10%] w-48 h-48 text-white/10 rotate-12" />
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tighter">Edit Staff Profile</DialogTitle>
                            <DialogDescription className="text-white/70 font-medium">Update account information for {selectedUser?.name}.</DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="p-8 space-y-4">
                        {isSuperAdmin && (
                            <div className="grid grid-cols-2 gap-4">
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
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">New Password</Label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Leave blank to keep current"
                                    className="rounded-xl bg-slate-50 border-slate-100 focus:bg-white pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full hover:bg-transparent text-slate-400"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="p-8 pt-0 flex gap-3">
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

            {/* PERMISSIONS DIALOG */}
            <Dialog open={isPermissionsOpen} onOpenChange={setIsPermissionsOpen}>
                <DialogContent className="sm:max-w-[500px] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="bg-gradient-to-br from-violet-600 to-indigo-700 p-8 text-white relative shrink-0">
                        <Shield className="absolute top-[-20%] right-[-10%] w-48 h-48 text-white/10 rotate-12" />
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black tracking-tighter">Access Control</DialogTitle>
                            <DialogDescription className="text-white/70 font-medium">Fine-tune system permissions for {selectedUser?.name}.</DialogDescription>
                        </DialogHeader>
                    </div>
                    <div className="p-8 overflow-y-auto space-y-6">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Module Access</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {(["dashboard", "jobs", "inventory", "pos", "challans", "finance", "attendance", "reports", "serviceRequests", "orders", "technician", "inquiries", "systemHealth", "users", "settings"] as const).map((key) => (
                                    <div key={key} className="flex items-center space-x-3 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition-colors">
                                        <Checkbox
                                            id={`perm-${key}`}
                                            checked={editPermissions[key] === true}
                                            onCheckedChange={(checked) => setEditPermissions(prev => ({ ...prev, [key]: checked === true }))}
                                            className="h-5 w-5 rounded-lg border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                        />
                                        <Label htmlFor={`perm-${key}`} className="text-sm font-semibold text-slate-600 cursor-pointer">{PERMISSION_LABELS[key]}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Action Rights</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {(["canCreate", "canEdit", "canDelete", "canExport", "process_payment"] as const).map((key) => (
                                    <div key={key} className="flex items-center space-x-3 p-3 rounded-2xl bg-amber-50/10 border border-amber-100/50 hover:bg-amber-50/20 transition-colors">
                                        <Checkbox
                                            id={`perm-${key}`}
                                            checked={editPermissions[key] === true}
                                            onCheckedChange={(checked) => setEditPermissions(prev => ({ ...prev, [key]: checked === true }))}
                                            className="h-5 w-5 rounded-lg border-amber-300 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                                        />
                                        <Label htmlFor={`perm-${key}`} className="text-sm font-bold text-amber-900/70 cursor-pointer">{PERMISSION_LABELS[key]}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Advanced Modules</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {(["corporate", "warrantyClaims", "refunds", "notifications", "knowledgeBase"] as const).map((key) => (
                                    <div key={key} className="flex items-center space-x-3 p-3 rounded-2xl bg-indigo-50/30 border border-indigo-100/50 hover:bg-indigo-50/50 transition-colors">
                                        <Checkbox
                                            id={`perm-${key}`}
                                            checked={editPermissions[key] === true}
                                            onCheckedChange={(checked) => setEditPermissions(prev => ({ ...prev, [key]: checked === true }))}
                                            className="h-5 w-5 rounded-lg border-indigo-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                        />
                                        <Label htmlFor={`perm-${key}`} className="text-sm font-bold text-indigo-900/70 cursor-pointer">{PERMISSION_LABELS[key]}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-8 pt-0 flex gap-3 shrink-0">
                        <Button variant="ghost" className="flex-1 rounded-xl h-12 font-bold text-slate-500" onClick={() => setIsPermissionsOpen(false)}>Cancel</Button>
                        <Button
                            className="flex-[2] rounded-xl h-12 font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                            onClick={handleSavePermissions}
                            disabled={updateMutation.isPending}
                        >
                            {updateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Authorize & Save"}
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
        </motion.div>
    );
}
