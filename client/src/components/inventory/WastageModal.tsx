import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AlertOctagon, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { wastageApi, inventoryApi } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InventoryItem, InventorySerial } from "@shared/schema";

interface WastageModalProps {
    item: InventoryItem | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

const REASONS = [
    "DOA/Factory Defect",
    "Installation Fault",
    "Transit Damage",
    "Water Damage",
    "Audit Discrepancy",
    "Other"
];

export function WastageModal({ item, open, onOpenChange, onSuccess }: WastageModalProps) {
    const [quantity, setQuantity] = useState("1");
    const [reason, setReason] = useState(REASONS[0]);
    const [jobTicketId, setJobTicketId] = useState("");
    const [notes, setNotes] = useState("");
    const [selectedSerials, setSelectedSerials] = useState<string[]>([]);

    // Financial loss auto-calculates based on price * quantity
    const defaultCost = item?.price || 0;
    const calcQty = item?.isSerialized ? selectedSerials.length : parseInt(quantity, 10) || 1;
    const [financialLoss, setFinancialLoss] = useState((defaultCost * calcQty).toString());

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Reset state when modal opens
    useEffect(() => {
        if (open) {
            setQuantity("1");
            setReason(REASONS[0]);
            setJobTicketId("");
            setNotes("");
            setSelectedSerials([]);
            setFinancialLoss((defaultCost * 1).toString());
        }
    }, [open, defaultCost]);

    // Update financial loss when quantity or selection changes
    useEffect(() => {
        setFinancialLoss((defaultCost * calcQty).toString());
    }, [calcQty, defaultCost]);

    // Fetch serials if the item is serialized
    const { data: availableSerials, isLoading: isLoadingSerials } = useQuery({
        queryKey: ['/api/inventory', item?.id, 'serials'],
        queryFn: () => inventoryApi.getSerials(item!.id),
        enabled: open && !!item && (item.isSerialized ?? false),
    });

    const reportWastageMutation = useMutation({
        mutationFn: async () => {
            if (!item) throw new Error("No item selected.");
            const parsedLoss = parseFloat(financialLoss) || 0;

            if (item.isSerialized) {
                if (selectedSerials.length === 0) throw new Error("Please select at least one serial number.");
                // Report each serial individually
                await Promise.all(
                    selectedSerials.map((serialId) =>
                        wastageApi.report(item.id, {
                            inventoryItemId: item.id,
                            serialId,
                            quantity: 1,
                            reason,
                            jobTicketId: jobTicketId || undefined,
                            financialLoss: parsedLoss / selectedSerials.length,
                            notes,
                        })
                    )
                );
            } else {
                await wastageApi.report(item.id, {
                    inventoryItemId: item.id,
                    quantity: parseInt(quantity, 10),
                    reason,
                    jobTicketId: jobTicketId || undefined,
                    financialLoss: parsedLoss,
                    notes,
                });
            }
        },
        onSuccess: () => {
            toast({
                title: "Wastage Reported",
                description: `Successfully logged wastage for ${item?.name}.`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
            queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }); // Update KPIs
            if (onSuccess) onSuccess();
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast({
                title: "Operation Failed",
                description: error.message || "Could not log wastage.",
                variant: "destructive",
            });
        }
    });

    const handleToggleSerial = (serialId: string) => {
        setSelectedSerials(prev =>
            prev.includes(serialId)
                ? prev.filter(id => id !== serialId)
                : [...prev, serialId]
        );
    };

    if (!item) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-slate-50">
                <div className="bg-gradient-to-r from-red-600 to-rose-600 p-6 text-white text-center pb-8 border-b">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                        <AlertOctagon className="w-6 h-6 text-white" />
                    </div>
                    <DialogTitle className="text-2xl font-bold tracking-tight text-white mb-1">Report Wastage</DialogTitle>
                    <DialogDescription className="text-red-100 text-sm">
                        Log defective, damaged, or lost inventory for audit trails.
                    </DialogDescription>
                </div>

                <div className="px-6 py-4 -mt-4">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 text-sm text-slate-700">
                            <strong>Item:</strong> {item.name} <br />
                            <span className="text-xs text-slate-500">ID: {item.id} | Unit Price: ৳{item.price?.toFixed(2) || '0.00'}</span>
                        </div>

                        <form id="wastage-form" onSubmit={(e) => { e.preventDefault(); reportWastageMutation.mutate(); }} className="space-y-4">

                            {item.isSerialized ? (
                                <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
                                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                                        Select Wasted Serial(s)
                                    </Label>
                                    {isLoadingSerials ? (
                                        <div className="flex items-center justify-center p-4">
                                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                                        </div>
                                    ) : (
                                        <div className="max-h-40 overflow-y-auto space-y-1 pr-2">
                                            {(availableSerials || []).filter((s: InventorySerial) => s.status === 'Available').length === 0 ? (
                                                <p className="text-sm text-slate-500">No available serials to mark as wasted.</p>
                                            ) : (
                                                (availableSerials || []).filter((s: InventorySerial) => s.status === 'Available').map((serial: InventorySerial) => (
                                                    <div key={serial.id} className="flex items-center space-x-2 py-1">
                                                        <Checkbox
                                                            id={serial.id}
                                                            checked={selectedSerials.includes(serial.id)}
                                                            onCheckedChange={() => handleToggleSerial(serial.id)}
                                                        />
                                                        <label htmlFor={serial.id} className="text-sm cursor-pointer select-none font-mono">
                                                            {serial.serialNumber}
                                                        </label>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label htmlFor="qty" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity to Write Off</Label>
                                    <Input
                                        id="qty"
                                        type="number"
                                        min="1"
                                        max={item.stock}
                                        value={quantity}
                                        onChange={e => setQuantity(e.target.value)}
                                        required
                                        className="bg-slate-50/50"
                                    />
                                    <p className="text-[10px] text-slate-400">Max available: {item.stock}</p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reason</Label>
                                <Select value={reason} onValueChange={setReason}>
                                    <SelectTrigger className="bg-slate-50/50">
                                        <SelectValue placeholder="Select Reason" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {REASONS.map(r => (
                                            <SelectItem key={r} value={r}>{r}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="jobId" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Linked Job Ticket (Optional)</Label>
                                <Input id="jobId" placeholder="e.g. J-10293 or R-9382" value={jobTicketId} onChange={e => setJobTicketId(e.target.value)} className="bg-slate-50/50" />
                                <p className="text-[10px] text-slate-400">If damaged during a specific repair</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="loss" className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
                                    Financial Loss
                                </Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">৳</span>
                                    <Input id="loss" type="number" step="0.01" min="0" value={financialLoss} onChange={e => setFinancialLoss(e.target.value)} required className="pl-7 bg-red-50/30 border-red-100 focus-visible:ring-red-500" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes</Label>
                                <Textarea id="notes" placeholder="Detailed explanation..." value={notes} onChange={e => setNotes(e.target.value)} className="resize-none h-20 bg-slate-50/50" />
                            </div>

                        </form>
                    </div>
                </div>

                <DialogFooter className="px-6 py-4 bg-white border-t border-slate-100 sm:justify-between items-center sm:flex-row flex-col gap-3">
                    <span className="text-xs font-medium text-red-600 italic flex-1 text-center sm:text-left">
                        Logs directly to financial write-offs.
                    </span>
                    <Button
                        type="submit"
                        form="wastage-form"
                        disabled={reportWastageMutation.isPending || ((item.isSerialized ?? false) && selectedSerials.length === 0)}
                        className="bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20 w-full sm:w-auto"
                    >
                        {reportWastageMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Confirm Write-off
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
