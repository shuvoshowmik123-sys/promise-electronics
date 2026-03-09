import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BentoCard } from '../shared/BentoCard';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
    Brain, Eye, Ghost, Rocket,
    MessageCircle, Users, Activity, RefreshCw, PenSquare, CheckCircle, XCircle,
    AlertCircle, ShieldAlert, X, Check, Trash2
} from 'lucide-react';

export function BrainTab() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const limit = 10;

    // Optimistic local mode state
    const [localMode, setLocalMode] = useState<string | null>(null);

    // Confirmation Dialog State
    const [pendingMode, setPendingMode] = useState<'observe' | 'shadow' | 'autopilot' | null>(null);
    const [confirmText, setConfirmText] = useState("");

    // Inline Editor for Shadow Drafts
    const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
    const [editDraftContent, setEditDraftContent] = useState("");

    // Queries
    const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery({
        queryKey: ['brain-stats'],
        queryFn: async () => {
            const res = await fetch('/api/brain/stats', { credentials: 'include' });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
        },
        refetchInterval: 15000
    });

    const { data: convData, isLoading: convLoading } = useQuery({
        queryKey: ['brain-conversations', page],
        queryFn: async () => {
            const res = await fetch(`/api/brain/conversations?page=${page}&limit=${limit}`, { credentials: 'include' });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
        }
    });

    const { data: shadowData } = useQuery({
        queryKey: ['brain-shadow-drafts'],
        queryFn: async () => {
            const res = await fetch('/api/brain/shadow-drafts', { credentials: 'include' });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
        },
        refetchInterval: 10000 // Poll frequently for new incoming drafts
    });

    // Mutations
    const updateModeMutation = useMutation({
        mutationFn: async (mode: string) => {
            const res = await apiRequest('PATCH', '/api/brain/config/mode', { mode });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Failed to update mode");
            return data;
        },
        onMutate: (mode: string) => setLocalMode(mode),
        onSuccess: (data, mode) => {
            queryClient.invalidateQueries({ queryKey: ['brain-stats'] });
            toast({ title: "Brain Mode Updated", description: `Successfully switched to ${mode.toUpperCase()} mode.` });
        },
        onError: (err: any) => {
            setLocalMode(null);
            toast({ title: "Operation Restricted", description: err.message || "Network error.", variant: "destructive" });
        }
    });

    const approveDraftMutation = useMutation({
        mutationFn: async ({ id, editedReply }: { id: string; editedReply?: string }) => {
            const res = await apiRequest('PATCH', `/api/brain/shadow-drafts/${id}/approve`, { editedReply });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['brain-shadow-drafts'] });
            queryClient.invalidateQueries({ queryKey: ['brain-conversations'] });
            toast({ title: "Draft approved & sent!" });
        }
    });

    const rejectDraftMutation = useMutation({
        mutationFn: async ({ id }: { id: string }) => {
            const res = await apiRequest('PATCH', `/api/brain/shadow-drafts/${id}/reject`, {});
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['brain-shadow-drafts'] });
            toast({ title: "Draft rejected & discarded.", variant: "destructive" });
        }
    });

    const updateQualityMutation = useMutation({
        mutationFn: async ({ id, isGoodExample }: { id: string; isGoodExample: boolean }) => {
            const res = await apiRequest('PATCH', `/api/brain/conversations/${id}/quality`, { isGoodExample });
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['brain-conversations'] });
            toast({ title: "Quality marked perfectly!" });
        }
    });

    // Derived State
    const stats = statsData?.stats;
    const conversations = convData?.data || [];
    const pagination = convData?.pagination;
    const shadowDrafts = shadowData?.data || [];
    const currentMode = localMode ?? stats?.activeMode ?? 'observe';

    const modeConfig = {
        observe: { label: 'Observe', icon: Eye, activeClass: 'bg-blue-600 text-white shadow-md shadow-blue-500/20', desc: 'Silently logging all messages' },
        shadow: { label: 'Shadow', icon: Ghost, activeClass: 'bg-purple-600 text-white shadow-md shadow-purple-500/20', desc: 'AI drafts replies for review' },
        autopilot: { label: 'Autopilot', icon: Rocket, activeClass: 'bg-rose-600 text-white shadow-md shadow-rose-500/20', desc: 'AI replies automatically' }
    } as const;

    const handleModeClick = (mode: 'observe' | 'shadow' | 'autopilot') => {
        if (mode === currentMode) return;
        if (mode === 'observe') {
            updateModeMutation.mutate(mode);
            return;
        }
        setPendingMode(mode);
        setConfirmText("");
    };

    const confirmModeSwitch = () => {
        if (!pendingMode) return;
        updateModeMutation.mutate(pendingMode);
        setPendingMode(null);
    };

    if (statsError) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-slate-400 gap-3">
                <AlertCircle className="w-12 h-12 text-slate-300" />
                <p className="text-lg font-semibold">Could not load Brain data</p>
                <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['brain-stats'] })}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-1 relative">
            {/* Header + Mode Control */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative z-10">
                <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent flex items-center gap-2">
                        <Brain className="w-7 h-7 text-blue-600" />
                        Dhaktar Bhai Brain
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {modeConfig[currentMode as keyof typeof modeConfig]?.desc}
                    </p>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
                    {(Object.keys(modeConfig) as Array<keyof typeof modeConfig>).map((m) => {
                        const cfg = modeConfig[m as keyof typeof modeConfig];
                        const Icon = cfg.icon;
                        const isActive = currentMode === m;
                        return (
                            <button
                                key={m}
                                onClick={() => handleModeClick(m as any)}
                                disabled={updateModeMutation.isPending}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all duration-200 disabled:opacity-70 ${isActive ? cfg.activeClass : 'text-slate-500 hover:bg-white hover:shadow-sm'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {cfg.label}
                                {m === 'shadow' && shadowDrafts.length > 0 && (
                                    <span className={`ml-1 flex h-2 w-2 rounded-full ${isActive ? 'bg-white' : 'bg-purple-500'}`}></span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                <BentoCard title="Observed Pairs" icon={<MessageCircle className="w-5 h-5 text-blue-500" />}>
                    <p className="text-4xl font-black text-slate-800 mt-2">
                        {statsLoading ? <span className="animate-pulse text-slate-300">—</span> : (stats?.totalPairs ?? 0)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Total Q&amp;A pairs learned</p>
                </BentoCard>

                <BentoCard title="Active Sessions" icon={<Users className="w-5 h-5 text-emerald-500" />}>
                    <p className="text-4xl font-black text-slate-800 mt-2">
                        {statsLoading ? <span className="animate-pulse text-slate-300">—</span> : (stats?.totalSessions ?? 0)}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Unique customers tracked</p>
                </BentoCard>

                <BentoCard title="Brain Health" icon={<Activity className="w-5 h-5 text-violet-500" />}>
                    <p className="text-4xl font-black text-emerald-500 mt-2">100%</p>
                    <p className="text-xs text-slate-400 mt-1">Vector DB online</p>
                </BentoCard>

                <BentoCard title="AI Mode" icon={<Brain className="w-5 h-5 text-amber-500" />}>
                    <p className="text-4xl font-black text-slate-800 mt-2 capitalize">{currentMode}</p>
                    <p className="text-xs text-slate-400 mt-1">{modeConfig[currentMode as keyof typeof modeConfig]?.desc}</p>
                </BentoCard>
            </div>

            {/* Pending Shadow Drafts (Visible if there are any) */}
            <AnimatePresence>
                {shadowDrafts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="bg-gradient-to-br from-purple-50 to-white rounded-2xl border border-purple-200 shadow-sm overflow-hidden flex flex-col relative z-10"
                    >
                        <div className="flex items-center justify-between p-4 border-b border-purple-100 shrink-0 bg-white/50 backdrop-blur-sm">
                            <h3 className="text-base font-semibold text-purple-900 flex items-center gap-2">
                                <Ghost className="w-5 h-5 text-purple-600" />
                                Action Required: Shadow Drafts
                                <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">{shadowDrafts.length}</span>
                            </h3>
                        </div>
                        <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
                            {shadowDrafts.map((draft: any) => (
                                <div key={draft.id} className="bg-white border hover:border-purple-300 border-purple-100 shadow-sm rounded-xl p-4 transition-all duration-200">
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <MessageCircle className="w-4 h-4" />
                                            <span>From Customer PSID: <code className="bg-slate-100 px-1 rounded">{draft.senderPsid}</code></span>
                                            <span className="text-xs">{new Date(draft.createdAt).toLocaleTimeString()}</span>
                                        </div>
                                    </div>

                                    {/* Customer message */}
                                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-slate-800 mb-3 whitespace-pre-wrap text-sm">
                                        <strong>Customer:</strong> {draft.customerMessage}
                                    </div>

                                    {/* AI Draft */}
                                    <div className="flex gap-3">
                                        <div className="w-1 rounded-full shrink-0 self-stretch bg-purple-400" />
                                        <div className="flex-1">
                                            {editingDraftId === draft.id ? (
                                                <div className="space-y-3">
                                                    <Textarea
                                                        value={editDraftContent}
                                                        onChange={(e) => setEditDraftContent(e.target.value)}
                                                        className="min-h-[100px] text-sm focus-visible:ring-purple-500 border-purple-200"
                                                        placeholder="Edit the AI's response before sending..."
                                                        autoFocus
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="outline" size="sm" onClick={() => setEditingDraftId(null)}>Cancel</Button>
                                                        <Button
                                                            size="sm"
                                                            className="bg-purple-600 hover:bg-purple-700"
                                                            onClick={() => {
                                                                approveDraftMutation.mutate({ id: draft.id, editedReply: editDraftContent });
                                                                setEditingDraftId(null);
                                                            }}
                                                            disabled={approveDraftMutation.isPending}
                                                        >
                                                            <Check className="w-4 h-4 mr-1.5" /> Approve & Send Edited
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-purple-50/50 border border-purple-100 rounded-lg p-3 text-slate-700 whitespace-pre-wrap text-sm">
                                                    <div className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                                                        <Ghost className="w-3 h-3" /> Draft AI Reply
                                                    </div>
                                                    {draft.aiDraft}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {editingDraftId !== draft.id && (
                                        <div className="flex gap-2 justify-end mt-4 pt-4 border-t border-slate-100">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200"
                                                onClick={() => rejectDraftMutation.mutate({ id: draft.id })}
                                                disabled={rejectDraftMutation.isPending}
                                            >
                                                <Trash2 className="w-4 h-4 mr-1.5" /> Reject
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setEditingDraftId(draft.id);
                                                    setEditDraftContent(draft.aiDraft);
                                                }}
                                            >
                                                <PenSquare className="w-4 h-4 mr-1.5" /> Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700"
                                                onClick={() => approveDraftMutation.mutate({ id: draft.id })}
                                                disabled={approveDraftMutation.isPending}
                                            >
                                                <Check className="w-4 h-4 mr-1.5" /> Approve & Send
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Conversation Feed */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative z-10" style={{ height: 580 }}>
                <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
                    <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-indigo-400" />
                        Observed Conversations
                        {pagination && (
                            <span className="text-xs font-normal text-slate-400 ml-1">({pagination.total} total)</span>
                        )}
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ['brain-conversations'] });
                        queryClient.invalidateQueries({ queryKey: ['brain-shadow-drafts'] });
                    }}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {convLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="animate-pulse bg-slate-100 h-28 rounded-xl" />
                        ))
                    ) : conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                            <Brain className="w-14 h-14 text-slate-200 mb-4" />
                            <p className="font-semibold text-slate-500">No conversations observed yet</p>
                            <p className="text-sm mt-1">When customers message via Messenger, and a human agent replies, the Q&amp;A pairs will appear here.</p>
                        </div>
                    ) : (
                        <AnimatePresence>
                            {conversations.map((conv: any) => (
                                <motion.div
                                    key={conv.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm"
                                >
                                    {/* Header row */}
                                    <div className="flex justify-between items-center mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                                                {conv.senderName ? conv.senderName.charAt(0).toUpperCase() : 'C'}
                                            </div>
                                            <span className="font-medium text-slate-700">{conv.senderName || 'Messenger User'}</span>
                                            <span className="text-xs text-slate-400">{new Date(conv.createdAt).toLocaleString()}</span>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                            <button
                                                title="Mark as Good Example"
                                                onClick={() => updateQualityMutation.mutate({ id: conv.id, isGoodExample: true })}
                                                className={`p-1.5 rounded-lg transition-colors ${conv.isGoodExample === true ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                            <button
                                                title="Mark as Bad Example"
                                                onClick={() => updateQualityMutation.mutate({ id: conv.id, isGoodExample: false })}
                                                className={`p-1.5 rounded-lg transition-colors ${conv.isGoodExample === false ? 'bg-rose-100 text-rose-600' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                            <button title="Edit Reply" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                                <PenSquare className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Customer message */}
                                    <div className="bg-white border border-slate-100 rounded-lg p-3 text-slate-800 mb-2 whitespace-pre-wrap">
                                        {conv.customerMessage}
                                    </div>

                                    {/* Reply */}
                                    <div className="flex gap-2">
                                        <div className={`w-1 rounded-full shrink-0 self-stretch ${conv.repliedBy === 'ai' || conv.repliedBy === 'ai_edited' ? 'bg-purple-400' : 'bg-blue-400'}`} />
                                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex-1 text-slate-700 whitespace-pre-wrap">
                                            <div className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                                                {conv.repliedBy === 'ai' ? <><Rocket className="w-3 h-3" /> Dhaktar Bhai AI</> : conv.repliedBy === 'ai_edited' ? <><Ghost className="w-3 h-3" /> Edited AI Reply</> : 'Human Reply'}
                                            </div>
                                            {conv.ourReply}
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    {(conv.category || conv.sentiment || conv.language) && (
                                        <div className="flex gap-2 mt-3 flex-wrap">
                                            {conv.category && <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-md">{conv.category}</span>}
                                            {conv.sentiment && <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-md">{conv.sentiment}</span>}
                                            {conv.language && <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-md">{conv.language}</span>}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-sm shrink-0">
                        <span className="text-slate-500">Page {pagination.page} of {pagination.totalPages}</span>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                            <Button variant="outline" size="sm" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirmation Modal Overlay */}
            <AnimatePresence>
                {pendingMode && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => setPendingMode(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
                        >
                            <div className={`p-6 text-white ${pendingMode === 'autopilot' ? 'bg-rose-600' : 'bg-purple-600'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        {pendingMode === 'autopilot' ? <Rocket className="w-8 h-8" /> : <Ghost className="w-8 h-8" />}
                                        <div>
                                            <h3 className="text-xl font-bold">Activate {modeConfig[pendingMode].label}?</h3>
                                            <p className="text-white/80 text-sm mt-1">Change AI behavior mode</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setPendingMode(null)} className="text-white/60 hover:text-white transition-colors">
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 space-y-4">
                                {pendingMode === 'shadow' && (
                                    <div className="text-slate-600 text-sm">
                                        <p>In <strong>Shadow Mode</strong>, the AI will generate draft responses to incoming customer messages.</p>
                                        <ul className="list-disc pl-5 mt-2 space-y-1">
                                            <li>These drafts will <strong>not</strong> be sent to customers automatically.</li>
                                            <li>You must review, approve, or reject them in the dashboard.</li>
                                        </ul>
                                    </div>
                                )}

                                {pendingMode === 'autopilot' && (
                                    <div className="text-slate-600 text-sm space-y-4">
                                        <div className="flex items-start gap-3 bg-rose-50 text-rose-800 p-3 rounded-xl border border-rose-100">
                                            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                                            <p><strong>Warning:</strong> The AI will reply to real customers <strong>autonomously</strong>. Make sure you have approved enough Good Examples in Shadow Mode first.</p>
                                        </div>
                                        <div>
                                            <p className="mb-2 font-medium text-slate-800">To confirm, type <strong>AUTOPILOT</strong> below:</p>
                                            <Input
                                                autoFocus
                                                placeholder="AUTOPILOT"
                                                value={confirmText}
                                                onChange={(e) => setConfirmText(e.target.value)}
                                                className="border-slate-300 focus-visible:ring-rose-500"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                                    <Button variant="ghost" className="text-slate-500" onClick={() => setPendingMode(null)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={confirmModeSwitch}
                                        disabled={pendingMode === 'autopilot' && confirmText !== 'AUTOPILOT'}
                                        className={pendingMode === 'autopilot' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-purple-600 hover:bg-purple-700'}
                                    >
                                        Confirm & Enable
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default BrainTab;
