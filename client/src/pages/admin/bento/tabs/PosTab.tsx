import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintStyles } from "@/components/print";
import { Search, UserPlus, Trash2, CreditCard, Plus, ShoppingCart, Package, Loader2, Minus, FileText, Banknote, Smartphone, Clock, Shield, ChevronDown, Link, ListPlus, X, Landmark, ScanBarcode, LockKeyhole, AlertTriangle, TrendingDown, TrendingUp, Equal } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, jobTicketsApi, posTransactionsApi, settingsApi, adminCustomersApi, drawerApi } from "@/lib/api";
import { toast } from "sonner";
import { CartItem, LinkedJobCharge, TransactionData, PAYMENT_METHODS, parseImages } from "./pos/pos-types";
import { CustomerDialog, JobLinkDialog, InventoryDialog, SuccessDialog, InvoicePreviewDialog, ReceiptPreviewDialog, HistoryDialog, RefundDialog } from "./pos/PosDialogs";
import { containerVariants, itemVariants, bounceItemVariants, BentoCard } from "../shared";
import { DrawerModals } from "@/components/admin/DrawerModals";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function PosTab() {
    const queryClient = useQueryClient();
    const [isMobile, setIsMobile] = useState(false);
    const { user } = useAdminAuth();

    // Drawer state
    const { data: activeDrawer, isLoading: drawerLoading } = useQuery({
        queryKey: ["activeDrawer"],
        queryFn: drawerApi.getActive
    });
    const [drawerModalType, setDrawerModalType] = useState<'open' | 'drop' | null>(null);

    // Cart & checkout state
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [linkedJobCharges, setLinkedJobCharges] = useState<LinkedJobCharge[]>([]);
    const [selectedInventory, setSelectedInventory] = useState<{ id: string; qty: number }[]>([]);
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerAddress, setCustomerAddress] = useState("");
    const [discount, setDiscount] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState("Cash");
    const [productSearch, setProductSearch] = useState("");
    const [isPaymentExpanded, setIsPaymentExpanded] = useState(false);

    // Dialog state
    const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
    const [isJobDialogOpen, setIsJobDialogOpen] = useState(false);
    const [isInventoryDialogOpen, setIsInventoryDialogOpen] = useState(false);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [showInvoicePreview, setShowInvoicePreview] = useState(false);
    const [showReceiptPreview, setShowReceiptPreview] = useState(false);
    const [showHistoryDialog, setShowHistoryDialog] = useState(false);
    const [showRefundDialog, setShowRefundDialog] = useState(false);
    const [refundTransaction, setRefundTransaction] = useState<any>(null);
    const [lastTransaction, setLastTransaction] = useState<TransactionData | null>(null);

    // Mobile cart drawer
    const [mobileCartOpen, setMobileCartOpen] = useState(false);

    // Barcode scanning
    const [barcodeBuffer, setBarcodeBuffer] = useState("");
    const lastKeyTimeRef = useRef(0);
    const barcodeTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ── Data Queries ──
    const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ["products"], queryFn: inventoryApi.getAll });
    const { data: inventoryItems, isLoading: inventoryLoading } = useQuery({ queryKey: ["inventory"], queryFn: inventoryApi.getAll });
    const { data: jobTickets, isLoading: jobsLoading } = useQuery({ queryKey: ["jobTickets"], queryFn: () => jobTicketsApi.getAll() });
    const { data: posTransactions } = useQuery({ queryKey: ["pos-transactions"], queryFn: () => posTransactionsApi.getAll() });
    const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: settingsApi.getAll });
    const { data: customers, isLoading: customersLoading } = useQuery({ queryKey: ["admin-customers"], queryFn: adminCustomersApi.getAll });

    const jobsList = Array.isArray(jobTickets) ? jobTickets : (jobTickets?.items || []);
    const billableJobs = jobsList.filter((job: any) => ["Completed", "Delivered", "Ready for Delivery"].includes(job.status));
    const serviceItems = inventoryItems?.filter((item: any) => item.itemType === "service") || [];

    // ── Helpers ──
    const getCurrencySymbol = () => { const s = settings?.find((s: any) => s.key === "currency_symbol"); return s?.value || "৳"; };
    const getSettingValue = (key: string, def: string) => { const s = settings?.find((s: any) => s.key === key); return s?.value || def; };
    const getVatPercentage = () => parseFloat(getSettingValue("vat_percentage", "5"));
    const getCompanyInfo = () => ({
        name: getSettingValue("site_name", "PROMISE ELECTRONICS"), logo: getSettingValue("logo_url", ""),
        address: getSettingValue("company_address", "Dhaka, Bangladesh"), phone: getSettingValue("support_phone", "+880 1700-000000"),
        email: getSettingValue("company_email", "support@promise-electronics.com"), website: getSettingValue("company_website", "www.promise-electronics.com"),
    });

    // ── Effects ──
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        check(); window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    // Navigation state from Cashier Dashboard
    useEffect(() => {
        const state = history.state;
        if (state?.linkedJobId) {
            setCustomerName(state.customerName || "");
            setCustomerPhone(state.customerPhone || "");
            setLinkedJobCharges([{
                jobId: state.linkedJobId, serviceItemId: null, serviceItemName: null,
                minPrice: 0, maxPrice: 0, billedAmount: state.prefilledAmount || 0,
                isValid: true, customerName: state.customerName, customerPhone: state.customerPhone, customerAddress: null,
            }]);
            toast.success(`Loaded linked job #${state.linkedJobId}`);
        }
    }, []);

    // ── Cart Logic ──
    const addToCart = (item: CartItem) => {
        setCartItems(prev => {
            const existing = prev.find(c => c.id === item.id);
            if (existing) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
            return [...prev, { ...item, quantity: 1 }];
        });
    };

    const removeFromCart = (id: string) => setCartItems(prev => prev.filter(i => i.id !== id));
    const updateCartItemQuantity = (id: string, qty: number) => { if (qty <= 0) { removeFromCart(id); return; } setCartItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i)); };

    // ── Job Linking ──
    const handleJobSelection = (jobId: string, checked: boolean) => {
        if (checked) {
            const job = billableJobs.find((j: any) => j.id === jobId);
            setLinkedJobCharges(prev => [...prev, {
                jobId, serviceItemId: null, serviceItemName: null, minPrice: 0, maxPrice: 0, billedAmount: 0, isValid: false,
                customerName: job?.customer || null, customerPhone: job?.customerPhone || null,
                customerAddress: job?.customerAddress || null, assistedByNames: job?.assistedByNames || null,
            }]);
        } else {
            setLinkedJobCharges(prev => prev.filter(j => j.jobId !== jobId));
        }
    };

    const handleServiceItemSelect = (jobId: string, serviceItemId: string) => {
        const si = serviceItems?.find((s: any) => s.id === serviceItemId);
        if (!si) return;
        const minP = si.minPrice ?? si.price ?? 0;
        const maxP = si.maxPrice ?? si.price ?? 0;
        setLinkedJobCharges(prev => prev.map(j => j.jobId === jobId ? { ...j, serviceItemId, serviceItemName: si.name, minPrice: minP, maxPrice: maxP || minP, billedAmount: minP, isValid: true } : j));
    };

    const handleBilledAmountChange = (jobId: string, amount: number) => {
        setLinkedJobCharges(prev => prev.map(j => {
            if (j.jobId !== jobId) return j;
            return { ...j, billedAmount: amount, isValid: amount >= j.minPrice && amount <= j.maxPrice };
        }));
    };

    // ── Inventory Selection ──
    const handleInventorySelection = (id: string, qty: number) => {
        if (qty <= 0) { setSelectedInventory(prev => prev.filter(i => i.id !== id)); return; }
        setSelectedInventory(prev => { const ex = prev.find(i => i.id === id); if (ex) return prev.map(i => i.id === id ? { ...i, qty } : i); return [...prev, { id, qty }]; });
    };

    const handleAddInventoryToCart = () => {
        if (!inventoryItems) return;
        selectedInventory.forEach(sel => {
            const item = inventoryItems.find((inv: any) => inv.id === sel.id);
            if (item) {
                const imgs = parseImages(item.images);
                const ci: CartItem = { id: item.id, name: item.name, price: String(item.price), quantity: sel.qty, image: imgs[0] };
                setCartItems(prev => { const ex = prev.find(c => c.id === item.id); if (ex) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + sel.qty } : c); return [...prev, ci]; });
            }
        });
        setSelectedInventory([]); setIsInventoryDialogOpen(false);
        toast.success(`Added ${selectedInventory.length} item(s) to cart`);
    };

    // ── Customer ──
    const handleSelectCustomer = (c: any) => { setCustomerName(c.name || ""); setCustomerPhone(c.phone || ""); setCustomerAddress(c.address || ""); setIsCustomerDialogOpen(false); toast.success("Customer details added"); };

    // ── Barcode Scanner ──
    const handleProductSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value; const now = Date.now();
        const isRapid = now - lastKeyTimeRef.current < 50; lastKeyTimeRef.current = now;
        setProductSearch(value);
        if (isRapid) setBarcodeBuffer(prev => prev + value.slice(-1)); else setBarcodeBuffer(value);
        if (barcodeTimerRef.current) clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => {
            const buf = barcodeBuffer || value;
            if (!buf || buf.length < 3) return;
            const matched = products?.find((p: any) => (p.sku && p.sku === buf) || (p.barcode && p.barcode === buf) || p.id === buf);
            if (matched) {
                const imgs = parseImages(matched.images);
                addToCart({ id: matched.id, name: matched.name, price: String(matched.price), quantity: 1, image: imgs[0] });
                setProductSearch(""); setBarcodeBuffer(""); toast.success(`Scanned: ${matched.name}`);
            }
        }, 150);
    };

    // ── Calculations ──
    const calculateSubtotal = () => {
        const cart = cartItems.reduce((s, i) => s + parseFloat(i.price.replace(/[^0-9.-]+/g, "")) * i.quantity, 0);
        return cart + linkedJobCharges.reduce((s, j) => s + (j.billedAmount || 0), 0);
    };
    const calculateTax = (sub: number) => sub * (getVatPercentage() / 100);
    const calculateTotal = () => { const s = calculateSubtotal(); return s + calculateTax(s) - discount; };

    // ── Checkout ──
    const checkoutMutation = useMutation({
        mutationFn: posTransactionsApi.create,
        onSuccess: async (response) => {
            if (linkedJobCharges.length > 0) {
                try {
                    await Promise.all(linkedJobCharges.map(c => jobTicketsApi.recordPayment(c.jobId, { paymentId: response.id, amount: c.billedAmount, method: paymentMethod })));
                    toast.success("Job payments recorded successfully");
                } catch (e) { console.error("Failed to update job payment status", e); toast.error("Transaction saved, but failed to update job payment status"); }
            }
            const td: TransactionData = {
                id: response.id, invoiceNumber: response.invoiceNumber, customer: response.customer,
                customerPhone: response.customerPhone, customerAddress: response.customerAddress,
                items: typeof response.items === "string" ? JSON.parse(response.items) : response.items || [],
                linkedJobs: response.linkedJobs ? (typeof response.linkedJobs === "string" ? JSON.parse(response.linkedJobs) : response.linkedJobs) : [],
                subtotal: String(response.subtotal), tax: String(response.tax), taxRate: String(response.taxRate || "5"),
                discount: String(response.discount || "0"), total: String(response.total), paymentMethod: response.paymentMethod,
                paymentStatus: response.paymentStatus || (response.paymentMethod === "Due" ? "Due" : "Paid"), createdAt: String(response.createdAt),
            };
            setLastTransaction(td); setShowSuccessDialog(true);
            setCartItems([]); setLinkedJobCharges([]); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setDiscount(0); setPaymentMethod("Cash");
            queryClient.invalidateQueries({ queryKey: ["pos-transactions"] });
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
            queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
            queryClient.invalidateQueries({ queryKey: ["job-tickets"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-jobs"] });
        },
        onError: (error: Error) => toast.error(`Checkout failed: ${error.message}`),
    });

    const handleCheckout = () => {
        if (cartItems.length === 0 && linkedJobCharges.length === 0) { toast.error("Cart is empty!"); return; }
        // Stock validation
        for (const item of cartItems) {
            const inv = inventoryItems?.find((i: any) => i.id === item.id);
            if (inv) { const stock = inv.stock || 0; if (item.quantity > stock) { toast.error(`Insufficient stock for "${item.name}"`, { description: `Only ${stock} units available. You have ${item.quantity} in cart.` }); return; } }
        }
        const invalidJobs = linkedJobCharges.filter(j => !j.isValid);
        if (invalidJobs.length > 0) { toast.error("Please select a service and valid billing amount for all linked jobs"); return; }
        if (paymentMethod === "Due" && !customerName.trim()) { toast.error("Customer name is required for Due/Credit payments!"); return; }

        const subtotal = calculateSubtotal(); const tax = calculateTax(subtotal); const total = calculateTotal(); const vatRate = getVatPercentage();
        const linkedJobsData = linkedJobCharges.map(j => ({ jobId: j.jobId, serviceItemId: j.serviceItemId, serviceItemName: j.serviceItemName, minPrice: j.minPrice, maxPrice: j.maxPrice, billedAmount: j.billedAmount, customerName: j.customerName, customerPhone: j.customerPhone, customerAddress: j.customerAddress, assistedByNames: j.assistedByNames }));

        checkoutMutation.mutate({
            id: `POS-${Date.now()}`, customer: customerName || null, customerPhone: customerPhone || null, customerAddress: customerAddress || null,
            items: JSON.stringify(cartItems), linkedJobs: linkedJobCharges.length > 0 ? JSON.stringify(linkedJobsData) : null,
            subtotal: parseFloat(subtotal.toFixed(2)), tax: parseFloat(tax.toFixed(2)), taxRate: parseFloat(vatRate.toFixed(2)),
            discount: parseFloat(discount.toFixed(2)), total: parseFloat(total.toFixed(2)), paymentMethod, paymentStatus: paymentMethod === "Due" ? "Due" : "Paid",
        });
    };

    const handleRequestRefund = (t: any) => { setRefundTransaction(t); setShowRefundDialog(true); };

    // ── Filtered Products ──
    const filteredProducts = (() => {
        const s = productSearch.toLowerCase();
        return products?.filter((p: any) => p.name.toLowerCase().includes(s) || (p.description && p.description.toLowerCase().includes(s)) || (p.category && p.category.toLowerCase().includes(s))) || [];
    })();

    const subtotal = calculateSubtotal(); const tax = calculateTax(subtotal); const total = calculateTotal();
    const cartCount = cartItems.length + linkedJobCharges.length;
    const isCartEmpty = cartItems.length === 0 && linkedJobCharges.length === 0;
    const companyInfo = getCompanyInfo();

    const finalizeCloseMutation = useMutation({
        mutationFn: async () => {
            if (!activeDrawer?.id) {
                throw new Error("No active drawer session");
            }
            const mode: "reconciled" | "under_review" = discrepancyAmount === 0 ? "reconciled" : "under_review";
            const note = mode === "reconciled"
                ? "Balanced drawer finalized from POS review screen."
                : "POS review screen finalized day close with discrepancy pending reconciliation.";
            return drawerApi.closeDay(activeDrawer.id, { mode, note });
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["activeDrawer"] });
            queryClient.invalidateQueries({ queryKey: ["drawer-active"] });
            queryClient.invalidateQueries({ queryKey: ["drawerHistory"] });
            if (!result.executed) {
                toast.error(result.reason ? `Unable to close register: ${result.reason}` : "Unable to close register");
                return;
            }
            toast.success(discrepancyAmount === 0 ? "Register closed successfully" : "Register closed for day and moved to review");
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to close register");
        },
    });

    // ── Linked jobs section in cart ──
    const LinkedJobsInCart = () => linkedJobCharges.length > 0 ? (
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 p-3 rounded-xl border border-indigo-100">
            <p className="text-xs font-bold text-indigo-700 mb-2 flex items-center gap-1"><Link className="w-3 h-3" /> Linked Jobs ({linkedJobCharges.length})</p>
            {linkedJobCharges.map(charge => {
                const job = jobsList?.find((j: any) => j.id === charge.jobId);
                const svcActive = job?.serviceExpiryDate && new Date(job.serviceExpiryDate) > new Date();
                const partsActive = job?.partsExpiryDate && new Date(job.partsExpiryDate) > new Date();
                const hasWarranty = job && (job.serviceWarrantyDays !== undefined || job.partsWarrantyDays !== undefined || job.serviceExpiryDate || job.partsExpiryDate);
                return (
                    <div key={charge.jobId} className="mb-3 pb-3 border-b border-indigo-100 last:border-b-0 last:pb-0 last:mb-0">
                        <div className="flex justify-between text-xs text-indigo-600 mb-1">
                            <span className="font-medium font-mono">{charge.jobId}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-indigo-400 hover:text-red-500 rounded-full hover:bg-red-50" onClick={() => handleJobSelection(charge.jobId, false)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                        <div className="text-[10px] text-indigo-500 mb-2">
                            <span className="font-medium">{job?.device || "Device"}</span>
                            {job?.issue && <span className="ml-2 text-gray-500">• {job.issue}</span>}
                        </div>
                        <div className="space-y-2 mt-2">
                            <div>
                                <Label className="text-[10px] text-indigo-600 mb-1 block">Service Type</Label>
                                <Select value={charge.serviceItemId || ""} onValueChange={(v) => handleServiceItemSelect(charge.jobId, v)}>
                                    <SelectTrigger className="h-7 text-xs bg-white/50 backdrop-blur-sm border-indigo-200"><SelectValue placeholder="Select service..." /></SelectTrigger>
                                    <SelectContent>{serviceItems.map((si: any) => (<SelectItem key={si.id} value={si.id} className="text-xs">{si.name} ({getCurrencySymbol()}{si.minPrice || si.price} - {getCurrencySymbol()}{si.maxPrice || si.price})</SelectItem>))}</SelectContent>
                                </Select>
                            </div>
                            {charge.serviceItemId && (
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <Label className="text-[10px] text-indigo-600">Bill Amount</Label>
                                        <span className="text-[10px] text-gray-500">Range: {getCurrencySymbol()}{charge.minPrice} - {getCurrencySymbol()}{charge.maxPrice}</span>
                                    </div>
                                    <Input type="number" min={charge.minPrice} max={charge.maxPrice} value={charge.billedAmount} onChange={(e) => handleBilledAmountChange(charge.jobId, parseFloat(e.target.value) || 0)} className={`h-7 text-xs bg-white/50 backdrop-blur-sm border-indigo-200 ${!charge.isValid ? 'border-red-400 ring-1 ring-red-400' : ''}`} />
                                    {!charge.isValid && charge.billedAmount > 0 && <p className="text-[10px] text-red-500 mt-1">Amount must be between {getCurrencySymbol()}{charge.minPrice} and {getCurrencySymbol()}{charge.maxPrice}</p>}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    ) : null;

    // ── RENDER ──
    if (drawerLoading) {
        return <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    const hasDrawerSession = !!activeDrawer;
    const isDrawerCounting = activeDrawer?.status === 'counting';
    const canViewDrawerDiscrepancy = !!activeDrawer && !!user && (
        activeDrawer.openedBy === user.id || user.role === 'Super Admin'
    );
    const canViewOpeningVariance = !!activeDrawer && !!user && (
        activeDrawer.openedBy === user.id || user.role === 'Super Admin'
    );
    const discrepancyAmount = Number(activeDrawer?.discrepancy || 0);
    const absoluteDiscrepancyAmount = Math.abs(discrepancyAmount);
    const expectedCash = Number(activeDrawer?.expectedCash ?? activeDrawer?.startingFloat ?? 0);
    const declaredCash = Number(activeDrawer?.declaredCash ?? 0);
    const hasOpeningBaseline = activeDrawer?.openingBaselineFloat !== undefined && activeDrawer?.openingBaselineFloat !== null;
    const openingBaselineFloat = Number(activeDrawer?.openingBaselineFloat ?? 0);
    const openingDifference = Number(activeDrawer?.openingDifference ?? 0);
    const absoluteOpeningDifference = Math.abs(openingDifference);
    const openingVarianceStatus = activeDrawer?.openingVarianceStatus
        ?? (Math.abs(openingDifference) < 0.01 ? 'balanced' : openingDifference > 0 ? 'surplus' : 'shortage');
    const hasOpeningVarianceFlag = hasOpeningBaseline && Math.abs(openingDifference) >= 0.01;
    const openingVarianceLabel = !hasOpeningBaseline
        ? null
        : canViewOpeningVariance
            ? (openingVarianceStatus === 'balanced'
                ? 'Balanced'
                : openingVarianceStatus === 'surplus'
                    ? `Surplus +${getCurrencySymbol()}${absoluteOpeningDifference.toFixed(2)}`
                    : `Shortage -${getCurrencySymbol()}${absoluteOpeningDifference.toFixed(2)}`)
            : (hasOpeningVarianceFlag ? 'Variance Flagged' : 'Balanced');

    const drawerResultMeta = !isDrawerCounting ? null : discrepancyAmount === 0 ? {
        label: 'Balanced',
        description: 'All cash is accounted for. Awaiting Super Admin review.',
        amountPrefix: '',
        amountClass: 'text-emerald-700',
        cardClass: 'from-emerald-50 via-green-50 to-teal-50 border-emerald-200/70',
        iconWrapClass: 'bg-emerald-100',
        iconClass: 'text-emerald-600',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        Icon: Equal,
    } : discrepancyAmount > 0 ? {
        label: 'Surplus',
        description: 'Cash is above expected. Awaiting Super Admin review.',
        amountPrefix: '+',
        amountClass: 'text-amber-700',
        cardClass: 'from-amber-50 via-orange-50 to-yellow-50 border-amber-200/70',
        iconWrapClass: 'bg-amber-100',
        iconClass: 'text-amber-600',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
        Icon: TrendingUp,
    } : {
        label: 'Shortage',
        description: 'Cash is below expected. Awaiting Super Admin review.',
        amountPrefix: '-',
        amountClass: 'text-rose-700',
        cardClass: 'from-rose-50 via-red-50 to-orange-50 border-rose-200/70',
        iconWrapClass: 'bg-rose-100',
        iconClass: 'text-rose-600',
        badgeClass: 'bg-rose-100 text-rose-700 border-rose-200',
        Icon: TrendingDown,
    };

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="h-full flex flex-col overflow-hidden relative">
            {!hasDrawerSession && (
                <div className="absolute inset-0 z-50 bg-slate-100/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-slate-200">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 mb-6">
                            <LockKeyhole className="h-10 w-10 text-rose-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Register is Closed</h2>
                        <p className="text-slate-500 mb-8">
                            You must open a register session with a starting cash float before making any transactions.
                        </p>
                        <Button
                            className="w-full h-12 text-lg font-bold shadow-lg bg-blue-600 hover:bg-blue-700"
                            onClick={() => setDrawerModalType('open')}
                        >
                            Open Register
                        </Button>
                    </div>
                </div>
            )}
            {isDrawerCounting && activeDrawer && drawerResultMeta && (
                <div className="absolute inset-0 z-50 bg-slate-100/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-white p-8 rounded-3xl shadow-xl max-w-2xl w-full border border-slate-200 space-y-6">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 mb-2">
                            <AlertTriangle className="h-10 w-10 text-amber-600" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-slate-900">Drawer Under Review</h2>
                            <p className="text-slate-500">
                                Blind drop is complete. This register is waiting for Super Admin review before normal cash activity resumes.
                            </p>
                        </div>

                        <div className={`rounded-3xl border bg-gradient-to-r ${drawerResultMeta.cardClass} p-6 text-left shadow-sm`}>
                            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                                <div className="flex items-start gap-4">
                                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${drawerResultMeta.iconWrapClass}`}>
                                        <drawerResultMeta.Icon className={`h-7 w-7 ${drawerResultMeta.iconClass}`} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${drawerResultMeta.badgeClass}`}>
                                                {drawerResultMeta.label}
                                            </span>
                                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
                                                Awaiting Super Admin review
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-700">{drawerResultMeta.description}</p>
                                            <p className={`mt-2 text-3xl font-black tabular-nums ${drawerResultMeta.amountClass}`}>
                                                {drawerResultMeta.amountPrefix}{getCurrencySymbol()}{absoluteDiscrepancyAmount.toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-white/80 bg-white/85 px-4 py-3 text-sm text-slate-600 shadow-sm">
                                    <div><span className="text-slate-400">Opened by:</span> <span className="font-semibold text-slate-800">{activeDrawer.openedByName}</span></div>
                                    <div className="mt-1"><span className="text-slate-400">Session status:</span> <span className="font-semibold text-slate-800 capitalize">{activeDrawer.status}</span></div>
                                </div>
                            </div>

                            {canViewDrawerDiscrepancy ? (
                                <div className="mt-5 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">System Expected</div>
                                        <div className="mt-2 text-2xl font-black tabular-nums text-slate-900">{getCurrencySymbol()}{expectedCash.toFixed(2)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">You Counted</div>
                                        <div className="mt-2 text-2xl font-black tabular-nums text-slate-900">{getCurrencySymbol()}{declaredCash.toFixed(2)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
                                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Difference</div>
                                        <div className={`mt-2 text-2xl font-black tabular-nums ${drawerResultMeta.amountClass}`}>
                                            {drawerResultMeta.amountPrefix}{getCurrencySymbol()}{absoluteDiscrepancyAmount.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-5 rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-slate-600 shadow-sm">
                                    This drawer result is waiting for Super Admin review. Exact expected, counted, and difference values are only visible to the register opener and Super Admin.
                                </div>
                            )}

                            {canViewDrawerDiscrepancy && (
                                <div className="mt-5 flex justify-end">
                                    <Button
                                        className={`${discrepancyAmount === 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'} text-white font-semibold`}
                                        onClick={() => finalizeCloseMutation.mutate()}
                                        disabled={finalizeCloseMutation.isPending}
                                    >
                                        {finalizeCloseMutation.isPending
                                            ? "Closing..."
                                            : discrepancyAmount === 0
                                                ? "Close Register"
                                                : "Close for Day (Under Review)"}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <PrintStyles />

            {/* Modals */}
            <DrawerModals
                type={drawerModalType}
                onClose={() => setDrawerModalType(null)}
                drawerSessionId={activeDrawer?.id}
                currentUser={user!}
                currencySymbol={getCurrencySymbol()}
            />

            {/* Live Session Bar */}
            {hasDrawerSession && activeDrawer && (
                <div className={`hidden mx-1 mb-3 px-3 py-2.5 rounded-2xl flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-xs shadow-sm shrink-0 border ${isDrawerCounting ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border-amber-200/60' : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-emerald-200/60'}`}>
                    <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${isDrawerCounting ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                        <span className={`font-bold ${isDrawerCounting ? 'text-amber-800' : 'text-emerald-800'}`}>{isDrawerCounting ? 'UNDER REVIEW' : 'LIVE'}</span>
                    </div>
                    <div className={`hidden md:block h-4 w-px ${isDrawerCounting ? 'bg-amber-200' : 'bg-emerald-200'}`} />
                    <div className="text-slate-600">
                        <span className="text-slate-400">Float:</span>{' '}
                        <span className="font-bold text-slate-800">{getCurrencySymbol()}{Number(activeDrawer.startingFloat).toFixed(0)}</span>
                    </div>
                    <div className="text-slate-600">
                        <span className="text-slate-400">Opened by:</span>{' '}
                        <span className="font-semibold text-slate-700 break-all md:break-normal">{activeDrawer.openedByName}</span>
                    </div>
                    <div className="text-slate-600 md:ml-auto">
                        <span className="text-slate-400">Since:</span>{' '}
                        <span className="font-medium text-slate-700">
                            {activeDrawer.openedAt ? new Date(activeDrawer.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                    </div>
                </div>
            )}

            {/* All Dialogs */}
            <CustomerDialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen} customers={customers || []} customersLoading={customersLoading} onSelect={handleSelectCustomer} getCurrencySymbol={getCurrencySymbol} />
            <JobLinkDialog open={isJobDialogOpen} onOpenChange={setIsJobDialogOpen} billableJobs={billableJobs} jobsLoading={jobsLoading} linkedJobCharges={linkedJobCharges} onJobSelection={handleJobSelection} />
            <InventoryDialog open={isInventoryDialogOpen} onOpenChange={setIsInventoryDialogOpen} inventoryItems={inventoryItems} inventoryLoading={inventoryLoading} selectedInventory={selectedInventory} onInventorySelection={handleInventorySelection} onAddToCart={handleAddInventoryToCart} getCurrencySymbol={getCurrencySymbol} />
            <SuccessDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog} lastTransaction={lastTransaction} getCurrencySymbol={getCurrencySymbol} onShowInvoice={() => { setShowSuccessDialog(false); setShowInvoicePreview(true); }} onShowReceipt={() => { setShowSuccessDialog(false); setShowReceiptPreview(true); }} />
            <InvoicePreviewDialog open={showInvoicePreview} onOpenChange={setShowInvoicePreview} lastTransaction={lastTransaction} companyInfo={companyInfo} />
            <ReceiptPreviewDialog open={showReceiptPreview} onOpenChange={setShowReceiptPreview} lastTransaction={lastTransaction} companyInfo={companyInfo} />
            <HistoryDialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog} posTransactions={Array.isArray(posTransactions) ? posTransactions : (posTransactions?.items || [])} getCurrencySymbol={getCurrencySymbol} onRequestRefund={handleRequestRefund} onSetTransaction={setLastTransaction} onShowInvoice={() => setShowInvoicePreview(true)} onShowReceipt={() => setShowReceiptPreview(true)} />
            <RefundDialog open={showRefundDialog} onOpenChange={setShowRefundDialog} refundTransaction={refundTransaction} getCurrencySymbol={getCurrencySymbol} />

            {/* Mobile Floating Cart Bar */}
            {isMobile && cartCount > 0 && !mobileCartOpen && (
                <motion.div initial={{ y: 80 }} animate={{ y: 0 }} className="fixed bottom-4 left-4 right-4 z-40 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white rounded-2xl shadow-xl shadow-indigo-500/30 p-4 flex items-center justify-between" onClick={() => setMobileCartOpen(true)}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center relative">
                            <ShoppingCart className="w-5 h-5" />
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-indigo-600 animate-pulse" />
                        </div>
                        <div><p className="font-bold text-sm">{cartCount} item(s)</p><p className="text-xs text-white/80">{getCurrencySymbol()}{total.toFixed(2)}</p></div>
                    </div>
                    <Button size="sm" className="bg-white text-indigo-700 hover:bg-white/90 font-bold rounded-xl shadow-sm">View Cart</Button>
                </motion.div>
            )}

            {/* Mobile Cart Drawer */}
            <AnimatePresence>
                {isMobile && mobileCartOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setMobileCartOpen(false)} />
                        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
                            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
                                <div className="flex items-center gap-2 text-indigo-900"><ShoppingCart className="w-5 h-5" /><h3 className="font-bold text-lg">Cart ({cartCount})</h3></div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" className="rounded-full hover:bg-indigo-100 text-indigo-700" onClick={() => setShowHistoryDialog(true)}><FileText className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" className="rounded-full hover:bg-rose-100 text-slate-500 hover:text-rose-600" onClick={() => setMobileCartOpen(false)}><X className="h-5 w-5" /></Button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                                {/* Mobile Cart Customer */}
                                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 space-y-2">
                                    <div className="flex gap-2"><Input placeholder="Customer name" className="h-10 text-sm bg-slate-50 border-slate-200" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /><Button size="icon" variant="outline" className="h-10 w-10 shrink-0 border-slate-200 bg-slate-50" onClick={() => setIsCustomerDialogOpen(true)}><UserPlus className="h-4 w-4 text-slate-500" /></Button></div>
                                    <Input placeholder="Phone" className="h-10 text-sm bg-slate-50 border-slate-200" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                                    <Input placeholder="Address" className="h-10 text-sm bg-slate-50 border-slate-200" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                                </div>
                                {/* Mobile Cart Items */}
                                {cartItems.map(item => {
                                    const price = parseFloat(item.price.replace(/[^0-9.-]+/g, "")); const inv = inventoryItems?.find((i: any) => i.id === item.id); const stock = inv?.stock || 0;
                                    return (
                                        <div key={item.id} className="flex gap-3 items-start bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                                            <div className="w-14 h-14 bg-slate-50 rounded-lg shrink-0 overflow-hidden flex items-center justify-center border border-slate-100">{item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-slate-300" />}</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-700 line-clamp-1">{item.name}</p>
                                                <div className="flex items-center gap-2 mt-2">
                                                    <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-l-lg hover:bg-slate-200" onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                                                        <span className="px-2 text-xs font-medium tabular-nums">{item.quantity}</span>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-r-lg hover:bg-slate-200" onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                                                    </div>
                                                    <span className="text-sm font-bold ml-auto text-slate-900">{getCurrencySymbol()}{(price * item.quantity).toFixed(2)}</span>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full" onClick={() => removeFromCart(item.id)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    );
                                })}
                                <LinkedJobsInCart />

                                {/* Close Register Mobile Button */}
                                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-center">
                                    <Button variant="outline" className="w-full border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setDrawerModalType('drop')}>
                                        Close Register
                                    </Button>
                                </div>
                            </div>

                            {/* Mobile Sticky Footer */}
                            <div className="border-t border-slate-200 bg-white p-4 space-y-3 z-10 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500 text-sm">Total Due</span>
                                    <span className="font-bold text-2xl text-slate-900">{getCurrencySymbol()}{total.toFixed(2)}</span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                                    {PAYMENT_METHODS.map(m => {
                                        const Icon = m.icon === 'Banknote' ? Banknote : m.icon === 'Landmark' ? Landmark : m.icon === 'Smartphone' ? Smartphone : m.icon === 'Clock' ? Clock : CreditCard;
                                        const isSel = paymentMethod === m.value;
                                        return (
                                            <button key={m.value} onClick={() => setPaymentMethod(m.value)} className={`snap-center shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${isSel ? `bg-gradient-to-r ${m.gradient} text-white border-transparent shadow-md transform scale-105` : `bg-white text-slate-600 border-slate-200 hover:bg-slate-50`}`}>
                                                <Icon className="w-3.5 h-3.5" /> <span className="text-xs font-medium">{m.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <Button className="w-full h-12 font-bold bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/20 text-white rounded-xl text-base" onClick={handleCheckout} disabled={checkoutMutation.isPending || cartCount === 0}>
                                    {checkoutMutation.isPending ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>) : (<><CreditCard className="w-5 h-5 mr-2" /> {paymentMethod === "Due" ? "Create Due" : `Pay ${getCurrencySymbol()}${total.toFixed(0)}`}</>)}
                                </Button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Main Layout */}
            <div className={`flex flex-1 min-h-0 flex-col md:flex-row gap-3 md:gap-4 ${isMobile ? 'pb-24' : 'overflow-hidden'}`}>
                {/* Product Grid */}
                <BentoCard
                    variant="ghost"
                    className="flex-1 min-h-0 flex flex-col gap-3 min-w-0 bg-transparent md:bg-white/50 border-transparent md:border-slate-200/60 p-0 md:p-4"
                    disableHover
                >
                    <div className="shrink-0 space-y-3">
                        {hasDrawerSession && activeDrawer && (
                            <div className={`px-3 py-2.5 rounded-2xl flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-xs shadow-sm border ${isDrawerCounting ? 'bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border-amber-200/60' : 'bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-emerald-200/60'}`}>
                                <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${isDrawerCounting ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                                    <span className={`font-bold ${isDrawerCounting ? 'text-amber-800' : 'text-emerald-800'}`}>{isDrawerCounting ? 'UNDER REVIEW' : 'LIVE'}</span>
                                </div>
                                <div className={`hidden md:block h-4 w-px ${isDrawerCounting ? 'bg-amber-200' : 'bg-emerald-200'}`} />
                                <div className="text-slate-600">
                                    <span className="text-slate-400">Float:</span>{' '}
                                    <span className="font-bold text-slate-800">{getCurrencySymbol()}{Number(activeDrawer.startingFloat).toFixed(0)}</span>
                                </div>
                                <div className="text-slate-600">
                                    <span className="text-slate-400">Opened by:</span>{' '}
                                    <span className="font-semibold text-slate-700 break-all md:break-normal">{activeDrawer.openedByName}</span>
                                </div>
                                <div className="text-slate-600 md:ml-auto">
                                    <span className="text-slate-400">Since:</span>{' '}
                                    <span className="font-medium text-slate-700">
                                        {activeDrawer.openedAt ? new Date(activeDrawer.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'â€”'}
                                    </span>
                                </div>
                            </div>
                        )}
                        {hasDrawerSession && activeDrawer && hasOpeningBaseline && (
                            <div className="px-3 py-2 rounded-xl border border-slate-200/70 bg-white/70 text-[11px] md:text-xs text-slate-600 shadow-sm">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span className="text-slate-400 font-medium">Opening Variance:</span>
                                    <span className={`font-bold ${openingVarianceStatus === 'balanced' ? 'text-emerald-700' : openingVarianceStatus === 'surplus' ? 'text-amber-700' : 'text-rose-700'}`}>
                                        {openingVarianceLabel}
                                    </span>
                                    {canViewOpeningVariance ? (
                                        <span>
                                            Baseline {getCurrencySymbol()}{openingBaselineFloat.toFixed(2)} | Opened {getCurrencySymbol()}{Number(activeDrawer.startingFloat).toFixed(2)} | Diff {openingDifference > 0 ? '+' : openingDifference < 0 ? '-' : ''}{getCurrencySymbol()}{absoluteOpeningDifference.toFixed(2)}
                                        </span>
                                    ) : hasOpeningVarianceFlag ? (
                                        <span>Opening variance flagged, awaiting review.</span>
                                    ) : null}
                                </div>
                            </div>
                        )}

                        <div className="bg-gradient-to-br from-slate-900/5 to-slate-800/5 rounded-2xl p-4 flex items-center gap-3 border border-slate-200/50 shadow-inner">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input placeholder="Search products or scan barcode..." className="pl-10 h-11 bg-white/80 backdrop-blur-sm border-white/60 ring-1 ring-slate-200/50 rounded-xl shadow-sm focus:ring-primary/30 transition-all font-medium" value={productSearch} onChange={handleProductSearch} />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <ScanBarcode className="w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {productsLoading ? (
                        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center flex-col gap-3"><div className="p-4 bg-slate-50 rounded-full"><Package className="h-8 w-8 text-slate-300" /></div><p className="text-slate-400 text-sm font-medium">No products found</p></div>
                    ) : (
                        <motion.div variants={containerVariants} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 overflow-y-auto flex-1 min-h-0 pb-4 pr-1 custom-scrollbar">
                            {filteredProducts.map((product: any, idx: number) => {
                                const imgs = parseImages(product.images); const imgUrl = imgs[0] || "";
                                return (
                                    <motion.div variants={bounceItemVariants} key={product.id} className="group bg-white/70 backdrop-blur-sm border border-white/60 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-primary/5 cursor-pointer transition-all duration-300 bc-hover bc-rise relative z-10 hover:z-20 active:scale-[0.98] overflow-hidden flex flex-col"
                                        onClick={() => { addToCart({ id: product.id, name: product.name, price: String(product.price), quantity: 1, image: imgUrl }); toast.success(`Added ${product.name}`, { icon: '🛒' }); }}>
                                        <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 relative overflow-hidden">
                                            {imgUrl ? <img src={imgUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={product.name} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-slate-200" /></div>}
                                            <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-3">
                                                <div className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-full text-[10px] font-bold text-primary shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">Add to Cart</div>
                                            </div>
                                        </div>
                                        <div className="p-3 flex-1 flex flex-col">
                                            <h3 className="text-xs font-semibold text-slate-700 line-clamp-2 leading-snug group-hover:text-primary transition-colors mb-auto">{product.name}</h3>
                                            <div className="mt-2 flex items-center justify-between">
                                                <div className="bg-primary/5 text-primary font-bold text-xs px-2 py-0.5 rounded-full border border-primary/10">{getCurrencySymbol()}{product.price}</div>
                                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-colors"><Plus className="w-3 h-3" /></div>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </motion.div>
                    )}
                </BentoCard>

                {/* Desktop Cart Panel */}
                {!isMobile && (
                    <BentoCard
                        variant="ghost"
                        className="w-full max-w-[430px] xl:max-w-[460px] h-full min-h-0 flex flex-col self-stretch p-0 bg-white/85 backdrop-blur-xl border-white/60 shadow-xl shadow-slate-200/50 overflow-hidden relative"
                        disableHover
                    >
                        {/* Header */}
                        <div className="px-4 py-3 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 text-white shrink-0 relative overflow-hidden">
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
                            <div className="relative z-10 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md shadow-inner text-white shrink-0">
                                    <ShoppingCart className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="font-bold text-base leading-tight">Current Sale</h2>
                                    <p className="text-[11px] text-indigo-100 font-medium opacity-80">{new Date().toLocaleDateString()}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button size="sm" variant="ghost" className="h-8 bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-md rounded-lg text-[11px] gap-1.5 whitespace-nowrap px-3" onClick={() => setDrawerModalType('drop')}>
                                        Close Register
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-md rounded-lg p-0" onClick={() => setShowHistoryDialog(true)}>
                                        <Clock className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col">
                            <div className="shrink-0 border-b border-white/70 bg-white/70 backdrop-blur-sm px-4 py-3">
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <Input placeholder="Guest Customer" className="h-10 bg-white border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 rounded-xl text-sm" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                                        <Button size="icon" className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 transition-colors shadow-sm" onClick={() => setIsCustomerDialogOpen(true)}>
                                            <UserPlus className="h-5 w-5" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input placeholder="Phone number" className="h-9 bg-white border-slate-200 rounded-lg text-xs" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                                        <Input placeholder="Address" className="h-9 bg-white border-slate-200 rounded-lg text-xs" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" className="h-9 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 hover:opacity-90 shadow-md shadow-violet-200 rounded-xl text-[11px] font-semibold gap-2" onClick={() => setIsJobDialogOpen(true)}>
                                            <Link className="w-3.5 h-3.5" />
                                            Link Job
                                        </Button>
                                        <Button variant="outline" className="h-9 bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 hover:opacity-90 shadow-md shadow-orange-200 rounded-xl text-[11px] font-semibold gap-2" onClick={() => setIsInventoryDialogOpen(true)}>
                                            <ListPlus className="w-3.5 h-3.5" />
                                            Inventory
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className={`flex-1 min-h-0 bg-slate-50/50 px-4 py-4 ${isCartEmpty ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                                {isCartEmpty ? (
                                    <div className="flex min-h-[280px] flex-col items-center justify-center text-slate-300 space-y-3 opacity-60">
                                        <ShoppingCart className="w-16 h-16" strokeWidth={1.5} />
                                        <p className="text-sm font-medium">Cart is empty</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {cartItems.map(item => {
                                            const price = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
                                            const inv = inventoryItems?.find((i: any) => i.id === item.id);
                                            const stock = inv?.stock || 0;
                                            const isLow = stock <= 5 && stock > 0;
                                            const isOut = stock < item.quantity;
                                            return (
                                                <div key={item.id} className={`group flex gap-3 items-start p-2.5 rounded-xl border transition-all ${isOut ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100 hover:border-indigo-100 hover:shadow-sm'}`}>
                                                    <div className="w-12 h-12 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                                                        {item.image ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-slate-300" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <p className="text-sm font-medium text-slate-700 line-clamp-2 leading-snug">{item.name}</p>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1 -mt-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={() => removeFromCart(item.id)}>
                                                                <X className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                        {(isLow || isOut) && (
                                                            <div className="flex gap-1 mt-0.5">
                                                                {isLow && !isOut && <Badge variant="outline" className="text-[10px] py-0 h-4 px-1.5 border-amber-200 text-amber-700 bg-amber-50">Low: {stock}</Badge>}
                                                                {isOut && <Badge variant="destructive" className="text-[10px] py-0 h-4 px-1.5">Stock: {stock}</Badge>}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center justify-between mt-2">
                                                            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 h-7">
                                                                <button className="px-2 hover:text-indigo-600 hover:bg-indigo-50 rounded-l-lg h-full flex items-center transition-colors" onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}>
                                                                    <Minus className="w-3 h-3" />
                                                                </button>
                                                                <span className="text-[11px] font-bold w-7 text-center tabular-nums text-slate-700">{item.quantity}</span>
                                                                <button className="px-2 hover:text-indigo-600 hover:bg-indigo-50 rounded-r-lg h-full flex items-center transition-colors" onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}>
                                                                    <Plus className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                            <span className="text-sm font-bold text-slate-900 tabular-nums">{getCurrencySymbol()}{(price * item.quantity).toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <LinkedJobsInCart />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] shrink-0 z-20">
                            <button
                                type="button"
                                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors"
                                onClick={() => setIsPaymentExpanded((prev) => !prev)}
                                aria-expanded={isPaymentExpanded}
                            >
                                <div className="min-w-0">
                                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Checkout</div>
                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-slate-700">{paymentMethod}</span>
                                        <span className="text-xs text-slate-400">Total</span>
                                        <span className="text-xl font-black text-slate-900 tabular-nums">{getCurrencySymbol()}{total.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                                        {cartCount} item{cartCount === 1 ? "" : "s"}
                                    </Badge>
                                    <motion.div
                                        animate={{ rotate: isPaymentExpanded ? 180 : 0 }}
                                        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                                        className="text-slate-500"
                                    >
                                        <ChevronDown className="w-4 h-4" />
                                    </motion.div>
                                </div>
                            </button>

                            <AnimatePresence initial={false}>
                                {isPaymentExpanded && (
                                    <motion.div
                                        key="checkout-details"
                                        initial={{ height: 0, opacity: 0, y: 10 }}
                                        animate={{ height: "auto", opacity: 1, y: 0 }}
                                        exit={{ height: 0, opacity: 0, y: 8 }}
                                        transition={{
                                            height: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
                                            opacity: { duration: 0.18 },
                                            y: { duration: 0.2 }
                                        }}
                                        className="overflow-hidden border-t border-slate-100"
                                    >
                                        <div className="px-4 pb-4 space-y-3 pt-3">
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>Subtotal</span>
                                                <span className="font-medium text-slate-700 tabular-nums">{getCurrencySymbol()}{subtotal.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-xs text-slate-500">
                                                <span>VAT ({getVatPercentage()}%)</span>
                                                <span className="font-medium text-slate-700 tabular-nums">{getCurrencySymbol()}{tax.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
                                                <span>Discount</span>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-rose-500 font-medium">-</span>
                                                    <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="h-7 w-20 text-right text-xs bg-slate-50 border-slate-200 p-1" />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                                {PAYMENT_METHODS.map(m => {
                                                    const Icon = m.icon === 'Banknote' ? Banknote : m.icon === 'Landmark' ? Landmark : m.icon === 'Smartphone' ? Smartphone : m.icon === 'Clock' ? Clock : CreditCard;
                                                    const isSel = paymentMethod === m.value;
                                                    return (
                                                        <button key={m.value} onClick={() => setPaymentMethod(m.value)} className={`flex-1 min-w-[72px] flex flex-col items-center gap-1 p-2 rounded-xl border transition-all duration-200 ${isSel ? `bg-gradient-to-b ${m.gradient} border-transparent text-white shadow-lg shadow-indigo-500/20 ring-2 ring-offset-2 ring-indigo-100` : `bg-white text-slate-500 border-slate-100 hover:border-indigo-200 hover:bg-slate-50`}`}>
                                                            <Icon className={`w-4 h-4 ${isSel ? 'text-white' : 'text-slate-400'}`} />
                                                            <span className="text-[10px] font-semibold">{m.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                                <Button variant="outline" className="h-11 border-2 border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 hover:border-slate-300 rounded-xl" onClick={() => { }} disabled={cartCount === 0}>
                                    <Clock className="w-4 h-4 mr-2" />
                                    Suspend
                                </Button>
                                <Button className="h-11 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold shadow-lg shadow-emerald-500/30 rounded-xl bc-hover bc-rise relative z-10 hover:z-20" onClick={handleCheckout} disabled={checkoutMutation.isPending || cartCount === 0}>
                                    {checkoutMutation.isPending ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>) : (<><CreditCard className="w-5 h-5 mr-2" /> Pay Now</>)}
                                </Button>
                            </div>
                        </div>
                    </BentoCard>
                )}
            </div>
        </motion.div >
    );
}
