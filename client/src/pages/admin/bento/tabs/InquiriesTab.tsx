import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    MessageSquare, CheckCircle, Clock, Mail, Search, Send,
    User, Loader2, X, KeyRound, ExternalLink, Phone,
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
import { inquiryMatchesSearch } from "@/lib/inquiry-search";
import { isAccountRecoveryInquiryMessage } from "@shared/account-recovery";
import { adminCustomersApi, adminRepairJourneysApi } from "@/lib/api";
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
    const [resetBusyId, setResetBusyId] = useState<string | null>(null);
    const [resetLinkResult, setResetLinkResult] = useState<{
        url: string;
        customerName: string;
        customerPhoneTail: string;
        expiresInHours: number;
        delivery?: { channel: "sms"; status: string; error?: string } | null;
    } | null>(null);

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
            toast.success("Internal note saved");
            setReplyDialog({ open: false, id: null });
            setReplyText("");
        },
    });

    const filtered = inquiries.filter((inq: any) => {
        const matchesSearch = inquiryMatchesSearch(inq, searchTerm);
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

    const issueResetLink = async (inq: any) => {
        const phone = (inq.phone || "").trim();
        if (!phone || phone === "not provided") {
            toast.error("This recovery request has no usable phone on the inquiry.");
            return;
        }
        setResetBusyId(inq.id);
        try {
            const account = await adminRepairJourneysApi.getAccountByPhone(phone);
            if (!account.found || !account.userId) {
                toast.error("No customer account matched this phone. Resolve identity on Customers, then issue the link there.");
                return;
            }
            const result = await adminCustomersApi.generateResetLink(account.userId, {
                deliver: "sms",
                inquiryId: inq.id,
            });
            setResetLinkResult({
                url: result.url,
                customerName: result.customerName,
                customerPhoneTail: result.customerPhoneTail,
                expiresInHours: result.expiresInHours,
                delivery: result.delivery,
            });
            queryClient.invalidateQueries({ queryKey: ["inquiries"] });
            if (result.delivery?.status === "sent") {
                toast.success("Reset link created and SMS sent to the phone on file");
            } else if (result.delivery?.status === "failed") {
                toast.message("Reset link created — SMS failed; copy the link for manual delivery");
            } else {
                toast.success("Reset link created");
            }
        } catch (error: any) {
            toast.error(error?.message || "Failed to issue reset link (Super Admin only)");
        } finally {
            setResetBusyId(null);
        }
    };

    const statusBadge = (status: string) => {
        if (status === "Pending") return <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px] px-1.5 py-0 font-bold">Pending</Badge>;
        if (status === "Replied") return <Badge className="bg-green-100 text-green-700 border-0 text-[10px] px-1.5 py-0 font-bold">Replied</Badge>;
        return <Badge className="bg-blue-100 text-blue-700 border-0 text-[10px] px-1.5 py-0 font-bold">{status}</Badge>;
    };

    const recoveryBadge = (
        <Badge className="bg-violet-100 text-violet-800 border-0 text-[10px] px-1.5 py-0 font-bold" data-testid="badge-account-recovery">
            Account recovery
        </Badge>
    );

    return (
        <MobileTabLayout>
            {/* Mobile header */}
            <MobileTabHeader>
                {/* Search */}
                <div className="relative mt-1.5">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search name, phone, message…"
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
                        {filtered.map((inq: any) => {
                            const isRecovery = isAccountRecoveryInquiryMessage(inq.message);
                            return (
                            <motion.div
                                key={inq.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
                                    isRecovery
                                        ? "border-l-[3px] border-l-violet-500"
                                        : inq.status === "Pending"
                                          ? "border-l-[3px] border-l-orange-400"
                                          : "border-slate-200"
                                }`}
                                data-testid={isRecovery ? "inquiry-row-recovery" : "inquiry-row-ordinary"}
                            >
                                <div className="p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${isRecovery ? "bg-violet-100" : "bg-slate-100"}`}>
                                                {isRecovery ? <KeyRound className="h-4 w-4 text-violet-600" /> : <User className="h-4 w-4 text-slate-400" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate">{inq.name}</p>
                                                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                                    {inq.phone ? <><Phone className="h-3 w-3" />{inq.phone}</> : null}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                            {isRecovery && recoveryBadge}
                                            {statusBadge(inq.status)}
                                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                {formatDistanceToNow(new Date(inq.createdAt), { addSuffix: true })}
                                            </span>
                                        </div>
                                    </div>

                                    <p className="text-[12px] text-slate-500 line-clamp-2">{inq.message}</p>

                                    {inq.status !== "Replied" && (
                                        <div className="flex gap-2 pt-1">
                                            {isRecovery ? (
                                                <Button
                                                    size="sm"
                                                    onClick={() => void issueResetLink(inq)}
                                                    disabled={resetBusyId === inq.id}
                                                    className="h-8 flex-1 rounded-lg gap-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white"
                                                    data-testid="button-issue-reset-link"
                                                >
                                                    {resetBusyId === inq.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                                                    Issue reset link
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={() => openReply(inq.id)}
                                                    className="h-8 flex-1 rounded-lg gap-1.5 text-xs font-bold bg-slate-700 hover:bg-slate-800 text-white"
                                                    data-testid="button-internal-note"
                                                >
                                                    <Send className="h-3.5 w-3.5" /> Internal note
                                                </Button>
                                            )}
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
                            );
                        })}
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
                                    {filtered.map((inq: any) => {
                                        const isRecovery = isAccountRecoveryInquiryMessage(inq.message);
                                        return (
                                        <motion.div key={inq.id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                                            className={`group relative bg-white p-5 rounded-xl border shadow-sm transition-all hover:shadow-md ${
                                                isRecovery ? "border-l-4 border-l-violet-500" : inq.status === "Pending" ? "border-l-4 border-l-orange-400" : ""
                                            }`}
                                            data-testid={isRecovery ? "inquiry-row-recovery" : "inquiry-row-ordinary"}
                                        >
                                            <div className="flex justify-between items-start mb-3 gap-2">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${isRecovery ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                                                        {isRecovery ? <KeyRound className="h-5 w-5" /> : <User className="h-5 w-5" />}
                                                    </div>
                                                    <div className="min-w-0 overflow-hidden">
                                                        <h3 className="font-semibold text-sm truncate pr-2">{inq.name}</h3>
                                                        <p className="text-xs text-muted-foreground truncate pr-2">{inq.phone || ""}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {isRecovery && recoveryBadge}
                                                    <span className="hidden sm:inline-block text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(inq.createdAt), { addSuffix: true })}</span>
                                                    {statusBadge(inq.status)}
                                                </div>
                                            </div>
                                            <div className="pl-14">
                                                <p className="text-sm text-slate-600 line-clamp-2 group-hover:line-clamp-none transition-all">{inq.message}</p>
                                                {inq.status !== "Replied" && (
                                                    <div className="mt-4 pt-3 border-t flex justify-end gap-2">
                                                        {isRecovery ? (
                                                            <Button
                                                                size="sm"
                                                                className="gap-2 bg-violet-600 hover:bg-violet-700"
                                                                onClick={() => void issueResetLink(inq)}
                                                                disabled={resetBusyId === inq.id}
                                                                data-testid="button-issue-reset-link"
                                                            >
                                                                {resetBusyId === inq.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                                                                Issue reset link
                                                            </Button>
                                                        ) : (
                                                            <Button size="sm" className="gap-2" variant="secondary" onClick={() => openReply(inq.id)} data-testid="button-internal-note">
                                                                <Send className="h-3.5 w-3.5" /> Internal note
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                        );
                                    })}
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
                                        <h3 className="text-base font-black text-slate-900">Internal staff note</h3>
                                        <button onClick={() => setReplyDialog({ open: false, id: null })} className="text-slate-400"><X className="h-5 w-5" /></button>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        This is saved on the inquiry for staff only. It is not SMS, email, or WhatsApp to the customer.
                                    </p>
                                    <Textarea
                                        placeholder="Internal note…"
                                        className="min-h-[140px] rounded-xl resize-none"
                                        value={replyText}
                                        onPointerDownCapture={(event) => event.stopPropagation()}
                                        onTouchStartCapture={(event) => event.stopPropagation()}
                                        onChange={e => setReplyText(e.target.value)}
                                    />
                                    <Button
                                        onClick={handleReply}
                                        disabled={updateStatusMutation.isPending || !replyText.trim()}
                                        className="w-full h-12 rounded-xl gap-2 text-base font-bold bg-slate-800 hover:bg-slate-900 text-white"
                                    >
                                        {updateStatusMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Save note
                                    </Button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body,
            )}

            {/* Desktop internal note dialog */}
            {!isMobile && (
                <Dialog open={replyDialog.open} onOpenChange={open => setReplyDialog({ ...replyDialog, open })}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Internal staff note</DialogTitle>
                            <DialogDescription>
                                Saved on the inquiry for staff only. Not delivered by SMS, email, or WhatsApp.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <Textarea placeholder="Internal note…" className="min-h-[150px]" value={replyText} onChange={e => setReplyText(e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setReplyDialog({ open: false, id: null })}>Cancel</Button>
                            <Button onClick={handleReply} disabled={updateStatusMutation.isPending}>
                                {updateStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save note
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            <Dialog open={!!resetLinkResult} onOpenChange={(open) => !open && setResetLinkResult(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reset link ready</DialogTitle>
                        <DialogDescription>
                            Super Admin only. Link works once and expires in {resetLinkResult?.expiresInHours ?? 24} hours.
                            {resetLinkResult?.delivery?.status === "sent" && " SMS was sent to the phone on the customer record."}
                            {resetLinkResult?.delivery?.status === "failed" && ` SMS failed (${resetLinkResult.delivery.error || "unknown"}). Copy the link for manual delivery.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg bg-slate-50 p-3 text-xs font-mono break-all select-all" data-testid="reset-link-url">
                        {resetLinkResult?.url}
                    </div>
                    <p className="text-xs text-slate-500">
                        {resetLinkResult?.customerName} ···{resetLinkResult?.customerPhoneTail}
                    </p>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={async () => {
                                if (!resetLinkResult?.url) return;
                                await navigator.clipboard.writeText(resetLinkResult.url);
                                toast.success("Link copied");
                            }}
                        >
                            <ExternalLink className="mr-2 h-4 w-4" /> Copy link
                        </Button>
                        <Button onClick={() => setResetLinkResult(null)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </MobileTabLayout>
    );
}
