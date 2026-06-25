import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    MessageSquare, CheckCircle, Clock, Mail, Search, Send,
    User, Loader2, X,
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

import { BentoCard, containerVariants, itemVariants, MobileTabLayout, MobileTabHeader, MobileScrollContent } from "../shared";
import { MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { fetchApi } from "@/lib/api/httpClient";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";

const fetchInquiries = () => fetchApi<any[]>("/inquiries");

type StatusFilter = "all" | "Pending" | "Replied";

export default function InquiriesTab() {
    const queryClient = useQueryClient();
    const isMobile = useIsMobile();
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [replyDialog, setReplyDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
    const [replyText, setReplyText] = useState("");

    const { data: inquiries = [], isLoading } = useQuery({
        queryKey: ["inquiries"],
        queryFn: fetchInquiries,
    });

    const updateStatusMutation = useMutation({
        mutationFn: ({ id, status, reply }: { id: string; status?: string; reply?: string }) =>
            fetchApi(`/inquiries/${id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ status, reply }),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inquiries"] });
            toast.success("Inquiry updated");
            setReplyDialog({ open: false, id: null });
            setReplyText("");
        },
    });

    const filtered = inquiries.filter((inq: any) => {
        const matchesSearch =
            inq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inq.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inq.message?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === "all" || inq.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const stats = {
        total: inquiries.length,
        pending: inquiries.filter((i: any) => i.status === "Pending").length,
        replied: inquiries.filter((i: any) => i.status === "Replied").length,
    };

    const openReply = (id: string) => {
        setReplyText("");
        setReplyDialog({ open: true, id });
    };

    const handleReply = () => {
        if (!replyDialog.id || !replyText.trim()) return;
        updateStatusMutation.mutate({ id: replyDialog.id, status: "Replied", reply: replyText });
    };

    const statusBadge = (status: string) => {
        if (status === "Pending") return <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px] px-1.5 py-0 font-bold">Pending</Badge>;
        if (status === "Replied") return <Badge className="bg-green-100 text-green-700 border-0 text-[10px] px-1.5 py-0 font-bold">Replied</Badge>;
        return <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] px-1.5 py-0 font-bold">{status}</Badge>;
    };

    return (
        <MobileTabLayout>
            {/* Mobile header */}
            <MobileTabHeader>
                {/* Search */}
                <div className="relative mt-1.5">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search name, email, message…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="h-9 pl-9 pr-8 rounded-xl bg-white border-slate-200 text-sm"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm("")} className="absolute right-2 top-2 text-slate-400">
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {/* Status filter chips */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                    {(["all", "Pending", "Replied"] as StatusFilter[]).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`shrink-0 rounded-lg border px-2.5 h-7 text-[11px] font-bold transition-colors ${
                                statusFilter === s
                                    ? s === "Pending" ? "bg-orange-100 text-orange-700 border-orange-200"
                                    : s === "Replied" ? "bg-green-100 text-green-700 border-green-200"
                                    : "bg-slate-800 text-white border-slate-800"
                                    : "bg-white text-slate-500 border-slate-200"
                            }`}
                        >
                            {s === "all" ? `All (${stats.total})` : s === "Pending" ? `Pending (${stats.pending})` : `Replied (${stats.replied})`}
                        </button>
                    ))}
                </div>
            </MobileTabHeader>

            {/* Mobile scroll content */}
            <MobileScrollContent className="md:hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Mail className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium">No inquiries found</p>
                    </div>
                ) : (
                    <AnimatePresence>
                        {filtered.map((inq: any) => (
                            <motion.div
                                key={inq.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${inq.status === "Pending" ? "border-l-[3px] border-l-orange-400" : "border-slate-200"}`}
                            >
                                <div className="p-3 space-y-2">
                                    {/* Top row */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="h-8 w-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center">
                                                <User className="h-4 w-4 text-slate-400" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate">{inq.name}</p>
                                                <p className="text-[10px] text-slate-400 truncate">{inq.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {statusBadge(inq.status)}
                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                {formatDistanceToNow(new Date(inq.createdAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Subject + message */}
                                    {inq.subject && <p className="text-[12px] font-semibold text-slate-700 truncate">{inq.subject}</p>}
                                    <p className="text-[12px] text-slate-500 line-clamp-2">{inq.message}</p>

                                    {/* Actions */}
                                    {inq.status !== "Replied" && (
                                        <div className="flex gap-2 pt-1">
                                            <Button
                                                size="sm"
                                                onClick={() => openReply(inq.id)}
                                                className="h-8 flex-1 rounded-lg gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
                                            >
                                                <Send className="h-3.5 w-3.5" /> Reply
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => updateStatusMutation.mutate({ id: inq.id, status: "Read" })}
                                                disabled={inq.status === "Read"}
                                                className="h-8 rounded-lg text-xs font-bold border-slate-200 text-slate-600"
                                            >
                                                Mark Read
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                )}
            </MobileScrollContent>

            {/* Desktop — unchanged */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="hidden md:flex flex-col flex-1 space-y-6 overflow-y-auto pb-0 px-0"
            >
                {/* Header Stats */}
                <motion.div variants={itemVariants} className="grid gap-4 md:grid-cols-3">
                    <BentoCard title="Total Inquiries" icon={<MessageSquare className="w-5 h-5 text-blue-600" />} variant="glass" className="h-full bg-white">
                        <div className="text-3xl font-bold text-slate-800 mt-2">{stats.total}</div>
                        <div className="text-xs font-medium text-slate-500 mt-1">All time messages</div>
                    </BentoCard>
                    <BentoCard title="Pending" icon={<Clock className="w-5 h-5 text-orange-600" />} variant="glass" className="h-full bg-orange-50/50 border-orange-200">
                        <div className="text-3xl font-bold text-orange-900 mt-2">{stats.pending}</div>
                        <div className="text-xs font-medium text-orange-700/80 mt-1">Needs attention</div>
                    </BentoCard>
                    <BentoCard title="Replied" icon={<CheckCircle className="w-5 h-5 text-green-600" />} variant="glass" className="h-full bg-green-50/50 border-green-200">
                        <div className="text-3xl font-bold text-green-900 mt-2">{stats.replied}</div>
                        <div className="text-xs font-medium text-green-700/80 mt-1">Successfully resolved</div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants} className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <h2 className="text-lg font-semibold tracking-tight">Recent Messages</h2>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search inquiries..." className="pl-8 bg-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                    <ScrollArea className="h-[600px] pr-4">
                        <div className="space-y-3">
                            {isLoading ? (
                                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}</div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-20 text-muted-foreground bg-slate-50 rounded-xl border border-dashed">
                                    <Mail className="h-10 w-10 mx-auto mb-3 opacity-20" /><p>No inquiries found</p>
                                </div>
                            ) : (
                                <AnimatePresence>
                                    {filtered.map((inq: any) => (
                                        <motion.div key={inq.id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                                            className={`group relative bg-white p-5 rounded-xl border shadow-sm transition-all hover:shadow-md ${inq.status === "Pending" ? "border-l-4 border-l-orange-400" : ""}`}
                                        >
                                            <div className="flex justify-between items-start mb-3 gap-2">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><User className="h-5 w-5" /></div>
                                                    <div className="min-w-0 overflow-hidden">
                                                        <h3 className="font-semibold text-sm truncate pr-2">{inq.name}</h3>
                                                        <p className="text-xs text-muted-foreground truncate pr-2">{inq.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="hidden sm:inline-block text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(inq.createdAt), { addSuffix: true })}</span>
                                                    {statusBadge(inq.status)}
                                                </div>
                                            </div>
                                            <div className="pl-14">
                                                <h4 className="font-medium text-sm mb-1">{inq.subject}</h4>
                                                <p className="text-sm text-slate-600 line-clamp-2 group-hover:line-clamp-none transition-all">{inq.message}</p>
                                                {inq.status !== "Replied" && (
                                                    <div className="mt-4 pt-3 border-t flex justify-end">
                                                        <Button size="sm" className="gap-2" onClick={() => openReply(inq.id)}>
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
            </motion.div>

            {/* Reply — bottom sheet on mobile, Dialog on desktop */}
            {isMobile && typeof document !== "undefined" && createPortal(
                <AnimatePresence>
                    {replyDialog.open && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[190] bg-slate-900/40 backdrop-blur-sm md:hidden"
                                onClick={() => setReplyDialog({ open: false, id: null })}
                            />
                            <motion.div
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "spring", stiffness: 340, damping: 34 }}
                                className="fixed inset-x-0 bottom-0 z-[210] rounded-t-3xl bg-white shadow-2xl md:hidden"
                            >
                                <div className="p-5 space-y-4">
                                    <MobileBottomSheetHandle />
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-base font-black text-slate-900">Reply to Inquiry</h3>
                                        <button onClick={() => setReplyDialog({ open: false, id: null })} className="text-slate-400"><X className="h-5 w-5" /></button>
                                    </div>
                                    <Textarea
                                        placeholder="Type your reply…"
                                        className="min-h-[140px] rounded-xl resize-none"
                                        value={replyText}
                                        onPointerDownCapture={(event) => event.stopPropagation()}
                                        onTouchStartCapture={(event) => event.stopPropagation()}
                                        onChange={e => setReplyText(e.target.value)}
                                    />
                                    <Button
                                        onClick={handleReply}
                                        disabled={updateStatusMutation.isPending || !replyText.trim()}
                                        className="w-full h-12 rounded-xl gap-2 text-base font-bold bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        {updateStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Send Reply
                                    </Button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body,
            )}

            {/* Desktop reply dialog */}
            {!isMobile && (
                <Dialog open={replyDialog.open} onOpenChange={open => setReplyDialog({ ...replyDialog, open })}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reply to Inquiry</DialogTitle>
                            <DialogDescription>Send a response via email. Access to history is logged.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <Textarea placeholder="Type your reply here..." className="min-h-[150px]" value={replyText} onChange={e => setReplyText(e.target.value)} />
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
            )}
        </MobileTabLayout>
    );
}
