import { useState } from "react";
import { RecordCleanupOverlay } from "@/components/admin/RecordCleanupOverlay";
import { Trash2, ShieldAlert, Search, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchApi } from "@/lib/api/httpClient";

/**
 * Removes test records left behind by QA against production.
 *
 * Two-step by design: nothing is deleted until a Super Admin has seen the exact
 * rows resolved by the server and typed the confirmation. The preview and the
 * delete run the same server-side resolver, so what was approved is what goes.
 *
 * Targets are explicit phone and ticket numbers. There is no "delete everything
 * named QA" — a name pattern would eventually match a real customer.
 */

type Blocker = { kind: string; detail: string };
type Customer = { userId: string; name: string | null; phone: string | null; role: string | null; accountState: string | null };
type ServiceRequest = { id: string; ticketNumber: string | null; phone: string | null; createdAt: string | null };
type Preview = {
    customers: Customer[];
    serviceRequests: ServiceRequest[];
    counts: Record<string, number>;
    blockers: Blocker[];
    safeToDelete: boolean;
};

const CONFIRMATION = "DELETE TEST DATA";
/* Its own phrase, because it destroys repair history rather than a login. */
const WORK_CONFIRMATION = "DELETE JOBS TOO";

function splitList(raw: string): string[] {
    return raw.split(/[\s,\n]+/).map((s) => s.trim()).filter(Boolean);
}

