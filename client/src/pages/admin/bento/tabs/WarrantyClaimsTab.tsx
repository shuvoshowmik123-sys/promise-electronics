import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    ShieldCheck, Search, CheckCircle, XCircle, Loader2, RefreshCw, Link2,
} from 'lucide-react';
import { toast } from 'sonner';

import { WarrantyClaimsTable } from '@/components/admin/corporate/WarrantyClaimsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { warrantyClaimsApi } from '@/lib/api';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useAdminMobileMode } from '@/hooks/useAdminMobileMode';
import {
    MobileTabLayout, MobileTabHeader, MobileScrollContent, MobileSegmentTabs,
} from '../shared/MobileAdminPrimitives';
import {
    MobileBottomSheetFrame, MobileBottomSheetHandle,
} from '@/components/ui/mobile-bottom-sheet';

// ─── Types ─────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'pending' | 'in_repair' | 'rejected' | 'linked';

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_repair', label: 'In Repair' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'linked', label: 'Linked' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function statusChipClass(status: string) {
    if (status === 'approved')   return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    if (status === 'in_repair')  return 'bg-blue-50 border-blue-200 text-blue-700';
    if (status === 'completed')  return 'bg-teal-50 border-teal-200 text-teal-700';
    if (status === 'rejected')   return 'bg-rose-50 border-rose-200 text-rose-700';
    return 'bg-amber-50 border-amber-200 text-amber-700'; // pending + unknown
}

function statusLabel(status: string) {
    if (status === 'in_repair') return 'In Repair';
    if (status === 'completed') return 'Completed';
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function claimTypeLabel(type: string) {
    if (!type) return '—';
    if (type === 'crr') return 'CRR';
    if (type === 'reservice') return 'Reservice';
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Returns the human-safe job label from backend-enriched fields or falls back to last 6 chars. */
function safeJobRef(claim: any, kind: 'original' | 'new'): string | null {
    if (kind === 'original') {
        if (claim.originalJobSafeRef) return claim.originalJobSafeRef as string;
        const id = claim.originalJobId as string | undefined;
        return id ? id.slice(-6).toUpperCase() : null;
    }
    if (claim.newJobSafeRef) return claim.newJobSafeRef as string;
    const id = claim.newJobId as string | undefined;
    return id ? id.slice(-6).toUpperCase() : null;
}

function DetailRow({
    label,
    value,
    mono = false,
    accent = false,
}: {
    label: string;
    value: string;
    mono?: boolean;
    accent?: boolean;
}) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">
                {label}
            </span>
            <span
                className={[
                    'text-sm font-bold text-right',
                    mono ? 'font-mono' : '',
                    accent ? 'text-blue-700' : 'text-slate-800',
                ].join(' ')}
            >
                {value}
            </span>
        </div>
    );
}

// ─── Detail / action bottom sheet ──────────────────────────────────────────────

interface ClaimSheetProps {
    claim: any;
    onClose: () => void;
    onApprove: (id: string) => void;
    onReject: (id: string, reason: string) => void;
    approving: boolean;
    rejecting: boolean;
    canApprove?: boolean;  // approve this specific claim (SA or Manager with warranty.approve AND claim.warrantyValid)
    canReject?: boolean;   // reject any pending claim (SA or Manager with warranty.approve)
}

