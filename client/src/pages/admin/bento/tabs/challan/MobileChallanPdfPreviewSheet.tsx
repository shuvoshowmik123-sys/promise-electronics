import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { format } from "date-fns";
import { getLineItems } from "./helpers";
import { useIsMobile } from "@/hooks/use-mobile";

interface MobileChallanPdfPreviewSheetProps {
    open: boolean;
    challan: any | null;
    isLoading: boolean;
    onClose: () => void;
    onDownload: () => void;
}

export function MobileChallanPdfPreviewSheet({ open, challan, isLoading, onClose, onDownload }: MobileChallanPdfPreviewSheetProps) {
    const isMobile = useIsMobile();

    if (typeof document === "undefined" || !isMobile || !open || !challan) return null;

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[240]">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
                    onClick={onClose}
                />
                <MobileBottomSheetFrame onClose={onClose} className="absolute inset-x-0 bottom-0 top-8 flex flex-col overflow-hidden rounded-t-[2rem] bg-slate-50 shadow-2xl">
                    <div className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-3">
                        <MobileBottomSheetHandle className="mb-3" />
                        <div className="flex items-center justify-between gap-3">
                            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 active:bg-slate-200" aria-label="Close PDF preview">
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <div className="min-w-0 flex-1 text-center">
                                <p className="text-sm font-black text-slate-950">This is a preview of the challan PDF</p>
                                <p className="text-[11px] font-semibold text-slate-500">Read it before saving.</p>
                                <p className="truncate font-mono text-[11px] font-bold text-teal-700">{challan.id}</p>
                            </div>
                            <button type="button" onClick={onDownload} className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white active:bg-teal-700" aria-label="Download PDF">
                                <Download className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto bg-slate-200 p-3">
                        {isLoading ? (
                            <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-white text-slate-500">
                                <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
                                <p className="mt-3 text-sm font-bold">Preparing PDF preview...</p>
                            </div>
                        ) : (
                            <div className="mx-auto min-h-full w-full max-w-[360px] rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
                                <div className="border-b border-slate-200 pb-4 text-center">
                                    <p className="text-lg font-black tracking-wide text-slate-950">DELIVERY CHALLAN</p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">Promise Electronics</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 border-b border-slate-200 py-4 text-xs">
                                    <div>
                                        <p className="font-black uppercase text-slate-400">Challan</p>
                                        <p className="mt-1 break-all font-mono font-bold text-slate-900">{challan.id}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black uppercase text-slate-400">Status</p>
                                        <p className="mt-1 font-bold text-slate-900">{challan.status || "Pending"}</p>
                                    </div>
                                    <div>
                                        <p className="font-black uppercase text-slate-400">Date</p>
                                        <p className="mt-1 font-bold text-slate-900">{challan.createdAt ? format(new Date(challan.createdAt), "dd/MM/yyyy") : format(new Date(), "dd/MM/yyyy")}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black uppercase text-slate-400">Type</p>
                                        <p className="mt-1 font-bold text-slate-900">{challan.type || "Customer"}</p>
                                    </div>
                                </div>
                                <div className="space-y-4 border-b border-slate-200 py-4 text-xs">
                                    <div>
                                        <p className="font-black uppercase text-slate-400">Receiver</p>
                                        <p className="mt-1 font-bold text-slate-950">{challan.receiver || "Receiver not set"}</p>
                                        <p className="mt-0.5 font-semibold text-slate-600">{challan.receiverPhone || "No phone"}</p>
                                        <p className="mt-0.5 leading-relaxed text-slate-600">{challan.receiverAddress || "No address"}</p>
                                    </div>
                                    <div>
                                        <p className="font-black uppercase text-slate-400">Transport</p>
                                        <p className="mt-1 font-bold text-slate-950">{challan.vehicleNo || "Vehicle not set"}</p>
                                        <p className="mt-0.5 font-semibold text-slate-600">{challan.driverName || "Driver not set"}</p>
                                    </div>
                                </div>
                                <div className="py-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-xs font-black uppercase text-slate-400">Items</p>
                                        <p className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{getLineItems(challan).length}</p>
                                    </div>
                                    <div className="space-y-2">
                                        {(getLineItems(challan).length > 0 ? getLineItems(challan) : [{ tvDetail: "No items listed", jobNo: "-", serialNumber: "-", status: "-", defect: "" }]).map((item, index) => (
                                            <div key={index} className="rounded-xl border border-slate-200 p-3 text-xs">
                                                <p className="font-black text-slate-950">{index + 1}. {item.tvDetail || item.description || "Item"}</p>
                                                <p className="mt-1 font-mono font-bold text-teal-700">{item.jobNo || "-"}</p>
                                                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                                                    <p><span className="font-black text-slate-400">Serial:</span> {item.serialNumber || "-"}</p>
                                                    <p><span className="font-black text-slate-400">Status:</span> {item.status || "OK"}</p>
                                                </div>
                                                {item.defect || item.remarks ? <p className="mt-1 text-[11px] font-semibold text-slate-600">{item.defect || item.remarks}</p> : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-6 pt-8 text-xs font-black text-slate-600">
                                    <p className="border-t border-slate-300 pt-2">Promise Electronics</p>
                                    <p className="border-t border-slate-300 pt-2 text-right">Received By</p>
                                </div>
                                <div className="mt-4 rounded-2xl bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">
                                    {getLineItems(challan).length ? "Preview is generated from the same PDF builder used for download." : "No items listed in challan."}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white p-4">
                        <Button variant="outline" className="h-11 rounded-2xl font-black" onClick={onClose}>Close</Button>
                        <Button className="h-11 rounded-2xl bg-teal-600 font-black hover:bg-teal-700" onClick={onDownload}>
                            <Download className="mr-2 h-4 w-4" /> Download
                        </Button>
                    </div>
                </MobileBottomSheetFrame>
            </div>
        </AnimatePresence>,
        document.body
    );
}
