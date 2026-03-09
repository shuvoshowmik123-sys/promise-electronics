import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, UserPlus, Trash2, Plus, Minus, Loader2, FileText, Receipt, CheckCircle, Printer, Shield, RotateCcw, Link, ListPlus } from "lucide-react";
import { Invoice, Receipt as ReceiptPrint, PrintStyles } from "@/components/print";
import { toast } from "sonner";
import { TransactionData, LinkedJobCharge, parseTransactionForReprint } from "./pos-types";

// ── Customer Select Dialog ──
export function CustomerDialog({ open, onOpenChange, customers, customersLoading, onSelect, getCurrencySymbol }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    customers: any[]; customersLoading: boolean;
    onSelect: (c: any) => void; getCurrencySymbol: () => string;
}) {
    const [search, setSearch] = useState("");
    const filtered = customers?.filter(c =>
        search === "" || c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())
    ) || [];

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Select Customer</DialogTitle>
                    <DialogDescription>Search and select a customer to auto-fill details.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 mb-4">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by name, phone or email..." className="flex-1" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {customersLoading ? (
                    <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground"><UserPlus className="h-12 w-12 mx-auto mb-3 opacity-20" /><p className="text-sm">No customers found</p></div>
                ) : (
                    <div className="border rounded-md max-h-[300px] overflow-y-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Address</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {filtered.map((customer) => (
                                    <TableRow key={customer.id}>
                                        <TableCell><div className="font-medium">{customer.name || "-"}</div><div className="text-xs text-muted-foreground">{customer.email || ""}</div></TableCell>
                                        <TableCell>{customer.phone || "-"}</TableCell>
                                        <TableCell className="max-w-[150px] truncate">{customer.address || "-"}</TableCell>
                                        <TableCell><Button size="sm" variant="outline" onClick={() => { onSelect(customer); setSearch(""); }}>Select</Button></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => { onOpenChange(false); setSearch(""); }}>Cancel</Button></div>
            </DialogContent>
        </Dialog>
    );
}

