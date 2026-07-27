/**
 * FINANCE-AND-AFTERCARE-01.4-UI-01A — Disputes case desk.
 * Aftercare only: no refund / warranty / job / bill mutations.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Loader2,
  Scale,
  Inbox,
  ShieldOff,
  ChevronRight,
  MessageSquarePlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  canCreateDisputes,
  canResolveDisputes,
  canViewDisputes,
} from "@/lib/disputes-capabilities";
import {
  consumeOpenDisputeCaseHandoff,
  DISPUTES_OPEN_CASE_EVENT,
} from "@/lib/disputes-open-handoff";
import {
  disputeCaseRef,
  disputeTargetLabel,
  disputeTargetShortRef,
  disputesApi,
  type Dispute,
  type DisputeNote,
} from "@/lib/api/disputesApi";
import { ApiError } from "@/lib/api/httpClient";
import {
  MobileScrollContent,
  MobileTabHeader,
  MobileTabLayout,
} from "../shared/MobileAdminPrimitives";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "under_review", label: "Under review" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "billing", label: "Billing" },
  { value: "service_quality", label: "Service quality" },
  { value: "refund", label: "Refund" },
  { value: "warranty", label: "Warranty" },
  { value: "other", label: "Other" },
] as const;

const TARGET_OPTIONS = [
  { value: "all", label: "All targets" },
  { value: "pos", label: "POS sale" },
  { value: "refund", label: "Refund" },
  { value: "warranty", label: "Warranty" },
] as const;

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "open") return "default";
  if (status === "under_review") return "secondary";
  if (status === "resolved") return "outline";
  return "outline";
}

function statusLabel(status: string) {
  if (status === "under_review") return "Under review";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function typeLabel(t: string) {
  if (t === "service_quality") return "Service quality";
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, " ");
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export default function DisputesTab() {
  const { user, permissions } = useAdminAuth();
  const perms = permissions as Record<string, boolean | undefined>;
  const canView = canViewDisputes(user, perms);
  const canCreate = canCreateDisputes(user, perms);
  const canResolve = canResolveDisputes(user, perms);
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [resolveNotes, setResolveNotes] = useState("");

  // Consume one-time create→detail handoff (view+create staff only).
  useEffect(() => {
    if (!canView) return;
    const pending = consumeOpenDisputeCaseHandoff();
    if (pending) setSelectedId(pending);

    const onOpen = (ev: Event) => {
      const id = (ev as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setSelectedId(id);
    };
    window.addEventListener(DISPUTES_OPEN_CASE_EVENT, onOpen);
    return () => window.removeEventListener(DISPUTES_OPEN_CASE_EVENT, onOpen);
  }, [canView]);

  const listQuery = useQuery({
    queryKey: ["disputes", "list", statusFilter, typeFilter, targetFilter],
    enabled: canView,
    queryFn: () =>
      disputesApi.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        dispute_type: typeFilter === "all" ? undefined : typeFilter,
        target_table:
          targetFilter === "all"
            ? undefined
            : (targetFilter as "pos" | "refund" | "warranty"),
        page: 1,
        limit: 50,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["disputes", "detail", selectedId],
    enabled: canView && !!selectedId,
    queryFn: () => disputesApi.getOne(selectedId!),
  });

  const notesQuery = useQuery({
    queryKey: ["disputes", "notes", selectedId],
    enabled: canView && !!selectedId,
    queryFn: () => disputesApi.getNotes(selectedId!),
  });

  const invalidateDisputesOnly = () => {
    qc.invalidateQueries({ queryKey: ["disputes"] });
  };

  const addNoteMutation = useMutation({
    mutationFn: () => disputesApi.addNote(selectedId!, noteText.trim(), "note"),
    onSuccess: () => {
      setNoteText("");
      invalidateDisputesOnly();
      toast.success("Note added");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const statusMutation = useMutation({
    mutationFn: (args: { status: string; resolution_notes?: string }) =>
      args.status === "resolved" && args.resolution_notes
        ? disputesApi.resolve(selectedId!, args.resolution_notes)
        : disputesApi.transitionStatus(selectedId!, args.status, args.resolution_notes),
    onSuccess: () => {
      setResolveNotes("");
      invalidateDisputesOnly();
      toast.success("Status updated");
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const items = listQuery.data?.items ?? [];
  const selected = detailQuery.data;
  const notes: DisputeNote[] = notesQuery.data ?? [];

  const allowedActions = useMemo(() => {
    if (!selected || !canResolve) return [] as string[];
    const s = selected.status;
    if (s === "open") return ["under_review", "closed"];
    if (s === "under_review") return ["resolved", "closed", "open"];
    return [];
  }, [selected, canResolve]);

  const canAddNote =
    canCreate && selected && (selected.status === "open" || selected.status === "under_review");

  if (!canView) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <ShieldOff className="h-10 w-10 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">
          You do not have permission to view disputes.
        </p>
      </div>
    );
  }

  const listBody = (
    <>
      <div className="flex flex-wrap gap-2 px-1 pb-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[140px] rounded-xl text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-[150px] rounded-xl text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={targetFilter} onValueChange={setTargetFilter}>
          <SelectTrigger className="h-9 w-[140px] rounded-xl text-xs">
            <SelectValue placeholder="Target" />
          </SelectTrigger>
          <SelectContent>
            {TARGET_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : listQuery.isError ? (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-destructive">
          Failed to load disputes.
          <Button variant="outline" size="sm" className="mt-3" onClick={() => listQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border bg-white py-16 text-center">
          <Inbox className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No dispute cases yet.</p>
          <p className="max-w-xs text-xs text-slate-400">
            Open a dispute from a POS sale, refund, or warranty claim when needed.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {items.map((d) => {
              const t = disputeTargetLabel(d);
              return (
                <button
                  key={d.id}
                  type="button"
                  className="flex w-full scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm active:scale-[0.99]"
                  onClick={() => setSelectedId(d.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-slate-800">
                        {disputeCaseRef(d.id)}
                      </span>
                      <Badge variant={statusBadgeVariant(d.status)} className="text-[10px]">
                        {statusLabel(d.status)}
                      </Badge>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {typeLabel(d.disputeType)}
                      {t ? ` · ${t.label} …${disputeTargetShortRef(t.id)}` : ""}
                    </div>
                    {d.customer ? (
                      <div className="mt-0.5 truncate text-xs text-slate-600">{d.customer}</div>
                    ) : null}
                    <div className="mt-1 text-[10px] text-slate-400">
                      {d.openedByName}
                      {d.openedAt
                        ? ` · ${format(new Date(d.openedAt), "d MMM yyyy")}`
                        : ""}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-b bg-slate-50">
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Case</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Status</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Type</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Target</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Customer</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => {
                  const t = disputeTargetLabel(d);
                  return (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setSelectedId(d.id)}
                    >
                      <TableCell className="font-mono text-sm font-semibold">
                        {disputeCaseRef(d.id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(d.status)}>
                          {statusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{typeLabel(d.disputeType)}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {t
                          ? `${t.label} …${disputeTargetShortRef(t.id)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{d.customer || "—"}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        <div>{d.openedByName}</div>
                        <div className="text-xs text-slate-400">
                          {d.openedAt
                            ? format(new Date(d.openedAt), "yyyy-MM-dd HH:mm")
                            : ""}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );

  const detail = selected ? (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-black">{disputeCaseRef(selected.id)}</span>
          <Badge variant={statusBadgeVariant(selected.status)}>
            {statusLabel(selected.status)}
          </Badge>
          <Badge variant="outline">{typeLabel(selected.disputeType)}</Badge>
        </div>

        {(() => {
          const t = disputeTargetLabel(selected);
          return t ? (
            <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Linked record
              </div>
              <div className="font-medium text-slate-800">
                {t.label}{" "}
                <span className="font-mono text-xs text-slate-500">
                  …{disputeTargetShortRef(t.id)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Read-only reference. Manage refunds, warranty, sales, or jobs on their own screens.
              </p>
            </div>
          ) : null;
        })()}

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Description
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{selected.description}</p>
        </div>

        {selected.customer ? (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Customer
            </div>
            <p className="mt-1 text-sm">{selected.customer}</p>
            {selected.customerPhone ? (
              <p className="font-mono text-xs text-slate-500">{selected.customerPhone}</p>
            ) : null}
          </div>
        ) : null}

        {selected.resolutionNotes ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              Resolution
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-900">
              {selected.resolutionNotes}
            </p>
          </div>
        ) : null}

        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Timeline
          </div>
          {notesQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : notes.length === 0 ? (
            <p className="text-xs text-slate-400">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl border bg-white px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                    <Badge variant="outline" className="text-[10px]">
                      {n.noteType === "status_change"
                        ? "Status"
                        : n.noteType === "internal"
                          ? "Internal"
                          : "Note"}
                    </Badge>
                    <span>{n.authorName}</span>
                    <span>
                      {n.createdAt ? format(new Date(n.createdAt), "d MMM HH:mm") : ""}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800">{n.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {canAddNote ? (
          <div className="space-y-2 rounded-xl border p-3">
            <Label className="text-xs">Add note</Label>
            <Textarea
              className="min-h-[72px] rounded-xl"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Staff note…"
            />
            <Button
              size="sm"
              className="gap-1"
              disabled={addNoteMutation.isPending || noteText.trim().length < 2}
              onClick={() => addNoteMutation.mutate()}
            >
              {addNoteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-3.5 w-3.5" />
              )}
              Add note
            </Button>
          </div>
        ) : null}

        {canResolve && allowedActions.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Case status
            </div>
            {allowedActions.includes("resolved") ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Resolution notes (required to resolve)</Label>
                <Textarea
                  className="min-h-[64px] rounded-xl bg-white"
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="How was this case resolved?"
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {allowedActions.includes("under_review") ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ status: "under_review" })}
                >
                  Start review
                </Button>
              ) : null}
              {allowedActions.includes("resolved") ? (
                <Button
                  size="sm"
                  disabled={statusMutation.isPending || resolveNotes.trim().length < 3}
                  onClick={() =>
                    statusMutation.mutate({
                      status: "resolved",
                      resolution_notes: resolveNotes.trim(),
                    })
                  }
                >
                  Resolve
                </Button>
              ) : null}
              {allowedActions.includes("closed") ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ status: "closed" })}
                >
                  Close
                </Button>
              ) : null}
              {allowedActions.includes("open") ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ status: "open" })}
                >
                  Reopen
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <MobileTabLayout>
      <MobileTabHeader className="md:hidden">
        <div className="flex items-center gap-2 pt-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Scale className="h-4 w-4" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">Disputes</div>
            <div className="text-[11px] text-slate-500">Aftercare case desk</div>
          </div>
        </div>
      </MobileTabHeader>
      <div className="hidden items-center gap-2 px-6 pb-2 pt-4 md:flex">
        <Scale className="h-5 w-5 text-violet-600" />
        <div>
          <h2 className="text-xl font-black text-slate-900">Disputes</h2>
          <p className="text-xs text-slate-500">Aftercare case desk — not a settlement screen</p>
        </div>
      </div>
      <MobileScrollContent className="md:px-6 md:pb-8">
        {listBody}
      </MobileScrollContent>

      <Sheet
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedId(null);
            setNoteText("");
            setResolveNotes("");
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="flex h-[min(92dvh,720px)] flex-col rounded-t-3xl p-4 md:h-full md:max-w-lg md:rounded-none"
        >
          <SheetHeader className="shrink-0 text-left">
            <SheetTitle>Dispute case</SheetTitle>
          </SheetHeader>
          <div className="mt-3 min-h-0 flex-1">
            {detailQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : detailQuery.isError ? (
              <p className="text-sm text-destructive">Could not load case.</p>
            ) : (
              detail
            )}
          </div>
        </SheetContent>
      </Sheet>
    </MobileTabLayout>
  );
}
