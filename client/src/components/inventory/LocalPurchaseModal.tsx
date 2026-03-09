import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Upload, Save, Loader2, Image as ImageIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { localPurchasesApi } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

interface LocalPurchaseModalProps {
    jobTicketId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function LocalPurchaseModal({ jobTicketId, open, onOpenChange, onSuccess }: LocalPurchaseModalProps) {
    const [partName, setPartName] = useState("");
    const [supplierName, setSupplierName] = useState("");
    const [costPrice, setCostPrice] = useState("");
    const [sellingPrice, setSellingPrice] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [receiptImage, setReceiptImage] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setReceiptImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const createPurchaseMutation = useMutation({
        mutationFn: async () => {
            if (!receiptImage) throw new Error("Receipt image is mandatory for petty cash purchases.");

            return await localPurchasesApi.create({
                jobTicketId,
                partName,
                supplierName,
                costPrice: parseFloat(costPrice),
                sellingPrice: parseFloat(sellingPrice),
                quantity: parseInt(quantity, 10),
                receiptImageUrl: receiptImage,
            });
        },
        onSuccess: () => {
            toast({
                title: "Purchase Logged",
                description: `Successfully added ${partName} to job ticket charges.`,
            });
            queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobTicketId}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
            queryClient.invalidateQueries({ queryKey: ["/api/inventory/local-purchases"] });
            if (onSuccess) onSuccess();
            handleClose();
        },
        onError: (error: any) => {
            toast({
                title: "Operation Failed",
                description: error.message || "Could not log local purchase.",
                variant: "destructive",
            });
        }
    });

    const handleClose = () => {
        setPartName("");
        setSupplierName("");
        setCostPrice("");
        setSellingPrice("");
        setQuantity("1");
        setReceiptImage(null);
        onOpenChange(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!receiptImage) {
            toast({ title: "Missing Receipt", description: "A receipt photo is required.", variant: "destructive" });
            return;
        }
        createPurchaseMutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-slate-50">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center pb-8 border-b">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                        <ShoppingCart className="w-6 h-6 text-white" />
                    </div>
                    <DialogTitle className="text-2xl font-bold tracking-tight text-white mb-1">Local Sourcing (Petty Cash)</DialogTitle>
                    <DialogDescription className="text-blue-100 text-sm">
                        Instantly buy a part and bill it to Job #{jobTicketId.substring(0, 8)}
                    </DialogDescription>
                </div>

                <div className="px-6 py-4 -mt-4">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
                        <form id="local-purchase-form" onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="partName" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Part Details</Label>
                                <Input id="partName" placeholder="e.g. 250V Capacitor" value={partName} onChange={e => setPartName(e.target.value)} required className="bg-slate-50/50" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="supplier" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supplier (Optional)</Label>
                                    <Input id="supplier" placeholder="Local Hardware Store" value={supplierName} onChange={e => setSupplierName(e.target.value)} className="bg-slate-50/50" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="qty" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity</Label>
                                    <Input id="qty" type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required className="bg-slate-50/50" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="space-y-2">
                                    <Label htmlFor="cost" className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
                                        Cost Price (Paid)
                                    </Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">৳</span>
                                        <Input id="cost" type="number" step="0.01" min="0" value={costPrice} onChange={e => setCostPrice(e.target.value)} required className="pl-7 bg-red-50/30 border-red-100 focus-visible:ring-red-500" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sell" className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                                        Selling Price (Bill)
                                    </Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">৳</span>
                                        <Input id="sell" type="number" step="0.01" min="0" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} required className="pl-7 bg-emerald-50/30 border-emerald-100 focus-visible:ring-emerald-500" />
                                    </div>
                                </div>
                            </div>

                            {/* Receipt Upload Section */}
                            <div className="pt-4 border-t border-slate-100">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block flex items-center gap-1">
                                    <ImageIcon className="w-3.5 h-3.5" /> Mandatory Receipt Photo
                                </Label>

                                <AnimatePresence mode="popLayout">
                                    {receiptImage ? (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="relative rounded-lg overflow-hidden border-2 border-slate-200 group"
                                        >
                                            <img src={receiptImage} alt="Receipt" className="w-full h-32 object-cover object-top" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Button type="button" variant="destructive" size="sm" onClick={() => setReceiptImage(null)} className="h-8">
                                                    <X className="w-4 h-4 mr-1" /> Remove
                                                </Button>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full h-32 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                                            >
                                                <Upload className="w-6 h-6 mb-2" />
                                                <span className="text-sm font-medium">Click to upload receipt</span>
                                                <span className="text-xs text-slate-400 mt-1">Required for petty cash audit</span>
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleFileChange} />
                            </div>
                        </form>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 bg-white border-t border-slate-100 sm:justify-between items-center sm:flex-row flex-col gap-3">
                    <span className="text-xs text-slate-500 italic flex-1 text-center sm:text-left">
                        Logs directly to strict audit ledger.
                    </span>
                    <Button
                        type="submit"
                        form="local-purchase-form"
                        disabled={!receiptImage || createPurchaseMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 w-full sm:w-auto"
                    >
                        {createPurchaseMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Log Purchase & Bill To Job
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