// ── Job Link Dialog ──
export function JobLinkDialog({ open, onOpenChange, billableJobs, jobsLoading, linkedJobCharges, onJobSelection }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    billableJobs: any[]; jobsLoading: boolean;
    linkedJobCharges: LinkedJobCharge[]; onJobSelection: (id: string, checked: boolean) => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Link Job Tickets</DialogTitle>
                    <DialogDescription>Select multiple job tickets to link to this invoice.</DialogDescription>
                </DialogHeader>
                {jobsLoading ? (
                    <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : billableJobs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground"><p className="text-sm">No billable job tickets available</p><p className="text-xs mt-1">Only Completed, Delivered, or Ready jobs can be linked</p></div>
                ) : (
                    <div className="border rounded-md max-h-[300px] overflow-y-auto mt-4">
                        <Table>
                            <TableHeader><TableRow><TableHead className="w-10"></TableHead><TableHead>Job ID</TableHead><TableHead>Customer</TableHead><TableHead>Device</TableHead><TableHead>Status</TableHead><TableHead>Warranty</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {billableJobs.map((job) => (
                                    <TableRow key={job.id}>
                                        <TableCell><Checkbox checked={linkedJobCharges.some(j => j.jobId === job.id)} onCheckedChange={(checked) => onJobSelection(job.id, !!checked)} /></TableCell>
                                        <TableCell className="font-mono">{job.id}</TableCell>
                                        <TableCell>{job.customer}</TableCell>
                                        <TableCell>{job.device}</TableCell>
                                        <TableCell><Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">{job.status}</Badge></TableCell>
                                        <TableCell>
                                            {(job.serviceExpiryDate && new Date(job.serviceExpiryDate) > new Date()) || (job.partsExpiryDate && new Date(job.partsExpiryDate) > new Date()) ? (
                                                <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 text-[10px] px-1.5 py-0.5 h-5 shadow-none"><Shield className="w-3 h-3" />Active</Badge>
                                            ) : (<span className="text-[10px] text-slate-400">Expired</span>)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => { onOpenChange(false); if (linkedJobCharges.length > 0) toast.success(`Linked ${linkedJobCharges.length} job ticket(s)`); }}>
                        Link {linkedJobCharges.length} Jobs
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Inventory Browser Dialog ──
export function InventoryDialog({ open, onOpenChange, inventoryItems, inventoryLoading, selectedInventory, onInventorySelection, onAddToCart, getCurrencySymbol }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    inventoryItems: any; inventoryLoading: boolean;
    selectedInventory: { id: string; qty: number }[];
    onInventorySelection: (id: string, qty: number) => void;
    onAddToCart: () => void; getCurrencySymbol: () => string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Add Inventory Items</DialogTitle>
                    <DialogDescription>Search and add parts or items directly from inventory.</DialogDescription>
                </DialogHeader>
                {inventoryLoading ? (
                    <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                    <div className="border rounded-md max-h-[300px] overflow-y-auto">
                        <Table>
                            <TableHeader><TableRow><TableHead>Item Name</TableHead><TableHead>Stock</TableHead><TableHead>Price</TableHead><TableHead className="w-24">Qty</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {inventoryItems?.map((item: any) => {
                                    const selected = selectedInventory.find(i => i.id === item.id);
                                    const isSelected = !!selected && selected.qty > 0;
                                    const canAdd = item.stock > 0;
                                    return (
                                        <TableRow key={item.id} className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 hover:bg-primary/15' : canAdd ? 'hover:bg-slate-50' : 'opacity-50 cursor-not-allowed'}`}
                                            onClick={() => { if (!canAdd) return; isSelected ? onInventorySelection(item.id, 0) : onInventorySelection(item.id, 1); }}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>
                                                        {isSelected && <CheckCircle className="w-3 h-3" />}
                                                    </div>
                                                    <div><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.id}</div></div>
                                                </div>
                                            </TableCell>
                                            <TableCell><Badge variant={item.stock > 0 ? "secondary" : "destructive"}>{item.stock} left</Badge></TableCell>
                                            <TableCell>{getCurrencySymbol()}{item.price}</TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                {isSelected ? (
                                                    <div className="flex items-center gap-1">
                                                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onInventorySelection(item.id, Math.max(0, (selected?.qty || 1) - 1)); }}><Minus className="h-3 w-3" /></Button>
                                                        <span className="w-8 text-center font-medium">{selected?.qty || 0}</span>
                                                        <Button variant="outline" size="icon" className="h-7 w-7" disabled={(selected?.qty || 0) >= item.stock} onClick={(e) => { e.stopPropagation(); onInventorySelection(item.id, Math.min(item.stock, (selected?.qty || 0) + 1)); }}><Plus className="h-3 w-3" /></Button>
                                                    </div>
                                                ) : (<span className="text-xs text-slate-400">Click to add</span>)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={onAddToCart} disabled={selectedInventory.length === 0}>Add Items</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Success Dialog ──
export function SuccessDialog({ open, onOpenChange, lastTransaction, getCurrencySymbol, onShowInvoice, onShowReceipt }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    lastTransaction: TransactionData | null; getCurrencySymbol: () => string;
    onShowInvoice: () => void; onShowReceipt: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md text-center px-8 py-10 overflow-hidden">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-300">
                    <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Sale Complete!</h2>
                <p className="text-slate-500 mb-6">Transaction #{lastTransaction?.invoiceNumber || lastTransaction?.id}</p>
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 mb-6 border border-slate-200/50">
                    <div className="text-sm text-slate-500 mb-1">Amount Received</div>
                    <div className="text-3xl font-bold text-green-600 tabular-nums">{getCurrencySymbol()}{lastTransaction ? parseFloat(lastTransaction.total).toFixed(2) : "0.00"}</div>
                    <div className="text-xs text-slate-400 mt-1">via {lastTransaction?.paymentMethod}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <Button variant="outline" onClick={onShowReceipt} className="gap-2"><Receipt className="w-4 h-4" /> Receipt</Button>
                    <Button onClick={onShowInvoice} className="gap-2 bg-primary text-white hover:bg-primary/90"><FileText className="w-4 h-4" /> Invoice</Button>
                </div>
                <Button variant="ghost" className="w-full text-slate-500" onClick={() => onOpenChange(false)}>Start New Sale</Button>
            </DialogContent>
        </Dialog>
    );
}

// ── Invoice Preview Dialog ──
export function InvoicePreviewDialog({ open, onOpenChange, lastTransaction, companyInfo }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    lastTransaction: TransactionData | null; companyInfo: any;
}) {
    const invoiceRef = useRef<HTMLDivElement>(null);
    const handlePrint = () => {
        if (!invoiceRef.current) return;
        const w = window.open("", "_blank");
        if (w) {
            w.document.write(`<!DOCTYPE html><html><head><title>Invoice - ${lastTransaction?.id}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif}.text-primary{color:#0ea5e9}.text-gray-600,.text-gray-500{color:#6b7280}.text-gray-800{color:#1f2937}.text-green-600{color:#16a34a}.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}.text-xs{font-size:.75rem}.text-sm{font-size:.875rem}.text-lg{font-size:1.125rem}.text-xl{font-size:1.25rem}.text-2xl{font-size:1.5rem}.text-3xl{font-size:1.875rem}.text-right{text-align:right}.text-center{text-align:center}.text-left{text-align:left}.flex{display:flex}.justify-between{justify-content:space-between}.justify-end{justify-content:flex-end}.items-start{align-items:flex-start}.items-center{align-items:center}.gap-4{gap:1rem}.gap-8{gap:2rem}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,1fr)}.mb-2{margin-bottom:.5rem}.mb-4{margin-bottom:1rem}.mb-8{margin-bottom:2rem}.mt-2{margin-top:.5rem}.mt-8{margin-top:2rem}.mt-auto{margin-top:auto}.ml-auto{margin-left:auto}.p-8{padding:2rem}.py-2,.py-3{padding-top:.5rem;padding-bottom:.5rem}.px-3,.px-4{padding-left:.75rem;padding-right:.75rem}.pb-6,.pt-6{padding:1.5rem 0}.pt-2,.pt-4{padding-top:.5rem}.border{border:1px solid #e5e7eb}.border-b{border-bottom:1px solid #e5e7eb}.border-t{border-top:1px solid #e5e7eb}.border-t-2{border-top:2px solid #1f2937}.border-gray-400{border-color:#9ca3af}.bg-gray-100{background-color:#f3f4f6}.rounded{border-radius:.25rem}.w-48{width:12rem}.w-72{width:18rem}.w-full{width:100%}.h-16{height:4rem}.w-16{width:4rem}table{width:100%;border-collapse:collapse}th,td{padding:.75rem 1rem}tr.border-b{border-bottom:1px solid #e5e7eb}.uppercase{text-transform:uppercase}.font-mono{font-family:monospace}@page{size:A4;margin:10mm}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div style="padding:2rem;max-width:210mm;margin:0 auto">${invoiceRef.current.innerHTML}</div></body></html>`);
            w.document.close(); w.print();
        }
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Invoice Preview (A4 Size)</DialogTitle></DialogHeader>
                <div className="border rounded-lg overflow-hidden bg-white">{lastTransaction && <Invoice ref={invoiceRef} data={lastTransaction} company={companyInfo} />}</div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                    <Button onClick={handlePrint} className="gap-2"><Printer className="h-4 w-4" /> Print Invoice</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Receipt Preview Dialog ──
export function ReceiptPreviewDialog({ open, onOpenChange, lastTransaction, companyInfo }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    lastTransaction: TransactionData | null; companyInfo: any;
}) {
    const receiptRef = useRef<HTMLDivElement>(null);
    const handlePrint = () => {
        if (!receiptRef.current) return;
        const w = window.open("", "_blank");
        if (w) {
            w.document.write(`<!DOCTYPE html><html><head><title>Receipt - ${lastTransaction?.id}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:10px;line-height:1.2}.text-center{text-align:center}.font-bold{font-weight:700}.text-xs{font-size:10px}.text-sm{font-size:12px}.flex{display:flex}.justify-between{justify-content:space-between}.mb-1,.mb-2{margin-bottom:4px}.pb-2{padding-bottom:4px}.pt-1,.pt-2{padding-top:4px}.mt-1,.mt-2{margin-top:4px}.p-2{padding:4px}.border-b,.border-t{border-style:dashed;border-color:#888}.border-b{border-bottom-width:1px}.border-t{border-top-width:1px}.text-gray-600{color:#666}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pr-2{padding-right:4px}.mx-auto{margin-left:auto;margin-right:auto}.h-8,.w-8{height:24px;width:24px}.object-contain{object-fit:contain}@page{size:57mm auto;margin:0}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div style="width:57mm;padding:2mm">${receiptRef.current.innerHTML}</div></body></html>`);
            w.document.close(); w.print();
        }
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Receipt Preview (57mm Thermal)</DialogTitle></DialogHeader>
                <div className="border rounded-lg overflow-hidden bg-white flex justify-center p-4">{lastTransaction && <ReceiptPrint ref={receiptRef} data={lastTransaction} company={companyInfo} />}</div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                    <Button onClick={handlePrint} className="gap-2"><Printer className="h-4 w-4" /> Print Receipt</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Transaction History Dialog ──
export function HistoryDialog({ open, onOpenChange, posTransactions, getCurrencySymbol, onRequestRefund, onSetTransaction, onShowInvoice, onShowReceipt }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    posTransactions: any[]; getCurrencySymbol: () => string;
    onRequestRefund: (t: any) => void;
    onSetTransaction: (t: TransactionData) => void;
    onShowInvoice: () => void; onShowReceipt: () => void;
}) {
    const [selected, setSelected] = useState<TransactionData | null>(null);
    const handleSelect = (t: any) => { const parsed = parseTransactionForReprint(t); setSelected(parsed); };
    const handleReprintInvoice = (t?: any) => { const data = t ? parseTransactionForReprint(t) : selected; if (data) { onSetTransaction(data); onOpenChange(false); onShowInvoice(); } };
    const handleReprintReceipt = (t?: any) => { const data = t ? parseTransactionForReprint(t) : selected; if (data) { onSetTransaction(data); onOpenChange(false); onShowReceipt(); } };

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelected(null); }}>
            <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Transaction History</DialogTitle>
                    <DialogDescription>Select a transaction to reprint its invoice or receipt</DialogDescription>
                </DialogHeader>
                <div className="overflow-y-auto max-h-96">
                    <Table>
                        <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {posTransactions?.map((transaction) => (
                                <TableRow key={transaction.id} className={`cursor-pointer ${selected?.id === transaction.id ? "bg-primary/10" : ""}`} onClick={() => handleSelect(transaction)}>
                                    <TableCell className="font-mono text-sm">{transaction.invoiceNumber || transaction.id}</TableCell>
                                    <TableCell>{transaction.customer || "Walk-in"}</TableCell>
                                    <TableCell>{new Date(transaction.createdAt).toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                                    <TableCell className="text-right font-semibold">{getCurrencySymbol()}{Number(transaction.total).toFixed(2)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex gap-1 justify-end">
                                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleReprintInvoice(transaction); }}><FileText className="h-4 w-4" /></Button>
                                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleReprintReceipt(transaction); }}><Receipt className="h-4 w-4" /></Button>
                                            <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={(e) => { e.stopPropagation(); onRequestRefund(transaction); }} title="Request Refund"><RotateCcw className="h-4 w-4" /></Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {(!posTransactions || posTransactions.length === 0) && (<TableRow><TableCell colSpan={5} className="text-center text-gray-500 py-8">No transactions found</TableCell></TableRow>)}
                        </TableBody>
                    </Table>
                </div>
                {selected && (
                    <div className="border-t pt-4 mt-4">
                        <p className="text-sm text-gray-600 mb-3">Selected: <span className="font-semibold">{selected.invoiceNumber || selected.id}</span></p>
                        <div className="flex gap-2">
                            <Button onClick={() => handleReprintInvoice()} className="gap-2"><FileText className="h-4 w-4" /> Reprint Invoice</Button>
                            <Button onClick={() => handleReprintReceipt()} variant="outline" className="gap-2"><Receipt className="h-4 w-4" /> Reprint Receipt</Button>
                        </div>
                    </div>
                )}
                <DialogFooter><Button variant="outline" onClick={() => { onOpenChange(false); setSelected(null); }}>Close</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Refund Dialog ──
export function RefundDialog({ open, onOpenChange, refundTransaction, getCurrencySymbol }: {
    open: boolean; onOpenChange: (v: boolean) => void;
    refundTransaction: any; getCurrencySymbol: () => string;
}) {
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!refundTransaction || !amount) return;
        setSubmitting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success("Refund processed successfully", { description: `Refunded ${getCurrencySymbol()}${amount} for Invoice #${refundTransaction.invoiceNumber}` });
            onOpenChange(false);
        } catch { toast.error("Failed to process refund"); }
        finally { setSubmitting(false); }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v && refundTransaction) { setAmount(refundTransaction.total?.toString() || ""); setReason(""); } }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-slate-800"><RotateCcw className="h-5 w-5 text-rose-600" /> Request Refund</DialogTitle>
                    <div className="text-sm text-slate-500">Invoice: <span className="font-mono text-slate-700">{refundTransaction?.invoiceNumber}</span></div>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>Refund Amount</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">{getCurrencySymbol()}</span>
                            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} max={refundTransaction?.total} className="pl-8" />
                        </div>
                        <p className="text-xs text-slate-400 text-right">Max refundable: {getCurrencySymbol()}{refundTransaction?.total}</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Reason</Label>
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective product, Customer returned" />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={handleSubmit} disabled={submitting || !amount}>
                        {submitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>) : "Confirm Refund"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