function MobileWarrantyClaimSheet({
    claim,
    onClose,
    onApprove,
    onReject,
    approving,
    rejecting,
    canApprove = false,
    canReject = false,
}: ClaimSheetProps) {
    const [rejectReason, setRejectReason] = useState('');
    const [showRejectForm, setShowRejectForm] = useState(false);

    const origRef = safeJobRef(claim, 'original') ?? '—';
    const newRef = safeJobRef(claim, 'new');

    // Hide bottom dock while sheet is open
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: true } }));
        return () => {
            window.dispatchEvent(new CustomEvent('admin:mobile-chrome', { detail: { hidden: false } }));
        };
    }, []);

    const isPending = claim.status === 'pending';

    return createPortal(
        <AnimatePresence>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]"
                onClick={onClose}
            />
            {/* Sheet */}
            <MobileBottomSheetFrame
                onClose={onClose}
                className="fixed inset-x-0 bottom-0 z-[201] flex max-h-[88dvh] flex-col rounded-t-3xl bg-white shadow-2xl"
            >
                <MobileBottomSheetHandle />

                {/* Scrollable body */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
                    {/* Status + type badges */}
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span
                            className={[
                                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold',
                                statusChipClass(claim.status),
                            ].join(' ')}
                        >
                            {statusLabel(claim.status)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                            {claimTypeLabel(claim.claimType)}
                        </span>
                        {claim.newJobId && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                                <Link2 className="h-2.5 w-2.5" />Linked Job
                            </span>
                        )}
                    </div>

                    {/* Detail rows */}
                    <div className="space-y-3">
                        <DetailRow label="Original Job" value={`#${origRef}`} mono />
                        {claim.newJobId && newRef && (
                            <DetailRow label="Linked Job" value={`#${newRef}`} mono accent />
                        )}
                        <DetailRow
                            label="Claimed"
                            value={claim.claimedAt ? format(new Date(claim.claimedAt), 'PP') : 'N/A'}
                        />
                        <DetailRow label="Type" value={claimTypeLabel(claim.claimType)} />
                    </div>

                    {/* Full reason */}
                    <div className="mt-4">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Reason
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700">
                            {claim.claimReason || '—'}
                        </p>
                    </div>

                    {/* Rejection form (inline in body when triggered) */}
                    {isPending && showRejectForm && (
                        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3">
                            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-rose-500">
                                Rejection Reason (optional)
                            </label>
                            <textarea
                                className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                                rows={3}
                                placeholder="Reason for rejection…"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                // eslint-disable-next-line jsx-a11y/no-autofocus
                                autoFocus
                            />
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    disabled={rejecting}
                                    onClick={() =>
                                        onReject(
                                            claim.id,
                                            rejectReason.trim() || 'Rejected by admin',
                                        )
                                    }
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
                                >
                                    {rejecting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <XCircle className="h-4 w-4" />
                                    )}
                                    Confirm Reject
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowRejectForm(false)}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Status info blocks */}
                    {(claim.status === 'in_repair' || (claim.status === 'approved' && claim.newJobId)) && newRef && (
                        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-500">
                                Linked Job Created
                            </div>
                            <div className="font-mono text-sm font-black text-blue-700">
                                #{newRef}
                            </div>
                        </div>
                    )}
                    {claim.status === 'approved' && !claim.newJobId && (
                        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                                Claim Approved — Job Not Yet Created
                            </div>
                        </div>
                    )}
                    {claim.status === 'completed' && (
                        <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50 p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-teal-600">
                                Warranty Job Completed
                            </div>
                        </div>
                    )}
                    {claim.status === 'rejected' && (
                        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-3">
                            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-500">
                                Claim Rejected
                            </div>
                            {claim.rejectionReason && (
                                <p className="text-xs text-rose-700">{claim.rejectionReason}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer — pending actions based on permission */}
                {isPending && (canApprove || canReject) && !showRejectForm && (
                    <div
                        className="flex w-full shrink-0 gap-2 overflow-hidden border-t border-slate-100 p-4"
                        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                    >
                        {canApprove && (
                            <button
                                type="button"
                                disabled={approving || rejecting}
                                onClick={() => onApprove(claim.id)}
                                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
                            >
                                {approving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckCircle className="h-4 w-4" />
                                )}
                                Approve &amp; Create Job
                            </button>
                        )}
                        {canReject && (
                            <button
                                type="button"
                                disabled={approving || rejecting}
                                onClick={() => setShowRejectForm(true)}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-700 active:scale-[0.98] disabled:opacity-50"
                            >
                                <XCircle className="h-4 w-4" />
                                Reject
                            </button>
                        )}
                    </div>
                )}

                {/* Footer — non-pending: just close */}
                {!isPending && !showRejectForm && (
                    <div
                        className="w-full shrink-0 border-t border-slate-100 p-4"
                        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-600"
                        >
                            Close
                        </button>
                    </div>
                )}
            </MobileBottomSheetFrame>
        </AnimatePresence>,
        document.body,
    );
}

// ─── Mobile warranty claim card ────────────────────────────────────────────────

