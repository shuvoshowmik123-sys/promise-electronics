import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    MessageSquare,
    Send,
    Image as ImageIcon,
    Paperclip,
    Loader2,
    CheckCheck,
    Check,
    Shield,
    Info,
    AlertCircle,
    WifiOff,
    RefreshCw,
    Volume2,
    VolumeX,
    Clock,
    Briefcase,
    ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { corporateMessagesApi } from "@/lib/api";
import { ImageKitUpload } from "@/components/common/ImageKitUpload";
import { cn } from "@/lib/utils";
import type { CorporateMessage } from "@shared/schema";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useMessageQueue, QueueMessage } from "@/hooks/useMessageQueue";
import { useSound } from "@/hooks/useSound";
import { useCorporateApiErrorHandler, corporateQueryConfig } from "@/lib/corporateApiErrorHandler";
import { useCorporateSSE } from "@/hooks/useCorporateSSE";

// ... existing code ...

// ... existing imports

// Helper to group messages by date
const groupMessagesByDate = (messages: any[]) => {
    const groups: { [key: string]: any[] } = {};
    messages.forEach((msg) => {
        const date = new Date(msg.createdAt);
        const key = date.toDateString();
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(msg);
    });
    return groups;
};

const TypingIndicator = () => (
    <div className="flex items-center gap-1 h-4 px-1">
        <motion.div
            className="w-1.5 h-1.5 bg-slate-400 rounded-full"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0 }}
        />
        <motion.div
            className="w-1.5 h-1.5 bg-slate-400 rounded-full"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
        />
        <motion.div
            className="w-1.5 h-1.5 bg-slate-400 rounded-full"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        />
    </div>
);

const DateHeader = ({ date }: { date: Date }) => (
    <div className="flex items-center justify-center my-4">
        <div className="bg-slate-100/80 backdrop-blur-sm text-slate-500 text-[10px] uppercase tracking-wider px-3 py-1 rounded-full font-semibold border border-slate-200/50 shadow-sm">
            {isToday(date) ? "Today" : isYesterday(date) ? "Yesterday" : format(date, "MMMM d, yyyy")}
        </div>
    </div>
);

// Job Card Bubble — rendered when messageType === "job_reference"
interface JobRefMeta {
    jobId: string;
    jobNo: string;
    device: string;
    status: string;
    priority?: string;
}

const statusColors: Record<string, string> = {
    Pending: "bg-amber-50 text-amber-600 border-amber-200",
    "In Progress": "bg-blue-50 text-blue-600 border-blue-200",
    Completed: "bg-emerald-50 text-emerald-600 border-emerald-200",
    Delivered: "bg-purple-50 text-purple-600 border-purple-200",
    Cancelled: "bg-rose-50 text-rose-600 border-rose-200",
};

