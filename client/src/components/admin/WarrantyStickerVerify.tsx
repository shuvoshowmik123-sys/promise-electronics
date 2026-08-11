/**
 * "Is this ours, and is it still covered?"
 *
 * The whole screen answers one question asked at a counter with a customer
 * standing there, so the answer is the first and largest thing on it. Detail
 * comes underneath for the staff member who wants it; nobody should have to
 * read a table to learn whether a claim is genuine.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, FilePlus2, Loader2, ScanLine, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchApi } from "@/lib/api/httpClient";
import { cn } from "@/lib/utils";
import { PLACEMENT_LABEL, formatCode, type StickerPlacement } from "@shared/warranty-sticker";

type Outcome = {
    result: "genuine" | "unknown" | "voided";
    scannedCode: string;
    sticker?: { placement: StickerPlacement; issuedAt: string; voidedAt: string | null; voidedReason: string | null };
    job?: {
        id: string;
        displayRef: string;
        device: string | null;
        modelNumber: string | null;
        screenSize: string | null;
        tvSerialNumber: string | null;
        completedAt: string | null;
        serviceValid: boolean;
        partsValid: boolean;
        serviceUntil: string | null;
        partsUntil: string | null;
    };
    siblings?: Array<{ placement: StickerPlacement; code: string }>;
};

const when = (v: string | null | undefined) => (v ? format(new Date(v), "d MMM yyyy") : "—");

export function WarrantyStickerVerify({ onStartClaim }: { onStartClaim?: (job: NonNullable<Outcome["job"]>) => void } = {}) {
    const [code, setCode] = useState("");
    const [outcome, setOutcome] = useState<Outcome | null>(null);

    const check = useMutation({
        mutationFn: (value: string) =>
            fetchApi<Outcome>("/warranty-stickers/verify", {
                method: "POST",
                body: JSON.stringify({ code: value }),
            }),
        onSuccess: setOutcome,
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) return;
        check.mutate(code);
    };

    return (
        <div className="space-y-4">
            <form onSubmit={submit} className="flex gap-2">
                <div className="relative flex-1">
                    <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Scan the seal, or type the code"
                        // A scanner types fast and presses Enter; nothing here
                        // may steal focus or autocorrect what it sends.
                        autoFocus
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        className="h-12 pl-9 font-mono text-base tracking-wider"
                    />
                </div>
                <Button type="submit" className="h-12 px-6" disabled={check.isPending || !code.trim()}>
                    {check.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
                </Button>
            </form>

            {/*
              * Not an edge case.
              *
              * A seal ends up under a wall mount, behind grease, or peeled off
              * entirely. A shop that can only honour a warranty it can scan
              * refuses genuine customers over its own adhesive — so the way in
              * without a seal sits here in plain sight, not behind a link.
              */}
            <p className="text-[11px] leading-5 text-slate-500">
                No seal, or it will not scan? The cover is on the repair record, not the sticker —
                search the customer's phone number in the claims list below and pick their repair.
            </p>

            {check.isError && (
                <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                    Could not check that code. Try again.
                </p>
            )}

            {outcome && <Result outcome={outcome} onStartClaim={onStartClaim} />}
        </div>
    );
}