export default function QaCleanupSection() {
    const [sweepOpen, setSweepOpen] = useState(false);
    const [phonesRaw, setPhonesRaw] = useState("");
    const [ticketsRaw, setTicketsRaw] = useState("");
    const [preview, setPreview] = useState<Preview | null>(null);
    const [confirmation, setConfirmation] = useState("");
    const [busy, setBusy] = useState<"idle" | "previewing" | "deleting">("idle");
    const [includeWork, setIncludeWork] = useState(false);
    const [workConfirmation, setWorkConfirmation] = useState("");

    const targets = { phones: splitList(phonesRaw), ticketNumbers: splitList(ticketsRaw), includeWork };
    const hasTargets = targets.phones.length > 0 || targets.ticketNumbers.length > 0;

    const setScope = (next: boolean) => {
        setIncludeWork(next);
        // The old preview described a different operation. Keeping it on screen
        // beside a changed scope is how somebody approves counts that were
        // never true for what they are about to run.
        setPreview(null);
        setConfirmation("");
        setWorkConfirmation("");
    };

    const runPreview = async () => {
        setBusy("previewing");
        setPreview(null);
        setConfirmation("");
        try {
            const result = await fetchApi<Preview>("/admin/system/qa-cleanup/preview", {
                method: "POST",
                body: JSON.stringify(targets),
            });
            setPreview(result);
        } catch {
            toast.error("Could not load the preview.");
        } finally {
            setBusy("idle");
        }
    };

    const runDelete = async () => {
        if (confirmation !== CONFIRMATION) return;
        if (includeWork && workConfirmation !== WORK_CONFIRMATION) return;
        setBusy("deleting");
        try {
            const result = await fetchApi<{ deleted: Record<string, number> }>(
                "/admin/system/qa-cleanup/execute",
                { method: "POST", body: JSON.stringify({ ...targets, confirmation, workConfirmation }) },
            );
            toast.success(
                `Removed ${result.deleted.customers} customer(s) and ${result.deleted.serviceRequests} service request(s).`,
            );
            setPreview(null);
            setConfirmation("");
            setWorkConfirmation("");
            setIncludeWork(false);
            setPhonesRaw("");
            setTicketsRaw("");
        } catch (error: any) {
            // A refusal is the tool working as intended, not a failure.
            toast.error(error?.message || "Delete failed.");
        } finally {
            setBusy("idle");
        }
    };

    return (
        <div className="rounded-[20px] border border-amber-200 bg-white overflow-hidden" data-testid="qa-cleanup-section">
            <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50/60 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-amber-100">
                    <ShieldAlert className="h-4 w-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-amber-800">Remove test records</p>
                    <p className="text-[11px] text-amber-600">
                        Delete QA data by phone or ticket number. Preview first — always.
                    </p>
                </div>
            </div>

            {/*
              * The sweep is the way in now; the fields below remain for the case
              * it was built for — one known phone number, deleted precisely.
              */}
            <div className="border-b border-amber-100 bg-white p-4">
                <button
                    type="button"
                    onClick={() => setSweepOpen(true)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition-colors hover:bg-slate-100"
                >
                    <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-900">
                            Sweep the whole system
                        </span>
                        <span className="block text-xs text-slate-500">
                            Every type at once — jobs, requests, products, bills. Select and
                            delete together. Recoverable for 24 hours.
                        </span>
                    </span>
                    <span className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                        Open
                    </span>
                </button>
            </div>

            <RecordCleanupOverlay open={sweepOpen} onClose={() => setSweepOpen(false)} />

            <div className="space-y-4 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="qa-phones">Phone numbers</Label>
                        <Input
                            id="qa-phones"
                            value={phonesRaw}
                            onChange={(e) => setPhonesRaw(e.target.value)}
                            placeholder="+8801700000801, +8801700000802"
                            className="h-11 rounded-xl"
                            data-testid="input-qa-phones"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="qa-tickets">Ticket numbers</Label>
                        <Input
                            id="qa-tickets"
                            value={ticketsRaw}
                            onChange={(e) => setTicketsRaw(e.target.value)}
                            placeholder="SRV-20260804-0007, SRV-20260804-0008"
                            className="h-11 rounded-xl"
                            data-testid="input-qa-tickets"
                        />
                    </div>
                </div>
                <p className="text-[11px] leading-5 text-slate-500">
                    Separate multiple values with commas or spaces. A customer's other repairs are
                    included automatically, so nothing is left pointing at a deleted record.
                </p>

                <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl"
                    disabled={!hasTargets || busy !== "idle"}
                    onClick={runPreview}
                    data-testid="button-qa-preview"
                >
                    {busy === "previewing"
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking…</>
                        : <><Search className="mr-2 h-4 w-4" />Preview what would be deleted</>}
                </Button>

                {preview && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="qa-preview">
                        {preview.blockers.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-[12px] font-semibold text-red-700">
                                    Refusing to delete — {preview.blockers.length} problem(s):
                                </p>
                                <ul className="space-y-1">
                                    {preview.blockers.map((b, i) => (
                                        <li key={i} className="text-[12px] leading-5 text-red-600">• {b.detail}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" />Safe to delete
                            </p>
                        )}

                        {preview.customers.length > 0 && (
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customers</p>
                                <ul className="mt-1 space-y-0.5">
                                    {preview.customers.map((c) => (
                                        <li key={c.userId} className="text-[12px] text-slate-700">
                                            {c.name || "(no name)"} · {c.phone || "no phone"}
                                            {c.accountState ? ` · ${c.accountState}` : ""}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {preview.serviceRequests.length > 0 && (
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service requests</p>
                                <ul className="mt-1 space-y-0.5">
                                    {preview.serviceRequests.map((s) => (
                                        <li key={s.id} className="font-mono text-[12px] text-slate-700">
                                            {s.ticketNumber || s.id}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 pt-2">
                            {Object.entries(preview.counts).map(([key, value]) => (
                                <span key={key} className="text-[11px] text-slate-500">
                                    {key.replace(/([A-Z])/g, " $1").toLowerCase()}: <b className="text-slate-700">{value}</b>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/*
                  * The scope, chosen before the preview rather than after.
                  *
                  * Without it a customer whose request ever became a job could
                  * not be removed at all - which is right for a live shop and
                  * useless for clearing demo records, because every realistic
                  * test customer has a job behind it.
                  */}
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <input
                        type="checkbox"
                        checked={includeWork}
                        onChange={(e) => setScope(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                        data-testid="checkbox-include-work"
                    />
                    <span className="min-w-0">
                        <span className="block text-[12px] font-bold text-amber-900">
                            Delete their jobs as well
                        </span>
                        <span className="block text-[11px] font-medium text-amber-800">
                            Removes the repair tickets and their history with the profile. Anything
                            carrying money — a bill, a payment, a refund, a commission, a shop order —
                            still refuses, and the preview names which.
                        </span>
                    </span>
                </label>

                {preview?.safeToDelete && (
                    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
                        <Label htmlFor="qa-confirm" className="text-[12px] text-red-700">
                            Type <b>{CONFIRMATION}</b> to confirm. This cannot be undone.
                        </Label>
                        <Input
                            id="qa-confirm"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            placeholder={CONFIRMATION}
                            className="h-11 rounded-xl border-red-200 bg-white"
                            data-testid="input-qa-confirm"
                        />
                        {includeWork && (
                            <>
                                <Label htmlFor="qa-confirm-work" className="text-[12px] text-red-700">
                                    Jobs are included. Also type <b>{WORK_CONFIRMATION}</b>.
                                </Label>
                                <Input
                                    id="qa-confirm-work"
                                    value={workConfirmation}
                                    onChange={(e) => setWorkConfirmation(e.target.value)}
                                    placeholder={WORK_CONFIRMATION}
                                    className="h-11 rounded-xl border-red-200 bg-white"
                                    data-testid="input-qa-confirm-work"
                                />
                            </>
                        )}
                        <Button
                            className="h-11 w-full rounded-xl bg-red-600 font-bold hover:bg-red-700"
                            disabled={
                                confirmation !== CONFIRMATION
                                || (includeWork && workConfirmation !== WORK_CONFIRMATION)
                                || busy !== "idle"
                            }
                            onClick={runDelete}
                            data-testid="button-qa-delete"
                        >
                            {busy === "deleting"
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting…</>
                                : <><Trash2 className="mr-2 h-4 w-4" />Delete these records</>}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