function JobCardBubble({ meta, isFromCorporate, onJobClick }: { meta: JobRefMeta; isFromCorporate: boolean; onJobClick?: (id: string) => void }) {
    const statusClass = statusColors[meta.status] || "bg-slate-50 text-slate-600 border-slate-200";
    return (
        <button
            onClick={() => onJobClick?.(meta.jobId)}
            className={cn(
                "group text-left w-full max-w-xs rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                isFromCorporate
                    ? "bg-white/15 border-white/25"
                    : "bg-white border-slate-100"
            )}
        >
            {/* Card header */}
            <div className={cn(
                "px-4 py-3 flex items-center gap-2",
                isFromCorporate ? "bg-white/10" : "bg-slate-50 border-b border-slate-100"
            )}>
                <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center",
                    isFromCorporate ? "bg-white/20" : "bg-[var(--corp-blue)]/10"
                )}>
                    <Briefcase className={cn("w-3.5 h-3.5", isFromCorporate ? "text-white" : "text-[var(--corp-blue)]")} />
                </div>
                <div>
                    <p className={cn("text-[10px] font-black uppercase tracking-widest", isFromCorporate ? "text-white/60" : "text-slate-400")}>Job Reference</p>
                    <p className={cn("text-sm font-bold leading-none mt-0.5", isFromCorporate ? "text-white" : "text-slate-800")}>{meta.jobNo}</p>
                </div>
                <ExternalLink className={cn("w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity", isFromCorporate ? "text-white/70" : "text-slate-400")} />
            </div>
            {/* Card body */}
            <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-xs", isFromCorporate ? "text-white/70" : "text-slate-500")}>Device</span>
                    <span className={cn("text-xs font-semibold truncate max-w-[150px]", isFromCorporate ? "text-white" : "text-slate-800")}>{meta.device || "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-xs", isFromCorporate ? "text-white/70" : "text-slate-500")}>Status</span>
                    <span className={cn(
                        "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                        isFromCorporate ? "bg-white/20 text-white border-white/30" : statusClass
                    )}>{meta.status}</span>
                </div>
                {meta.priority && (
                    <div className="flex items-center justify-between gap-3">
                        <span className={cn("text-xs", isFromCorporate ? "text-white/70" : "text-slate-500")}>Priority</span>
                        <span className={cn("text-xs font-semibold", isFromCorporate ? "text-white" : "text-slate-700")}>{meta.priority}</span>
                    </div>
                )}
            </div>
            {/* Click hint */}
            <div className={cn(
                "px-4 py-2 text-[10px] font-medium flex items-center gap-1",
                isFromCorporate ? "bg-white/10 text-white/50" : "bg-slate-50 text-slate-400"
            )}>
                <ExternalLink className="w-3 h-3" /> Tap to open job details
            </div>
        </button>
    );
}

