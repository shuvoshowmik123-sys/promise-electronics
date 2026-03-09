import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    MessageSquare, CheckCircle, Clock, Mail, Search, Send,
    Trash2, MoreHorizontal, User, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants } from "../shared/animations";

const getCsrfToken = () => {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
    return match ? match[2] : undefined;
};

// Mock API function (replace with actual import if available)
const fetchInquiries = async () => {
    const res = await fetch("/api/inquiries");
    if (!res.ok) throw new Error("Failed to fetch inquiries");
    return res.json();
};

export default function InquiriesTab() {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [replyDialog, setReplyDialog] = useState<{ open: boolean, id: string | null }>({ open: false, id: null });
    const [replyText, setReplyText] = useState("");

    const { data: inquiries = [], isLoading } = useQuery({
        queryKey: ["inquiries"],
        queryFn: fetchInquiries,
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, reply }: { id: string, status?: string, reply?: string }) => {
            const res = await fetch(`/api/inquiries/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "X-XSRF-TOKEN": getCsrfToken() || ""
                },
                body: JSON.stringify({ status, reply }),
            });
            if (!res.ok) throw new Error("Failed to update inquiry");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inquiries"] });
            toast.success("Inquiry updated successfully");
            setReplyDialog({ open: false, id: null });
            setReplyText("");
        },
    });

    const filteredInquiries = inquiries.filter((inq: any) =>
        inq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inq.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inq.message.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        total: inquiries.length,
        pending: inquiries.filter((i: any) => i.status === 'Pending').length,
        replied: inquiries.filter((i: any) => i.status === 'Replied').length
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Pending': return <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-100">Pending</Badge>;
            case 'Read': return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">Read</Badge>;
            case 'Replied': return <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">Replied</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const handleReply = () => {
        if (!replyDialog.id || !replyText.trim()) return;
        updateStatusMutation.mutate({
            id: replyDialog.id,
            status: "Replied",
            reply: replyText
        });
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
        >
            {/* Header Stats */}
            <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
                <BentoCard
                    title="Total Inquiries"
                    icon={<MessageSquare className="w-5 h-5 text-blue-600" />}
                    variant="glass"
                    className="h-full bg-white"
                >
                    <div className="text-3xl font-bold text-slate-800 mt-2">{stats.total.toString()}</div>
                    <div className="text-xs font-medium text-slate-500 mt-1">All time messages</div>
                </BentoCard>

                <BentoCard
                    title="Pending"
                    icon={<Clock className="w-5 h-5 text-orange-600" />}
                    variant="glass"
                    className="h-full bg-orange-50/50 border-orange-200"
                >
                    <div className="text-3xl font-bold text-orange-900 mt-2">{stats.pending.toString()}</div>
                    <div className="text-xs font-medium text-orange-700/80 mt-1">Needs attention</div>
                </BentoCard>

                <BentoCard
                    title="Replied"
                    icon={<CheckCircle className="w-5 h-5 text-green-600" />}
                    variant="glass"
                    className="h-full bg-green-50/50 border-green-200"
                >
                    <div className="text-3xl font-bold text-green-900 mt-2">{stats.replied.toString()}</div>
                    <div className="text-xs font-medium text-green-700/80 mt-1">Successfully resolved</div>
                </BentoCard>
            </motion.div>

            {/* Main Content */}
            <motion.div variants={itemVariants} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-lg font-semibold tracking-tight">Recent Messages</h2>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search inquiries..."
                            className="pl-8 bg-white"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
                            </div>
                        ) : filteredInquiries.length === 0 ? (
                            <div className="text-center py-20 text-muted-foreground bg-slate-50 rounded-xl border border-dashed">
                                <Mail className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                <p>No inquiries found</p>
                            </div>
                        ) : (
                            <AnimatePresence>
                                {filteredInquiries.map((inq: any) => (
                                    <motion.div
                                        key={inq.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        className={`group relative bg-white p-5 rounded-xl border shadow-sm transition-all hover:shadow-md ${inq.status === 'Pending' ? 'border-l-4 border-l-orange-400' : ''}`}
                                    >
                                        <div className="flex justify-between items-start mb-3 gap-2">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                                    <User className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0 overflow-hidden">
                                                    <h3 className="font-semibold text-sm truncate pr-2">{inq.name}</h3>
                                                    <p className="text-xs text-muted-foreground truncate pr-2">{inq.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="hidden sm:inline-block text-xs text-muted-foreground whitespace-nowrap">
                                                    {formatDistanceToNow(new Date(inq.createdAt), { addSuffix: true })}
                                                </span>
                                                {getStatusBadge(inq.status)}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: inq.id, status: 'Read' })}>
                                                            Mark as Read
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="text-destructive">
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>

                                        <div className="pl-14">
                                            <h4 className="font-medium text-sm mb-1">{inq.subject}</h4>
                                            <p className="text-sm text-slate-600 line-clamp-2 group-hover:line-clamp-none transition-all">
                                                {inq.message}
                                            </p>

                                            {inq.status !== 'Replied' && (
                                                <div className="mt-4 pt-3 border-t flex justify-end">
                                                    <Button
                                                        size="sm"
                                                        className="gap-2"
                                                        onClick={() => setReplyDialog({ open: true, id: inq.id })}
                                                    >
                                                        <Send className="h-3.5 w-3.5" /> Reply
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </ScrollArea>
            </motion.div>

            {/* Reply Dialog */}
            <Dialog open={replyDialog.open} onOpenChange={open => setReplyDialog({ ...replyDialog, open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reply to Inquiry</DialogTitle>
                        <DialogDescription>
                            Send a response via email. Access to history is logged.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <Textarea
                            placeholder="Type your reply here..."
                            className="min-h-[150px]"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReplyDialog({ open: false, id: null })}>Cancel</Button>
                        <Button onClick={handleReply} disabled={updateStatusMutation.isPending}>
                            {updateStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send Reply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.div >
    );
}
