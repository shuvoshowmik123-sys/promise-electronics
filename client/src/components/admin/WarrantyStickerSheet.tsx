/**
 * The two stickers for a repair, ready to print.
 *
 * One goes on the back of the television where the customer can see it. One
 * goes inside, beside the actual repair, where only somebody opening the set
 * will find it. Different codes, same job — so if the pair ever disagree, a
 * sticker has been moved between televisions.
 *
 * The QR is drawn here, in the browser, from the qrcode package. The printed
 * receipt in this system fetches its QR from api.qrserver.com, which means no
 * internet or a bad day at that company prints a blank square. A warranty
 * sticker is evidence; it cannot depend on somebody else's website being up.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Loader2, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api/httpClient";
import { formatCode, PLACEMENT_LABEL, type StickerPlacement } from "@shared/warranty-sticker";

type Sticker = {
    id: string;
    code: string;
    placement: StickerPlacement;
    issuedAt: string;
};

function QrCanvas({ value, size = 132 }: { value: string; size?: number }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!ref.current) return;
        QRCode.toCanvas(ref.current, value, {
            width: size,
            margin: 1,
            // High correction: this sticker will be creased, dusty and
            // photographed at an angle in a workshop. Level H survives about
            // 30% of the symbol being unreadable.
            errorCorrectionLevel: "H",
            color: { dark: "#000000", light: "#ffffff" },
        }).catch(() => { /* the printed code below is the fallback */ });
    }, [value, size]);
    return <canvas ref={ref} width={size} height={size} className="h-[132px] w-[132px]" />;
}

function OneSticker({ sticker, shopName }: { sticker: Sticker; shopName: string }) {
    const hidden = sticker.placement === "inner";
    return (
        <div className="flex w-[300px] gap-3 rounded-xl border-2 border-dashed border-slate-400 bg-white p-3 print:break-inside-avoid">
            <QrCanvas value={sticker.code} />
            <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-900">{shopName}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Warranty seal · {PLACEMENT_LABEL[sticker.placement]}
                    </p>
                </div>
                {/* The code is printed as well as encoded. A cracked QR still
                    leaves something a person can read out over the counter. */}
                <p className="font-mono text-[13px] font-black leading-tight tracking-tight text-slate-900">
                    {formatCode(sticker.code)}
                </p>
                <p className="text-[8px] leading-tight text-slate-500">
                    {hidden
                        ? "Do not remove. Removal voids this repair's warranty."
                        : "Keep this seal intact to claim your warranty."}
                </p>
            </div>
        </div>
    );
}

export function WarrantyStickerSheet({ jobId, shopName = "PROMISE ELECTRONICS" }: { jobId: string; shopName?: string }) {
    const [error, setError] = useState<string | null>(null);

    const { data: stickers = [], isLoading } = useQuery({
        queryKey: ["warranty-stickers", jobId],
        queryFn: () => fetchApi<Sticker[]>(`/jobs/${jobId}/warranty-stickers`),
        retry: false,
        // The codes are created on first ask and then never change, so there is
        // nothing to refetch.
        staleTime: Infinity,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throwOnError: false as any,
    });

    useEffect(() => {
        if (!isLoading && stickers.length === 0) {
            setError("This job carries no warranty, so it needs no sticker.");
        }
    }, [isLoading, stickers.length]);

    if (isLoading) {
        return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>;
    }

    if (stickers.length === 0) {
        return <p className="py-8 text-center text-sm font-semibold text-slate-400">{error}</p>;
    }

    const outer = stickers.find((s) => s.placement === "outer");
    const inner = stickers.find((s) => s.placement === "inner");

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 print:hidden">
                <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-[11px] leading-5 text-slate-600">
                        Print both. The <strong>outside</strong> seal goes on the back of the set across a
                        seam or screw. The <strong>inside</strong> seal goes next to the repair itself.
                        Two different codes on the same job — if they ever disagree, a seal has been moved.
                    </p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => window.print()}>
                    <Printer className="mr-1.5 h-4 w-4" /> Print
                </Button>
            </div>

            <div className="flex flex-wrap gap-4">
                {outer && <OneSticker sticker={outer} shopName={shopName} />}
                {inner && <OneSticker sticker={inner} shopName={shopName} />}
            </div>
        </div>
    );
}