export default function CorporateMessagesPage() {
    const { user } = useCorporateAuth();
    const queryClient = useQueryClient();
    const { isOnline } = useNetworkStatus();
    const { playSent, playReceived, isMuted, toggleMute } = useSound();
    const { handleError } = useCorporateApiErrorHandler();
    const search = useSearch();
    const [, setLocation] = useLocation();

    // Parse job reference from URL query params (set by "Message Manager" button)
    const jobRefParams = (() => {
        const params = new URLSearchParams(search);
        const jobRef = params.get("jobRef");
        if (!jobRef) return null;
        return {
            jobId: jobRef,
            jobNo: params.get("jobNo") || jobRef.substring(0, 8),
            device: params.get("device") || "",
            status: params.get("status") || "",
            priority: params.get("priority") || "",
        };
    })();

    // Guard so we only auto-send the job card once per navigation
    const jobRefSentRef = useRef(false);

    const [messageText, setMessageText] = useState("");
    const [showQuickActions, setShowQuickActions] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const prevMessagesLength = useRef(0);

    // Fetch the default thread (auto-created if not exists)
    const {
        data: defaultThread,
        isLoading: isLoadingThread,
        isError: isThreadError,
        error: threadError,
        refetch: refetchThread
    } = useQuery({
        queryKey: ["/api/corporate/messages/default-thread"],
        queryFn: () => corporateMessagesApi.getDefaultThread(),
        ...corporateQueryConfig,
    });

    const threadId = defaultThread?.id;

    // SSE Subscription
    const [messages, setMessages] = useState<CorporateMessage[]>([]);

    // Initial fetch
    const { data: initialMessages, isLoading: isLoadingMessages } = useQuery({
        queryKey: ["/api/corporate/messages/threads", threadId],
        queryFn: () => threadId ? corporateMessagesApi.getMessages(threadId) : Promise.resolve([]),
        enabled: !!threadId,
        staleTime: Infinity, // Don't refetch automatically
        ...corporateQueryConfig,
    });

    // Sync state with initial data
    useEffect(() => {
        if (initialMessages) {
            setMessages(initialMessages);
            prevMessagesLength.current = initialMessages.length;
        }
    }, [initialMessages]);

    // Listen for real-time updates
    const { latestEvent } = useCorporateAuth().user ? useCorporateSSE() : { latestEvent: null }; // Only connect if authenticated

    // Auto-send job reference card when navigated from "Message Manager" button
    useEffect(() => {
        if (!jobRefParams || !threadId || jobRefSentRef.current) return;
        jobRefSentRef.current = true;

        // Clear the query params from the URL so a refresh doesn't re-send
        setLocation("/corporate/messages", { replace: true });

        // Send the job reference message
        sendMessage.mutate({
            messageType: "job_reference",
            content: `Job reference: ${jobRefParams.jobNo}`,
            attachments: [{
                url: "job_reference",
                fileId: jobRefParams.jobId,
                name: jobRefParams.jobNo,
                thumbnailUrl: JSON.stringify({
                    device: jobRefParams.device,
                    status: jobRefParams.status,
                    priority: jobRefParams.priority,
                }),
            }],
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId, jobRefParams]);

    useEffect(() => {
        if (latestEvent && latestEvent.type === 'chat_message') {
            const newMessage = latestEvent.data.message;
            if (newMessage.threadId === threadId) {
                setMessages(prev => {
                    // Avoid duplicates
                    if (prev.some(m => m.id === newMessage.id)) return prev;

                    // Remove optimistic message if it exists (by matching content/timestamp or just assuming it's the last one)
                    // For now, simpler to just append and let the key-based deduplication handle it if we used real IDs for optimistic
                    // But typically optimistic messages have temp IDs.
                    // We'll filter out optimistic messages that match the new one's content/type if needed, 
                    // but for now, let's just append the real one.
                    // Actually, we should probably remove the optimistic one if we can identify it.
                    // But simpler: Just add valid message.

                    const newMessages = [...prev, newMessage];
                    return newMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                });

                // Play sound if not from us
                if (newMessage.senderType !== 'corporate') {
                    playReceived();
                }
            }
        }
    }, [latestEvent, threadId, playReceived]);

    // Mutations
    const sendMessage = useMutation({
        mutationFn: (data: { content?: string; messageType?: string; attachments?: any[] }) => {
            console.log('[Mutation] Sending message:', { threadId, data });
            if (!threadId) throw new Error("No thread ID available");
            return corporateMessagesApi.sendMessage(threadId, data);
        },
        onMutate: async (newMessage) => {
            // Optimistic update
            const optimisticMessage = {
                id: `temp-${Date.now()}`,
                content: newMessage.content,
                messageType: newMessage.messageType || 'text',
                senderType: 'corporate',
                createdAt: new Date(),
                isRead: false,
                attachments: newMessage.attachments || [],
                isOptimistic: true,
                threadId: threadId!, // Assert threadId exists as checked in mutationFn
                senderId: user?.id || 'current-user', // Fallback
            } as unknown as CorporateMessage & { isOptimistic: boolean };

            setMessages(prev => [...prev, optimisticMessage]);

            // Scroll to bottom immediately
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollIntoView({ behavior: "smooth" });
                }
            }, 10);

            return { optimisticMessageId: optimisticMessage.id };
        },
        onSuccess: (data, variables, context) => {
            playSent();
            console.log('[Mutation] Message sent successfully');

            // Replace optimistic message with real one
            setMessages(prev => prev.map(msg =>
                msg.id === context?.optimisticMessageId ? data : msg
            ));
        },
        onError: (error, _newMessage, context) => {
            // Remove optimistic message on error
            if (context?.optimisticMessageId) {
                setMessages(prev => prev.filter(msg => msg.id !== context.optimisticMessageId));
            }
            handleError(error, "Sending Message");
        }
    });

    const { queue, addToQueue, removeFromQueue, retryMessage: retryQueueMessage } = useMessageQueue({
        onSend: async (msg) => {
            await sendMessage.mutateAsync({ content: msg.text, messageType: 'text' });
        }
    });

    // Auto-scroll to bottom on new messages or queue updates
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, queue]);

    const groupedMessages = groupMessagesByDate(messages || []);

    const handleSendMessage = async () => {
        if (!messageText.trim()) return;
        if (!threadId) return;

        if (!isOnline) {
            addToQueue(messageText, threadId);
            setMessageText("");
            return;
        }

        try {
            await sendMessage.mutateAsync({ content: messageText, messageType: "text" });
            setMessageText("");
            setShowQuickActions(true);
        } catch (error) {
            console.error("Send failed, adding to queue", error);
            // Don't add to queue here if it was a real API error handled by onError/rollback
            // Unless we want offline-like behavior for failed requests. 
            // For now, let the error toast handle it and rollback.
        }
    };

    const handleImageUpload = (result: any) => {
        if (!threadId) return;
        sendMessage.mutate({
            messageType: "image",
            attachments: [{
                url: result.url,
                fileId: result.fileId,
                name: result.name,
                thumbnailUrl: result.thumbnailUrl
            }]
        });
    };

    const insertQuickMessage = (message: string) => {
        setMessageText(prev => prev ? `${prev} ${message}` : message);
        setShowQuickActions(false);
    };

    const CORPORATE_MESSAGES = {
        loadingMessages: "Loading conversation...",
        systemFeedback: ["Is my data secure?", "How do I update billing?", "Feature request"],
        messagePlaceholder: "Type your message..."
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4.5rem)] overflow-hidden bg-[var(--corp-bg-subtle)] -m-4 md:-m-8">
            {/* Simplified Header */}
            <div className="px-6 py-4 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl z-20 flex items-center justify-between flex-shrink-0 relative">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--corp-blue)] via-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <MessageSquare className="text-white w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight">Support Chat</h1>
                        <p className="text-xs text-slate-500 flex items-center gap-2">
                            <Shield className="w-3 h-3 text-emerald-500" />
                            Direct line to your account manager
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-slate-400 hover:text-slate-600 rounded-full h-8 w-8"
                        onClick={toggleMute}
                        title={isMuted ? "Unmute sounds" : "Mute sounds"}
                        aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
                    >
                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                        <div className={cn(
                            "w-2 h-2 rounded-full transition-colors duration-500",
                            isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-300"
                        )} />
                        {isOnline ? (
                            <span className="hidden sm:inline font-medium text-slate-600">Connected</span>
                        ) : (
                            <span className="hidden sm:inline font-medium text-slate-400">Offline</span>
                        )}
                        <Separator orientation="vertical" className="h-3 mx-1" />
                        <Info className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Responses typically in 1-2 hours</span>
                        <span className="sm:hidden">1-2h response</span>
                    </div>
                </div>
            </div>

            {/* Offline Banner */}
            <AnimatePresence>
                {!isOnline && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-amber-50 border-b border-amber-200 overflow-hidden z-10 flex-shrink-0"
                    >
                        <div className="px-6 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-amber-700">
                                <WifiOff className="w-4 h-4" />
                                <span className="text-sm font-medium">No internet connection</span>
                                <span className="text-xs text-amber-600 hidden sm:inline">• Your messages will be sent once you're back online</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Chat Area - Full Width */}
            <div className="flex-1 flex overflow-hidden p-4 md:p-6">
                <Card className="flex-1 flex flex-col overflow-hidden border-none shadow-2xl shadow-slate-200/50 bg-white/90 backdrop-blur-xl rounded-3xl">

                    {/* Messages Area */}
                    <ScrollArea className="flex-1 px-4 md:px-8 py-6 bg-gradient-to-b from-slate-50/50 to-white/30">
                        <div className="max-w-4xl mx-auto space-y-6">
                            {isLoadingMessages ? (
                                <div className="flex flex-col items-center justify-center py-24 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-[var(--corp-blue)]" />
                                    <p className="text-sm text-slate-500">{CORPORATE_MESSAGES.loadingMessages}</p>
                                </div>
                            ) : !messages?.length ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center justify-center py-24 text-center gap-5"
                                >
                                    <div className="w-20 h-20 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl flex items-center justify-center border border-blue-100/50">
                                        <MessageSquare className="w-10 h-10 text-[var(--corp-blue)]/60" />
                                    </div>
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-slate-700">How can we help you today?</h4>
                                        <p className="text-sm text-slate-500 max-w-xs mx-auto leading-relaxed">
                                            Send us a message and our support team will get back to you shortly.
                                        </p>
                                    </div>
                                </motion.div>
                            ) : (
                                Object.entries(groupedMessages).map(([date, dayMessages]) => (
                                    <div key={date}>
                                        <DateHeader date={new Date(date)} />
                                        <div className="space-y-4">
                                            {dayMessages.map((msg, msgIndex) => (
                                                <motion.div
                                                    layout
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: msgIndex * 0.05 }}
                                                    key={msg.id}
                                                    className={cn(
                                                        "flex flex-col",
                                                        msg.senderType === "corporate" ? "items-end" : "items-start"
                                                    )}
                                                >
                                                    <div className="flex items-end gap-3 max-w-[85%] md:max-w-[70%]">
                                                        {msg.senderType !== "corporate" && (
                                                            <Avatar className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 shrink-0">
                                                                <AvatarFallback className="text-[10px] font-bold text-slate-500">
                                                                    AD
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        )}
                                                        <div className={cn(
                                                            "px-5 py-3.5 rounded-2xl shadow-sm",
                                                            msg.senderType === "corporate"
                                                                ? cn(
                                                                    "bg-gradient-to-br from-[var(--corp-blue)] to-blue-600 text-white rounded-br-none shadow-blue-500/20",
                                                                    (msg as any).isOptimistic && "opacity-80"
                                                                )
                                                                : "bg-white text-slate-700 border border-slate-100/80 rounded-bl-none shadow-slate-200/50"
                                                        )}>
                                                            {msg.messageType === "job_reference" && (msg.attachments as any)?.[0] ? (() => {
                                                                const att = (msg.attachments as any)[0];
                                                                let extra: Record<string, string> = {};
                                                                try { extra = JSON.parse(att.thumbnailUrl || "{}"); } catch { /* ignore */ }
                                                                return (
                                                                    <JobCardBubble
                                                                        meta={{
                                                                            jobId: att.fileId || "",
                                                                            jobNo: att.name || "",
                                                                            device: extra.device || "",
                                                                            status: extra.status || "",
                                                                            priority: extra.priority,
                                                                        }}
                                                                        isFromCorporate={msg.senderType === "corporate"}
                                                                        onJobClick={(id) => setLocation(`/corporate/jobs/${id}`)}
                                                                    />
                                                                );
                                                            })() : msg.messageType === "image" && (msg.attachments as any)?.[0] ? (
                                                                <div className="mb-3 relative cursor-pointer overflow-hidden rounded-xl group/img">
                                                                    <img
                                                                        src={(msg.attachments as any)[0].url}
                                                                        alt="Attachment"
                                                                        className="max-h-[280px] object-cover transition-transform duration-500 group-hover/img:scale-105"
                                                                    />
                                                                </div>
                                                            ) : null}
                                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                                        </div>
                                                        {msg.senderType === "corporate" && (
                                                            <div className="flex flex-col items-center gap-1 self-end mb-1">
                                                                {(msg as any).isOptimistic ? (
                                                                    <Clock className="w-3.5 h-3.5 text-slate-300 animate-pulse" />
                                                                ) : msg.isRead ? (
                                                                    <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                                                                ) : (
                                                                    <Check className="w-3.5 h-3.5 text-slate-300" />
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "text-[10px] text-slate-400 font-medium mt-1 mx-2",
                                                        msg.senderType === "corporate" ? "text-right" : "text-left ml-12"
                                                    )}>
                                                        {format(new Date(msg.createdAt), "hh:mm a")}
                                                    </span>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            )}
                            {queue.map((msg) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={msg.id}
                                    className="flex flex-col items-end"
                                >
                                    <div className="flex items-center gap-2 max-w-[85%] md:max-w-[70%]">
                                        {msg.status === 'failed' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2 text-xs"
                                                onClick={() => retryQueueMessage(msg.id)}
                                            >
                                                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                                                Retry
                                            </Button>
                                        )}
                                        <div className={cn(
                                            "px-5 py-3.5 rounded-2xl shadow-sm border rounded-br-none",
                                            msg.status === 'failed'
                                                ? "bg-red-50 text-slate-700 border-red-100"
                                                : "bg-slate-50 text-slate-700 border-slate-100 opacity-80"
                                        )}>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 mt-1 text-[10px] font-medium mx-2">
                                        {msg.status === 'failed' ? (
                                            <>
                                                <AlertCircle className="w-3 h-3 text-red-500" />
                                                <span className="text-red-500">Failed to send</span>
                                            </>
                                        ) : (
                                            <>
                                                <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                                                <span className="text-slate-400">Sending...</span>
                                            </>
                                        )}
                                    </div>
                                </motion.div>
                            ))}

                            {sendMessage.isPending && (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex justify-end"
                                >
                                    <div className="px-4 py-3 rounded-2xl rounded-br-none bg-blue-50 text-blue-600 shadow-sm border border-blue-100/50">
                                        <TypingIndicator />
                                    </div>
                                </motion.div>
                            )}
                            <div ref={scrollRef} />
                        </div>
                    </ScrollArea>

                    {/* Composer Area - Fixed at bottom */}
                    <div className="p-5 border-t border-slate-100/80 bg-white/70 backdrop-blur-sm flex-shrink-0">
                        {/* Quick Actions */}
                        <AnimatePresence>
                            {showQuickActions && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="mb-3 flex flex-wrap gap-2 justify-center md:justify-start"
                                >
                                    <span className="text-xs text-slate-400 mr-2 flex items-center">Quick responses:</span>
                                    {CORPORATE_MESSAGES.systemFeedback.slice(0, 3).map((msg: string, i: number) => (
                                        <button
                                            key={i}
                                            onClick={() => insertQuickMessage(msg)}
                                            className="text-xs px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                        >
                                            {msg}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex items-end gap-3 max-w-4xl mx-auto w-full">
                            <div className="flex items-center gap-1">
                                <ImageKitUpload
                                    onUploadSuccess={handleImageUpload}
                                    folder="/corporate-chat"
                                    hideError={true}
                                >
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-slate-400 hover:text-[var(--corp-blue)] hover:bg-blue-50 h-11 w-11 rounded-xl transition-colors"
                                        aria-label="Upload image"
                                    >
                                        <ImageIcon className="w-5 h-5" />
                                    </Button>
                                </ImageKitUpload>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 h-11 w-11 rounded-xl transition-colors"
                                    aria-label="Attach file"
                                >
                                    <Paperclip className="w-5 h-5" />
                                </Button>
                            </div>
                            <div className="flex-1 relative">
                                <Input
                                    placeholder={CORPORATE_MESSAGES.messagePlaceholder}
                                    className="h-12 bg-slate-50/80 border-slate-200/60 rounded-xl pr-14 focus-visible:ring-[var(--corp-blue)]/20 focus-visible:ring-offset-0 transition-all"
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                                />
                                <Button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }}
                                    disabled={!messageText.trim() || sendMessage.isPending || !threadId}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 p-0 z-10 bg-gradient-to-br from-[var(--corp-blue)] to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
                                    aria-label="Send message"
                                >
                                    {sendMessage.isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
