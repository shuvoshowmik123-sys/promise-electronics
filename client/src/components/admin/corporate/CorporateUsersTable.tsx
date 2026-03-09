import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { corporateApi, adminUsersApi, SafeUser } from "@/lib/api";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, UserPlus, Trash2, Search, Users, ChevronLeft, ChevronRight, Copy, Check, AtSign, Clock, ShieldCheck, Mail, Building2, PanelRight, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface CorporateUsersTableProps {
    clientId: string;
}

export function CorporateUsersTable({ clientId }: CorporateUsersTableProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // UI State
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);

    // Modal State
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [createdUserCreds, setCreatedUserCreds] = useState<{ username: string, password: string } | null>(null);
    const [copied, setCopied] = useState(false);

    // Fetch Users
    const { data: users, isLoading } = useQuery({
        queryKey: ["corporateUsers", clientId],
        queryFn: () => corporateApi.getCorporateUsers(clientId),
    });

    // Create User Mutation
    const createUserMutation = useMutation({
        mutationFn: corporateApi.createCorporateUser,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["corporateUsers", clientId] });
            setIsAddUserOpen(false);
            setFormData({ name: "", username: "", email: "" }); // Reset form

            if (data.temporaryPassword) {
                setCreatedUserCreds({
                    username: data.user.username || "",
                    password: data.temporaryPassword
                });
            } else {
                toast({
                    title: "User Created",
                    description: `Credentials have been emailed to ${data.user.email}`,
                });
            }
        },
        onError: (error: Error) => {
            toast({
                title: "Failed to create user",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    // Delete User Mutation
    const deleteUserMutation = useMutation({
        mutationFn: adminUsersApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["corporateUsers", clientId] });
            setSelectedUser(null);
            toast({ title: "User deleted" });
        },
        onError: (error: Error) => {
            toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
        }
    });

    const [formData, setFormData] = useState({
        name: "",
        username: "",
        email: ""
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createUserMutation.mutate({
            corporateClientId: clientId,
            ...formData
        });
    };

    const handleCopyToken = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const filteredUsers = (users || []).filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredUsers.length / limit);
    const paginatedUsers = filteredUsers.slice((page - 1) * limit, page * limit);

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden min-h-0 relative">

            {/* Header & Toolbar */}
            <div className="p-4 border-b flex flex-col sm:flex-row gap-4 justify-between items-start md:items-center bg-white z-10 w-full shrink-0">
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 hidden sm:flex">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">Corporate Portal Users</h3>
                        <p className="text-xs text-slate-500">Manage client access accounts</p>
                    </div>
                    <div className="relative w-full sm:w-64 sm:ml-4">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                        onClick={() => setIsAddUserOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm shadow-blue-500/20"
                    >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add User
                    </Button>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/30">
                <Table className="relative w-full">
                    <TableHeader className="bg-slate-50/80 text-xs uppercase text-slate-500 font-bold tracking-wider border-b sticky top-0 z-10 backdrop-blur-xl">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="px-6 py-4">Name</TableHead>
                            <TableHead className="px-6 py-4">Username</TableHead>
                            <TableHead className="px-6 py-4">Email</TableHead>
                            <TableHead className="px-6 py-4">Status</TableHead>
                            <TableHead className="px-6 py-4">Last Login</TableHead>
                            <TableHead className="px-6 py-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100/50">
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-48 text-center text-slate-400">
                                    <div className="flex flex-col items-center justify-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                                        <p>Loading user accounts...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-48 text-center text-slate-400">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                            <ShieldCheck className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-1">No portal users yet</h3>
                                        <p className="text-sm">Create an account to give this client portal access.</p>
                                        <Button
                                            variant="outline"
                                            className="mt-4 rounded-xl border-slate-200"
                                            onClick={() => setIsAddUserOpen(true)}
                                        >
                                            <UserPlus className="h-4 w-4 mr-2" /> Create First User
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedUsers.map((user) => (
                                <TableRow
                                    key={user.id}
                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedUser(user)}
                                >
                                    <TableCell className="px-6 py-4 font-medium text-slate-800">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                                {user.name?.charAt(0) || user.username?.charAt(0) || "U"}
                                            </div>
                                            {user.name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 font-mono text-xs text-slate-600">
                                        <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded w-fit border border-slate-200">
                                            <AtSign className="w-3 h-3 text-slate-400" /> {user.username}
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-slate-600">{user.email}</TableCell>
                                    <TableCell className="px-6 py-4">
                                        <Badge variant="outline" className={cn(
                                            "uppercase text-[10px] tracking-wider font-semibold border",
                                            user.status === 'Active' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"
                                        )}>
                                            {user.status || "Active"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-xs text-slate-500">
                                        {user.lastLogin ? (
                                            <span className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5" /> {format(new Date(user.lastLogin), "MMM d, yyyy")}
                                            </span>
                                        ) : (
                                            <span className="italic text-slate-400">Never</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">
                                                <PanelRight className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm("Are you sure you want to delete this user?")) {
                                                        deleteUserMutation.mutate(user.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Footer */}
            {totalPages > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
                    <span className="text-sm font-medium text-slate-500">
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, filteredUsers.length)} of {filteredUsers.length} users
                    </span>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="gap-1 h-8 px-2 sm:px-3 rounded-lg border-slate-200">
                            <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Prev</span>
                        </Button>
                        <div className="hidden sm:flex items-center gap-1">
                            {Array.from({ length: totalPages }).map((_, i) => {
                                if (totalPages > 7) {
                                    if (i !== 0 && i !== totalPages - 1 && Math.abs(i + 1 - page) > 1) {
                                        if (i === 1 || i === totalPages - 2) return <span key={i} className="px-1 text-slate-400">...</span>;
                                        return null;
                                    }
                                }
                                return (
                                    <Button
                                        key={i} variant={page === i + 1 ? "default" : "ghost"} size="sm"
                                        onClick={() => setPage(i + 1)}
                                        className={`h-8 w-8 p-0 rounded-lg ${page === i + 1 ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        {i + 1}
                                    </Button>
                                )
                            })}
                        </div>
                        <div className="sm:hidden flex items-center px-3 font-medium text-sm text-slate-700">
                            {page} / {totalPages}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="gap-1 h-8 px-2 sm:px-3 rounded-lg border-slate-200">
                            <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* User Details Slide Panel */}
            <AnimatePresence>
                {selectedUser && (
                    <div className="fixed inset-0 z-40 flex justify-end" tabIndex={-1} onKeyDown={e => e.key === 'Escape' && setSelectedUser(null)}>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSelectedUser(null)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ x: "100%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: "100%", opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="relative w-full max-w-sm bg-slate-50 shadow-2xl flex flex-col h-full border-l border-slate-200"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
                                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    <ShieldCheck className="w-5 h-5 text-indigo-500" />
                                    Portal Access
                                </h2>
                                <Button variant="ghost" size="icon" onClick={() => setSelectedUser(null)} className="rounded-full">
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Profile Card */}
                                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 flex flex-col items-center text-center relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                                    <div className="w-20 h-20 rounded-2xl bg-white p-1 shadow-sm mt-4 relative z-10">
                                        <div className="w-full h-full bg-slate-100 rounded-xl flex items-center justify-center text-2xl font-bold text-slate-600 uppercase">
                                            {selectedUser.name?.charAt(0) || "U"}
                                        </div>
                                    </div>
                                    <h3 className="mt-3 font-bold text-lg text-slate-800">{selectedUser.name}</h3>
                                    <p className="text-sm font-medium text-slate-500 mb-3">{selectedUser.email}</p>
                                    <Badge variant="outline" className={cn(
                                        "uppercase text-[10px] tracking-wider font-semibold border",
                                        selectedUser.status === 'Active' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"
                                    )}>
                                        {selectedUser.status || "Active"}
                                    </Badge>
                                </div>

                                {/* Info List */}
                                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-1 divide-y divide-slate-100">
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <AtSign className="w-4 h-4" /> Username
                                        </div>
                                        <span className="text-sm font-mono font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                            {selectedUser.username}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Clock className="w-4 h-4" /> Last Login
                                        </div>
                                        <span className="text-sm font-medium text-slate-800">
                                            {selectedUser.lastLogin ? format(new Date(selectedUser.lastLogin), "MMM d, yyyy") : "Never"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Building2 className="w-4 h-4" /> Role
                                        </div>
                                        <span className="text-sm font-medium text-slate-800">Client Portal</span>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-6 border-t border-slate-200/60 text-center">
                                    <p className="text-xs text-slate-400">Need to revoke access?</p>
                                    <Button
                                        variant="outline"
                                        className="w-full rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                        onClick={() => {
                                            if (confirm("Are you sure you want to delete this user?")) {
                                                deleteUserMutation.mutate(selectedUser.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" /> Delete User
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add User Dialog */}
            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                <DialogContent className="sm:max-w-md bg-white rounded-2xl border-0 shadow-2xl p-0 overflow-hidden">
                    <div className="px-6 py-6 border-b border-slate-100 bg-slate-50/50">
                        <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                                <UserPlus className="w-4 h-4" />
                            </div>
                            Add Corporate User
                        </DialogTitle>
                        <DialogDescription className="mt-2 text-slate-500 text-sm">
                            Create a login for this company's employees. A random password will be generated and emailed to them.
                        </DialogDescription>
                    </div>
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-slate-600 font-semibold">Full Name</Label>
                            <Input
                                id="name" required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="rounded-xl border-slate-200 h-11 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-600 font-semibold">Email Address</Label>
                            <Input
                                id="email" type="email" required
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="rounded-xl border-slate-200 h-11 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="username" className="text-slate-600 font-semibold">Username</Label>
                            <Input
                                id="username" required
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                                className="rounded-xl border-slate-200 h-11 focus:ring-blue-500"
                            />
                        </div>
                        <div className="pt-4 flex justify-end gap-3">
                            <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)} className="rounded-xl border-slate-200">
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createUserMutation.isPending} className="rounded-xl bg-blue-600 hover:bg-blue-700 shadow-sm text-white">
                                {createUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create & Send Email
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Credential Success Dialog */}
            <Dialog open={!!createdUserCreds} onOpenChange={(open) => !open && setCreatedUserCreds(null)}>
                <DialogContent className="sm:max-w-md bg-white rounded-2xl border-0 shadow-2xl p-0 overflow-hidden text-center">
                    <div className="px-6 py-8">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8" />
                        </div>
                        <DialogTitle className="text-2xl font-bold text-slate-800 mb-2">User Created!</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Attempts were made to email these credentials. Please copy them now as a backup.
                        </DialogDescription>

                        <div className="mt-6 bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3 text-left">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-slate-500">Username</span>
                                <code className="bg-white border border-slate-200 px-3 py-1 rounded-lg text-slate-700 font-mono text-sm shadow-sm">
                                    {createdUserCreds?.username}
                                </code>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-slate-500">Password</span>
                                <div className="flex items-center gap-2">
                                    <code className="bg-white border border-slate-200 px-3 py-1 rounded-lg text-emerald-600 font-mono font-bold text-sm shadow-sm select-all">
                                        {createdUserCreds?.password}
                                    </code>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg shrink-0 border-slate-200"
                                        onClick={() => handleCopyToken(createdUserCreds?.password || "")}
                                    >
                                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-slate-500" />}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <Button
                            onClick={() => setCreatedUserCreds(null)}
                            className="w-full mt-6 rounded-xl bg-slate-800 hover:bg-slate-900 text-white h-11 shadow-sm"
                        >
                            Done
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
