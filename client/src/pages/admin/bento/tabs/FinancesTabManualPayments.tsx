import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { manualPaymentsApi } from "@/lib/api";
import { toast } from "sonner";

const methodLabels: Record<string, string> = {
    bkash_send_money: "bKash Send Money",
    nagad_send_money: "Nagad Send Money",
    cash: "Cash",
    credit: "Credit",
};

const statusColors: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    staff_verified: "bg-blue-50 text-blue-700 border-blue-200",
    applied_to_invoice: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
};

export function ManualPaymentsTab({ getCurrencySymbol }: { getCurrencySymbol: () => string }) {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState("pending");
    const [rejectTarget, setRejectTarget] = useState<any>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [form, setForm] = useState({
        jobTicketId: "",
        dueRecordId: "",
        serviceRequestId: "",
        customerName: "",
        customerPhone: "",
        method: "bkash_send_money",
        amount: "",
        senderNumber: "",
        transactionId: "",
        notes: "",
    });

    const { data, isLoading } = useQuery({
        queryKey: ["manual-payments", status],
        queryFn: () => manualPaymentsApi.getAll({ status }),
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["manual-payments"] });
        queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
        queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
        queryClient.invalidateQueries({ queryKey: ["due-summary-global"] });
    };

    const createMutation = useMutation({
        mutationFn: manualPaymentsApi.create,
        onSuccess: () => {
            invalidate();
            toast.success("Manual payment recorded");
            setForm({
                jobTicketId: "",
                dueRecordId: "",
                serviceRequestId: "",
                customerName: "",
                customerPhone: "",
                method: "bkash_send_money",
                amount: "",
                senderNumber: "",
                transactionId: "",
                notes: "",
            });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to record payment"),
    });

    const verifyMutation = useMutation({
        mutationFn: manualPaymentsApi.verify,
        onSuccess: () => {
            invalidate();
            toast.success("Payment verified");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to verify payment"),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => manualPaymentsApi.reject(id, reason),
        onSuccess: () => {
            invalidate();
            toast.success("Payment rejected");
            setRejectTarget(null);
            setRejectReason("");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to reject payment"),
    });

    const records = data?.items || [];

    const submitPayment = () => {
        createMutation.mutate({
            jobTicketId: form.jobTicketId || undefined,
            dueRecordId: form.dueRecordId || undefined,
            serviceRequestId: form.serviceRequestId || undefined,
            customerName: form.customerName || undefined,
            customerPhone: form.customerPhone || undefined,
            method: form.method as any,
            amount: Number(form.amount),
            senderNumber: form.senderNumber || undefined,
            transactionId: form.transactionId || undefined,
            notes: form.notes || undefined,
        });
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
            <div className="rounded-xl border bg-white p-4 space-y-3">
                <div>
                    <h3 className="font-bold text-slate-900">Record Manual Payment</h3>
                    <p className="text-xs text-muted-foreground">For bKash/Nagad send-money, cash, or credit booking records.</p>
                </div>
                <div className="grid gap-2">
                    <Label>Method</Label>
                    <Select value={form.method} onValueChange={(method) => setForm({ ...form, method })}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="bkash_send_money">bKash Send Money</SelectItem>
                            <SelectItem value="nagad_send_money">Nagad Send Money</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2"><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-xl" /></div>
                    <div className="grid gap-2"><Label>Sender</Label><Input value={form.senderNumber} onChange={(e) => setForm({ ...form, senderNumber: e.target.value })} className="rounded-xl" /></div>
                </div>
                <div className="grid gap-2"><Label>Transaction ID</Label><Input value={form.transactionId} onChange={(e) => setForm({ ...form, transactionId: e.target.value })} className="rounded-xl" /></div>
                <div className="grid gap-2"><Label>Job Ticket ID</Label><Input value={form.jobTicketId} onChange={(e) => setForm({ ...form, jobTicketId: e.target.value })} className="rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2"><Label>Due ID</Label><Input value={form.dueRecordId} onChange={(e) => setForm({ ...form, dueRecordId: e.target.value })} className="rounded-xl" /></div>
                    <div className="grid gap-2"><Label>Request ID</Label><Input value={form.serviceRequestId} onChange={(e) => setForm({ ...form, serviceRequestId: e.target.value })} className="rounded-xl" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2"><Label>Customer</Label><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="rounded-xl" /></div>
                    <div className="grid gap-2"><Label>Phone</Label><Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="rounded-xl" /></div>
                </div>
                <div className="grid gap-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-xl" /></div>
                <Button onClick={submitPayment} disabled={createMutation.isPending || !form.amount} className="w-full rounded-xl">
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Record
                </Button>
            </div>

            <div className="rounded-xl border bg-white overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h3 className="font-bold text-slate-900">Manual Payment Verification</h3>
                        <p className="text-xs text-muted-foreground">Staff approval applies linked job/due payments.</p>
                    </div>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="w-44 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="staff_verified">Verified</SelectItem>
                            <SelectItem value="applied_to_invoice">Applied</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Method</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="h-28 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : records.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">No manual payments found</TableCell></TableRow>
                        ) : records.map((record: any) => (
                            <TableRow key={record.id}>
                                <TableCell>{methodLabels[record.method] || record.method}</TableCell>
                                <TableCell>
                                    <div className="font-mono text-xs">{record.transactionId || record.id}</div>
                                    <div className="text-xs text-muted-foreground">{record.jobTicketId || record.dueRecordId || record.serviceRequestId}</div>
                                </TableCell>
                                <TableCell>
                                    <div>{record.customerName || "-"}</div>
                                    <div className="text-xs text-muted-foreground">{record.customerPhone || record.senderNumber || "-"}</div>
                                </TableCell>
                                <TableCell className="text-right font-semibold">{getCurrencySymbol()}{Number(record.amount).toLocaleString()}</TableCell>
                                <TableCell><Badge variant="outline" className={statusColors[record.status]}>{record.status}</Badge></TableCell>
                                <TableCell className="text-right">
                                    {record.status === "pending" && (
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" onClick={() => verifyMutation.mutate(record.id)} disabled={verifyMutation.isPending} className="rounded-xl"><CheckCircle className="w-4 h-4 mr-1" />Verify</Button>
                                            <Button size="sm" variant="outline" onClick={() => setRejectTarget(record)} className="rounded-xl"><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                                        </div>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader><DialogTitle>Reject Manual Payment</DialogTitle></DialogHeader>
                    <div className="grid gap-2">
                        <Label>Reason</Label>
                        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="rounded-xl" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectTarget(null)} className="rounded-xl">Cancel</Button>
                        <Button variant="destructive" onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason })} disabled={!rejectReason.trim() || rejectMutation.isPending} className="rounded-xl">Reject</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
