import { Button } from "@/components/ui/button";
import { Eye, Download, Send, CheckCircle2, RotateCcw, Clock } from "lucide-react";
import { HighlightMatch, MobileMarqueeText } from "../../shared";
import { cn } from "@/lib/utils";
import { getLineItems } from "./helpers";

type ChallanLike = any;

interface MobileChallanCardProps {
    challan: ChallanLike;
    searchQuery: string;
    onView: (challan: ChallanLike) => void;
    onPreviewPdf: (challan: ChallanLike) => void;
    onSend: (challan: ChallanLike) => void;
    onReceive: (challan: ChallanLike) => void;
    onReset: (challan: ChallanLike) => void;
}

function getStatusTone(status: string) {
    return status === "Pending"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : status === "Delivered"
            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
            : status === "Received"
                ? "border-blue-100 bg-blue-50 text-blue-700"
                : "border-slate-100 bg-slate-50 text-slate-600";
}

export function MobileChallanCard({ challan, searchQuery, onView, onPreviewPdf, onSend, onReceive, onReset }: MobileChallanCardProps) {
    const itemsList = getLineItems(challan);
    const statusTone = getStatusTone(challan.status);

    return (
        <div className="overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <button type="button" onClick={() => onView(challan)} className="w-full p-3 text-left active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <MobileMarqueeText className="font-mono text-sm font-black text-teal-700" title={challan.id}>
                                <HighlightMatch text={challan.id} query={searchQuery} />
                            </MobileMarqueeText>
                            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black", statusTone)}>
                                {challan.status}
                            </span>
                        </div>
                        <MobileMarqueeText className="mt-2 text-base font-black text-slate-950" title={challan.receiver || "Receiver not set"}>
                            <HighlightMatch text={challan.receiver || "Receiver not set"} query={searchQuery} />
                        </MobileMarqueeText>
                        <MobileMarqueeText className="mt-0.5 text-xs font-semibold text-slate-500" title={challan.receiverPhone || "No receiver phone"}>
                            <HighlightMatch text={challan.receiverPhone || "No receiver phone"} query={searchQuery} />
                        </MobileMarqueeText>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-2.5 py-2 text-center">
                        <p className="font-mono text-lg font-black leading-none text-slate-950">{challan.items || itemsList.length || 0}</p>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-slate-400">Items</p>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="font-black uppercase tracking-wide text-slate-400">Transport</p>
                        <MobileMarqueeText className="mt-1 font-semibold text-slate-700" title={challan.vehicleNo || "Vehicle not set"}>
                            <HighlightMatch text={challan.vehicleNo || "Vehicle not set"} query={searchQuery} />
                        </MobileMarqueeText>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                        <p className="font-black uppercase tracking-wide text-slate-400">Driver</p>
                        <MobileMarqueeText className="mt-1 font-semibold text-slate-700" title={challan.driverName || "Driver not set"}>
                            <HighlightMatch text={challan.driverName || "Driver not set"} query={searchQuery} />
                        </MobileMarqueeText>
                    </div>
                </div>
            </button>
            <div className="grid grid-cols-3 gap-1.5 border-t border-blue-100 bg-blue-50/70 p-2">
                <Button variant="ghost" className="h-9 rounded-xl bg-blue-100 px-2 text-[11px] font-black text-blue-800 hover:bg-blue-200" onClick={() => onView(challan)}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                </Button>
                <Button variant="ghost" className="h-9 rounded-xl bg-indigo-100 px-2 text-[11px] font-black text-indigo-800 hover:bg-indigo-200" onClick={() => onPreviewPdf(challan)}>
                    <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
                </Button>
                <Button
                    variant="ghost"
                    className="h-9 rounded-xl bg-sky-100 px-2 text-[11px] font-black text-sky-800 hover:bg-sky-200 disabled:bg-slate-100 disabled:text-slate-300"
                    disabled={challan.status !== "Pending"}
                    onClick={() => onSend(challan)}
                >
                    <Send className="mr-1.5 h-3.5 w-3.5" /> Send
                </Button>
                <Button
                    variant="ghost"
                    className="col-span-2 h-9 rounded-xl bg-cyan-100 px-2 text-[11px] font-black text-cyan-800 hover:bg-cyan-200 disabled:bg-slate-100 disabled:text-slate-300"
                    disabled={challan.status !== "Delivered"}
                    onClick={() => onReceive(challan)}
                >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Receive
                </Button>
                <Button
                    variant="ghost"
                    className="h-9 rounded-xl bg-blue-100 px-2 text-[11px] font-black text-blue-800 hover:bg-blue-200 disabled:bg-slate-100 disabled:text-slate-300"
                    disabled={challan.status === "Pending"}
                    onClick={() => onReset(challan)}
                >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
                </Button>
            </div>
        </div>
    );
}
