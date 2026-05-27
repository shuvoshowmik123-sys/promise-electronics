import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    Search,
    Send,
    MessageCircle,
    Phone,
    UserCheck,
    Loader2,
    RefreshCw,
} from "lucide-react";

type InboxItem = {
    senderPsid: string;
    senderName: string | null;
    customerPhone: string | null;
    channel: "whatsapp" | "messenger";
    messageCount: number;
    lastMessageAt: string | null;
    lastMessagePreview: string;
    lastMessageRole: "user" | "model" | null;
    needsClaim: boolean;
    claimedByName: string | null;
    claimedByUserId: string | null;
};

type HistoryMsg = { role: "user" | "model"; content: string };

function formatTime(ts: string | null) {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString();
}

function ChannelBadge({ channel }: { channel: "whatsapp" | "messenger" }) {
    const isWA = channel === "whatsapp";
    return (
        <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                isWA ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
            }`}
        >
            {isWA ? <Phone className="w-2.5 h-2.5" /> : <MessageCircle className="w-2.5 h-2.5" />}
            {isWA ? "WA" : "Msgr"}
        </span>
    );
}

export function CrmInboxPanel() {
    const { user } = useAdminAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [selectedPsid, setSelectedPsid] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const chatEndRef = useRef<HTMLDivElement | null>(null);

    // ─── Inbox list ─────────────────────────────────────────────────────────
    const { data: inboxData, isLoading: inboxLoading } = useQuery({
        queryKey: ["crm-inbox", search],
        queryFn: async () => {
            const qs = new URLSearchParams();
            if (search) qs.set("search", search);
            qs.set("limit", "50");
            const res = await fetch(`/api/brain/inbox?${qs.toString()}`, { credentials: "include" });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json() as Promise<{ success: boolean; data: InboxItem[] }>;
        },
        refetchInterval: 8000,
    });

    const inbox: InboxItem[] = inboxData?.data ?? [];

    // Auto-select first conversation if none selected
    useEffect(() => {
        if (!selectedPsid && inbox.length > 0) {
            setSelectedPsid(inbox[0].senderPsid);
        }
    }, [inbox, selectedPsid]);

    // ─── Selected session messages ──────────────────────────────────────────
    const { data: msgData, isLoading: msgLoading } = useQuery({
        queryKey: ["crm-messages", selectedPsid],
        queryFn: async () => {
            if (!selectedPsid) return null;
            const res = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedPsid)}/messages`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json() as Promise<{
                success: boolean;
                data: {
                    senderPsid: string;
                    senderName: string | null;
                    customerPhone: string | null;
                    channel: "whatsapp" | "messenger";
                    messageCount: number;
                    history: HistoryMsg[];
                    needsClaim: boolean;
                    claimedByName: string | null;
                };
            }>;
        },
        enabled: !!selectedPsid,
        refetchInterval: 5000,
    });

    const session = msgData?.data;
    const history: HistoryMsg[] = session?.history ?? [];

    // Auto-scroll chat to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [history.length]);

    // ─── Send mutation ──────────────────────────────────────────────────────
    const sendMutation = useMutation({
        mutationFn: async (text: string) => {
            if (!selectedPsid) throw new Error("No session selected");
            const res = await fetch(`/api/brain/sessions/${encodeURIComponent(selectedPsid)}/send`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    userId: user?.id,
                    userName: user?.name,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `${res.status}`);
            }
            return res.json();
        },
        onSuccess: () => {
            setReplyText("");
            queryClient.invalidateQueries({ queryKey: ["crm-messages", selectedPsid] });
            queryClient.invalidateQueries({ queryKey: ["crm-inbox"] });
        },
        onError: (e: any) => {
            toast({
                title: "Failed to send",
                description: e.message || "Unknown error",
                variant: "destructive",
            });
        },
    });

    const handleSend = () => {
        if (!replyText.trim()) return;
        sendMutation.mutate(replyText.trim());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const customerLabel = useMemo(() => {
        if (!session) return "";
        return session.senderName || session.customerPhone || session.senderPsid;
    }, [session]);

    return (
        <div className="w-full bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr] min-h-[600px]">
                {/* ─── Left: Inbox list ───────────────────────────────────── */}
                <div className="border-r flex flex-col bg-slate-50/50">
                    <div className="p-3 border-b bg-white sticky top-0 z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-sm">Inbox</h3>
                            <span className="ml-auto text-[11px] text-slate-500">
                                {inbox.length} chats
                            </span>
                            <button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ["crm-inbox"] })}
                                className="text-slate-400 hover:text-slate-700 transition-colors"
                                title="Refresh"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name or phone..."
                                className="pl-7 h-8 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {inboxLoading && (
                            <div className="p-4 flex items-center justify-center text-slate-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Loading...
                            </div>
                        )}

                        {!inboxLoading && inbox.length === 0 && (
                            <div className="p-6 text-center text-slate-400 text-sm">
                                No conversations yet
                            </div>
                        )}

                        {inbox.map((item) => {
                            const isSelected = item.senderPsid === selectedPsid;
                            return (
                                <button
                                    key={item.senderPsid}
                                    onClick={() => setSelectedPsid(item.senderPsid)}
                                    className={`w-full text-left p-3 border-b border-slate-200/60 hover:bg-white transition-colors ${
                                        isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <ChannelBadge channel={item.channel} />
                                                <span className="font-semibold text-sm truncate">
                                                    {item.senderName || item.customerPhone || "Customer"}
                                                </span>
                                                {item.needsClaim && (
                                                    <span className="ml-auto text-[10px] font-bold text-amber-600">
                                                        NEEDS CLAIM
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[12px] text-slate-600 truncate">
                                                {item.lastMessageRole === "model" && (
                                                    <span className="text-slate-400">You: </span>
                                                )}
                                                {item.lastMessagePreview || "—"}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-slate-400">
                                                    {formatTime(item.lastMessageAt)}
                                                </span>
                                                {item.claimedByName && (
                                                    <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                                        <UserCheck className="w-2.5 h-2.5" />
                                                        {item.claimedByName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ─── Right: Chat panel ──────────────────────────────────── */}
                <div className="flex flex-col">
                    {!selectedPsid && (
                        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                            Select a conversation to view messages
                        </div>
                    )}

                    {selectedPsid && (
                        <>
                            {/* Chat header */}
                            <div className="p-3 border-b bg-white flex items-center gap-2">
                                {session && <ChannelBadge channel={session.channel} />}
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm truncate">{customerLabel}</div>
                                    {session?.customerPhone && (
                                        <div className="text-[11px] text-slate-500">
                                            {session.customerPhone}
                                        </div>
                                    )}
                                </div>
                                {session?.claimedByName ? (
                                    <span className="text-[11px] text-slate-600 flex items-center gap-1">
                                        <UserCheck className="w-3 h-3" />
                                        {session.claimedByName}
                                    </span>
                                ) : session?.needsClaim ? (
                                    <span className="text-[11px] font-semibold text-amber-600">
                                        Unclaimed
                                    </span>
                                ) : null}
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30">
                                {msgLoading && (
                                    <div className="flex justify-center text-slate-400 text-sm py-4">
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        Loading messages...
                                    </div>
                                )}

                                {!msgLoading && history.length === 0 && (
                                    <div className="text-center text-slate-400 text-sm py-8">
                                        No messages yet
                                    </div>
                                )}

                                {history.map((msg, idx) => {
                                    const isCustomer = msg.role === "user";
                                    return (
                                        <div
                                            key={idx}
                                            className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}
                                        >
                                            <div
                                                className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                                                    isCustomer
                                                        ? "bg-white border border-slate-200 text-slate-800"
                                                        : "bg-blue-500 text-white"
                                                }`}
                                            >
                                                {String(msg.content ?? "")}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Reply box */}
                            <div className="p-3 border-t bg-white">
                                <div className="flex gap-2 items-end">
                                    <Textarea
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Type a reply... (Enter to send, Shift+Enter for newline)"
                                        rows={2}
                                        className="resize-none text-sm flex-1"
                                        disabled={sendMutation.isPending}
                                    />
                                    <Button
                                        onClick={handleSend}
                                        disabled={!replyText.trim() || sendMutation.isPending}
                                        className="h-auto px-4 py-2"
                                    >
                                        {sendMutation.isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Send className="w-4 h-4" />
                                        )}
                                    </Button>
                                </div>
                                <div className="mt-1 text-[10px] text-slate-400">
                                    Sending as {user?.name} via{" "}
                                    {session?.channel === "whatsapp" ? "WhatsApp" : "Messenger"}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
