import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Calculator, CheckCircle2, AlertTriangle,
    FileText, User, UserCheck, Download, Search,
    RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { drawerApi } from "@/lib/api";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export function FinancesTabDrawer({ getCurrencySymbol, exportToCSV }: any) {
    const { user } = useAdminAuth();
    const queryClient = useQueryClient();
    const canReconcile = user?.role === 'Admin' || user?.role === 'Super Admin';
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    // Reconciliation Dialog State
    const [reconcileSession, setReconcileSession] = useState<any>(null);
    const [reconcileNotes, setReconcileNotes] = useState("");
    const [expectedCash, setExpectedCash] = useState<number>(0);

    const { data: historyData, isLoading } = useQuery({
        queryKey: ["drawerHistory", page],
        queryFn: () => drawerApi.getHistory(`?page=${page}&limit=20`),
    });

    const reconcileMutation = useMutation({
        mutationFn: (data: { id: string; status: string; notes: string }) =>
            drawerApi.reconcile(data.id, {
                status: data.status,
                notes: data.notes,
                closedBy: user!.id,
                closedByName: user!.name
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["drawerHistory"] });
            toast.success("Drawer session reconciled successfully");
            setReconcileSession(null);
            setReconcileNotes("");
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to reconcile session");
        }
    });

    const handleReconcileSubmit = (status: 'reconciled' | 'discrepancy') => {
        if (!reconcileSession) return;
        reconcileMutation.mutate({
            id: reconcileSession.id,
            status,
            notes: reconcileNotes,
        });
    };

    const handleExport = () => {
        if (!historyData?.items) return;
        const exportData = historyData.items.map((s: any) => ({
            "Session ID": s.id,
            "Status": s.status,
            "Opened At": format(new Date(s.openedAt), "PP p"),
            "Opened By": s.openedByName,
            "Starting Float": s.startingFloat,
            "Declared Cash": s.declaredCash || 0,
            "Closed At": s.closedAt ? format(new Date(s.closedAt), "PP p") : "N/A",
            "Closed By": s.closedByName || "N/A",
            "System Expected": "Hidden for Security", // In a real system, calculate from Transactions
            "Notes": s.notes || ""
        }));
        exportToCSV(exportData, `drawer-history-${format(new Date(), "yyyy-MM-dd")}.csv`);
    };

    const filteredSessions = historyData?.items?.filter((s: any) =>
        s.openedByName?.toLowerCase().includes(search.toLowerCase()) ||
        s.id.toLowerCase().includes(search.toLowerCase())
    ) || [];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search sessions or cashiers..."
                            className="pl-9 bg-slate-50 border-slate-200"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button variant="outline" className="w-full sm:w-auto text-slate-600" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-50 border-b border-slate-200">
                            <TableRow>
                                <TableHead className="font-semibold text-slate-700">Date & Session</TableHead>
                                <TableHead className="font-semibold text-slate-700">Cashier</TableHead>
                                <TableHead className="font-semibold text-slate-700 text-right">Float</TableHead>
                                <TableHead className="font-semibold text-slate-700 text-right">Declared Drop</TableHead>
                                <TableHead className="font-semibold text-slate-700">Status</TableHead>
                                <TableHead className="font-semibold text-slate-700 text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center">
                                        <div className="flex items-center justify-center gap-2 text-slate-500">
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            Loading drawer history...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredSessions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                                        No drawer sessions found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredSessions.map((session: any) => (
                                    <TableRow key={session.id} className="group hover:bg-slate-50 transition-colors">
                                        <TableCell>
                                            <div className="font-medium text-slate-900">
                                                {format(new Date(session.openedAt), "MMM d, yyyy")}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1 font-mono">
                                                ID: {session.id.slice(0, 8)} • {format(new Date(session.openedAt), "h:mm a")}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                    <User className="h-4 w-4" />
                                                </div>
                                                <span className="font-medium text-slate-700">{session.openedByName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium text-slate-600">
                                            {getCurrencySymbol()}{session.startingFloat}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {session.declaredCash !== null ? (
                                                <span className="font-bold text-slate-900">{getCurrencySymbol()}{session.declaredCash}</span>
                                            ) : (
                                                <span className="text-slate-400 italic">Not dropped</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {session.status === 'open' && <Badge variant="default" className="bg-blue-100 text-blue-700 border-blue-200">Open Shift</Badge>}
                                            {session.status === 'counting' && <Badge variant="default" className="bg-amber-100 text-amber-700 border-amber-200">Needs Recon</Badge>}
                                            {session.status === 'reconciled' && <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">Reconciled</Badge>}
                                            {session.status === 'discrepancy' && <Badge variant="default" className="bg-rose-100 text-rose-700 border-rose-200">Discrepancy</Badge>}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {session.status === 'counting' && canReconcile ? (
                                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={() => setReconcileSession(session)}>
                                                    Reconcile
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" className="text-slate-600" onClick={() => {
                                                    setReconcileSession(session);
                                                }}>
                                                    View Details
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Reconciliation / Details Dialog */}
            <Dialog open={!!reconcileSession} onOpenChange={(open) => !open && setReconcileSession(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            {reconcileSession?.status === 'counting' && canReconcile ? (
                                <><Calculator className="h-5 w-5 text-blue-600" /> Reconcile Drawer</>
                            ) : (
                                <><FileText className="h-5 w-5 text-slate-600" /> Session Details</>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            Session ID: <span className="font-mono text-slate-900">{reconcileSession?.id}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Cashier</p>
                                <p className="font-bold text-slate-900">{reconcileSession?.openedByName}</p>
                                <p className="text-xs text-slate-400 mt-1">{reconcileSession?.openedAt && format(new Date(reconcileSession.openedAt), "MMM d, h:mm a")}</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Starting Float</p>
                                <p className="font-bold text-slate-900 text-xl">{getCurrencySymbol()}{reconcileSession?.startingFloat || 0}</p>
                            </div>
                        </div>

                        {/* Counts Comparison */}
                        <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 space-y-4">
                            <div className="flex justify-between items-center border-b border-indigo-100 pb-3">
                                <div>
                                    <p className="font-medium text-indigo-900">Declared by Cashier</p>
                                    <p className="text-xs text-indigo-600">Blind drop count submitted</p>
                                </div>
                                <span className="text-2xl font-black text-indigo-700 tabular-nums">
                                    {getCurrencySymbol()}{reconcileSession?.declaredCash || 0}
                                </span>
                            </div>

                            {/* Manager Input for Expected Cash - Optional feature for future */}
                            {reconcileSession?.status === 'counting' && canReconcile && (
                                <div className="space-y-3 pt-2">
                                    <label className="text-sm font-semibold text-slate-700">Manager Expected Cash (System Calc)</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-slate-500">{getCurrencySymbol()}</span>
                                        </div>
                                        <Input
                                            type="number"
                                            className="pl-8 bg-white"
                                            value={expectedCash || ""}
                                            onChange={(e) => setExpectedCash(parseFloat(e.target.value) || 0)}
                                            placeholder="Enter total expected from system"
                                        />
                                    </div>
                                    {expectedCash > 0 && (
                                        <div className={`p-3 rounded-lg text-sm font-medium flex items-center justify-between ${expectedCash === (reconcileSession?.declaredCash || 0)
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-rose-100 text-rose-800'
                                            }`}>
                                            <span>Difference:</span>
                                            <span>
                                                {expectedCash === (reconcileSession?.declaredCash || 0)
                                                    ? 'Perfect Match ✔'
                                                    : `${getCurrencySymbol()}${Math.abs(expectedCash - (reconcileSession?.declaredCash || 0))} ${expectedCash > (reconcileSession?.declaredCash || 0) ? 'Short' : 'Over'}`
                                                }
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Manager Notes</label>
                            {reconcileSession?.status === 'counting' && canReconcile ? (
                                <Textarea
                                    className="bg-white resize-none h-24"
                                    placeholder="Add notes about any discrepancies, investigations, or sign-offs..."
                                    value={reconcileNotes}
                                    onChange={(e) => setReconcileNotes(e.target.value)}
                                />
                            ) : (
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-slate-600 text-sm min-h-[80px]">
                                    {reconcileSession?.notes || "No notes provided."}
                                </div>
                            )}
                        </div>

                        {/* Sign off status */}
                        {(reconcileSession?.status === 'reconciled' || reconcileSession?.status === 'discrepancy') && (
                            <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 p-3 rounded-lg">
                                <UserCheck className="h-4 w-4 text-slate-500" />
                                <span>Closed by <strong>{reconcileSession?.closedByName}</strong> on {reconcileSession?.closedAt && format(new Date(reconcileSession.closedAt), "MMM d, yyyy")}</span>
                            </div>
                        )}
                    </div>

                    {reconcileSession?.status === 'counting' && canReconcile ? (
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                onClick={() => handleReconcileSubmit('discrepancy')}
                                disabled={reconcileMutation.isPending}
                            >
                                <AlertTriangle className="h-4 w-4 mr-2" /> Mark Discrepancy
                            </Button>
                            <Button
                                type="button"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleReconcileSubmit('reconciled')}
                                disabled={reconcileMutation.isPending}
                            >
                                <CheckCircle2 className="h-4 w-4 mr-2" /> Approve & Reconcile
                            </Button>
                        </DialogFooter>
                    ) : (
                        <DialogFooter>
                            <Button type="button" onClick={() => setReconcileSession(null)}>Close</Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
