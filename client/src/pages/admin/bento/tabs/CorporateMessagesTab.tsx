import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    MessageSquare,
    Send,
    Search,
    MoreVertical,
    Image as ImageIcon,
    Paperclip,
    Loader2,
    Clock,
    CheckCheck,
    Check,
    Building2,
    Archive,
    Inbox,
    Filter,
    WifiOff,
    RefreshCw,
    Volume2,
    VolumeX,
    Menu,
    Briefcase,
    ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isSameDay } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { corporateMessagesApi } from "@/lib/api";
import { ImageKitUpload } from "@/components/common/ImageKitUpload";
import { cn } from "@/lib/utils";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Sheet,
    SheetContent,
} from "@/components/ui/sheet";
import { useMessageQueue } from "@/hooks/useMessageQueue";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSound } from "@/hooks/useSound";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DashboardSkeleton, BentoCard, containerVariants, itemVariants } from "../shared";

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

// Admin-side Job Card Bubble — rendered when messageType === "job_reference"
const adminStatusColors: Record<string, string> = {
    Pending: "bg-amber-50 text-amber-600 border-amber-200",
    "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
    Completed: "bg-emerald-50 text-emerald-600 border-emerald-200",
    Delivered: "bg-purple-50 text-purple-600 border-purple-200",
    Cancelled: "bg-rose-50 text-rose-600 border-rose-200",
};

function AdminJobCardBubble({ meta, isFromAdmin, onClick }: { meta: { jobId: string; jobNo: string; device: string; status: string; priority?: string }; isFromAdmin: boolean; onClick?: () => void }) {
    const statusClass = adminStatusColors[meta.status] || "bg-slate-50 text-slate-600 border-slate-200";
    return (
        <button
            onClick={onClick}
            className={cn(
                "group text-left w-full max-w-xs rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                isFromAdmin ? "bg-blue-500/20 border-blue-300/30" : "bg-white border-slate-200"
            )}
        >
            <div className={cn(
                "px-4 py-3 flex items-center gap-2",
                isFromAdmin ? "bg-blue-500/10" : "bg-slate-50 border-b border-slate-100"
            )}>
                <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center",
                    isFromAdmin ? "bg-blue-100" : "bg-blue-50"
                )}>
                    <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div>
                    <p className={cn("text-[10px] font-black uppercase tracking-widest", isFromAdmin ? "text-blue-300" : "text-slate-400")}>Job Reference</p>
                    <p className={cn("text-sm font-bold leading-none mt-0.5", isFromAdmin ? "text-white" : "text-slate-800")}>{meta.jobNo}</p>
                </div>
                <ExternalLink className={cn("w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity", isFromAdmin ? "text-blue-200" : "text-slate-400")} />
            </div>
            <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-xs", isFromAdmin ? "text-blue-200" : "text-slate-500")}>Device</span>
                    <span className={cn("text-xs font-semibold truncate max-w-[150px]", isFromAdmin ? "text-white" : "text-slate-800")}>{meta.device || "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-xs", isFromAdmin ? "text-blue-200" : "text-slate-500")}>Status</span>
                    <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border", isFromAdmin ? "bg-white/20 text-white border-white/30" : statusClass)}>{meta.status}</span>
                </div>
                {meta.priority && (
                    <div className="flex items-center justify-between gap-3">
                        <span className={cn("text-xs", isFromAdmin ? "text-blue-200" : "text-slate-500")}>Priority</span>
                        <span className={cn("text-xs font-semibold", isFromAdmin ? "text-white" : "text-slate-700")}>{meta.priority}</span>
                    </div>
                )}
            </div>
            <div className={cn(
                "px-4 py-2 text-[10px] font-medium flex items-center gap-1",
                isFromAdmin ? "bg-blue-500/10 text-blue-200" : "bg-slate-50 text-slate-400"
            )}>
                <ExternalLink className="w-3 h-3" /> Click to view job details
            </div>
        </button>
    );
}