function MobileWarrantyCard({
    claim,
    onTap,
}: {
    claim: any;
    onTap: (claim: any) => void;
}) {
    const isPending = claim.status === 'pending';
    const origRef = safeJobRef(claim, 'original') ?? '—';
    const newRef = safeJobRef(claim, 'new');

    return (
        <button
            type="button"
            onClick={() => onTap(claim)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-transform active:scale-[0.98]"
        >
            {/* Primary row: safe job reference + status badge */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <span className="text-sm font-black text-slate-900">
                        Job #{origRef}
                    </span>
                    {claim.newJobId && newRef && (
                        <span className="ml-2 inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
                            <Link2 className="h-2 w-2" />#{newRef}
                        </span>
                    )}
                </div>
                <span
                    className={[
                        'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold',
                        statusChipClass(claim.status),
                    ].join(' ')}
                >
                    {statusLabel(claim.status)}
                </span>
            </div>

            {/* Type + date row */}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                    {claimTypeLabel(claim.claimType)}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                    {claim.claimedAt ? format(new Date(claim.claimedAt), 'MMM d, yyyy') : 'N/A'}
                </span>
            </div>

            {/* Reason preview */}
            {claim.claimReason && (
                <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">
                    {claim.claimReason}
                </p>
            )}

            {/* Pending affordance */}
            {isPending && (
                <div className="mt-2 flex items-center gap-1 text-[10px] font-bold text-amber-600">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Tap to review
                </div>
            )}
        </button>
    );
}

// ─── Main tab component ─────────────────────────────────────────────────────────

export default function WarrantyClaimsTab() {
    const isMobile = useAdminMobileMode();
    const queryClient = useQueryClient();
    const { user, permissions } = useAdminAuth();
    const isSA = user?.role === "Super Admin";
    const hasWarrantyApprove = isSA || (permissions as any)["warranty.approve"] === true;

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [search, setSearch] = useState('');
    const [selectedClaim, setSelectedClaim] = useState<any | null>(null);

    const { data, isLoading, error, refetch } = useQuery<any>({
        queryKey: ['warranty-claims'],
        queryFn: () => warrantyClaimsApi.getAll(),
        enabled: isMobile,
    });

    const allClaims: any[] = useMemo(
        () => (Array.isArray(data) ? data : (data?.items ?? [])),
        [data],
    );

    const approveMutation = useMutation({
        mutationFn: async (id: string) => {
            await warrantyClaimsApi.approve(id, {
                approvedBy: user?.id ?? 'admin',
                approvedByName: user?.name ?? 'Admin',
                approvedByRole: user?.role ?? 'Admin',
            });
            return warrantyClaimsApi.createJob(id, { createdBy: user?.id ?? 'admin' });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['warranty-claims'] });
            queryClient.invalidateQueries({ queryKey: ['job-tickets'] });
            toast.success('CRR / reservice approved and linked job created');
            setSelectedClaim(null);
        },
        onError: (err: any) => toast.error(err.message || 'Failed to approve claim'),
    });

    const rejectMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
            await warrantyClaimsApi.reject(id, {
                approvedBy: user?.id ?? 'admin',
                approvedByName: user?.name ?? 'Admin',
                approvedByRole: user?.role ?? 'Admin',
                rejectionReason: reason,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['warranty-claims'] });
            toast.success('Claim rejected');
            setSelectedClaim(null);
        },
        onError: (err: any) => toast.error(err.message || 'Failed to reject claim'),
    });

    // ── Mobile filter + search ────────────────────────────────────────────────

    const filteredClaims = useMemo(() => {
        let list: any[] = allClaims;

        if (statusFilter === 'pending')
            list = list.filter((c) => c.status === 'pending');
        else if (statusFilter === 'in_repair')
            // "In Repair" catches both approved (transient) and in_repair states
            list = list.filter((c) => c.status === 'in_repair' || c.status === 'approved');
        else if (statusFilter === 'rejected')
            list = list.filter((c) => c.status === 'rejected');
        else if (statusFilter === 'linked')
            // Any claim that has a linked new job, regardless of status
            list = list.filter((c) => Boolean(c.newJobId));

        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter((c) => {
                const orig = safeJobRef(c, 'original') ?? '';
                const linked = safeJobRef(c, 'new') ?? '';
                return (
                    orig.toLowerCase().includes(q) ||
                    linked.toLowerCase().includes(q) ||
                    String(c.originalJobId ?? '').toLowerCase().includes(q) ||
                    String(c.newJobId ?? '').toLowerCase().includes(q) ||
                    String(c.claimReason ?? '').toLowerCase().includes(q) ||
                    String(c.claimType ?? '').toLowerCase().includes(q) ||
                    String(c.status ?? '').toLowerCase().includes(q) ||
                    String(c.customer ?? '').toLowerCase().includes(q)
                );
            });
        }

        return list;
    }, [allClaims, statusFilter, search]);

    const pendingCount = useMemo(
        () => allClaims.filter((c) => c.status === 'pending').length,
        [allClaims],
    );

    // ── Mobile branch ─────────────────────────────────────────────────────────

    if (isMobile) {
        return (
            <MobileTabLayout>
                <MobileTabHeader>
                    {/* Title row */}
                    <div className="flex items-center justify-between pt-2 pb-1">
                        <div>
                            <div className="text-base font-black text-slate-900 leading-tight">
                                Warranty Claims
                            </div>
                            <div className="text-[11px] font-medium text-slate-500">
                                CRR &amp; reservice
                            </div>
                        </div>
                        {pendingCount > 0 && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                                {pendingCount} pending
                            </span>
                        )}
                    </div>

                    {/* Search bar */}
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Job ref, reason, type…"
                            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </div>

                    {/* Status chips */}
                    <MobileSegmentTabs<StatusFilter>
                        value={statusFilter}
                        onChange={setStatusFilter}
                        tone="amber"
                        items={STATUS_CHIPS.map((chip) => ({
                            ...chip,
                            badge:
                                chip.value === 'pending' && pendingCount > 0 ? (
                                    <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                        {pendingCount}
                                    </span>
                                ) : undefined,
                        }))}
                    />
                </MobileTabHeader>

                <MobileScrollContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-3 py-16 text-center">
                            <ShieldCheck className="h-8 w-8 text-slate-300" />
                            <p className="text-sm font-medium text-slate-500">Failed to load claims</p>
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm"
                            >
                                <RefreshCw className="h-3 w-3" />
                                Retry
                            </button>
                        </div>
                    ) : filteredClaims.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-16 text-center">
                            <ShieldCheck className="h-8 w-8 text-slate-300" />
                            <p className="text-sm font-medium text-slate-500">
                                No warranty claims found
                            </p>
                            {(search || statusFilter !== 'all') && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch('');
                                        setStatusFilter('all');
                                    }}
                                    className="mt-1 text-xs font-bold text-blue-600"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2 pt-1">
                            {filteredClaims.map((claim: any) => (
                                <MobileWarrantyCard
                                    key={claim.id}
                                    claim={claim}
                                    onTap={setSelectedClaim}
                                />
                            ))}
                        </div>
                    )}
                </MobileScrollContent>

                {/* Detail / action sheet */}
                {selectedClaim && (
                    <MobileWarrantyClaimSheet
                        claim={selectedClaim}
                        onClose={() => setSelectedClaim(null)}
                        onApprove={(id) => approveMutation.mutate(id)}
                        onReject={(id, reason) => rejectMutation.mutate({ id, reason })}
                        approving={approveMutation.isPending}
                        rejecting={rejectMutation.isPending}
                        canApprove={hasWarrantyApprove && (!!(selectedClaim?.warrantyValid) || isSA)}
                        canReject={hasWarrantyApprove}
                    />
                )}
            </MobileTabLayout>
        );
    }

    // ── Desktop branch (unchanged) ────────────────────────────────────────────

    return (
        <div className="space-y-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Warranty Claims</h2>
                    <p className="text-muted-foreground">
                        Review and manage client warranty claims and approve warranty jobs.
                    </p>
                </div>
                <ShieldCheck className="h-8 w-8 text-primary opacity-20" />
            </div>

            <Card className="border-border/40 shadow-sm bg-card/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle>Active Claims</CardTitle>
                    <CardDescription>
                        All pending and processed warranty claims across the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <WarrantyClaimsTable />
                </CardContent>
            </Card>
        </div>
    );
}
