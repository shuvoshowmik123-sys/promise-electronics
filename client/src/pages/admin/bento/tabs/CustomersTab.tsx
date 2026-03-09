import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Users, Search, Plus, Phone, Mail,
    Loader2, Trash2, Activity, ShoppingBag,
    Wrench, CheckCircle, Clock, ExternalLink, RefreshCw,
    LayoutGrid, List, FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { adminCustomersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants, tableRowVariants } from "../shared/animations";

export default function CustomersTab() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState<"list" | "grid">("list");
    const [activitySheet, setActivitySheet] = useState<{ open: boolean, customer: any | null }>({ open: false, customer: null });
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [formData, setFormData] = useState({ name: "", phone: "", email: "", address: "" });

    const { data: customers = [], isLoading } = useQuery({
        queryKey: ["customers"],
        queryFn: adminCustomersApi.getAll,
    });



    const addCustomerMutation = useMutation({
        mutationFn: adminCustomersApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            setIsAddDialogOpen(false);
            setFormData({ name: "", phone: "", email: "", address: "" });
            toast.success("Customer added successfully");
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to add customer");
        }
    });

    const deleteCustomerMutation = useMutation({
        mutationFn: adminCustomersApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customers"] });
            toast.success("Customer deleted");
        },
    });

    const filteredCustomers = customers.filter((c: any) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
        >
            {/* Header section with Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <BentoCard
                    className="h-[140px] bg-gradient-to-br from-blue-50 to-indigo-50"
                    title="Total Customers"
                    icon={<Users size={20} className="text-blue-600" />}
                >
                    <div className="flex flex-col justify-end h-full mt-2">
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono">{customers.length}</div>
                        <div className="text-slate-500 text-sm mt-0.5">All registered users</div>
                    </div>
                </BentoCard>

                <BentoCard
                    className="h-[140px] bg-gradient-to-br from-purple-50 to-pink-50"
                    title="Recent Activity"
                    icon={<Activity size={20} className="text-purple-600" />}
                >
                    <div className="flex flex-col justify-end h-full mt-2">
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono">
                            {customers.filter((c: any) => new Date(c.joinedAt || c.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}
                        </div>
                        <div className="text-slate-500 text-sm mt-0.5">New users in last 30 days</div>
                    </div>
                </BentoCard>

                <BentoCard
                    className="h-[140px] bg-gradient-to-br from-emerald-50 to-teal-50"
                    title="Total Orders"
                    icon={<ShoppingBag size={20} className="text-emerald-600" />}
                >
                    <div className="flex flex-col justify-end h-full mt-2">
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono">
                            {customers.reduce((acc: number, c: any) => acc + (c.ordersCount || 0), 0)}
                        </div>
                        <div className="text-slate-500 text-sm mt-0.5">Across all customers</div>
                    </div>
                </BentoCard>
            </div>

            {/* Action Bar */}
            <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 hidden md:flex shrink-0">
                        <button
                            onClick={() => setViewMode("list")}
                            className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === "list" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            title="List View"
                        >
                            <List className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === "grid" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            title="Grid View"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                    </div>
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search customers..."
                            className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-blue-500 rounded-lg"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <Button
                    onClick={() => {
                        setFormData({ name: "", phone: "", email: "", address: "" });
                        setIsAddDialogOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 rounded-lg"
                >
                    <Plus className="mr-2 h-4 w-4" /> Add Customer
                </Button>
            </motion.div>

            {/* Main Content */}
            <motion.div variants={itemVariants} className={viewMode === "list" ? "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" : ""}>
                {viewMode === "list" && (
                    <div className="hidden md:block">
                        <ScrollArea className="h-[600px]">
                            <Table>
                                <TableHeader className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm border-b border-slate-100">
                                    <TableRow className="hover:bg-transparent border-b border-slate-100">
                                        <TableHead className="w-[250px] font-semibold text-slate-700">Customer</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Contact</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Engagement</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Lifetime Value</TableHead>
                                        <TableHead className="font-semibold text-slate-700">Status & Activity</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        [1, 2, 3, 4, 5].map(i => (
                                            <TableRow key={i} className="border-b border-slate-100 last:border-0">
                                                <TableCell colSpan={5}><div className="h-14 bg-slate-50 animate-pulse rounded-lg border border-slate-100" /></TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <AnimatePresence>
                                            {filteredCustomers.map((customer: any, i: number) => (
                                                <motion.tr
                                                    key={customer.id}
                                                    variants={tableRowVariants}
                                                    initial="hidden"
                                                    animate="visible"
                                                    custom={i}
                                                    onClick={() => setActivitySheet({ open: true, customer })}
                                                    className="group hover:bg-blue-50/40 transition-colors border-b border-slate-100 last:border-0 cursor-pointer bg-white bc-hover bc-rise"
                                                >
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <motion.div layoutId={`avatar-${customer.id}`}>
                                                                <Avatar className="h-10 w-10 bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200/50 shadow-sm relative z-10">
                                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${customer.name}&backgroundColor=transparent`} />
                                                                    <AvatarFallback className="text-blue-700 font-semibold">{customer.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                                </Avatar>
                                                            </motion.div>
                                                            <div>
                                                                <motion.div layoutId={`name-${customer.id}`} className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors w-fit relative z-10">{customer.name}</motion.div>
                                                                <div className="text-xs text-slate-500 truncate max-w-[200px] font-medium">{customer.address || "No Address on File"}</div>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="space-y-1.5">
                                                            <motion.div layoutId={`phone-${customer.id}`} className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md w-fit relative z-10">
                                                                <Phone className="h-3 w-3 text-blue-500" /> {customer.phone}
                                                            </motion.div>
                                                            {customer.email && (
                                                                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 px-2 relative z-10">
                                                                    <Mail className="h-3 w-3 text-slate-400" /> {customer.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-2 relative z-10">
                                                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100/50 font-medium w-fit flex items-center gap-1">
                                                                <ShoppingBag className="h-3 w-3" /> {customer.totalOrders || 0} Orders
                                                            </Badge>
                                                            <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100/50 font-medium w-fit flex items-center gap-1">
                                                                <Wrench className="h-3 w-3" /> {customer.totalServiceRequests || 0} Repairs
                                                            </Badge>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <motion.div layoutId={`ltv-${customer.id}`} className="font-semibold text-slate-800 font-mono text-base relative z-10 w-fit">
                                                            ৳ {(customer.lifetimeValue || 0).toLocaleString()}
                                                        </motion.div>
                                                    </TableCell>
                                                    <TableCell className="space-y-1.5 relative z-10">
                                                        <div className="flex items-center gap-1.5">
                                                            <motion.div layoutId={`status-${customer.id}`}>
                                                                {customer.status === 'Active' ? (
                                                                    <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] uppercase">Active</Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-[10px] uppercase">{customer.status}</Badge>
                                                                )}
                                                            </motion.div>
                                                            {customer.isVerified && <CheckCircle className="h-3.5 w-3.5 text-blue-500 relative z-10" />}
                                                        </div>
                                                        <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            Active: {new Date(customer.lastInteractionDate || customer.joinedAt || Date.now()).toLocaleDateString(undefined, {
                                                                month: 'short', day: 'numeric', year: 'numeric'
                                                            })}
                                                        </div>
                                                    </TableCell>
                                                </motion.tr>
                                            ))}
                                        </AnimatePresence>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    </div>
                )}

                {/* Grid View (Desktop & Mobile Fallback for List View) */}
                <div className={viewMode === "list" ? "md:hidden p-4 space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"}>
                    {filteredCustomers.map((customer: any) => (
                        <motion.div layoutId={`card-${customer.id}`} key={customer.id} onClick={() => setActivitySheet({ open: true, customer })} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4 cursor-pointer bc-hover bc-rise transition-all relative">
                            <div className="flex items-start justify-between relative z-10">
                                <div className="flex items-center gap-3">
                                    <motion.div layoutId={`avatar-${customer.id}`}>
                                        <Avatar className="h-12 w-12 bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200/50 shadow-sm relative z-10">
                                            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${customer.name}&backgroundColor=transparent`} />
                                            <AvatarFallback className="text-blue-700 font-semibold">{customer.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                    </motion.div>
                                    <div className="space-y-0.5">
                                        <motion.div layoutId={`name-${customer.id}`} className="font-semibold text-slate-900 leading-tight w-fit relative z-10">{customer.name}</motion.div>
                                        <p className="text-xs font-medium text-slate-500 relative z-10">
                                            {new Date(customer.joinedAt || customer.createdAt).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <motion.div layoutId={`status-${customer.id}`}>
                                    {customer.status === 'Active' ? (
                                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] uppercase">Active</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-[10px] uppercase">{customer.status}</Badge>
                                    )}
                                </motion.div>
                            </div>

                            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100 relative z-10">
                                <motion.div layoutId={`phone-${customer.id}`} className="flex items-center gap-2 text-xs font-medium text-slate-700 w-fit relative z-10">
                                    <Phone className="h-3.5 w-3.5 text-blue-500" /> {customer.phone}
                                </motion.div>
                                {customer.email && (
                                    <div className="flex items-center gap-2 text-xs font-medium text-slate-600 relative z-10">
                                        <Mail className="h-3.5 w-3.5 text-slate-400" /> {customer.email}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 mt-2 relative z-10">
                                <div className="space-y-1.5">
                                    <p className="text-xs text-slate-500 font-medium relative z-10">Engagement</p>
                                    <div className="flex flex-wrap gap-1.5 relative z-10">
                                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100/50 font-medium text-[10px] flex items-center gap-1">
                                            <ShoppingBag className="h-3 w-3" /> {customer.totalOrders || 0}
                                        </Badge>
                                        <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100/50 font-medium text-[10px] flex items-center gap-1">
                                            <Wrench className="h-3 w-3" /> {customer.totalServiceRequests || 0}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="space-y-1.5 text-right relative z-10">
                                    <p className="text-xs text-slate-500 font-medium">LTV</p>
                                    <motion.div layoutId={`ltv-${customer.id}`} className="font-mono text-sm font-bold text-slate-800 ml-auto w-fit">৳ {(customer.lifetimeValue || 0).toLocaleString()}</motion.div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-3 border-t border-slate-100 relative z-10">
                                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider relative z-10">
                                    {customer.status}
                                </div>
                                <Button variant="ghost" size="sm" className="h-8 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg px-3 relative z-10" onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Are you sure?")) deleteCustomerMutation.mutate(customer.id);
                                }}>
                                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                                </Button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>


            {/* Add Customer Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Customer</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Full Name <span className="text-red-500">*</span></Label>
                            <Input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Enter full name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone Number <span className="text-red-500">*</span></Label>
                            <Input
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="Enter phone number"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                placeholder="Enter email address"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Input
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                placeholder="Enter address"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => addCustomerMutation.mutate(formData)}
                            disabled={!formData.name || !formData.phone || addCustomerMutation.isPending}
                        >
                            {addCustomerMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Create Customer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Framer Motion Expanding Activity Overlay */}
            <AnimatePresence>
                {activitySheet.open && activitySheet.customer && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setActivitySheet({ open: false, customer: null })}
                        />
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                            <motion.div
                                layoutId={viewMode === "grid" || window.innerWidth < 768 ? `card-${activitySheet.customer.id}` : undefined}
                                className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto relative border border-slate-100"
                            >
                                <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-20">
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                                        <Activity className="h-5 w-5 text-blue-600" />
                                        Customer Activity
                                    </h2>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setActivitySheet({ open: false, customer: null })}>
                                        <span className="sr-only">Close</span>
                                        <Trash2 className="h-4 w-4" style={{ display: 'none' }} />
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x h-4 w-4"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                    </Button>
                                </div>
                                <ScrollArea className="flex-1 overflow-y-auto">
                                    <div className="p-6 space-y-8">
                                        {/* Profile Summary */}
                                        <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex items-start gap-4">
                                            <motion.div layoutId={`avatar-${activitySheet.customer.id}`}>
                                                <Avatar className="h-14 w-14 bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200 shadow-sm relative z-10">
                                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${activitySheet.customer.name}&backgroundColor=transparent`} />
                                                    <AvatarFallback className="text-blue-700 font-semibold">{activitySheet.customer.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                            </motion.div>

                                            <div className="space-y-1 flex-1">
                                                <motion.h3 layoutId={`name-${activitySheet.customer.id}`} className="font-bold text-lg text-slate-900 w-fit relative z-10">{activitySheet.customer.name}</motion.h3>
                                                <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
                                                    <motion.span layoutId={`phone-${activitySheet.customer.id}`} className="flex items-center gap-1 w-fit relative z-10"><Phone className="h-3.5 w-3.5 text-blue-500" /> {activitySheet.customer.phone}</motion.span>
                                                </div>
                                                <div className="pt-2 flex flex-wrap gap-2">
                                                    <motion.div layoutId={`status-${activitySheet.customer.id}`}>
                                                        {activitySheet.customer.status === 'Active' ? (
                                                            <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] uppercase">Active Option</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-[10px] uppercase">{activitySheet.customer.status}</Badge>
                                                        )}
                                                    </motion.div>

                                                    <motion.div layoutId={`ltv-${activitySheet.customer.id}`} className="w-fit relative z-10">
                                                        <Badge variant="secondary" className="bg-white border-slate-200 font-mono text-xs shadow-sm">
                                                            LTV: ৳ {(activitySheet.customer.lifetimeValue || 0).toLocaleString()}
                                                        </Badge>
                                                    </motion.div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-3">
                                            <Button
                                                variant="outline"
                                                className="text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 font-semibold"
                                                onClick={() => {
                                                    setActivitySheet({ open: false, customer: null });
                                                    setTimeout(() => {
                                                        window.location.hash = `#quotations?search=${encodeURIComponent(activitySheet.customer.phone)}`;
                                                    }, 100);
                                                }}
                                            >
                                                <FileText className="h-4 w-4 mr-2" />
                                                Create Quotation
                                            </Button>
                                        </div>

                                        {/* Interaction Timeline */}
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                                <RefreshCw className="h-4 w-4 text-slate-400" />
                                                Interaction History
                                            </h4>

                                            {(!activitySheet.customer.interactionTimeline || activitySheet.customer.interactionTimeline.length === 0) ? (
                                                <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-200 rounded-xl">
                                                    No interactions found for this customer.
                                                </div>
                                            ) : (
                                                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                                                    {activitySheet.customer.interactionTimeline.map((interaction: any, index: number) => (
                                                        <div
                                                            key={`${interaction.type}-${interaction.id}-${index}`}
                                                            className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active cursor-pointer"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                setActivitySheet({ open: false, customer: null });
                                                                // Allow time for exit animation before navigation
                                                                setTimeout(() => {
                                                                    if (interaction.type === 'Service Request' || interaction.type === 'Repair') {
                                                                        window.location.hash = `#service-requests?search=${interaction.reference}`;
                                                                    } else if (interaction.type === 'Shop Order') {
                                                                        window.location.hash = `#orders?search=${interaction.reference}`;
                                                                    } else if (interaction.type === 'Job Ticket' || interaction.type === 'Invoice') {
                                                                        window.location.hash = `#jobs?search=${interaction.reference}`;
                                                                    }
                                                                }, 100);
                                                            }}
                                                        >
                                                            {/* Line Marker */}
                                                            <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-slate-100 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 transition-colors group-hover:border-blue-100 group-hover:bg-blue-50">
                                                                {interaction.type === 'Shop Order' ? (
                                                                    <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />
                                                                ) : interaction.type === 'Job Ticket' ? (
                                                                    <Wrench className="h-3.5 w-3.5 text-orange-600" />
                                                                ) : interaction.type === 'Invoice' ? (
                                                                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                                                                ) : (
                                                                    <Wrench className="h-3.5 w-3.5 text-purple-600" />
                                                                )}
                                                            </div>

                                                            {/* Content */}
                                                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-100 bg-white shadow-sm transition-all group-hover:shadow-md group-hover:border-blue-200">
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                                                                        {interaction.type}
                                                                    </span>
                                                                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                                                        <Clock className="h-3 w-3" />
                                                                        {new Date(interaction.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                    </span>
                                                                </div>
                                                                <div className="font-semibold text-slate-900 mt-1 flex items-center gap-2 group-hover:text-blue-700 transition-colors">
                                                                    #{interaction.reference}
                                                                    <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-blue-500 transition-colors" />
                                                                </div>
                                                                <div className="flex items-center justify-between mt-3">
                                                                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                                                                        {interaction.status}
                                                                    </Badge>
                                                                    <span className="font-mono text-sm font-bold text-slate-800">
                                                                        ৳ {interaction.amount?.toLocaleString() || 0}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </motion.div>
                                    </div>
                                </ScrollArea>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>
        </motion.div >
    );
}
