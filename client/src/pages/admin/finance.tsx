import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pettyCashApi, dueRecordsApi, posTransactionsApi, settingsApi } from "@/lib/api";
import { Plus, TrendingUp, TrendingDown, DollarSign, AlertCircle, Loader2, Wallet, FileText, ShoppingCart, Banknote, CreditCard, Smartphone, Clock, Eye, Printer, Search, Filter, X } from "lucide-react";
import { Invoice, PrintStyles } from "@/components/print";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useRef } from "react";
import type { InsertPettyCashRecord, InsertDueRecord } from "@shared/schema";
import { format } from "date-fns";

export default function AdminFinancePage() {
  const queryClient = useQueryClient();
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [isPettyCashDialogOpen, setIsPettyCashDialogOpen] = useState(false);
  const [isDueDialogOpen, setIsDueDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [selectedSaleTransaction, setSelectedSaleTransaction] = useState<any>(null);

  // Search and filter state for Sales tab
  const [salesSearch, setSalesSearch] = useState("");
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<string>("all");

  // Search and filter state for Petty Cash tab
  const [pettyCashSearch, setPettyCashSearch] = useState("");
  const [pettyCashTypeFilter, setPettyCashTypeFilter] = useState<string>("all");

  // Search and filter state for Due Records tab
  const [dueSearch, setDueSearch] = useState("");
  const [dueStatusFilter, setDueStatusFilter] = useState<string>("all");

  // Partial payment dialog state
  const [isSettleDialogOpen, setIsSettleDialogOpen] = useState(false);
  const [selectedDueRecord, setSelectedDueRecord] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");

  const [pettyCashForm, setPettyCashForm] = useState({
    description: "",
    category: "",
    amount: "",
    type: "Income",
  });

  const [dueForm, setDueForm] = useState({
    customer: "",
    amount: "",
    status: "Pending",
    invoice: "",
    dueDate: new Date(),
  });

  const { data: pettyCashRecords = [], isLoading: isPettyCashLoading } = useQuery({
    queryKey: ["pettyCash"],
    queryFn: pettyCashApi.getAll,
  });

  const { data: dueRecords = [], isLoading: isDueRecordsLoading } = useQuery({
    queryKey: ["dueRecords"],
    queryFn: dueRecordsApi.getAll,
  });

  const { data: posTransactions = [], isLoading: isPosLoading } = useQuery({
    queryKey: ["pos-transactions"],
    queryFn: posTransactionsApi.getAll,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
  });

  const getCurrencySymbol = () => {
    const currencySetting = settings?.find(s => s.key === "currency_symbol");
    return currencySetting?.value || "৳";
  };

  const getCompanyInfo = () => {
    const getSettingValue = (key: string, defaultValue: string) => {
      const setting = settings?.find((s) => s.key === key);
      return setting?.value || defaultValue;
    };
    return {
      name: getSettingValue("site_name", "PROMISE ELECTRONICS"),
      logo: getSettingValue("logo_url", ""),
      address: getSettingValue("company_address", "Dhaka, Bangladesh"),
      phone: getSettingValue("support_phone", "+880 1700-000000"),
      email: getSettingValue("company_email", "support@promise-electronics.com"),
      website: getSettingValue("company_website", "www.promise-electronics.com"),
    };
  };

  const parseTransactionForPrint = (transaction: any) => {
    let parsedItems = [];
    if (transaction.items) {
      try {
        parsedItems = typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items;
      } catch {
        parsedItems = [];
      }
    }
    return {
      id: transaction.id,
      invoiceNumber: transaction.invoiceNumber,
      customer: transaction.customer,
      items: parsedItems,
      linkedJobs: [],
      subtotal: transaction.subtotal,
      tax: transaction.tax,
      discount: transaction.discount || "0",
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      paymentStatus: transaction.paymentStatus || (transaction.paymentMethod === "Due" ? "Due" : "Paid"),
      createdAt: transaction.createdAt,
    };
  };

  const handlePrintInvoice = () => {
    if (!invoiceRef.current) return;
    const printContent = invoiceRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invoice - ${selectedSaleTransaction?.id}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: Arial, sans-serif; }
              .text-primary { color: #0ea5e9; }
              .text-gray-600, .text-gray-500 { color: #6b7280; }
              .text-gray-800 { color: #1f2937; }
              .text-green-600 { color: #16a34a; }
              .font-bold { font-weight: 700; }
              .font-semibold { font-weight: 600; }
              .font-medium { font-weight: 500; }
              .text-xs { font-size: 0.75rem; }
              .text-sm { font-size: 0.875rem; }
              .text-lg { font-size: 1.125rem; }
              .text-xl { font-size: 1.25rem; }
              .text-2xl { font-size: 1.5rem; }
              .text-3xl { font-size: 1.875rem; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .text-left { text-align: left; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              .justify-end { justify-content: flex-end; }
              .items-start { align-items: flex-start; }
              .items-center { align-items: center; }
              .gap-4 { gap: 1rem; }
              .gap-8 { gap: 2rem; }
              .grid { display: grid; }
              .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
              .mb-2 { margin-bottom: 0.5rem; }
              .mb-4 { margin-bottom: 1rem; }
              .mb-8 { margin-bottom: 2rem; }
              .mt-2 { margin-top: 0.5rem; }
              .mt-8 { margin-top: 2rem; }
              .ml-auto { margin-left: auto; }
              .p-8 { padding: 2rem; }
              .py-2, .py-3 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
              .px-3, .px-4 { padding-left: 0.75rem; padding-right: 0.75rem; }
              .pb-6, .pt-6 { padding: 1.5rem 0; }
              .pt-2, .pt-4 { padding-top: 0.5rem; }
              .border { border: 1px solid #e5e7eb; }
              .border-b { border-bottom: 1px solid #e5e7eb; }
              .border-t { border-top: 1px solid #e5e7eb; }
              .border-t-2 { border-top: 2px solid #1f2937; }
              .bg-gray-100 { background-color: #f3f4f6; }
              .rounded { border-radius: 0.25rem; }
              .w-full { width: 100%; }
              .h-16 { height: 4rem; }
              .w-16 { width: 4rem; }
              .object-contain { object-fit: contain; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 0.75rem 1rem; }
              .uppercase { text-transform: uppercase; }
              .font-mono { font-family: monospace; }
              @page { size: A4; margin: 10mm; }
              @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <div style="padding: 2rem; max-width: 210mm; margin: 0 auto;">
              ${printContent}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const createPettyCashMutation = useMutation({
    mutationFn: pettyCashApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
      toast.success("Transaction added successfully");
      setIsPettyCashDialogOpen(false);
      resetPettyCashForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add transaction");
    },
  });

  const deletePettyCashMutation = useMutation({
    mutationFn: pettyCashApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
      toast.success("Transaction deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete transaction");
    },
  });

  const createDueMutation = useMutation({
    mutationFn: dueRecordsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
      toast.success("Due record added successfully");
      setIsDueDialogOpen(false);
      resetDueForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add due record");
    },
  });

  const updateDueMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertDueRecord> }) =>
      dueRecordsApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
      queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
      queryClient.invalidateQueries({ queryKey: ["pos-transactions"] });

      if (data.status === "Paid") {
        toast.success("Payment fully settled");
      } else {
        toast.success("Partial payment recorded");
      }
      setIsSettleDialogOpen(false);
      setSelectedDueRecord(null);
      setPaymentAmount("");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to settle payment");
    },
  });

  const resetPettyCashForm = () => {
    setPettyCashForm({
      description: "",
      category: "",
      amount: "",
      type: "Income",
    });
  };

  const resetDueForm = () => {
    setDueForm({
      customer: "",
      amount: "",
      status: "Pending",
      invoice: "",
      dueDate: new Date(),
    });
  };

  const handleOpenSettleDialog = (record: any) => {
    setSelectedDueRecord(record);
    setPaymentAmount("");
    setPaymentMethod("Cash");
    setIsSettleDialogOpen(true);
  };

  const handleSettlePayment = () => {
    if (!selectedDueRecord) return;

    const paidStr = paymentAmount.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(paidStr)) {
      toast.error("Please enter a valid amount (max 2 decimal places)");
      return;
    }

    const remainingAmount = Number(selectedDueRecord.amount) - Number(selectedDueRecord.paidAmount || 0);
    const remainingAmountCents = Math.round(remainingAmount * 100);
    const paidAmountCents = Math.round(Number(paidStr) * 100);

    if (paidAmountCents <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    if (paidAmountCents > remainingAmountCents) {
      toast.error(`Payment amount cannot exceed remaining due (${getCurrencySymbol()}${remainingAmount})`);
      return;
    }

    // Send payment details to server (it handles logic)
    updateDueMutation.mutate({
      id: selectedDueRecord.id,
      data: {
        paymentAmount: paidStr,
        paymentMethod: paymentMethod
      } as any
    });
  };


  const isIncome = (type: string) => ["Income", "Cash", "Bank", "bKash", "Nagad"].includes(type);

  const cashInHand = pettyCashRecords.reduce((sum, record) => {
    const amount = Number(record.amount);
    return sum + (isIncome(record.type) ? amount : -amount);
  }, 0);

  const today = new Date().toISOString().split('T')[0];
  const todayIncome = pettyCashRecords
    .filter(r => r.createdAt && r.createdAt.toString().startsWith(today) && isIncome(r.type))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const todayExpense = pettyCashRecords
    .filter(r => r.createdAt && r.createdAt.toString().startsWith(today) && r.type === "Expense")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const totalDue = dueRecords
    .filter(r => r.status !== "Paid")
    .reduce((sum, r) => sum + (Number(r.amount) - Number(r.paidAmount || 0)), 0);

  const salesByMethod = {
    Cash: posTransactions.filter(t => t.paymentMethod === "Cash").reduce((sum, t) => sum + Number(t.total), 0),
    Bank: posTransactions.filter(t => t.paymentMethod === "Bank").reduce((sum, t) => sum + Number(t.total), 0),
    bKash: posTransactions.filter(t => t.paymentMethod === "bKash").reduce((sum, t) => sum + Number(t.total), 0),
    Nagad: posTransactions.filter(t => t.paymentMethod === "Nagad").reduce((sum, t) => sum + Number(t.total), 0),
    Due: posTransactions.filter(t => t.paymentMethod === "Due").reduce((sum, t) => sum + Number(t.total), 0),
  };
  const totalSales = posTransactions.reduce((sum, t) => sum + Number(t.total), 0);
  const paidSales = totalSales - salesByMethod.Due;

  // Filter sales transactions
  const filteredSales = posTransactions.filter((t) => {
    const matchesSearch = salesSearch === "" ||
      t.invoiceNumber?.toLowerCase().includes(salesSearch.toLowerCase()) ||
      t.customer?.toLowerCase().includes(salesSearch.toLowerCase());
    const matchesPayment = salesPaymentFilter === "all" || t.paymentMethod === salesPaymentFilter;
    return matchesSearch && matchesPayment;
  });

  // Filter petty cash records
  const filteredPettyCash = pettyCashRecords.filter((r) => {
    const matchesSearch = pettyCashSearch === "" ||
      r.description?.toLowerCase().includes(pettyCashSearch.toLowerCase()) ||
      r.category?.toLowerCase().includes(pettyCashSearch.toLowerCase());
    const matchesType = pettyCashTypeFilter === "all" || r.type === pettyCashTypeFilter;
    return matchesSearch && matchesType;
  });

  // Filter due records
  const filteredDueRecords = dueRecords.filter((r) => {
    const matchesSearch = dueSearch === "" ||
      r.customer?.toLowerCase().includes(dueSearch.toLowerCase()) ||
      r.invoice?.toLowerCase().includes(dueSearch.toLowerCase());
    const matchesStatus = dueStatusFilter === "all" || r.status === dueStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">Finance & Accounts</h1>
          <p className="text-muted-foreground">Manage petty cash, expenses, and track due payments.</p>
        </div>

        <Tabs defaultValue="sales" className="w-full">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-6">
            <TabsTrigger value="sales" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-sales">Sales</TabsTrigger>
            <TabsTrigger value="petty-cash" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-petty-cash">Petty Cash</TabsTrigger>
            <TabsTrigger value="due-records" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 py-2" data-testid="tab-due-records">Due Records</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card data-testid="card-total-sales">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-sales">{getCurrencySymbol()}{totalSales.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{posTransactions.length} transactions</p>
                </CardContent>
              </Card>
              <Card data-testid="card-cash-sales">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cash</CardTitle>
                  <Banknote className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-green-600" data-testid="text-cash-sales">{getCurrencySymbol()}{salesByMethod.Cash.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card data-testid="card-bank-sales">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Bank</CardTitle>
                  <CreditCard className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-blue-600" data-testid="text-bank-sales">{getCurrencySymbol()}{salesByMethod.Bank.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card data-testid="card-bkash-sales">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">bKash</CardTitle>
                  <Smartphone className="h-4 w-4 text-pink-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-pink-600" data-testid="text-bkash-sales">{getCurrencySymbol()}{salesByMethod.bKash.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card data-testid="card-nagad-sales">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Nagad</CardTitle>
                  <Smartphone className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-orange-600" data-testid="text-nagad-sales">{getCurrencySymbol()}{salesByMethod.Nagad.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card data-testid="card-due-sales">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Due (Credit)</CardTitle>
                  <Clock className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-red-600" data-testid="text-due-sales">{getCurrencySymbol()}{salesByMethod.Due.toLocaleString()}</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
              <div className="relative flex-1 w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice or customer..."
                  className="pl-9"
                  data-testid="input-sales-search"
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Select value={salesPaymentFilter} onValueChange={setSalesPaymentFilter}>
                  <SelectTrigger className="w-[140px]" data-testid="select-sales-payment-filter">
                    <SelectValue placeholder="All Payments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payments</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="bKash">bKash</SelectItem>
                    <SelectItem value="Nagad">Nagad</SelectItem>
                    <SelectItem value="Due">Due</SelectItem>
                  </SelectContent>
                </Select>
                {(salesSearch || salesPaymentFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={() => { setSalesSearch(""); setSalesPaymentFilter("all"); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPosLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">Loading sales...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8" data-testid="empty-state-sales">
                        <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {posTransactions.length === 0 ? "No sales recorded yet" : "No sales match your search or filters"}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSales.slice(0, 50).map((transaction: any) => (
                      <TableRow key={transaction.id} data-testid={`row-sale-${transaction.id}`}>
                        <TableCell className="font-mono text-sm" data-testid={`text-invoice-${transaction.id}`}>
                          {transaction.invoiceNumber || transaction.id}
                        </TableCell>
                        <TableCell data-testid={`text-sale-date-${transaction.id}`}>
                          {transaction.createdAt ? format(new Date(transaction.createdAt), 'yyyy-MM-dd HH:mm') : 'N/A'}
                        </TableCell>
                        <TableCell data-testid={`text-customer-${transaction.id}`}>
                          {transaction.customer || 'Walk-in'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              transaction.paymentMethod === "Cash" ? "border-green-500 text-green-600" :
                                transaction.paymentMethod === "Bank" ? "border-blue-500 text-blue-600" :
                                  transaction.paymentMethod === "bKash" ? "border-pink-500 text-pink-600" :
                                    transaction.paymentMethod === "Nagad" ? "border-orange-500 text-orange-600" :
                                      "border-red-500 text-red-600"
                            }
                            data-testid={`badge-payment-${transaction.id}`}
                          >
                            {transaction.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={transaction.paymentStatus === "Paid" ? "default" : "destructive"}
                            data-testid={`badge-status-${transaction.id}`}
                          >
                            {transaction.paymentStatus === "Paid" ? "Paid" : "Due"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold" data-testid={`text-sale-amount-${transaction.id}`}>
                          {getCurrencySymbol()}{Number(transaction.total).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedSaleTransaction(parseTransactionForPrint(transaction));
                              setIsInvoiceDialogOpen(true);
                            }}
                            data-testid={`button-view-invoice-${transaction.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-invoice-preview">
                <DialogHeader>
                  <DialogTitle>Invoice Preview</DialogTitle>
                </DialogHeader>
                {selectedSaleTransaction && (
                  <div ref={invoiceRef}>
                    <Invoice data={selectedSaleTransaction} company={getCompanyInfo()} />
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(false)} data-testid="button-close-invoice">
                    Close
                  </Button>
                  <Button onClick={handlePrintInvoice} data-testid="button-print-invoice">
                    <Printer className="h-4 w-4 mr-2" /> Print
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="petty-cash" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card data-testid="card-cash-in-hand">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cash in Hand</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-cash-in-hand">{getCurrencySymbol()}{cashInHand.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card data-testid="card-today-income">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Today's Income</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-today-income">+{getCurrencySymbol()}{todayIncome.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card data-testid="card-today-expense">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Today's Expense</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600" data-testid="text-today-expense">-{getCurrencySymbol()}{todayExpense.toLocaleString()}</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
              <div className="relative flex-1 w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by description or category..."
                  className="pl-9"
                  data-testid="input-petty-cash-search"
                  value={pettyCashSearch}
                  onChange={(e) => setPettyCashSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Select value={pettyCashTypeFilter} onValueChange={setPettyCashTypeFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-petty-cash-type-filter">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Income">Income</SelectItem>
                    <SelectItem value="Expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                {(pettyCashSearch || pettyCashTypeFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={() => { setPettyCashSearch(""); setPettyCashTypeFilter("all"); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Transaction History</h2>
              <Dialog open={isPettyCashDialogOpen} onOpenChange={setIsPettyCashDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-transaction">
                    <Plus className="w-4 h-4 mr-2" /> Add Transaction
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Transaction</DialogTitle>
                    <DialogDescription>Record a new income or expense.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="type">Type</Label>
                      <Select
                        value={pettyCashForm.type}
                        onValueChange={(value: "Income" | "Expense") => setPettyCashForm({ ...pettyCashForm, type: value })}
                      >
                        <SelectTrigger data-testid="select-transaction-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Income">Income</SelectItem>
                          <SelectItem value="Expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        data-testid="input-description"
                        placeholder="Service Charge - Job #8892"
                        value={pettyCashForm.description}
                        onChange={(e) => setPettyCashForm({ ...pettyCashForm, description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        data-testid="input-category"
                        placeholder="Service / Food / Transport"
                        value={pettyCashForm.category}
                        onChange={(e) => setPettyCashForm({ ...pettyCashForm, category: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amount">Amount ({getCurrencySymbol()})</Label>
                      <Input
                        id="amount"
                        data-testid="input-amount"
                        type="number"
                        placeholder="1500"
                        value={pettyCashForm.amount}
                        onChange={(e) => setPettyCashForm({ ...pettyCashForm, amount: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsPettyCashDialogOpen(false)} data-testid="button-cancel-transaction">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createPettyCashMutation.mutate({
                        ...pettyCashForm,
                        amount: Number(pettyCashForm.amount) || 0
                      } as InsertPettyCashRecord)}
                      disabled={createPettyCashMutation.isPending}
                      data-testid="button-submit-transaction"
                    >
                      {createPettyCashMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add Transaction
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isPettyCashLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">Loading transactions...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredPettyCash.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8" data-testid="empty-state-petty-cash">
                        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {pettyCashRecords.length === 0 ? "No transactions recorded" : "No transactions match your search or filters"}
                        </p>
                        {pettyCashRecords.length === 0 && (
                          <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => setIsPettyCashDialogOpen(true)}
                            data-testid="button-add-first-transaction"
                          >
                            <Plus className="w-4 h-4 mr-2" /> Add Your First Transaction
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPettyCash.map((record) => (
                      <TableRow key={record.id} data-testid={`row-transaction-${record.id}`}>
                        <TableCell data-testid={`text-date-${record.id}`}>
                          {record.createdAt ? format(new Date(record.createdAt), 'yyyy-MM-dd') : 'N/A'}
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-description-${record.id}`}>
                          {record.description}
                        </TableCell>
                        <TableCell data-testid={`text-category-${record.id}`}>{record.category}</TableCell>
                        <TableCell>
                          <Badge variant={isIncome(record.type) ? "default" : "destructive"} data-testid={`badge-type-${record.id}`}>
                            {record.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-bold ${isIncome(record.type) ? "text-green-600" : "text-red-600"}`} data-testid={`text-amount-${record.id}`}>
                          {isIncome(record.type) ? "+" : "-"}{getCurrencySymbol()}{Number(record.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTransaction(record);
                              setIsDetailDialogOpen(true);
                            }}
                            data-testid={`button-view-details-${record.id}`}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
              <DialogContent data-testid="dialog-transaction-details">
                <DialogHeader>
                  <DialogTitle>Transaction Details</DialogTitle>
                </DialogHeader>
                {selectedTransaction && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Type</p>
                        <Badge variant={selectedTransaction.type === "Income" ? "default" : "destructive"} className="mt-1">
                          {selectedTransaction.type}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium mt-1">{selectedTransaction.createdAt ? format(new Date(selectedTransaction.createdAt), 'yyyy-MM-dd HH:mm') : 'N/A'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="font-medium mt-1">{selectedTransaction.description}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Category</p>
                      <p className="font-medium mt-1">{selectedTransaction.category}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-md">
                      <p className="text-xs text-muted-foreground">Amount</p>
                      <p className={`text-2xl font-bold mt-1 ${selectedTransaction.type === "Income" ? "text-green-600" : "text-red-600"}`}>
                        {selectedTransaction.type === "Income" ? "+" : "-"}{getCurrencySymbol()}{Number(selectedTransaction.amount).toLocaleString()}
                      </p>
                    </div>

                    {/* Due Record Details */}
                    {selectedTransaction.dueRecordId && dueRecords.find((d: any) => d.id === selectedTransaction.dueRecordId) && (
                      <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                        <h4 className="text-sm font-semibold text-blue-800 mb-2">Due Status</h4>
                        {(() => {
                          const dueRecord = dueRecords.find((d: any) => d.id === selectedTransaction.dueRecordId);
                          if (!dueRecord) return null;
                          const total = Number(dueRecord.amount);
                          const paid = Number(dueRecord.paidAmount || 0);
                          const remaining = total - paid;
                          return (
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Total Due</p>
                                <p className="font-medium text-red-600">-{getCurrencySymbol()}{total.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Total Paid</p>
                                <p className="font-medium text-green-600">+{getCurrencySymbol()}{paid.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Remaining</p>
                                <p className="font-bold text-red-600">{remaining > 0 ? "-" : ""}{getCurrencySymbol()}{remaining.toLocaleString()}</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}


                  </div>
                )}
                <DialogFooter>
                  <Button onClick={() => setIsDetailDialogOpen(false)} data-testid="button-close-details">
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="due-records" className="mt-6 space-y-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-lg border shadow-sm">
              <div className="relative flex-1 w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer or invoice..."
                  className="pl-9"
                  data-testid="input-due-search"
                  value={dueSearch}
                  onChange={(e) => setDueSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Select value={dueStatusFilter} onValueChange={setDueStatusFilter}>
                  <SelectTrigger className="w-[130px]" data-testid="select-due-status-filter">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
                {(dueSearch || dueStatusFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={() => { setDueSearch(""); setDueStatusFilter("all"); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">Outstanding Payments</h2>
                <p className="text-sm text-muted-foreground">Total Due: <span className="font-bold text-destructive" data-testid="text-total-due">{getCurrencySymbol()}{totalDue.toLocaleString()}</span></p>
              </div>
              <Dialog open={isDueDialogOpen} onOpenChange={setIsDueDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-due">
                    <Plus className="w-4 h-4 mr-2" /> Record New Due
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record New Due</DialogTitle>
                    <DialogDescription>Add a new outstanding payment record.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoice">Invoice Reference</Label>
                      <Input
                        id="invoice"
                        data-testid="input-invoice"
                        placeholder="INV-8821"
                        value={dueForm.invoice}
                        onChange={(e) => setDueForm({ ...dueForm, invoice: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer">Customer / Corporate</Label>
                      <Input
                        id="customer"
                        data-testid="input-customer"
                        placeholder="Karim Uddin"
                        value={dueForm.customer}
                        onChange={(e) => setDueForm({ ...dueForm, customer: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="due-amount">Amount ({getCurrencySymbol()})</Label>
                      <Input
                        id="due-amount"
                        data-testid="input-due-amount"
                        type="number"
                        placeholder="5000"
                        value={dueForm.amount}
                        onChange={(e) => setDueForm({ ...dueForm, amount: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="due-date">Due Date</Label>
                      <Input
                        id="due-date"
                        data-testid="input-due-date"
                        type="date"
                        value={format(new Date(dueForm.dueDate), 'yyyy-MM-dd')}
                        onChange={(e) => setDueForm({ ...dueForm, dueDate: new Date(e.target.value) })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDueDialogOpen(false)} data-testid="button-cancel-due">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createDueMutation.mutate({
                        ...dueForm,
                        amount: Number(dueForm.amount) || 0
                      } as InsertDueRecord)}
                      disabled={createDueMutation.isPending}
                      data-testid="button-submit-due"
                    >
                      {createDueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Record Due
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="rounded-md border bg-white shadow-sm overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead>Invoice Ref</TableHead>
                    <TableHead>Customer / Corporate</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount Due</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isDueRecordsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">Loading due records...</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredDueRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8" data-testid="empty-state-due-records">
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {dueRecords.length === 0 ? "No due records" : "No due records match your search or filters"}
                        </p>
                        {dueRecords.length === 0 && (
                          <Button
                            variant="outline"
                            className="mt-4"
                            onClick={() => setIsDueDialogOpen(true)}
                            data-testid="button-add-first-due"
                          >
                            <Plus className="w-4 h-4 mr-2" /> Record Your First Due
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDueRecords.map((record) => (
                      <TableRow key={record.id} data-testid={`row-due-${record.id}`}>
                        <TableCell className="font-mono" data-testid={`text-invoice-${record.id}`}>{record.invoice}</TableCell>
                        <TableCell className="font-medium" data-testid={`text-customer-${record.id}`}>{record.customer}</TableCell>
                        <TableCell data-testid={`text-due-date-${record.id}`}>
                          {record.dueDate ? format(new Date(record.dueDate), 'yyyy-MM-dd') : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={record.status === "Overdue" ? "destructive" : record.status === "Paid" ? "default" : "secondary"} data-testid={`badge-status-${record.id}`}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold" data-testid={`text-due-amount-${record.id}`}>
                          {getCurrencySymbol()}{(Number(record.amount) - Number(record.paidAmount || 0)).toLocaleString()}
                          {Number(record.paidAmount) > 0 && (
                            <span className="block text-xs text-muted-foreground font-normal">
                              (Total: {getCurrencySymbol()}{Number(record.amount).toLocaleString()})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.status !== "Paid" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSettleDialog(record)}
                              data-testid={`button-settle-${record.id}`}
                            >
                              Settle Payment
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isSettleDialogOpen} onOpenChange={setIsSettleDialogOpen}>
        <DialogContent data-testid="dialog-settle-payment">
          <DialogHeader>
            <DialogTitle>Settle Payment</DialogTitle>
            <DialogDescription>
              Enter the amount being paid. You can make a partial or full payment.
            </DialogDescription>
          </DialogHeader>
          {selectedDueRecord && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedDueRecord.customer}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Invoice</p>
                  <p className="font-mono">{selectedDueRecord.invoice}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">
                    {selectedDueRecord.dueDate
                      ? format(new Date(selectedDueRecord.dueDate), 'yyyy-MM-dd')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding Amount</p>
                  <p className="font-bold text-lg text-destructive">
                    {getCurrencySymbol()}{(Number(selectedDueRecord.amount) - Number(selectedDueRecord.paidAmount || 0)).toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      (of {getCurrencySymbol()}{Number(selectedDueRecord.amount).toLocaleString()})
                    </span>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-amount">Payment Amount ({getCurrencySymbol()})</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  placeholder="Enter amount received"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  data-testid="input-payment-amount"
                />
                {paymentAmount && Number(paymentAmount) > 0 && (
                  <div className="text-sm">
                    {Number(paymentAmount) >= (Number(selectedDueRecord.amount) - Number(selectedDueRecord.paidAmount || 0)) ? (
                      <p className="text-green-600">Full payment - will mark as Paid</p>
                    ) : (
                      <p className="text-blue-600">
                        Remaining after payment: {getCurrencySymbol()}{(Number(selectedDueRecord.amount) - Number(paymentAmount)).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment-method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="bKash">bKash</SelectItem>
                    <SelectItem value="Nagad">Nagad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSettleDialogOpen(false)}
              data-testid="button-cancel-settle"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSettlePayment}
              disabled={updateDueMutation.isPending || !paymentAmount}
              data-testid="button-confirm-settle"
            >
              {updateDueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
