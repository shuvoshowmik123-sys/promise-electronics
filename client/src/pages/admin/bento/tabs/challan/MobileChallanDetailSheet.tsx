import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, ScrollText } from "lucide-react";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { format } from "date-fns";
import { getLineItems } from "./helpers";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileMarqueeText } from "../../shared";

interface MobileChallanDetailSheetProps {
    open: boolean;
    challan: any | null;
    onClose: () => void;
    onPreviewPdf: (challan: any) => void;
}

export function MobileChallanDetailSheet({ open, challan, onClose, onPreviewPdf }: MobileChallanDetailSheetProps) {
    const isMobile = useIsMobile();

    if (typeof document === "undefined" || !isMobile || !open || !challan) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[220]">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
                    onClick={onClose}
                />
                <MobileBottomSheetFrame onClose={onClose} className="absolute inset-x-0 bottom-0 top-12 flex flex-col overflow-hidden rounded-t-[2rem] bg-slate-50 shadow-2xl">
                    <div className="relative shrink-0 overflow-hidden rounded-t-[2rem] bg-teal-950 px-5 pb-5 pt-3 text-white">
                        <div className="absolute -right-8 top-1 rotate-12 text-white/5">
                            <ScrollText className="h-36 w-36" />
                        </div>
                        <div className="relative z-10">
                            <MobileBottomSheetHandle className="mb-3 bg-teal-700" />
                            <div className="flex items-center justify-between gap-3">
                                <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-teal-100 active:bg-white/10" aria-label="Close challan details">
                                    <ArrowLeft className="h-5 w-5" />
                                </button>
                                <div className="min-w-0 flex-1 text-center">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-300">Challan Details</p>
                                    <MobileMarqueeText className="font-mono text-sm font-black text-white" title={challan.id}>{challan.id}</MobileMarqueeText>
                                </div>
                                <button type="button" onClick={() => onPreviewPdf(challan)} className="flex h-9 w-9 items-center justify-center rounded-full text-teal-100 active:bg-white/10" aria-label="Preview challan PDF">
                                    <FileText className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="mt-4 flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <MobileMarqueeText className="text-xl font-black tracking-tight" title={challan.receiver || "Receiver not set"}>{challan.receiver || "Receiver not set"}</MobileMarqueeText>
                                    <MobileMarqueeText className="mt-1 text-xs font-semibold text-teal-200" title={challan.receiverPhone || "No phone"}>{challan.receiverPhone || "No phone"}</MobileMarqueeText>
                                </div>
                                <span className="shrink-0 rounded-full border border-blue-300/40 bg-blue-300/15 px-3 py-1 text-[11px] font-black uppercase text-blue-100">
                                    {challan.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-28">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Vehicle</p>
                                <MobileMarqueeText className="mt-1 text-sm font-bold text-slate-900" title={challan.vehicleNo || "Vehicle not set"}>{challan.vehicleNo || "Vehicle not set"}</MobileMarqueeText>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Driver</p>
                                <MobileMarqueeText className="mt-1 text-sm font-bold text-slate-900" title={challan.driverName || "Driver not set"}>{challan.driverName || "Driver not set"}</MobileMarqueeText>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Address</p>
                            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">{challan.receiverAddress || "No address"}</p>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Items</p>
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600">{getLineItems(challan).length}</span>
                            </div>
                            {getLineItems(challan).length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-sm font-medium text-slate-500">No items listed</div>
                            ) : getLineItems(challan).map((item, i) => (
                                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <MobileMarqueeText className="text-sm font-black text-slate-950" title={item.tvDetail || item.description || "Item detail not set"}>{item.tvDetail || item.description || "Item detail not set"}</MobileMarqueeText>
                                            <MobileMarqueeText className="mt-1 font-mono text-xs font-bold text-teal-700" title={item.jobNo || "No job no"}>{item.jobNo || "No job no"}</MobileMarqueeText>
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{item.status || "OK"}</span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-xl bg-slate-50 px-2 py-2">
                                            <p className="font-black uppercase text-slate-400">Serial</p>
                                            <MobileMarqueeText className="mt-1 font-semibold text-slate-700" title={item.serialNumber || "-"}>{item.serialNumber || "-"}</MobileMarqueeText>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-2 py-2">
                                            <p className="font-black uppercase text-slate-400">Defect</p>
                                            <MobileMarqueeText className="mt-1 font-semibold text-slate-700" title={item.defect || item.remarks || "-"}>{item.defect || item.remarks || "-"}</MobileMarqueeText>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
                        <Button variant="outline" className="h-11 rounded-2xl font-black" onClick={onClose}>Done</Button>
                        <Button className="h-11 rounded-2xl bg-teal-600 font-black hover:bg-teal-700" onClick={() => onPreviewPdf(challan)}>
                            <FileText className="mr-2 h-4 w-4" /> Preview PDF
                        </Button>
                    </div>
                </MobileBottomSheetFrame>
            </div>
        </AnimatePresence>,
        document.body
    );
}
