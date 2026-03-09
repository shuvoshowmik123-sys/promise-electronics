import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { BentoCard } from "../../shared/BentoCard";
import { DollarSign, Search, Plus, Loader2, ArrowRight, Calendar, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SafeUser } from "@/lib/api/types";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

// ── Salary Assignment Dialog ──────────────────────────────────────────────────
function AssignSalaryDialog({
    open,
    onClose,
    userId,
    userName,
    onSuccess,
}: {
    open: boolean;
    onClose: () => void;
    userId: string;
    userName: string;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const today = format(new Date(), "yyyy-MM-dd");

    const [form, setForm] = useState({
        baseAmount: "",
        hraAmount: "",
        medicalAmount: "",
        conveyanceAmount: "",
        otherAmount: "",
        incomeTaxPercent: "0",
        effectiveFrom: today,
        changeReason: "new_hire",
    });

    const set = (field: string, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    // Auto-fill allowances from base (50% HRA, 10% medical, 10% conveyance)
    const handleBaseChange = (val: string) => {
        const base = parseFloat(val) || 0;
        setForm((prev) => ({
            ...prev,
            baseAmount: val,
            hraAmount: prev.hraAmount === "" ? String(Math.round(base * 0.5)) : prev.hraAmount,
            medicalAmount: prev.medicalAmount === "" ? String(Math.round(base * 0.1)) : prev.medicalAmount,
            conveyanceAmount: prev.conveyanceAmount === "" ? String(Math.round(base * 0.1)) : prev.conveyanceAmount,
        }));
    };

    const gross =
        (parseFloat(form.baseAmount) || 0) +
        (parseFloat(form.hraAmount) || 0) +
        (parseFloat(form.medicalAmount) || 0) +
        (parseFloat(form.conveyanceAmount) || 0) +
        (parseFloat(form.otherAmount) || 0);

    const { mutate, isPending } = useMutation({
        mutationFn: () =>
            apiRequest("POST", "/api/admin/hr/salary-assignments", {
                userId,
                baseAmount: parseFloat(form.baseAmount),
                hraAmount: parseFloat(form.hraAmount) || 0,
                medicalAmount: parseFloat(form.medicalAmount) || 0,
                conveyanceAmount: parseFloat(form.conveyanceAmount) || 0,
                otherAmount: parseFloat(form.otherAmount) || 0,
                incomeTaxPercent: parseFloat(form.incomeTaxPercent) || 0,
                effectiveFrom: form.effectiveFrom,
                changeReason: form.changeReason,
            }),
        onSuccess: () => {
            toast({ title: "Salary assigned", description: `${userName}'s compensation has been set up.` });
            onSuccess();
            onClose();
        },
        onError: () => {
            toast({ title: "Failed to assign salary", variant: "destructive" });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.baseAmount || parseFloat(form.baseAmount) <= 0) {
            toast({ title: "Base salary is required", variant: "destructive" });
            return;
        }
        mutate();
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />

                    {/* Modal */}
                    <motion.div
                        className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 16 }}
                        transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold leading-tight">Salary Assignment</h3>
                                    <p className="text-emerald-100 text-xs mt-0.5">{userName}</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 rounded-xl hover:bg-white/20 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="p-5 space-y-5">
                            {/* Base + Effective From */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Base Salary (৳) *
                                    </Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        placeholder="e.g. 25000"
                                        className="rounded-xl border-slate-200 focus:ring-emerald-500 focus:border-emerald-500"
                                        value={form.baseAmount}
                                        onChange={(e) => handleBaseChange(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Effective From
                                    </Label>
                                    <Input
                                        type="date"
                                        className="rounded-xl border-slate-200"
                                        value={form.effectiveFrom}
                                        onChange={(e) => set("effectiveFrom", e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Allowances */}
                            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Allowances
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { key: "hraAmount", label: "House Rent (HRA)" },
                                        { key: "medicalAmount", label: "Medical" },
                                        { key: "conveyanceAmount", label: "Conveyance" },
                                        { key: "otherAmount", label: "Other" },
                                    ].map(({ key, label }) => (
                                        <div key={key} className="space-y-1">
                                            <Label className="text-[10px] font-semibold text-slate-500">
                                                {label} (৳)
                                            </Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                className="h-8 rounded-xl bg-white border-slate-200 text-sm"
                                                value={(form as any)[key]}
                                                onChange={(e) => set(key, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Tax + Reason */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Income Tax (%)
                                    </Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        placeholder="0"
                                        className="rounded-xl border-slate-200"
                                        value={form.incomeTaxPercent}
                                        onChange={(e) => set("incomeTaxPercent", e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Reason
                                    </Label>
                                    <Select value={form.changeReason} onValueChange={(v) => set("changeReason", v)}>
                                        <SelectTrigger className="rounded-xl border-slate-200 h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="new_hire">New Hire</SelectItem>
                                            <SelectItem value="increment">Increment</SelectItem>
                                            <SelectItem value="adjustment">Adjustment</SelectItem>
                                            <SelectItem value="promotion">Promotion</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Gross Preview */}
                            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                                <span className="text-sm font-semibold text-emerald-700">Gross Salary</span>
                                <span className="text-lg font-black text-emerald-700">
                                    ৳{gross.toLocaleString("en-BD")}
                                </span>
                            </div>

                            {/* Footer actions */}
                            <div className="flex gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1 rounded-xl"
                                    onClick={onClose}
                                    disabled={isPending}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                                    disabled={isPending}
                                >
                                    {isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                    ) : (
                                        <DollarSign className="w-4 h-4 mr-2" />
                                    )}
                                    Save Assignment
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function EmployeeCompensationSubTab() {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);

    // Fetch all staff users
    const { data: users, isLoading: isLoadingUsers } = useQuery<SafeUser[]>({
        queryKey: ['/api/admin/users'],
    });

    const staffUsers = users?.filter(u => ['Super Admin', 'Manager', 'Cashier', 'Technician'].includes(u.role)) || [];
    const filteredUsers = staffUsers.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const selectedUser = staffUsers.find(u => u.id === selectedUserId);

    // Fetch assignment for selected user
    const { data: assignmentData, isLoading: isLoadingAssignment, refetch: refetchAssignment } = useQuery<any>({
        queryKey: ['/api/admin/hr/salary-assignments', selectedUserId],
        queryFn: () => apiRequest("GET", `/api/admin/hr/salary-assignments/${selectedUserId}`),
        enabled: !!selectedUserId,
    });

    const profile = assignmentData?.profile;
    const activeAssignment = assignmentData?.assignment;

    return (
        <>
            {selectedUserId && selectedUser && (
                <AssignSalaryDialog
                    open={assignDialogOpen}
                    onClose={() => setAssignDialogOpen(false)}
                    userId={selectedUserId}
                    userName={selectedUser.name}
                    onSuccess={() => {
                        refetchAssignment();
                        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
                    }}
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full h-[600px]">
                {/* ── Employee List (Left Panel) ── */}
                <BentoCard variant="ghost" className="md:col-span-4 bg-white border border-slate-200 shadow-sm p-0 flex flex-col h-full rounded-[1.5rem] overflow-hidden" disableHover>
                    <div className="p-4 border-b border-slate-50 shrink-0">
                        <h3 className="font-bold text-slate-700 leading-tight mb-3">Employees</h3>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search by name..."
                                className="pl-9 bg-slate-50 border-slate-200 h-9 rounded-xl text-sm transition-all focus-visible:ring-1 focus-visible:ring-emerald-500 focus-visible:border-emerald-500"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    <ScrollArea className="flex-1">
                        {isLoadingUsers ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 text-sm">
                                No employees found.
                            </div>
                        ) : (
                            <div className="p-2 space-y-1 block">
                                {filteredUsers.map(user => (
                                    <button
                                        key={user.id}
                                        onClick={() => setSelectedUserId(user.id)}
                                        className={`w-full text-left p-3 rounded-xl transition-all duration-200 flex items-center justify-between group ${selectedUserId === user.id ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${selectedUserId === user.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`text-sm font-semibold truncate ${selectedUserId === user.id ? 'text-emerald-900' : 'text-slate-700'}`}>
                                                    {user.name}
                                                </p>
                                                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                                    {user.role}
                                                </p>
                                            </div>
                                        </div>
                                        {selectedUserId === user.id && (
                                            <ArrowRight className="w-4 h-4 text-emerald-500 shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </BentoCard>

                {/* ── Assignment Detail (Right Panel) ── */}
                <BentoCard variant="ghost" className="md:col-span-8 bg-white border border-slate-200 shadow-sm p-0 flex flex-col h-full rounded-[1.5rem] overflow-hidden" disableHover>
                    {selectedUserId ? (
                        isLoadingAssignment ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
                            </div>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="p-5 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 bg-slate-50/50">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-slate-800 text-lg">Compensation Timeline</h3>
                                            <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 font-medium rounded-full text-[10px] px-2">
                                                {profile?.employmentStatus === 'active' ? (
                                                    <span className="flex items-center gap-1 text-emerald-600"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active</span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-amber-600"><AlertCircle className="w-3 h-3" /> {profile?.employmentStatus || 'Unknown'}</span>
                                                )}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            Joined: {profile?.joinDate ? format(new Date(profile.joinDate), 'PP') : 'N/A'}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-8 px-4 text-xs font-medium w-full sm:w-auto shadow-sm"
                                        onClick={() => setAssignDialogOpen(true)}
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                        New Assignment
                                    </Button>
                                </div>

                                {/* Timeline Content */}
                                <ScrollArea className="flex-1 bg-slate-50/30 p-6">
                                    {!activeAssignment ? (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                                            <DollarSign className="w-10 h-10 text-slate-300 mb-3" />
                                            <p className="font-semibold text-slate-700 text-base">No Active Compensation</p>
                                            <p className="text-sm mt-1 max-w-sm text-center">This employee does not have an active salary assignment.</p>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="mt-4 rounded-full border-slate-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 font-medium"
                                                onClick={() => setAssignDialogOpen(true)}
                                            >
                                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                                Set Up Initial Salary
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="relative pl-6 border-l-2 border-emerald-100 space-y-8 pb-8">
                                            {/* Current Active Assignment Card */}
                                            <div className="relative">
                                                <div className="absolute -left-[31px] top-4 w-4 h-4 rounded-full bg-emerald-50  border-2 border-emerald-500 z-10 ring-4 ring-white" />
                                                <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                                    <div className="flex justify-between items-start mb-4">
                                                        <div>
                                                            <Badge variant="default" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 rounded-full text-[10px] px-2 mb-2">
                                                                Current Active
                                                            </Badge>
                                                            <h4 className="font-bold text-slate-800 text-lg flex items-center gap-1">
                                                                ৳{activeAssignment.baseAmount?.toLocaleString()} <span className="text-xs text-slate-400 font-normal">Base</span>
                                                            </h4>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs font-semibold text-slate-700 mb-0.5">Effective From</p>
                                                            <p className="text-sm text-emerald-600 font-mono tracking-tight bg-emerald-50 px-2 py-0.5 rounded-md inline-block">
                                                                {format(new Date(activeAssignment.effectiveFrom), 'MMM d, yyyy')}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">House Rent</p>
                                                            <p className="text-sm font-medium text-slate-700">৳{activeAssignment.hraAmount?.toLocaleString() || 0}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Medical</p>
                                                            <p className="text-sm font-medium text-slate-700">৳{activeAssignment.medicalAmount?.toLocaleString() || 0}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Conveyance</p>
                                                            <p className="text-sm font-medium text-slate-700">৳{activeAssignment.conveyanceAmount?.toLocaleString() || 0}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-1">Income Tax</p>
                                                            <p className="text-sm font-medium text-rose-600">{activeAssignment.incomeTaxPercent || 0}%</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px] font-medium text-slate-500 bg-slate-50 border-slate-200">
                                                            Reason: {activeAssignment.changeReason.replace(/_/g, ' ')}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* History placeholder */}
                                            <div className="relative opacity-60">
                                                <div className="absolute -left-[30px] top-4 w-3 h-3 rounded-full bg-slate-200 border-2 border-white z-10" />
                                                <div className="bg-white border border-slate-200 rounded-2xl p-4">
                                                    <div className="flex justify-between items-center">
                                                        <div>
                                                            <p className="text-xs text-slate-500 mb-1">Previous Assignment</p>
                                                            <h4 className="font-semibold text-slate-600">History will appear here</h4>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </ScrollArea>
                            </>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 h-full bg-slate-50/50">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 border-4 border-white shadow-sm">
                                <UsersIcon className="w-6 h-6 text-emerald-400" />
                            </div>
                            <p className="text-base font-semibold text-slate-700 mb-1">Select an employee</p>
                            <p className="text-sm text-slate-400 max-w-[250px]">Choose an employee from the list to view their compensation details and history.</p>
                        </div>
                    )}
                </BentoCard>
            </div>
        </>
    );
}

// Temporary icon to avoid large import at top
function UsersIcon(props: any) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