function Result({ outcome, onStartClaim }: { outcome: Outcome; onStartClaim?: (job: NonNullable<Outcome["job"]>) => void }) {
    if (outcome.result === "unknown") {
        return (
            /*
             * A verdict, not a crash.
             *
             * This said "not genuine" using the visual language of a system
             * failure — a solid red panel and an X-in-a-circle, which
             * everywhere else in software means something went wrong. The
             * owner looked at it during testing and thought the app had
             * broken. A staff member at the counter has no chance, and if a
             * real error ever appears on this screen the two must be tellable
             * apart at a glance.
             *
             * Still red, still serious: bordered rather than filled, a shield
             * struck through rather than an error mark, and the plain sentence
             * first.
             */
            <div className="rounded-2xl border-2 border-rose-400 bg-white p-5 text-center">
                <ShieldOff className="mx-auto h-10 w-10 text-rose-600" />
                <p className="mt-2 text-xl font-black text-rose-800">We did not repair this television</p>
                <p className="mt-1 text-sm font-semibold text-rose-700">
                    This seal was never issued by Promise Electronics.
                </p>
                <p className="mt-3 font-mono text-sm text-rose-900/70">{formatCode(outcome.scannedCode) || "—"}</p>
                {/* Said plainly so nobody reads a misprint as a forgery. */}
                <p className="mt-3 text-[11px] leading-5 text-rose-700/80">
                    Check for a damaged or misread character before refusing the claim.
                    This attempt has been recorded.
                </p>
            </div>
        );
    }

    const job = outcome.job;
    const voided = outcome.result === "voided";
    const covered = !voided && (job?.serviceValid || job?.partsValid);

    return (
        <div className="space-y-3">
            <div
                className={cn(
                    "rounded-2xl border-2 p-5 text-center",
                    voided ? "border-amber-500 bg-amber-50"
                        : covered ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-300 bg-slate-50",
                )}
            >
                {voided ? <ShieldOff className="mx-auto h-10 w-10 text-amber-600" />
                    : covered ? <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                        : <AlertTriangle className="mx-auto h-10 w-10 text-slate-400" />}

                <p className={cn("mt-2 text-xl font-black",
                    voided ? "text-amber-800" : covered ? "text-emerald-800" : "text-slate-700")}>
                    {voided ? "Seal replaced" : covered ? "Genuine — still covered" : "Genuine — cover expired"}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                    Our repair · {job?.displayRef}
                </p>
                {voided && outcome.sticker?.voidedReason && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700">{outcome.sticker.voidedReason}</p>
                )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Television" value={[job?.device, job?.modelNumber, job?.screenSize].filter(Boolean).join(" · ") || "—"} />
                {/* The sticker says the job is ours; this says it is the same
                    television. Read it off the back of the set and compare. */}
                <Field label="TV serial on record" value={job?.tvSerialNumber || "Not recorded"} highlight={!!job?.tvSerialNumber} />
                <Field label="Repaired" value={when(job?.completedAt)} />
                <Field label="Seal position" value={outcome.sticker ? PLACEMENT_LABEL[outcome.sticker.placement] : "—"} />
                <Field
                    label="Service warranty"
                    value={job?.serviceUntil ? `${job.serviceValid ? "Valid" : "Expired"} · until ${when(job.serviceUntil)}` : "None"}
                />
                <Field
                    label="Parts warranty"
                    value={job?.partsUntil ? `${job.partsValid ? "Valid" : "Expired"} · until ${when(job.partsUntil)}` : "None"}
                />
            </div>

            {/*
              * The point of scanning.
              *
              * Everything above is evidence; this is the thing the counter
              * actually wants to do next. Without it the staff member reads a
              * verdict and then goes hunting for the same job by hand, which
              * is the work the seal was supposed to remove.
              *
              * A claim can still be started on expired cover — the shop may
              * choose to honour it, and that is a decision for a person, not
              * a disabled button.
              */}
            {onStartClaim && outcome.job && !voided && (
                <button
                    type="button"
                    onClick={() => onStartClaim(outcome.job!)}
                    className={cn(
                        "flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black shadow-sm active:scale-[0.99]",
                        covered ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700",
                    )}
                >
                    <FilePlus2 className="h-4 w-4" />
                    {covered ? "Start warranty claim" : "Start claim anyway (cover expired)"}
                </button>
            )}

            {/* The pair check. Open the set, scan the hidden seal, and confirm
                it names this same repair. */}
            {outcome.siblings && outcome.siblings.length > 1 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Both seals on this repair</p>
                    <div className="mt-2 space-y-1.5">
                        {outcome.siblings.map((s) => (
                            <div key={s.code} className="flex items-center justify-between gap-3 text-[13px]">
                                <span className="font-semibold text-slate-600">{PLACEMENT_LABEL[s.placement]}</span>
                                <span className={cn("font-mono font-bold", s.code === outcome.scannedCode ? "text-emerald-700" : "text-slate-400")}>
                                    {formatCode(s.code)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-slate-500">
                        Open the set and scan the inside seal too. If it names a different repair,
                        a seal has been moved between televisions.
                    </p>
                </div>
            )}
        </div>
    );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className={cn("mt-1 text-sm font-bold text-slate-900", highlight && "font-mono tracking-wide")}>{value}</p>
        </div>
    );
}
