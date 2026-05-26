/**
 * TeamChatPanel — floating FAB + slide-over chat drawer.
 * Phase 3: Internal Team Chat UI
 */
import { MessageSquare, X, Send, Hash, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Channel {
    id: string;
    name: string;
    description: string | null;
    isGeneral: boolean;
}

interface Message {
    id: string;
    channelId: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    content: string;
    createdAt: string;
}

export function TeamChatPanel() {
    const { user } = useAdminAuth();
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
    const [text, setText] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { data: channels = [] } = useQuery<Channel[]>({
        queryKey: ["team-channels"],
        queryFn: async () => {
            const res = await fetch("/api/team/channels");
            if (!res.ok) throw new Error("Failed");
            return res.json();
        },
        enabled: open,
    });

    // Auto-select general channel on first open
    useEffect(() => {
        if (channels.length > 0 && !activeChannelId) {
            const general = channels.find(c => c.isGeneral) ?? channels[0];
            setActiveChannelId(general.id);
        }
    }, [channels, activeChannelId]);

    const { data: messages = [] } = useQuery<Message[]>({
        queryKey: ["team-messages", activeChannelId],
        queryFn: async () => {
            const res = await fetch(`/api/team/channels/${activeChannelId}/messages`);
            if (!res.ok) throw new Error("Failed");
            return res.json();
        },
        enabled: !!activeChannelId && open,
        refetchInterval: 5_000,
    });

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMutation = useMutation({
        mutationFn: async (content: string) => {
            const res = await fetch(`/api/team/channels/${activeChannelId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) throw new Error("Failed to send");
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["team-messages", activeChannelId] });
            setText("");
        },
    });

    const handleSend = () => {
        const trimmed = text.trim();
        if (!trimmed || !activeChannelId) return;
        sendMutation.mutate(trimmed);
    };

    const getInitials = (name: string) =>
        name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

    const getRoleColor = (role: string) => {
        const map: Record<string, string> = {
            Admin: "bg-red-500",
            SuperAdmin: "bg-purple-600",
            Manager: "bg-blue-500",
            Technician: "bg-green-600",
            ChatHandler: "bg-amber-500",
            PickupAgent: "bg-teal-500",
        };
        return map[role] ?? "bg-slate-500";
    };

    return (
        <>
            {/* FAB */}
            <button
                onClick={() => setOpen(v => !v)}
                className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
                aria-label="Team Chat"
            >
                {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
            </button>

            {/* Panel */}
            {open && (
                <div className="fixed bottom-24 right-6 z-50 w-80 h-[520px] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/40">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm flex-1">Team Chat</span>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                        {/* Channel list */}
                        <div className="w-24 border-r bg-muted/20 flex flex-col py-2 overflow-y-auto">
                            {channels.map(ch => (
                                <button
                                    key={ch.id}
                                    onClick={() => setActiveChannelId(ch.id)}
                                    className={cn(
                                        "text-left px-2 py-2 text-xs truncate hover:bg-muted transition-colors",
                                        activeChannelId === ch.id && "bg-primary/10 font-semibold text-primary"
                                    )}
                                >
                                    <Hash className="h-3 w-3 inline mr-1 opacity-60" />
                                    {ch.name}
                                </button>
                            ))}
                        </div>

                        {/* Messages area */}
                        <div className="flex-1 flex flex-col">
                            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                                {messages.length === 0 && (
                                    <p className="text-center text-xs text-muted-foreground mt-8">
                                        No messages yet. Say hello!
                                    </p>
                                )}
                                {messages.map(msg => {
                                    const isMe = msg.senderId === user?.id;
                                    return (
                                        <div
                                            key={msg.id}
                                            className={cn("flex gap-2", isMe && "flex-row-reverse")}
                                        >
                                            <div className={cn(
                                                "h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[9px] text-white font-bold mt-0.5",
                                                getRoleColor(msg.senderRole)
                                            )}>
                                                {getInitials(msg.senderName)}
                                            </div>
                                            <div className={cn("max-w-[70%]", isMe && "items-end flex flex-col")}>
                                                {!isMe && (
                                                    <p className="text-[10px] text-muted-foreground mb-0.5 ml-0.5">
                                                        {msg.senderName}
                                                    </p>
                                                )}
                                                <div className={cn(
                                                    "rounded-2xl px-3 py-2 text-xs leading-relaxed",
                                                    isMe
                                                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                        : "bg-muted rounded-tl-sm"
                                                )}>
                                                    {msg.content}
                                                </div>
                                                <p className="text-[9px] text-muted-foreground mt-0.5 px-1">
                                                    {format(new Date(msg.createdAt), "h:mm a")}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="px-3 pb-3 pt-2 border-t flex gap-2">
                                <Input
                                    className="h-8 text-xs flex-1"
                                    placeholder="Message..."
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                                    disabled={!activeChannelId}
                                />
                                <Button
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={handleSend}
                                    disabled={!text.trim() || sendMutation.isPending}
                                >
                                    <Send className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
