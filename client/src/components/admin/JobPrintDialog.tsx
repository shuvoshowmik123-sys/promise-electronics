/**
 * Printing the workshop sticker.
 *
 * Deliberately only the sticker. The job slip already prints through
 * handlePrintTicket, and a second ticket printer beside it would be two things
 * to keep in agreement forever — the two would drift, and the day they
 * disagreed nobody would know which one the customer was holding.
 *
 * JobTicketPrint and JobReceipt remain in the codebase, fully written and
 * imported by nothing. They are dead and should be deleted rather than wired
 * up against the printer that already works.
 */
import { useRef, useState } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintStyles } from "@/components/print";
import { JobStickerSheet, type JobStickerData } from "@/components/print/JobSticker";
import { cn } from "@/lib/utils";

export function JobPrintDialog({
    open,
    onOpenChange,
    job,
    jobNumber,
    appBaseUrl: appBaseUrlProp,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    job: any;
    jobNumber: string;
    appBaseUrl?: string;
}) {
    /**
     * Copies of the sticker.
     *
     * Two by default: one for the back of the set and one spare, because a
     * sticker that will not stick to a dusty panel is discovered at the moment
     * somebody is holding the television, not before.
     */
    const [copies, setCopies] = useState(2);
    const areaRef = useRef<HTMLDivElement>(null);

    const appBaseUrl = appBaseUrlProp || window.location.origin;

    const stickerData: JobStickerData = {
        id: job?.id,
        jobNumber,
        customer: job?.customer,
        customerPhone: job?.customerPhone,
        device: job?.device,
        screenSize: job?.screenSize ?? job?.panelInches,
        issue: job?.issue,
        // Whoever took the set in. Falls back to the assigned technician only
        // because an unlabelled initial is worse than a slightly wrong one.
        receivedBy: job?.createdByName ?? job?.receivedBy ?? job?.technician,
        createdAt: job?.createdAt ?? new Date(),
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Sticker for job #{jobNumber}</DialogTitle>
                    <DialogDescription>
                        Identifies the set on the bench without a phone. Scanning it opens the full job.
                    </DialogDescription>
                </DialogHeader>

                {/* Print styles must be mounted for the browser dialog to
                    render only the sheet rather than the whole admin panel. */}
                <PrintStyles />

                <div className="flex items-center justify-between gap-2 print:hidden">
                    <p className="text-[11px] leading-5 text-slate-500">
                        Stick one on the back of the set. Everything printed here stays true for the
                        whole repair — status and price live behind the code, where they cannot go stale.
                    </p>
                    <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-600">
                        Copies
                        <input
                            type="number"
                            min={1}
                            max={40}
                            value={copies}
                            onChange={(e) => setCopies(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
                            className="h-11 w-16 rounded-xl border border-slate-200 px-2 text-sm font-bold"
                        />
                    </label>
                </div>

                <div className="max-h-[52vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    {/* print-content is the class PrintStyles makes visible; everything
                        else on the page is hidden while printing. Naming it anything
                        else silently prints a blank sheet. */}
                    <div ref={areaRef} className="print-content mx-auto w-fit bg-white p-2 shadow-sm">
                        <JobStickerSheet jobs={[stickerData]} appBaseUrl={appBaseUrl} copies={copies} />
                    </div>
                </div>

                <div className="flex justify-end gap-2 print:hidden">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                    <Button onClick={() => window.print()}>
                        <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
