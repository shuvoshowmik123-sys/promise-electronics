/**
 * Contextual create entry — only when a concrete POS/refund/warranty id is already loaded.
 * Create-only staff get a neutral success toast; no case ID or desk navigation.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  buildNavigateAdminTabPath,
  getCurrentAdminTabIdFromLocation,
} from "@/lib/admin-workspace-routing";
import { Scale, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { canCreateDisputes, canViewDisputes } from "@/lib/disputes-capabilities";
import {
  emitOpenDisputeCase,
  handoffOpenDisputeCase,
} from "@/lib/disputes-open-handoff";
import { disputesApi, type DisputeTargetTable } from "@/lib/api/disputesApi";
import { ApiError } from "@/lib/api/httpClient";

const DISPUTE_TYPES = [
  { value: "billing", label: "Billing" },
  { value: "service_quality", label: "Service quality" },
  { value: "refund", label: "Refund" },
  { value: "warranty", label: "Warranty" },
  { value: "other", label: "Other" },
] as const;

type Props = {
  targetType: DisputeTargetTable;
  targetId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Compact control for dense tables */
  size?: "sm" | "default";
  className?: string;
};

export function OpenDisputeButton({
  targetType,
  targetId,
  customerName,
  customerPhone,
  size = "sm",
  className,
}: Props) {
  const { user, permissions } = useAdminAuth();
  const perms = permissions as Record<string, boolean | undefined>;
  const canCreate = canCreateDisputes(user, perms);
  const canView = canViewDisputes(user, perms);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [disputeType, setDisputeType] = useState<string>("billing");
  const [description, setDescription] = useState("");
  const [customer, setCustomer] = useState(customerName || "");
  const [, setLocation] = useLocation();

  if (!canCreate || !targetId) return null;

  const targetLabel =
    targetType === "pos" ? "POS sale" : targetType === "refund" ? "Refund" : "Warranty claim";

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        dispute_type: disputeType,
        description: description.trim(),
        customer: customer.trim() || null,
        customer_phone: customerPhone || null,
        pos_transaction_id: targetType === "pos" ? targetId : null,
        refund_id: targetType === "refund" ? targetId : null,
        warranty_claim_id: targetType === "warranty" ? targetId : null,
      };
      return disputesApi.create(body);
    },
    onSuccess: (created) => {
      if (canView) {
        qc.invalidateQueries({ queryKey: ["disputes"] });
        const tab =
          typeof window !== "undefined"
            ? getCurrentAdminTabIdFromLocation(
                window.location.pathname,
                window.location.search,
                window.location.hash,
              )
            : "";
        if (tab === "disputes") {
          // Already on desk: open detail via event (no raw id in UI).
          emitOpenDisputeCase(created.id);
        } else {
          // Cross-tab: in-memory handoff, then mount desk via canonical path (no case id in URL).
          handoffOpenDisputeCase(created.id);
          setLocation(buildNavigateAdminTabPath("disputes"));
        }
        toast.success("Dispute case opened");
      } else {
        // Create-only: neutral toast, no desk navigate, no case id surface.
        toast.success("Dispute case recorded");
      }
      setOpen(false);
      setDescription("");
      setDisputeType("billing");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not open dispute";
      toast.error(msg);
    },
  });

  return (
    <>
      <Button
        type="button"
        size={size}
        variant="outline"
        className={className ?? "h-7 gap-1 rounded-lg px-2 text-xs"}
        onClick={() => setOpen(true)}
        data-testid={`open-dispute-${targetType}`}
      >
        <Scale className="h-3.5 w-3.5" />
        Open dispute
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>Open dispute</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-500">Linked record: </span>
              {targetLabel}
              <span className="ml-1 font-mono text-xs text-slate-500">
                …{targetId.replace(/-/g, "").slice(-6).toUpperCase()}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={disputeType} onValueChange={setDisputeType}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPUTE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                className="min-h-[96px] rounded-xl"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is being disputed?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Customer name (optional)</Label>
              <Input
                className="rounded-xl"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || description.trim().length < 3}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create case"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
