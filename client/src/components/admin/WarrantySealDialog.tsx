/**
 * Printing and reprinting the warranty seals for a finished repair.
 *
 * Issued at completion and not before: the seal proves a repair happened, so
 * printing one for a job still on the bench is proof of something that has not
 * happened yet.
 *
 * Reprinting stays available afterwards, deliberately. Seals fall off hot
 * panels, print crooked, smear, and get peeled by children — and a shop that
 * can only print once ends up with a television carrying a code nobody can
 * read. Replacing voids the old pair with a reason, so an old seal turning up
 * later reads as a reprint rather than a forgery.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintStyles, QrImage } from "@/components/print";
import { fetchApi } from "@/lib/api/httpClient";
import { formatCode, PLACEMENT_LABEL, type StickerPlacement } from "@shared/warranty-sticker";
import { cn } from "@/lib/utils";

type Seal = {
    id: string;
    code: string;
    placement: StickerPlacement;
    issuedAt: string;
    voidedAt: string | null;
};

function SealLabel({ seal, shopName }: { seal: Seal; shopName: string }) {
    const hidden = seal.placement === "inner";
    return (
        <div
            className="warranty-seal"
            style={{
                width: "50mm",
                height: "25mm",
                display: "flex",
                gap: "1.5mm",
                alignItems: "center",
                padding: "1.5mm",
                boxSizing: "border-box",
                border: "0.2mm dashed #64748b",
                borderRadius: "1mm",
                background: "#fff",
                color: "#000",
                fontFamily: "Arial, Helvetica, sans-serif",
            }}
        >
            <QrImage value={seal.code} size={68} style={{ width: "19mm", height: "19mm", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
                <div style={{ fontSize: "7px", fontWeight: 900, letterSpacing: "0.4px" }}>{shopName}</div>
                <div style={{ fontSize: "6.5px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                    Warranty seal · {PLACEMENT_LABEL[seal.placement]}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: "9px", fontWeight: 900, marginTop: "0.8mm" }}>
                    {formatCode(seal.code)}
                </div>
                <div style={{ fontSize: "5.5px", color: "#475569", marginTop: "0.5mm", lineHeight: 1.25 }}>
                    {hidden
                        ? "Do not remove. Removal voids this repair's warranty."
                        : "Keep this seal intact to claim your warranty."}
                </div>
            </div>
        </div>
    );
}

export function WarrantySealDialog({
    open,
    onOpenChange,
    jobId,
    jobNumber,
    shopName = "PROMISE ELECTRONICS",
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    jobId: string;
    jobNumber: string;
    shopName?: string;
}) {
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);

    const { data: seals = [], isLoading } = useQuery({
        queryKey: ["warranty-seals", jobId],
        queryFn: async () => {
            try {
                return await fetchApi<Seal[]>(`/jobs/${jobId}/warranty-stickers`);
            } catch (e: any) {
                setError(e?.message || "Could not prepare the seals");
                return [] as Seal[];
            }
        },
        enabled: open,
        staleTime: Infinity,
    });

    const reissue = useMutation({
        mutationFn: (reason: string) =>
            fetchApi<Seal[]>(`/jobs/${jobId}/warranty-stickers/reissue`, {
                method: "POST",
                body: JSON.stringify({ reason }),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["warranty-seals", jobId] });
            toast.success("New seals issued. The old codes are now void.");
        },
        onError: (e: Error) => toast.error(e.message || "Could not reissue the seals"),
    });

    const live = seals.filter((s) => !s.voidedAt);
    const outer = live.find((s) => s.placement === "outer");
    const inner = live.find((s) => s.placement === "inner");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Warranty seals — job #{jobNumber}</DialogTitle>
                    <DialogDescription>
                        Two seals, two different codes, same repair. If they ever name different jobs,
                        one has been moved between televisions.
                    </DialogDescription>
                </DialogHeader>

                <PrintStyles />

                {isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
                ) : live.length === 0 ? (
                    <p className="py-10 text-center text-sm font-semibold text-slate-500">
                        {error ?? "This job carries no warranty, so it needs no seal."}
                    </p>
                ) : (
                    <>
                        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 print:hidden">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            <p className="text-[11px] leading-5 text-emerald-900">
                                Stick the <strong>outside</strong> seal on the back of the set, across a seam or
                                screw. Stick the <strong>inside</strong> seal next to the repair itself, where it is
                                only found by opening the television.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="print-content mx-auto w-fit bg-white p-3">
                                <style>{`@media print { @page { size: A4; margin: 10mm; } .warranty-seal { break-inside: avoid; } }`}</style>
                                <div className="flex flex-wrap gap-4">
                                    {outer && <SealLabel seal={outer} shopName={shopName} />}
                                    {inner && <SealLabel seal={inner} shopName={shopName} />}
                                </div>
                            </div>
                        </div>

                        <div className={cn("flex flex-wrap justify-end gap-2 print:hidden")}>
                            <Button
                                variant="outline"
                                disabled={reissue.isPending}
                                onClick={() => {
                                    // A reason is required: it travels with the voided code, so a
                                    // scanned old seal explains itself instead of looking forged.
                                    const reason = window.prompt(
                                        "Replace these seals?\n\nThe current codes stop being valid. Say why — " +
                                        "it is shown if anyone scans the old seal later.",
                                    );
                                    if (!reason?.trim()) return;
                                    reissue.mutate(reason.trim());
                                }}
                            >
                                <RefreshCw className="mr-2 h-4 w-4" /> Replace seals
                            </Button>
                            <Button onClick={() => window.print()}>
                                <Printer className="mr-2 h-4 w-4" /> Print
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
