import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Link2, Loader2, PlusCircle, Search, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { dueRecordsApi, manualPaymentsApi, searchApi } from "@/lib/api";
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

const statusLabels: Record<string, string> = {
    pending: "Pending",
    staff_verified: "Verified",
    applied_to_invoice: "Applied",
    rejected: "Rejected",
};

const DIGITAL_METHODS = ["bkash_send_money", "nagad_send_money"];

type LinkOption = {
    type: "job" | "due" | "service-request";
    id: string;
    label: string;
    customerName?: string;
    customerPhone?: string;
    amount?: number;
    meta?: string;
};

export function ManualPaymentsTab({ getCurrencySymbol }: { getCurrencySymbol: () => string }) {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState("pending");
    const [source, setSource] = useState<"customer_submission" | "admin_manual">("customer_submission");
    const [linkSearch, setLinkSearch] = useState("");
    const [debouncedLinkSearch, setDebouncedLinkSearch] = useState("");
    const [isLinkSearchOpen, setIsLinkSearchOpen] = useState(false);
    const [selectedLinkLabel, setSelectedLinkLabel] = useState("");
    const [rejectTarget, setRejectTarget] = useState<any>(null);
    const [rejectReason, setRejectReason] = useState("");
    const [showWalkinSheet, setShowWalkinSheet] = useState(false);
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

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedLinkSearch(linkSearch.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [linkSearch]);

    const { data, isLoading } = useQuery({
        queryKey: ["manual-payments", status, source],
        queryFn: () => manualPaymentsApi.getAll({ status, source }),
    });

    const { data: linkOptions = [], isLoading: isSearchingLinks } = useQuery({
        queryKey: ["manual-payment-link-search", debouncedLinkSearch],
        enabled: debouncedLinkSearch.length >= 2,
        queryFn: async () => {
            const [globalResults, dueResults] = await Promise.all([
                searchApi.global(debouncedLinkSearch),
                dueRecordsApi.getAll({ search: debouncedLinkSearch, status: "Pending", limit: 8 }),
            ]);

            const jobLinks: LinkOption[] = (globalResults.jobs || []).map((job: any) => ({
                type: "job",
                id: job.id,
                label: job.corporateJobNumber || job.id,
                customerName: job.resolvedCustomerName || job.customer,
                customerPhone: job.customerPhone,
                meta: [job.device, job.status].filter(Boolean).join(" | "),
            }));
            const serviceRequestLinks: LinkOption[] = (globalResults.serviceRequests || []).map((request: any) => ({
                type: "service-request",
                id: request.id,
                label: request.ticketNumber || request.id,
                customerName: request.customerName,
                customerPhone: request.phone,
                meta: [request.brand, request.modelNumber, request.status].filter(Boolean).join(" | "),
            }));
            const dueLinks: LinkOption[] = (dueResults.items || []).map((due: any) => ({
                type: "due",
                id: due.id,
                label: due.invoice || due.id,
                customerName: due.customer,
                amount: Math.max(0, Number(due.amount || 0) - Number(due.paidAmount || 0)),
                meta: due.status,
            }));

            return [...jobLinks, ...dueLinks, ...serviceRequestLinks].slice(0, 12);
        },
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["manual-payments"] });
        queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
        queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
        queryClient.invalidateQueries({ queryKey: ["dueRecords-paginated"] });
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
            setLinkSearch("");
            setSelectedLinkLabel("");
            setIsLinkSearchOpen(false);
            setShowWalkinSheet(false);
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

    const applyLink = (link: LinkOption) => {
        setForm((current) => ({
            ...current,
            jobTicketId: link.type === "job" ? link.id : "",
            dueRecordId: link.type === "due" ? link.id : "",
            serviceRequestId: link.type === "service-request" ? link.id : "",
            customerName: link.customerName || current.customerName,
            customerPhone: link.customerPhone || current.customerPhone,
            amount: link.amount ? String(link.amount) : current.amount,
        }));
        setLinkSearch(link.label);
        setSelectedLinkLabel(`${link.type.replace("-", " ")} ${link.label}`);
        setIsLinkSearchOpen(false);
    };

    const clearLink = () => {
        setForm((current) => ({
            ...current,
            jobTicketId: "",
            dueRecordId: "",
            serviceRequestId: "",
        }));
        setLinkSearch("");
        setSelectedLinkLabel("");
        setIsLinkSearchOpen(false);
    };

    const linkedReference = form.jobTicketId || form.dueRecordId || form.serviceRequestId;

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

    // Walk-in form fields — shared between Sheet (mobile) and inline panel (desktop)
    const walkinFields = (
        <div className="space-y-3">
            <div className="grid gap-2">
                <Label>Link job, due, or request</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={linkSearch}
                        onChange={(e) => {
                            setLinkSearch(e.target.value);
                            setSelectedLinkLabel("");
                            setIsLinkSearchOpen(true);
                        }}
                        placeholder="Search phone, ticket, invoice, name..."
                        className="pl-9 pr-9 rounded-xl"
                    />
                    {linkedReference && (
                        <button
                            type="button"
                            onClick={clearLink}
                            className="absolute right-3 top-2.5 text-muted-foreground hover:text-slate-900"
                        >
                            <XCircle className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {linkedReference && (
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <Link2 className="h-4 w-4" />
                        <span className="font-mono">{selectedLinkLabel || linkedReference}</span>
                    </div>
                )}
                {isLinkSearchOpen && debouncedLinkSearch.length >= 2 && (
                    <div className="rounded-xl border bg-slate-50 max-h-56 overflow-y-auto">
                        {isSearchingLinks ? (
                            <div className="flex items-center justify-center py-5 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />Searching
                            </div>
                        ) : linkOptions.length === 0 ? (
                            <div className="py-5 text-center text-sm text-muted-foreground">No matching job, due, or request</div>
                        ) : linkOptions.map((link) => (
                            <button
                                key={`${link.type}-${link.id}`}
                                type="button"
                                onClick={() => applyLink(link)}
                                className="w-full border-b last:border-b-0 px-3 py-2 text-left hover:bg-white"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize">{link.type.replace("-", " ")}</Badge>
                                            <span className="font-mono text-xs font-semibold truncate">{link.label}</span>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground truncate">
                                            {[link.customerName, link.customerPhone, link.meta].filter(Boolean).join(" | ")}
                                        </div>
                                    </div>
                                    {link.amount != null && (
                                        <div className="shrink-0 text-sm font-semibold">{getCurrencySymbol()}{link.amount.toLocaleString()}</div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
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
            {(form.method === "bkash_send_money" || form.method === "nagad_send_money") && (
                <div className="grid gap-2"><Label>Transaction ID</Label><Input value={form.transactionId} onChange={(e) => setForm({ ...form, transactionId: e.target.value })} className="rounded-xl" /></div>
            )}
            <div className="grid gap-2"><Label>Job Ticket ID</Label><Input value={form.jobTicketId} onChange={(e) => { setSelectedLinkLabel(""); setForm({ ...form, jobTicketId: e.target.value, dueRecordId: "", serviceRequestId: "" }); }} className="rounded-xl" /></div>
            <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2"><Label>Due ID</Label><Input value={form.dueRecordId} onChange={(e) => { setSelectedLinkLabel(""); setForm({ ...form, dueRecordId: e.target.value, jobTicketId: "", serviceRequestId: "" }); }} className="rounded-xl" /></div>
                <div className="grid gap-2"><Label>Request ID</Label><Input value={form.serviceRequestId} onChange={(e) => { setSelectedLinkLabel(""); setForm({ ...form, serviceRequestId: e.target.value, jobTicketId: "", dueRecordId: "" }); }} className="rounded-xl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2"><Label>Customer</Label><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} className="rounded-xl" /></div>
                <div className="grid gap-2"><Label>Phone</Label><Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} className="rounded-xl" /></div>
            </div>
            <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-xl" />
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-2 xl:grid xl:grid-cols-[360px_1fr] xl:gap-4">

            {/* ── Mobile: FAB opens a bottom Sheet with the walk-in form ── */}
            <div className="xl:hidden">
                <button
                    type="button"
                    onClick={() => setShowWalkinSheet(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 active:bg-emerald-100"
                >
                    <PlusCircle className="h-4 w-4" />
                    Record Walk-in Payment
                </button>
                <Sheet open={showWalkinSheet} onOpenChange={setShowWalkinSheet}>
                    <SheetContent side="bottom" className="h-[92dvh] rounded-t-3xl overflow-y-auto pb-[max(2rem,env(safe-area-inset-bottom))] pt-0 px-4">
                        <div className="sticky top-0 z-10 border-b bg-white pb-3 pt-4 mb-4">
                            <h3 className="font-bold text-slate-900">Walk-in Manual Record</h3>
                            <p className="text-xs text-muted-foreground">Use only when staff collected payment outside the customer portal.</p>
                        </div>
                        {walkinFields}
                        <Button
                            onClick={submitPayment}
                            disabled={createMutation.isPending || !form.amount}
                            className="mt-4 w-full rounded-xl"
                        >
                            {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Record
                        </Button>
                    </SheetContent>
                </Sheet>
            </div>

            {/* ── Desktop xl+: inline walk-in form panel ── */}
            <div className="hidden xl:block order-2 xl:order-1 rounded-xl border bg-white p-4 space-y-3">
                <div>
                    <h3 className="font-bold text-slate-900">Walk-in Manual Record</h3>
                    <p className="text-xs text-muted-foreground">Use only when staff collected payment outside the customer portal.</p>
                </div>
                {walkinFields}
                <Button onClick={submitPayment} disabled={createMutation.isPending || !form.amount} className="w-full rounded-xl">
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Record
                </Button>
            </div>

            {/* ── Customer Payment Verification panel (always visible) ── */}
            <div className="order-1 rounded-xl border bg-white overflow-hidden xl:order-2">
                <div className="flex flex-col gap-2 p-3 border-b md:flex-row md:items-center md:justify-between md:p-4">
                    <div>
                        <h3 className="font-bold text-slate-900">
                            {source === "customer_submission" ? "Customer Payment Verification" : "Manual Payment Records"}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {source === "customer_submission"
                                ? "Customer-submitted bKash/Nagad send-money details awaiting staff statement check."
                                : "Staff-entered walk-in or internal payment records."}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center">
                        <Select value={source} onValueChange={(value) => setSource(value as typeof source)}>
                            <SelectTrigger className="w-full rounded-xl md:w-52"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="customer_submission">Customer Submissions</SelectItem>
                                <SelectItem value="admin_manual">Walk-in Manual</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger className="w-full rounded-xl md:w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="staff_verified">Verified</SelectItem>
                                <SelectItem value="applied_to_invoice">Applied</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                {/* Mobile card list */}
                <div className="space-y-2 p-2.5 md:hidden">
                    {isLoading ? (
                        <div className="flex h-28 items-center justify-center rounded-xl bg-slate-50">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    ) : records.length === 0 ? (
                        <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">No manual payments found</div>
                    ) : records.map((record: any) => (
                        <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-bold text-slate-900">{methodLabels[record.method] || record.method}</div>
                                    {DIGITAL_METHODS.includes(record.method) && record.transactionId && (
                                        <div className="mt-1 font-mono text-xs text-slate-500">{record.transactionId}</div>
                                    )}
                                </div>
                                <Badge variant="outline" className={statusColors[record.status]}>{statusLabels[record.status] || record.status}</Badge>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                                <div className="rounded-lg bg-slate-50 p-1.5">
                                    <div className="text-slate-400">Sender</div>
                                    <div className="truncate font-semibold text-slate-800">{record.senderNumber || "-"}</div>
                                </div>
                                <div className="rounded-lg bg-slate-50 p-1.5">
                                    <div className="text-slate-400">Amount</div>
                                    <div className="font-semibold text-slate-800">{getCurrencySymbol()}{Number(record.amount).toLocaleString()}</div>
                                </div>
                                <div className="rounded-lg bg-slate-50 p-1.5">
                                    <div className="text-slate-400">Customer</div>
                                    <div className="truncate font-semibold text-slate-800">{record.customerName || record.customerPhone || "-"}</div>
                                </div>
                                <div className="rounded-lg bg-slate-50 p-1.5">
                                    <div className="text-slate-400">Reference</div>
                                    <div className="truncate font-mono font-semibold text-slate-800">{record.jobTicketId || record.dueRecordId || record.serviceRequestId || "-"}</div>
                                </div>
                            </div>
                            {record.status === "pending" && (
                                <div className="mt-2 grid grid-cols-2 gap-1.5">
                                    <Button size="sm" onClick={() => verifyMutation.mutate(record.id)} disabled={verifyMutation.isPending} className="rounded-xl"><CheckCircle className="w-4 h-4 mr-1" />Verify</Button>
                                    <Button size="sm" variant="outline" onClick={() => setRejectTarget(record)} className="rounded-xl"><XCircle className="w-4 h-4 mr-1" />Reject</Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                {/* Desktop table */}
                <Table className="hidden md:table">
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
                                    {DIGITAL_METHODS.includes(record.method) && record.transactionId && (
                                        <div className="font-mono text-xs">{record.transactionId}</div>
                                    )}
                                    <div className="text-xs text-muted-foreground">{record.senderNumber || "-"}</div>
                                    <div className="text-xs text-muted-foreground">{record.jobTicketId || record.dueRecordId || record.serviceRequestId}</div>
                                </TableCell>
                                <TableCell>
                                    <div>{record.customerName || "-"}</div>
                                    <div className="text-xs text-muted-foreground">{record.customerPhone || record.senderNumber || "-"}</div>
                                </TableCell>
                                <TableCell className="text-right font-semibold">{getCurrencySymbol()}{Number(record.amount).toLocaleString()}</TableCell>
                                <TableCell><Badge variant="outline" className={statusColors[record.status]}>{statusLabels[record.status] || record.status}</Badge></TableCell>
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