export default function CorporateMessagesTab({ preSelectedClientId, hideSidebar, preSelectedThreadId }: { preSelectedClientId?: string, hideSidebar?: boolean, preSelectedThreadId?: string }) {
    const queryClient = useQueryClient();
    const { isOnline } = useNetworkStatus();
    const { playSent, playReceived, isMuted, toggleMute } = useSound();

    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(preSelectedThreadId ?? null);
    const [messageText, setMessageText] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'archived'>('all');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const prevMessagesLength = useRef(0);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    // Sync if parent passes a new preSelectedThreadId (e.g. notification click)
    useEffect(() => {
        if (preSelectedThreadId && preSelectedThreadId !== selectedThreadId) {
            setSelectedThreadId(preSelectedThreadId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preSelectedThreadId]);

    // Queries
    const { data: threads, isLoading: isLoadingThreads } = useQuery({
        queryKey: ["/api/admin/corporate-messages/threads"],
        queryFn: () => corporateMessagesApi.adminGetAllThreads(),
        refetchInterval: 10000,
    });

    const { data: selectedThreadDetails, isLoading: isLoadingMessages } = useQuery({
        queryKey: ["/api/admin/corporate-messages/threads", selectedThreadId],
        queryFn: () => selectedThreadId ? corporateMessagesApi.adminGetThread(selectedThreadId) : Promise.resolve(null),
        enabled: !!selectedThreadId,
        refetchInterval: 5000,
    });

    // Mutations
    const sendMessage = useMutation({
        mutationFn: (data: { content?: string; messageType?: string; attachments?: any[] }) =>
            corporateMessagesApi.adminSendMessage(selectedThreadId!, data),
        onSuccess: () => {
            playSent();
            queryClient.invalidateQueries({ queryKey: ["/api/admin/corporate-messages/threads", selectedThreadId] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/corporate-messages/threads"] });
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
        },
    });

    const { queue, addToQueue, retryMessage: retryQueueMessage } = useMessageQueue({
        onSend: async (msg) => {
            await sendMessage.mutateAsync({ content: msg.text, messageType: 'text' });
        }
    });

    // Mark as read when thread is selected
    const markAsReadMutation = useMutation({
        mutationFn: (threadId: string) => corporateMessagesApi.adminMarkAsRead(threadId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/corporate-messages/threads"] });
        }
    });

    useEffect(() => {
        if (selectedThreadId) {
            markAsReadMutation.mutate(selectedThreadId);
        }
    }, [selectedThreadId]);

    // Force selection of the thread if preSelectedClientId is provided
    useEffect(() => {
        if (preSelectedClientId && threads && threads.length > 0 && !selectedThreadId) {
            const threadForClient = threads.find((t: any) => t.clientId === preSelectedClientId);
            if (threadForClient) {
                setSelectedThreadId(threadForClient.id);
            }
        }
    }, [preSelectedClientId, threads, selectedThreadId]);

    // Scroll tracking
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [selectedThreadDetails?.messages, selectedThreadId, queue]);

    // Sound effect
    useEffect(() => {
        const messages = selectedThreadDetails?.messages;
        if (messages && messages.length > prevMessagesLength.current) {
            if (prevMessagesLength.current > 0) {
                const lastMsg = messages[messages.length - 1];
                if (lastMsg.senderType !== 'admin') {
                    playReceived();
                }
            }
            prevMessagesLength.current = messages.length;
        } else if (!messages) {
            prevMessagesLength.current = 0;
        }
    }, [selectedThreadDetails?.messages, playReceived]);

    const updateStatus = useMutation({
        mutationFn: (status: 'open' | 'closed' | 'archived') =>
            corporateMessagesApi.adminUpdateThreadStatus(selectedThreadId!, status),
        onSuccess: () => {
            toast.success("Thread status updated");
            queryClient.invalidateQueries({ queryKey: ["/api/admin/corporate-messages/threads"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/corporate-messages/threads", selectedThreadId] });
        },
    });

    // Filter threads
    const filteredThreads = threads?.filter((t: any) => {
        const matchesSearch =
            t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.clientName?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    }) || [];

    const handleSendMessage = async () => {
        if (!messageText.trim() || !selectedThreadId) return;

        if (!isOnline) {
            addToQueue(messageText, selectedThreadId);
            setMessageText("");
            return;
        }

        try {
            await sendMessage.mutateAsync({ content: messageText, messageType: "text" });
            setMessageText("");
        } catch (error) {
            console.error("Send failed, adding to queue", error);
            addToQueue(messageText, selectedThreadId);
            setMessageText("");
        }
    };

    const handleImageUpload = (result: any) => {
        if (!selectedThreadId) return;
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

    if (isLoadingThreads && !threads) return <DashboardSkeleton />;

    const SidebarContent = () => (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-white space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                        Messages
                    </h2>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                                <Filter className="w-3.5 h-3.5" />
                                {statusFilter === 'all' ? 'Filter' : statusFilter}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                                <Inbox className="w-4 h-4 mr-2" /> All
                                {statusFilter === 'all' && <Check className="w-4 h-4 ml-auto" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('open')}>
                                <Clock className="w-4 h-4 mr-2" /> Open
                                {statusFilter === 'open' && <Check className="w-4 h-4 ml-auto" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('closed')}>
                                <CheckCheck className="w-4 h-4 mr-2" /> Closed
                                {statusFilter === 'closed' && <Check className="w-4 h-4 ml-auto" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusFilter('archived')}>
                                <Archive className="w-4 h-4 mr-2" /> Archived
                                {statusFilter === 'archived' && <Check className="w-4 h-4 ml-auto" />}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Search clients or subjects..."
                        className="pl-9 h-10 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-1 focus-visible:ring-blue-600"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                {isLoadingThreads ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                        <p className="text-xs text-slate-400">Loading threads...</p>
                    </div>
                ) : filteredThreads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
                        <div className="p-3 bg-slate-100 rounded-full">
                            <Inbox className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-500 font-medium">No messages found</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 p-2">
                        {filteredThreads.map((thread: any) => (
                            <button
                                key={thread.id}
                                onClick={() => {
                                    setSelectedThreadId(thread.id);
                                    setIsMobileOpen(false);
                                }}
                                className={cn(
                                    "w-full text-left p-4 transition-all duration-200 group flex flex-col gap-2 relative border border-slate-200 rounded-xl hover:-translate-y-1 hover:shadow-md",
                                    selectedThreadId === thread.id
                                        ? "bg-blue-50/50 border-blue-200 shadow-sm ring-1 ring-blue-500/20"
                                        : "bg-white hover:bg-slate-50 hover:border-slate-300"
                                )}
                            >
                                {selectedThreadId === thread.id && (
                                    <motion.div layoutId="activeThreadIndicator" className="absolute left-0 top-3 bottom-3 w-1 bg-blue-600 rounded-r-md" />
                                )}
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Avatar className="h-8 w-8 bg-slate-100 border border-slate-200">
                                            <AvatarFallback className="text-xs text-slate-500 font-medium">
                                                {thread.clientName.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-semibold text-slate-900 truncate">{thread.clientName}</h4>
                                            <span className="text-[10px] text-slate-400 block truncate">{format(new Date(thread.lastMessageAt), "MMM d, h:mm a")}</span>
                                        </div>
                                    </div>
                                    {thread.unreadCount > 0 && (
                                        <div className="h-5 w-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                                            {thread.unreadCount}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h3 className="font-medium text-sm text-slate-800 truncate">{thread.subject}</h3>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                        {thread.lastMessageSnippet || "No messages yet"}
                                    </p>
                                </div>
                                <div>
                                    <Badge variant={thread.status === 'open' ? 'default' : 'secondary'} className={cn(
                                        "h-5 text-[10px] uppercase tracking-wider font-semibold",
                                        thread.status === 'open' && "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    )}>
                                        {thread.status}
                                    </Badge>
                                </div>
                            </button>
                        ))}
                    </div>
                )
                }
            </ScrollArea >
        </div >
    );

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col h-full w-full relative"
        >
            <AnimatePresence>
                {!isOnline && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-red-50 border-b border-red-200 overflow-hidden shrink-0 rounded-t-xl"
                    >
                        <div className="px-4 py-2 flex items-center justify-center gap-2 text-red-700">
                            <WifiOff className="w-4 h-4" />
                            <span className="text-sm font-medium">Offline Mode</span>
                            <span className="text-xs hidden sm:inline">• Changes will sync when reconnected</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <BentoCard
                variant={hideSidebar ? "ghost" : "default"}
                className="flex flex-1 overflow-hidden h-full rounded-xl"
                disableHover
            >
                {/* Desktop Sidebar */}
                {!hideSidebar && (
                    <div className="hidden md:flex w-80 lg:w-96 shrink-0 border-r border-slate-100 bg-white h-full z-10">
                        <SidebarContent />
                    </div>
                )}

                {/* Mobile Sidebar Sheet */}
                {!hideSidebar && (
                    <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
                        <SheetContent side="left" className="p-0 w-80 sm:w-96">
                            <SidebarContent />
                        </SheetContent>
                    </Sheet>
                )}

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col h-full bg-slate-50/50 min-w-0">
                    {!selectedThreadId ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400">
                            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6">
                                <MessageSquare className="w-10 h-10 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">No active conversation</h3>
                            <p className="max-w-xs text-sm">Create a new message to start a thread with this client.</p>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="h-16 shrink-0 px-4 md:px-6 border-b border-slate-100 bg-white flex items-center justify-between z-10 shadow-sm">
                                <div className="flex items-center gap-3 min-w-0">
                                    {!hideSidebar && (
                                        <Button variant="ghost" size="icon" className="md:hidden -ml-2 shrink-0" onClick={() => setIsMobileOpen(true)}>
                                            <Menu className="w-5 h-5 text-slate-600" />
                                        </Button>
                                    )}
                                    <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-slate-800 truncate">{selectedThreadDetails?.subject}</h3>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="truncate">{selectedThreadDetails?.clientName}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 ml-4">
                                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600" onClick={toggleMute}>
                                        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="text-slate-400 drop-shadow-sm bg-white border border-slate-100 hover:text-slate-600">
                                                <MoreVertical className="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => updateStatus.mutate('open')}>
                                                <Inbox className="w-4 h-4 mr-2" /> Mark as Open
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => updateStatus.mutate('closed')}>
                                                <CheckCheck className="w-4 h-4 mr-2" /> Mark as Resolved
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => updateStatus.mutate('archived')}>
                                                <Archive className="w-4 h-4 mr-2" /> Archive
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            {/* Chat Messages */}
                            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-0">
                                <div className="space-y-6 max-w-4xl mx-auto">
                                    {isLoadingMessages ? (
                                        <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                                            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                                            Loading messages...
                                        </div>
                                    ) : selectedThreadDetails?.messages.length === 0 ? (
                                        <div className="py-20 text-center text-slate-400">No messages yet.</div>
                                    ) : (
                                        selectedThreadDetails?.messages.map((msg: any, index: number) => {
                                            const isLast = index === selectedThreadDetails.messages.length - 1;
                                            const isSameSender = index > 0 && selectedThreadDetails.messages[index - 1].senderType === msg.senderType;
                                            const showDate = index === 0 || !isSameDay(new Date(msg.createdAt), new Date(selectedThreadDetails.messages[index - 1].createdAt));

                                            return (
                                                <div key={msg.id} className="flex flex-col">
                                                    {showDate && (
                                                        <div className="flex justify-center my-4">
                                                            <span className="bg-slate-200/50 text-slate-500 text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full">
                                                                {format(new Date(msg.createdAt), "MMM d, yyyy")}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className={cn(
                                                            "flex flex-col gap-1",
                                                            msg.senderType === "admin" ? "items-end" : "items-start",
                                                            isSameSender ? "mt-1" : "mt-6"
                                                        )}
                                                    >
                                                        {!isSameSender && msg.senderType !== "admin" && (
                                                            <div className="text-xs font-semibold text-slate-500 px-1">{msg.senderName || "Client"}</div>
                                                        )}
                                                        <div className={cn(
                                                            "px-5 py-3 max-w-[85%] md:max-w-lg shadow-sm border group relative",
                                                            msg.senderType === "admin"
                                                                ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm border-blue-700"
                                                                : "bg-white text-slate-800 rounded-2xl rounded-tl-sm border-slate-200"
                                                        )}>
                                                            {msg.messageType === "job_reference" && msg.attachments?.[0] ? (() => {
                                                                const att = msg.attachments[0] as any;
                                                                let extra: Record<string, string> = {};
                                                                try { extra = JSON.parse(att.thumbnailUrl || "{}"); } catch { /* ignore */ }
                                                                return (
                                                                    <AdminJobCardBubble
                                                                        meta={{
                                                                            jobId: att.fileId || "",
                                                                            jobNo: att.name || "",
                                                                            device: extra.device || "",
                                                                            status: extra.status || "",
                                                                            priority: extra.priority,
                                                                        }}
                                                                        isFromAdmin={msg.senderType === "admin"}
                                                                        onClick={() => {
                                                                            // Scroll to or open job details — in admin context, just show a toast with the job link for now
                                                                            // A deep-link to the admin corporate jobs tab can be wired here when that view exists
                                                                            window.open(`/corporate/jobs/${att.fileId}`, "_blank");
                                                                        }}
                                                                    />
                                                                );
                                                            })() : null}
                                                            {msg.messageType === "image" && msg.attachments?.[0] && (
                                                                <div className="mb-2 rounded-xl overflow-hidden border border-slate-200/20 bg-black/5">
                                                                    <img src={msg.attachments[0].url} alt="Attachment" className="max-h-60 object-cover" />
                                                                </div>
                                                            )}
                                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                                            <div className="absolute right-2 bottom-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                {msg.senderType === "admin" && msg.isRead ? (
                                                                    <CheckCheck className="w-3 h-3 text-blue-200" />
                                                                ) : (
                                                                    <span className={cn("text-[9px]", msg.senderType === "admin" ? "text-blue-200" : "text-slate-400")}>
                                                                        {format(new Date(msg.createdAt), "h:mm a")}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {msg.senderType === "admin" && isLast && (
                                                            <div className="text-[10px] text-slate-400 font-medium px-1 flex items-center gap-1">
                                                                {msg.isRead ? <>Read <CheckCheck className="w-3 h-3 text-blue-500" /></> : <>Sent <Check className="w-3 h-3" /></>}
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                </div>
                                            );
                                        })
                                    )}
                                    {sendMessage.isPending && (
                                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-end">
                                            <div className="px-5 py-3 rounded-2xl bg-slate-200 rounded-tr-sm text-slate-500">
                                                <TypingIndicator />
                                            </div>
                                        </motion.div>
                                    )}
                                    {queue.map((msg) => (
                                        <div key={msg.id} className="flex flex-col items-end gap-1 mt-2 mb-2">
                                            <div className="flex items-center gap-2 max-w-[85%]">
                                                {msg.status === 'failed' && (
                                                    <Button variant="ghost" size="sm" className="text-red-500 h-8 text-xs" onClick={() => retryQueueMessage(msg.id)}>
                                                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
                                                    </Button>
                                                )}
                                                <div className={cn(
                                                    "px-5 py-3 rounded-2xl rounded-tr-sm border border-dashed",
                                                    msg.status === 'failed' ? "bg-red-50 border-red-200 text-slate-600" : "bg-slate-100 border-slate-300 text-slate-500 opacity-70"
                                                )}>
                                                    <p className="text-sm">{msg.text}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} className="h-4" />
                                </div>
                            </div>

                            {/* Chat Input */}
                            <div className="shrink-0 p-4 border-t border-slate-100 bg-white">
                                <div className="max-w-4xl mx-auto flex items-end gap-2">
                                    <div className="flex items-center gap-1 pb-1">
                                        <ImageKitUpload onUploadSuccess={handleImageUpload} folder="/corporate-chat" hideError>
                                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-10 w-10 shrink-0 rounded-full">
                                                <ImageIcon className="w-5 h-5" />
                                            </Button>
                                        </ImageKitUpload>
                                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-10 w-10 shrink-0 rounded-full">
                                            <Paperclip className="w-5 h-5" />
                                        </Button>
                                    </div>
                                    <textarea
                                        placeholder="Type your message..."
                                        className="flex-1 w-full min-h-[48px] max-h-32 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm text-slate-800 placeholder:text-slate-400"
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        rows={1}
                                    />
                                    <Button
                                        size="icon"
                                        onClick={handleSendMessage}
                                        disabled={!messageText.trim() || sendMessage.isPending}
                                        className={cn(
                                            "h-12 w-12 rounded-full shrink-0 shadow-sm transition-all text-white",
                                            messageText.trim() ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-200"
                                        )}
                                    >
                                        <Send className="w-5 h-5 ml-0.5" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </BentoCard>
        </motion.div>
    );
}

