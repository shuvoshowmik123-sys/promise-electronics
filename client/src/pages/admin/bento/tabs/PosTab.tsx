import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
    buildNavigateAdminTabPath,
    isAdminWorkspaceTabActive,
} from "@/lib/admin-workspace-routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PrintStyles } from "@/components/print";
import { Search, UserPlus, Trash2, CreditCard, Plus, ShoppingCart, Package, Loader2, Minus, FileText, Banknote, Smartphone, Clock, Shield, ChevronDown, Link, ListPlus, X, Landmark, ScanBarcode, LockKeyhole, AlertTriangle, TrendingUp, Equal, Ban, RefreshCcw, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, jobTicketsApi, posTransactionsApi, settingsApi, adminCustomersApi, drawerApi, publicAreaMapApi, localPurchasesApi } from "@/lib/api";
import { toast } from "sonner";
import { CartItem, LinkedJobCharge, TransactionData, PAYMENT_METHODS, parseImages, parseTransactionForReprint } from "./pos/pos-types";
import { MobileProductPicker, type MobilePickerItem } from "./pos/MobileProductPicker";
import { WARRANTY_SETTING_KEYS, DEFAULT_PARTS_MONTH_OPTIONS, DEFAULT_SERVICE_MONTH_OPTIONS, parseMonthOptions, formatWarrantyMonths } from "@shared/warranty-options";
import { getSafeJobDisplayRef } from "@shared/job-display-utils";
const CustomerDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.CustomerDialog })));
const JobLinkDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.JobLinkDialog })));
const InventoryDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.InventoryDialog })));
const SuccessDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.SuccessDialog })));
const InvoicePreviewDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.InvoicePreviewDialog })));
const ReceiptPreviewDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.ReceiptPreviewDialog })));
const HistoryDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.HistoryDialog })));
const RefundDialog = lazy(() => import("./pos/PosDialogs").then(m => ({ default: m.RefundDialog })));
import { containerVariants, itemVariants, bounceItemVariants, BentoCard } from "../shared";
import { DrawerModals } from "@/components/admin/DrawerModals";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const OPEN_REGISTER_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
type OpenRegisterDenomination = typeof OPEN_REGISTER_DENOMINATIONS[number];
type OpenRegisterCounts = Record<OpenRegisterDenomination, number>;

const createEmptyOpenRegisterCounts = (): OpenRegisterCounts => ({
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
});

const calculateOpenRegisterTotal = (counts: OpenRegisterCounts) =>
    OPEN_REGISTER_DENOMINATIONS.reduce((total, denomination) => total + denomination * counts[denomination], 0);

interface PosTabProps {
    initialSearchQuery?: string;
    initialTransactionId?: string;
    onSearchConsumed?: () => void;
}

export default function PosTab({ initialSearchQuery, initialTransactionId, onSearchConsumed }: PosTabProps = {}) {
    const [location, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const [isMobile, setIsMobile] = useState(false);
    const { user } = useAdminAuth();

    // Drawer state
    const { data: activeDrawer, isLoading: drawerLoading } = useQuery({
        queryKey: ["activeDrawer"],
        queryFn: drawerApi.getActive
    });
    const [drawerModalType, setDrawerModalType] = useState<'open' | 'drop' | null>(null);
    const [openRegisterCounts, setOpenRegisterCounts] = useState<OpenRegisterCounts>(() => createEmptyOpenRegisterCounts());

    // Cart & checkout state
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [linkedJobCharges, setLinkedJobCharges] = useState<LinkedJobCharge[]>([]);
    const [selectedInventory, setSelectedInventory] = useState<{ id: string; qty: number }[]>([]);
    const [customerName, setCustomerName] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerAddress, setCustomerAddress] = useState("");
    const [serviceAreaId, setServiceAreaId] = useState("");
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
    const [showPaymentReview, setShowPaymentReview] = useState(false);
    const [holdConfirming, setHoldConfirming] = useState(false);
    const [refundTransaction, setRefundTransaction] = useState<any>(null);
    const [lastTransaction, setLastTransaction] = useState<TransactionData | null>(null);
    const [autoShareReceipt, setAutoShareReceipt] = useState(false);

    // Mobile cart drawer
    const [mobileCartOpen, setMobileCartOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<string>("All");
    const [showCustomerAutocomplete, setShowCustomerAutocomplete] = useState(false);
    const [customerSearchField, setCustomerSearchField] = useState<"name" | "phone">("name");

    // Barcode scanning
    const [barcodeBuffer, setBarcodeBuffer] = useState("");
    const lastKeyTimeRef = useRef(0);
    const barcodeTimerRef = useRef<NodeJS.Timeout | null>(null);
    const holdConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Data Queries ──
    const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ["products"], queryFn: inventoryApi.getAll });
    const { data: inventoryItems, isLoading: inventoryLoading } = useQuery({ queryKey: ["inventory"], queryFn: inventoryApi.getAll });
    // Purpose-built billable jobs endpoint — avoid unbounded/truncated job list for POS.
    const { data: billableJobsRaw, isLoading: jobsLoading } = useQuery({
        queryKey: ["jobTickets", "ready-for-billing"],
        queryFn: () => jobTicketsApi.getReadyForBilling(),
    });
    const { data: posTransactions } = useQuery({ queryKey: ["pos-transactions"], queryFn: () => posTransactionsApi.getAll() });
    const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: settingsApi.getAll });
    const { data: customers, isLoading: customersLoading } = useQuery({ queryKey: ["admin-customers"], queryFn: adminCustomersApi.getAll });
    const { data: serviceAreas = [] } = useQuery({
        queryKey: ['public-service-area-list'],
        queryFn: publicAreaMapApi.getList,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always',
    });
    // Only fetches when register is confirmed closed — shows last opener in lock screen
    const { data: recentDrawerHistory } = useQuery({
        queryKey: ["drawerHistory", "recent"],
        queryFn: () => drawerApi.getHistory("?limit=1"),
        enabled: !drawerLoading && !activeDrawer,
        staleTime: 60_000,
    });
    const lastDrawerSession = (recentDrawerHistory as any)?.items?.[0] ?? null;

    const billableJobs = Array.isArray(billableJobsRaw) ? billableJobsRaw : [];
    const serviceItems = inventoryItems?.filter((item: any) => item.itemType === "service") || [];

    // ── Helpers ──
    const getCurrencySymbol = () => { const s = settings?.find((s: any) => s.key === "currency_symbol"); return s?.value || "৳"; };
    const getSettingValue = (key: string, def: string) => { const s = settings?.find((s: any) => s.key === key); return s?.value || def; };
    /**
     * VAT applies only when the shop has switched it on AND set a rate.
     *
     * Two separate questions, deliberately. The rate answers "how much"; the
     * toggle answers "at all". Collapsing them into one number means switching
     * VAT off destroys the rate, and switching it back on means somebody has to
     * remember what it used to be.
     *
     * The toggle defaults to OFF. A shop that has never opened the VAT screen
     * has not decided to charge tax, and the till must not decide for it — this
     * is the same mistake the old hardcoded 5% made, and it charged customers
     * a tax nobody had chosen.
     */
    const isVatEnabled = () => getSettingValue("vat_enabled", "false") === "true";
    const getVatPercentage = () =>
        isVatEnabled() ? parseFloat(getSettingValue("vat_percentage", "0")) || 0 : 0;
    const getCompanyInfo = () => ({
        name: getSettingValue("site_name", "PROMISE ELECTRONICS"), logo: getSettingValue("logo_url", ""),
        address: getSettingValue("company_address", "Dhaka, Bangladesh"), phone: getSettingValue("support_phone", "+880 1700-000000"),
        email: getSettingValue("company_email", "support@promise-electronics.com"), website: getSettingValue("company_website", "www.promise-electronics.com"),
    });
    const openRegisterTotal = calculateOpenRegisterTotal(openRegisterCounts);
    const openRegisterNotesTotal = [1000, 500, 200, 100, 50, 20].reduce((sum, denomination) => sum + denomination * openRegisterCounts[denomination as OpenRegisterDenomination], 0);
    const openRegisterSmallCashTotal = openRegisterTotal - openRegisterNotesTotal;

    const updateOpenRegisterCount = (denomination: OpenRegisterDenomination, nextCount: number) => {
        setOpenRegisterCounts((previous) => ({
            ...previous,
            [denomination]: Math.max(0, Math.min(999, Number.isFinite(nextCount) ? Math.floor(nextCount) : 0)),
        }));
    };

    // ── Effects ──
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check(); window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, []);

    useEffect(() => {
        return () => {
            if (holdConfirmTimerRef.current) clearTimeout(holdConfirmTimerRef.current);
        };
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

    // Handle initialSearchQuery from deep link (e.g., Smart Search)
    useEffect(() => {
        if (initialSearchQuery !== undefined) {
            setProductSearch(initialSearchQuery);
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);

    // Auto-open transaction by initialTransactionId (from Smart Search deep-link)
    const initialTransactionIdOpenedRef = useRef<string | null>(null);
    useEffect(() => {
        if (initialTransactionId && posTransactions) {
            if (initialTransactionIdOpenedRef.current === initialTransactionId) return;
            const transactions = Array.isArray(posTransactions) ? posTransactions : (posTransactions as any)?.items || [];
            const match = transactions.find((t: any) =>
                t.id === initialTransactionId ||
                t.invoiceNumber === initialTransactionId
            );
            if (match) {
                initialTransactionIdOpenedRef.current = initialTransactionId;
                const td = parseTransactionForReprint(match);
                setLastTransaction(td);
                setShowInvoicePreview(true);
            }
        }
    }, [initialTransactionId, posTransactions]);

    useEffect(() => {
        const anySurfaceOpen = mobileCartOpen || showPaymentReview || isCustomerDialogOpen || isJobDialogOpen || isInventoryDialogOpen || showSuccessDialog || showInvoicePreview || showReceiptPreview || showHistoryDialog || showRefundDialog || drawerModalType !== null;
        if (isMobile && anySurfaceOpen) {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
            return () => {
                window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
            };
        }
    }, [isMobile, mobileCartOpen, showPaymentReview, isCustomerDialogOpen, isJobDialogOpen, isInventoryDialogOpen, showSuccessDialog, showInvoicePreview, showReceiptPreview, showHistoryDialog, showRefundDialog, drawerModalType]);

    // Close mobile cart/payment-review when leaving POS via any workspace navigation path.
    // Wouter emits custom "pushState"/"replaceState" events (see wouter use-browser-location);
    // hashchange covers the temporary legacy bridge; popstate covers browser Back/Forward.
    useEffect(() => {
        const closeTransientIfLeftPos = () => {
            if (!isMobile) return;
            const onPos = isAdminWorkspaceTabActive(
                "pos",
                window.location.pathname,
                window.location.search,
                window.location.hash,
            );
            if (!onPos) {
                setMobileCartOpen(false);
                setShowPaymentReview(false);
            }
        };

        closeTransientIfLeftPos();

        // Event names match wouter's patched History API notifications.
        const navEvents = ["hashchange", "popstate", "pushState", "replaceState"] as const;
        for (const eventName of navEvents) {
            window.addEventListener(eventName, closeTransientIfLeftPos);
        }
        return () => {
            for (const eventName of navEvents) {
                window.removeEventListener(eventName, closeTransientIfLeftPos);
            }
        };
    }, [isMobile]);

    const posDialogOpenRef = useRef(false);
    posDialogOpenRef.current = isCustomerDialogOpen || isJobDialogOpen || isInventoryDialogOpen || showSuccessDialog || showInvoicePreview || showReceiptPreview || showHistoryDialog || showRefundDialog || showPaymentReview;

    useEffect(() => {
        if (!isMobile || !mobileCartOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // If any POS sub-dialog is open, let it handle Escape — don't close cart
            if (posDialogOpenRef.current) return;
            setMobileCartOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isMobile, mobileCartOpen]);

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

    /**
     * Put the collection fare on the bill when its job is linked.
     *
     * The fare was quoted to the customer at booking, recomputed on the server,
     * stored on the request and carried onto the job as a charge — and then the
     * till ignored it, so every collection was made for nothing. It is added
     * here rather than folded into the repair amount because that amount is
     * validated against a service item's price range, and because a customer is
     * entitled to see what the journey cost as its own line.
     *
     * Added once. Linking a second job, or re-linking the same one, must not
     * charge the journey twice.
     */
    const addPickupFareForJob = (job: any) => {
        const charges = Array.isArray(job?.charges) ? job.charges : [];
        const fare = charges.find((c: any) => c?.type === "pickup" && Number(c?.amount) > 0);
        if (!fare) return;
        const lineId = `pickup-${job.id}`;
        setCartItems((prev) => {
            if (prev.some((item) => item.id === lineId)) return prev;
            return [...prev, {
                id: lineId,
                name: "Pickup & drop",
                price: String(Number(fare.amount)),
                quantity: 1,
                isPickupFare: true,
                pickupDiscountOver:
                    fare.discountOver === null || fare.discountOver === undefined
                        ? null
                        : Number(fare.discountOver),
            }];
        });
    };

    // ── Job Linking ──
    const handleJobSelection = (jobId: string, checked: boolean) => {
        if (checked) {
            const job = billableJobs.find((j: any) => j.id === jobId);
            addPickupFareForJob(job);
            setLinkedJobCharges(prev => [...prev, {
                jobId, serviceItemId: null, serviceItemName: null, minPrice: 0, maxPrice: 0, billedAmount: 0, isValid: false,
                customerName: job?.customer || null, customerPhone: job?.customerPhone || null,
                customerAddress: job?.customerAddress || null, assistedByNames: job?.assistedByNames || null,
            }]);
        } else {
            setLinkedJobCharges(prev => prev.filter(j => j.jobId !== jobId));
            // Unlinking the job takes its journey off the bill with it.
            setCartItems(prev => prev.filter(item => item.id !== `pickup-${jobId}`));
        }
    };

    /**
     * Attach the job handed over from the Jobs tab ("Bill at POS").
     *
     * The tech finished a repair with the customer standing there; walking them
     * to a desktop to link the ticket by hand was the cost this removes. The
     * till now opens with the job already on the sale, leaving only parts and
     * warranty to enter.
     *
     * Guarded rather than trusted:
     *  - the id must be in billableJobs, so a stale or hand-edited link cannot
     *    attach a job the server does not consider billable
     *  - waits for that list to load instead of dropping the request in the gap
     *  - skips if already linked, so a re-render cannot double-add
     *  - survives a closed register: the handoff is remembered and applied once
     *    the drawer session opens, rather than silently lost behind the lock
     *    screen
     * The parameter is cleared once consumed so a refresh does not re-link a
     * job the cashier deliberately removed.
     */
    /**
     * Attach the job handed over from the Jobs tab ("Bill at POS").
     *
     * The tech finished a repair with the customer standing there; walking them
     * to a desktop to link the ticket by hand was the cost this removes. The
     * till opens with the job already on the sale, leaving only the parts used
     * and the warranty to enter.
     *
     * Guarded rather than trusted:
     *  - the id must be in billableJobs, so a stale or hand-edited link cannot
     *    attach a job the server does not consider billable
     *  - waits for that list to load instead of dropping the request in the gap
     *  - skips if already linked, so a re-render cannot double-add
     *  - survives a closed register: the handoff is held until the drawer
     *    session opens rather than being lost behind the lock screen
     * The parameter is cleared once consumed, so a refresh cannot re-link a job
     * the cashier deliberately removed.
     *
     * These MUST stay above the `if (drawerLoading) return` guard further down.
     * Placed below it they are skipped while the drawer query is in flight and
     * then run once it resolves, so the component calls more hooks than on the
     * previous render — React tears the whole till down with "Rendered more
     * hooks than during the previous render". Depending on `activeDrawer`
     * rather than the derived `hasDrawerSession` is what lets them live up
     * here, since that const is declared after the guard.
     */
    const pendingBillJobRef = useRef<string | null>(null);

    useEffect(() => {
        const target = new URLSearchParams(window.location.search).get("target");
        if (target) pendingBillJobRef.current = target;
    }, [location]);

    useEffect(() => {
        const jobId = pendingBillJobRef.current;
        if (!jobId || !activeDrawer || jobsLoading) return;
        if (!billableJobs.some((j: any) => j.id === jobId)) return;

        pendingBillJobRef.current = null;
        const params = new URLSearchParams(window.location.search);
        params.delete("target");
        const qs = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);

        setLinkedJobCharges((prev) => {
            if (prev.some((j) => j.jobId === jobId)) return prev;
            const job = billableJobs.find((j: any) => j.id === jobId) as any;
            addPickupFareForJob(job);
            toast.success(`Job ${getSafeJobDisplayRef(job) || jobId} linked`, {
                description: "Add the parts used and the warranty to finish billing.",
            });
            return [...prev, {
                jobId, serviceItemId: null, serviceItemName: null, minPrice: 0, maxPrice: 0, billedAmount: 0, isValid: false,
                customerName: job?.customer || null, customerPhone: job?.customerPhone || null,
                customerAddress: job?.customerAddress || null, assistedByNames: job?.assistedByNames || null,
            }];
        });
    }, [billableJobs, jobsLoading, activeDrawer]);

    /**
     * Warranty option lists, from settings with the shared defaults as fallback.
     * A malformed setting must still leave the counter able to promise cover.
     */
    const partsMonthOptions = useMemo(
        () => parseMonthOptions(
            (settings as any[])?.find((s) => s.key === WARRANTY_SETTING_KEYS.partsMonths)?.value,
            DEFAULT_PARTS_MONTH_OPTIONS,
        ),
        [settings],
    );
    const serviceMonthOptions = useMemo(
        () => parseMonthOptions(
            (settings as any[])?.find((s) => s.key === WARRANTY_SETTING_KEYS.serviceMonths)?.value,
            DEFAULT_SERVICE_MONTH_OPTIONS,
        ),
        [settings],
    );

    const handleWarrantyChange = (jobId: string, kind: "parts" | "service", raw: string) => {
        const months = raw === "none" ? null : Number(raw);
        setLinkedJobCharges((prev) => prev.map((j) => {
            if (j.jobId !== jobId) return j;
            return kind === "parts"
                ? { ...j, partsWarrantyMonths: months }
                : { ...j, serviceWarrantyMonths: months };
        }));
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
    };

    // ── Customer ──
    /**
     * The sheet can now hand back a bare { name } for a walk-in nobody has
     * saved yet, so a blank field on the incoming record means "not known",
     * not "clear what the counter already typed".
     */
    const handleSelectCustomer = (c: any) => {
        setCustomerName(c.name || "");
        if (c.phone) setCustomerPhone(c.phone);
        if (c.address) setCustomerAddress(c.address);
        setIsCustomerDialogOpen(false);
        toast.success(c.id ? "Customer details added" : `Billing to ${c.name}`);
    };

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
                setProductSearch(""); setBarcodeBuffer("");
            }
        }, 150);
    };

    // ── Calculations ──
    const calculateSubtotal = () => {
        const cart = cartItems.reduce((s, i) => s + parseFloat(String(i.price).replace(/[^0-9.-]+/g, "")) * i.quantity, 0);
        return cart + linkedJobCharges.reduce((s, j) => s + (j.billedAmount || 0), 0);
    };
    /**
     * VAT is charged on the repair, not on the journey.
     *
     * Transport was previously taxed with everything else because it sits in
     * the same cart: a Tk350 collection added Tk17.50 of VAT the shop had never
     * decided to charge. Excluded here by the shop's decision.
     *
     * Only the taxed BASE changes. The subtotal on screen still shows the full
     * amount including transport, because that is what the customer is paying
     * before tax — hiding the fare from the subtotal would misstate the bill to
     * fix the tax on it.
     */
    const calculateTaxableSubtotal = () => {
        const taxableCart = cartItems
            .filter((i) => !i.isPickupFare)
            .reduce((s, i) => s + parseFloat(String(i.price).replace(/[^0-9.-]+/g, "")) * i.quantity, 0);
        return taxableCart + linkedJobCharges.reduce((s, j) => s + (j.billedAmount || 0), 0);
    };
    const calculateTax = () => calculateTaxableSubtotal() * (getVatPercentage() / 100);

    /**
     * The collection discount, resolved here because here is the first moment
     * the bill exists.
     *
     * At booking the set has not been opened, so the customer was quoted the
     * full fare and told what would earn the discount. This is where that
     * promise is kept — automatically, because leaving it to whoever is at the
     * till is how it silently never happens.
     *
     * Judged against the repair, not the whole bill. `calculateTaxableSubtotal`
     * is already everything except transport, which is exactly the figure the
     * threshold was written about: a Tk350 fare must not help pay for itself.
     *
     * All of the fare or none of it. The line stays on the bill either way —
     * the customer is shown what the journey was worth and then shown it being
     * given to them. It is never called free.
     */
    const calculatePickupDiscount = () => {
        const repairTotal = calculateTaxableSubtotal();
        return cartItems.reduce((sum, item) => {
            if (!item.isPickupFare) return sum;
            const threshold = item.pickupDiscountOver;
            if (threshold === null || threshold === undefined || threshold <= 0) return sum;
            if (repairTotal < threshold) return sum;
            return sum + parseFloat(String(item.price).replace(/[^0-9.-]+/g, "")) * item.quantity;
        }, 0);
    };

    const calculateTotal = () =>
        calculateSubtotal() + calculateTax() - calculatePickupDiscount() - discount;

    // ── Checkout ──
    const openRegisterMutation = useMutation({
        mutationFn: () => {
            if (!user?.id) throw new Error("Current user is required to open register");
            return drawerApi.open({
                startingFloat: openRegisterTotal,
                openedBy: user.id,
                openedByName: user.name,
            });
        },
        onSuccess: () => {
            toast.success("Register opened successfully");
            setOpenRegisterCounts(createEmptyOpenRegisterCounts());
            queryClient.invalidateQueries({ queryKey: ["activeDrawer"] });
            queryClient.invalidateQueries({ queryKey: ["drawer-active"] });
            queryClient.invalidateQueries({ queryKey: ["drawerHistory"] });
        },
        onError: (error: Error) => toast.error(error.message || "Failed to open register"),
    });

    const checkoutMutation = useMutation({
        mutationFn: posTransactionsApi.create,
        onSuccess: async (response) => {
            const td: TransactionData = {
                id: response.id, invoiceNumber: response.invoiceNumber, customer: response.customer,
                customerPhone: response.customerPhone, customerAddress: response.customerAddress,
                items: typeof response.items === "string" ? JSON.parse(response.items) : response.items || [],
                linkedJobs: response.linkedJobs ? (typeof response.linkedJobs === "string" ? JSON.parse(response.linkedJobs) : response.linkedJobs) : [],
                subtotal: String(response.subtotal), tax: String(response.tax), taxRate: String(response.taxRate || "0"),
                discount: String(response.discount || "0"), total: String(response.total), paymentMethod: response.paymentMethod,
                paymentStatus: response.paymentStatus || (response.paymentMethod === "Due" ? "Due" : "Paid"), createdAt: String(response.createdAt),
            };
            // Close mobile cart sheet FIRST, then show dialog after spring exit animation (~350ms).
            // Without this the SuccessDialog (z-50) renders behind the cart sheet (z-[60]) and is invisible.
            setMobileCartOpen(false);
            setLastTransaction(td);
            setCartItems([]); setLinkedJobCharges([]); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setServiceAreaId(""); setDiscount(0); setPaymentMethod("Cash");
            setTimeout(() => setShowSuccessDialog(true), 380);
            queryClient.invalidateQueries({ queryKey: ["pos-transactions"] });
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
            queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
            queryClient.invalidateQueries({ queryKey: ["job-tickets"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-jobs"] });
        },
        onError: (error: Error) => toast.error(`Checkout failed: ${error.message}`),
    });

    const validateCheckout = () => {
        if (cartItems.length === 0 && linkedJobCharges.length === 0) { toast.error("Cart is empty!"); return; }
        for (const item of cartItems) {
            const inv = inventoryItems?.find((i: any) => i.id === item.id);
            if (inv) { const stock = inv.stock || 0; if (item.quantity > stock) { toast.error(`Insufficient stock for "${item.name}"`, { description: `Only ${stock} units available. You have ${item.quantity} in cart.` }); return; } }
        }
        const invalidJobs = linkedJobCharges.filter(j => !j.isValid);
        if (invalidJobs.length > 0) { toast.error("Please select a service and valid billing amount for all linked jobs"); return; }
        if (paymentMethod === "Due" && !customerName.trim()) { toast.error("Customer name is required for Due/Credit payments!"); return; }
        return true;
    };

    const submitCheckout = () => {
        const subtotal = calculateSubtotal(); const tax = calculateTax(); const total = calculateTotal(); const vatRate = getVatPercentage();
        const linkedJobsData = linkedJobCharges.map(j => ({ jobId: j.jobId, serviceItemId: j.serviceItemId, serviceItemName: j.serviceItemName, minPrice: j.minPrice, maxPrice: j.maxPrice, billedAmount: j.billedAmount, customerName: j.customerName, customerPhone: j.customerPhone, customerAddress: j.customerAddress, assistedByNames: j.assistedByNames, serviceWarrantyMonths: j.serviceWarrantyMonths ?? null, partsWarrantyMonths: j.partsWarrantyMonths ?? null }));

        checkoutMutation.mutate({
            id: `POS-${Date.now()}`, customer: customerName || null, customerPhone: customerPhone || null, customerAddress: customerAddress || null,
            items: JSON.stringify(cartItems), linkedJobs: linkedJobCharges.length > 0 ? JSON.stringify(linkedJobsData) : null,
            serviceAreaId: linkedJobCharges.length === 0 && serviceAreaId ? serviceAreaId : null,
            subtotal: parseFloat(subtotal.toFixed(2)), tax: parseFloat(tax.toFixed(2)), taxRate: parseFloat(vatRate.toFixed(2)),
            /**
             * Stored as one discount, deliberately.
             *
             * The ledger has a single column and one invariant — total equals
             * subtotal plus tax minus discount. Recording only the hand-typed
             * discount would leave the collection discount unexplained and every
             * such row failing that check, which is exactly the kind of drift
             * nobody finds until a month-end reconciliation. The two are still
             * separate on screen and on the receipt, where the customer is the
             * one who needs to see which is which.
             */
            discount: parseFloat((discount + calculatePickupDiscount()).toFixed(2)), total: parseFloat(total.toFixed(2)), paymentMethod, paymentStatus: paymentMethod === "Due" ? "Due" : "Paid",
        });
    };

    const handleCheckout = () => {
        if (!validateCheckout()) return;
        setShowPaymentReview(true);
    };

    const cancelHoldConfirm = () => {
        if (holdConfirmTimerRef.current) {
            clearTimeout(holdConfirmTimerRef.current);
            holdConfirmTimerRef.current = null;
        }
        setHoldConfirming(false);
    };

    const startHoldConfirm = () => {
        if (checkoutMutation.isPending) return;
        setHoldConfirming(true);
        holdConfirmTimerRef.current = setTimeout(() => {
            holdConfirmTimerRef.current = null;
            setHoldConfirming(false);
            if (!validateCheckout()) return;
            setShowPaymentReview(false);
            submitCheckout();
        }, 1400);
    };

    const handleRequestRefund = (t: any) => { setRefundTransaction(t); setShowRefundDialog(true); };

    // ── Customer autocomplete ──
    const customerSuggestions = useMemo(() => {
        if (!customers) return [];
        const list = customers as any[];
        if (customerSearchField === "phone") {
            const q = customerPhone.trim();
            if (q.length < 2) return [];
            return list.filter((c) => c.phone?.includes(q)).slice(0, 6);
        }
        const q = customerName.trim().toLowerCase();
        if (q.length < 1) return [];
        return list.filter((c) =>
            c.name?.toLowerCase().includes(q) || c.phone?.includes(customerName)
        ).slice(0, 6);
    }, [customerName, customerPhone, customers, customerSearchField]);

    const handleSelectCustomerSuggestion = (c: any) => {
        setCustomerName(c.name || "");
        setCustomerPhone(c.phone || "");
        setCustomerAddress(c.address || "");
        setShowCustomerAutocomplete(false);
    };

    // Category chips now live inside MobileProductPicker, which derives them
    // from the items it is given.

    // ── Filtered Products ──
    const filteredProducts = (() => {
        const s = productSearch.toLowerCase();
        const bySearch = products?.filter((p: any) => p.name.toLowerCase().includes(s) || (p.description && p.description.toLowerCase().includes(s)) || (p.category && p.category.toLowerCase().includes(s))) || [];
        if (activeCategory === "All") return bySearch;
        return bySearch.filter((p: any) => p.category === activeCategory);
    })();

    // ── Mobile picker ────────────────────────────────────────────────────
    /**
     * The mobile picker owns its own search and category filtering, so it takes
     * the whole catalogue rather than the pre-filtered desktop list.
     *
     * `price` here is the display string. Nothing derives money from it: the add
     * handler below re-reads the raw price off the product by id, so what lands
     * in the cart and in the stored transaction is byte-identical to the desktop
     * path regardless of how this is formatted.
     */
    const pickerItems: MobilePickerItem[] = useMemo(() => {
        return ((products as any[]) ?? []).map((p) => {
            const inv = (inventoryItems as any[])?.find((i: any) => i.id === p.id);
            return {
                id: p.id,
                name: p.name,
                price: `${getCurrencySymbol()} ${Number(p.price).toLocaleString()}`,
                category: p.category ?? undefined,
                images: p.images ?? null,
                stock: Number(inv?.stock ?? p.stock ?? 0),
            };
        });
    }, [products, inventoryItems]);

    // Recently sold items, newest first. Survives reload — the same twenty parts
    // are most of the counter's volume and retyping them is the cost being cut.
    const [recentItemIds, setRecentItemIds] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem("pos-recent-item-ids");
            const parsed: unknown = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
        } catch {
            return [];
        }
    });

    const rememberRecentItem = (id: string) => {
        setRecentItemIds((prev) => {
            const next = [id, ...prev.filter((existing) => existing !== id)].slice(0, 12);
            try {
                localStorage.setItem("pos-recent-item-ids", JSON.stringify(next));
            } catch {
                // A full or blocked localStorage must never break a sale.
            }
            return next;
        });
    };

    const handlePickerAdd = (item: { id: string }) => {
        const product = (products as any[])?.find((p: any) => p.id === item.id);
        if (!product) return;
        const inv = (inventoryItems as any[])?.find((i: any) => i.id === product.id);
        const stock = Number(inv?.stock ?? product.stock ?? 0);
        if (stock <= 0) {
            toast.error(`"${product.name}" is out of stock`);
            return;
        }
        const imgs = parseImages(product.images);
        addToCart({ id: product.id, name: product.name, price: String(product.price), quantity: 1, image: imgs[0] });
        rememberRecentItem(product.id);
    };

    /**
     * Sourced parts already bought for a job, used to answer "what did I pay
     * last time?" without a round trip per keystroke — the picker's suggestion
     * hook is synchronous by design.
     */
    const { data: localPurchaseHistory } = useQuery({
        queryKey: ["local-purchases-history"],
        queryFn: () => localPurchasesApi.getAll(),
        staleTime: 5 * 60 * 1000,
    });

    const sourcedPartSuggestion = useMemo(() => {
        const byName = new Map<string, any>();
        for (const purchase of ((localPurchaseHistory as any[]) ?? [])) {
            const key = String(purchase.partName ?? "").trim().toLowerCase();
            if (!key) continue;
            const seen = byName.get(key);
            // Most recent wins — the last price paid is the best estimate of the
            // next one. Never an average: this is a volatile local market.
            if (!seen || new Date(purchase.createdAt) > new Date(seen.createdAt)) {
                byName.set(key, purchase);
            }
        }
        return (name: string) => {
            const match = byName.get(name.trim().toLowerCase());
            if (!match) return undefined;
            return {
                supplierName: match.supplierName ?? undefined,
                costPrice: match.costPrice ?? undefined,
                sellingPrice: match.sellingPrice ?? undefined,
                warrantyDays: match.warrantyDays ?? undefined,
            };
        };
    }, [localPurchaseHistory]);

    /**
     * A sourced part is billed to the sale immediately.
     *
     * It is deliberately NOT written to local_purchases here. That ledger
     * requires a job ticket (jobTicketId is NOT NULL) which a counter sale need
     * not have, and every row in it is expected to carry a receipt photo.
     * Writing a receiptless row tied to a guessed job would quietly weaken the
     * petty-cash audit trail that LocalPurchaseModal exists to enforce. Parts
     * bought against a repair still go through that modal, which is also what
     * feeds the warranty resolver.
     */
    const handleAddSourcedPart = (part: {
        partName: string;
        supplierName?: string;
        costPrice: number;
        sellingPrice: number;
        warrantyDays?: number;
    }) => {
        addToCart({
            id: `sourced:${part.partName.trim().toLowerCase()}`,
            name: part.partName.trim(),
            price: String(part.sellingPrice),
            quantity: 1,
            isSourced: true,
            /**
             * Both of these were previously shown in a toast and then thrown
             * away. The cost may legitimately be absent — that is the whole
             * point of settling it at the end of the shift — but "absent" and
             * "discarded" are different states, and only one of them can be
             * chased later. The warranty must never be lost at all.
             */
            sourcedCostPrice: Number.isFinite(part.costPrice) && part.costPrice > 0 ? part.costPrice : null,
            sourcedWarrantyDays: part.warrantyDays ?? null,
        });
        toast.success(`${part.partName.trim()} added`, {
            description: part.warrantyDays
                ? `Sourced part · ${part.warrantyDays}-day warranty`
                : "Sourced part · no warranty given",
        });
    };

    const subtotal = calculateSubtotal(); const tax = calculateTax(); const total = calculateTotal();
    const pickupDiscount = calculatePickupDiscount();
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
                const job = billableJobs?.find((j: any) => j.id === charge.jobId) as any;
                const svcActive = job?.serviceExpiryDate && new Date(job.serviceExpiryDate) > new Date();
                const partsActive = job?.partsExpiryDate && new Date(job.partsExpiryDate) > new Date();
                const hasWarranty = job && (job.serviceWarrantyDays !== undefined || job.partsWarrantyDays !== undefined || job.serviceExpiryDate || job.partsExpiryDate);
                return (
                    <div key={charge.jobId} className="mb-3 pb-3 border-b border-indigo-100 last:border-b-0 last:pb-0 last:mb-0">
                        <div className="flex justify-between text-xs text-indigo-600 mb-1">
                            <span className="font-medium font-mono">{getSafeJobDisplayRef({ id: charge.jobId, corporateJobNumber: (job as any)?.corporateJobNumber })}</span>
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
                            {/*
                              * Warranty is set HERE, not deferred to the evening
                              * like the sourced-part cost. A cost is a fact that
                              * can be looked up tonight; a warranty is a promise
                              * made to the customer's face, and if it is not
                              * recorded now there is nothing to reconstruct it
                              * from when they claim in month four.
                              *
                              * "No warranty" stays selectable — some repairs
                              * carry none, and defaulting to a period would put
                              * a promise on the record nobody made.
                              */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-[10px] text-indigo-600 mb-1 block">Parts warranty</Label>
                                    <Select
                                        value={charge.partsWarrantyMonths != null ? String(charge.partsWarrantyMonths) : "none"}
                                        onValueChange={(v) => handleWarrantyChange(charge.jobId, "parts", v)}
                                    >
                                        <SelectTrigger className="h-7 text-xs bg-white/50 backdrop-blur-sm border-indigo-200"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none" className="text-xs">No warranty</SelectItem>
                                            {partsMonthOptions.map((m) => (
                                                <SelectItem key={m} value={String(m)} className="text-xs">{formatWarrantyMonths(m)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-[10px] text-indigo-600 mb-1 block">Service warranty</Label>
                                    <Select
                                        value={charge.serviceWarrantyMonths != null ? String(charge.serviceWarrantyMonths) : "none"}
                                        onValueChange={(v) => handleWarrantyChange(charge.jobId, "service", v)}
                                    >
                                        <SelectTrigger className="h-7 text-xs bg-white/50 backdrop-blur-sm border-indigo-200"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none" className="text-xs">No warranty</SelectItem>
                                            {serviceMonthOptions.map((m) => (
                                                <SelectItem key={m} value={String(m)} className="text-xs">{formatWarrantyMonths(m)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
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
        label: 'Cash Shortage',
        description: 'Cash is below expected. This is flagged for Super Admin review.',
        amountPrefix: '-',
        amountClass: 'text-orange-700',
        cardClass: 'from-orange-50 via-amber-50 to-yellow-50 border-orange-200/70',
        iconWrapClass: 'bg-orange-100',
        iconClass: 'text-orange-600',
        badgeClass: 'bg-orange-100 text-orange-700 border-orange-200',
        Icon: AlertTriangle,
    };

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="h-full flex flex-col overflow-hidden relative">
            {!hasDrawerSession && (
                <div className="absolute inset-0 z-50 flex flex-col">
                    {/* ── Mobile lock screen ── */}
                    <form
                        className="md:hidden flex h-full min-h-0 flex-col bg-[#f8fafc] px-3 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom))]"
                        onSubmit={(event) => {
                            event.preventDefault();
                            openRegisterMutation.mutate();
                        }}
                    >
                        <div className="flex flex-none items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/90 p-2.5 shadow-sm backdrop-blur">
                            <button
                                type="button"
                                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm active:scale-95"
                                onClick={() => {
                                    setLocation(buildNavigateAdminTabPath("dashboard"));
                                }}
                                aria-label="Back"
                            >
                                <ChevronDown className="h-5 w-5 rotate-90" />
                            </button>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <h2 className="truncate text-lg font-black text-slate-950">Open Register</h2>
                                    <Badge className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0 text-[10px] text-rose-700 hover:bg-rose-50">Closed</Badge>
                                </div>
                                <p className="truncate text-[11px] font-semibold text-slate-500">Count opening cash before counter sales.</p>
                            </div>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                <Wallet className="h-5 w-5" />
                            </div>
                        </div>

                        <div className="mt-2 flex flex-none items-end justify-between rounded-2xl border border-slate-200 bg-slate-950 p-3 text-white shadow-sm">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Total Opening Float</p>
                                <div className="mt-1 text-3xl font-black tabular-nums">{getCurrencySymbol()}{openRegisterTotal.toLocaleString()}</div>
                            </div>
                            <div className="text-right text-[11px] font-bold text-white/55">
                                <div>Notes {getCurrencySymbol()}{openRegisterNotesTotal.toLocaleString()}</div>
                                <div>Small {getCurrencySymbol()}{openRegisterSmallCashTotal.toLocaleString()}</div>
                            </div>
                        </div>

                        {lastDrawerSession?.openedByName && (
                            <div className="mt-2 flex flex-none items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
                                <span className="font-bold text-slate-400">Last session</span>
                                <span className="max-w-[180px] truncate font-black text-slate-700">{lastDrawerSession.openedByName}</span>
                            </div>
                        )}

                        <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                            <div className="mb-2 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Cash counter pad</p>
                                    <p className="text-xs font-semibold text-slate-500">Tap count. Total updates instantly.</p>
                                </div>
                                <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg px-2 text-xs" onClick={() => setOpenRegisterCounts(createEmptyOpenRegisterCounts())}>
                                    Clear
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {OPEN_REGISTER_DENOMINATIONS.map((denomination) => {
                                    const count = openRegisterCounts[denomination];
                                    const subtotalForDenomination = count * denomination;
                                    const isActive = count > 0;
                                    const isSmallCash = denomination <= 10;

                                    return (
                                        <div key={denomination} className={cn("rounded-xl border p-2.5", isActive ? "border-blue-200 bg-blue-50" : isSmallCash ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white")}>
                                            <div className="flex items-start justify-between gap-1">
                                                <div>
                                                    <div className="text-base font-black tabular-nums text-slate-950">{getCurrencySymbol()}{denomination}</div>
                                                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{isSmallCash ? "Small" : "Note"}</div>
                                                </div>
                                                <div className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums", isActive ? "bg-white text-blue-700" : "bg-slate-100 text-slate-400")}>
                                                    {getCurrencySymbol()}{subtotalForDenomination}
                                                </div>
                                            </div>
                                            <div className="mt-2 grid grid-cols-[30px_1fr_30px] items-center gap-1.5">
                                                <button type="button" className="flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 active:scale-95" onClick={() => updateOpenRegisterCount(denomination, count - 1)}>
                                                    <Minus className="h-3.5 w-3.5" />
                                                </button>
                                                <Input type="number" inputMode="numeric" min={0} value={count} onChange={(event) => updateOpenRegisterCount(denomination, Number(event.target.value))} className="h-8 rounded-lg border-slate-200 bg-white text-center text-sm font-black tabular-nums" />
                                                <button type="button" className="flex h-8 items-center justify-center rounded-lg bg-blue-600 text-white active:scale-95" onClick={() => updateOpenRegisterCount(denomination, count + 1)}>
                                                    <Plus className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <Button type="submit" className="mt-2 h-12 flex-none rounded-2xl bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700" disabled={openRegisterMutation.isPending || !user?.id}>
                            {openRegisterMutation.isPending ? "Opening..." : "Confirm Float & Open"}
                        </Button>
                    </form>
                    <div className="hidden flex-col h-full bg-slate-900 px-5 py-8">
                        <div className="flex-1 flex flex-col items-center justify-center gap-5">
                            <div className="w-24 h-24 rounded-[2rem] bg-white/10 border border-white/10 flex items-center justify-center">
                                <LockKeyhole className="w-12 h-12 text-white/80" />
                            </div>
                            <div className="text-center">
                                <p className="text-white/40 text-[11px] font-black uppercase tracking-widest mb-1">Register</p>
                                <h1 className="text-white font-black text-3xl leading-tight">Closed</h1>
                                <p className="text-white/40 text-xs mt-2 max-w-[240px]">Open a session with starting float to begin transactions</p>
                            </div>
                            {lastDrawerSession?.openedByName && (
                                <div className="w-full max-w-[280px] px-4 py-3 rounded-2xl bg-white/8 border border-white/10 text-center space-y-0.5">
                                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Last opened by</p>
                                    <p className="text-white font-black text-xl">{lastDrawerSession.openedByName}</p>
                                    {lastDrawerSession.closedAt && (
                                        <p className="text-white/30 text-[11px]">
                                            {new Date(lastDrawerSession.closedAt).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}
                                            {" · "}
                                            {new Date(lastDrawerSession.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setDrawerModalType("open")}
                            className="w-full h-14 rounded-2xl bg-blue-600 text-white font-black text-lg active:scale-[0.97] transition-transform shadow-lg shadow-blue-900/50"
                        >
                            Open Register
                        </button>
                    </div>
                    {/* ── Desktop lock screen (original style) ── */}
                    <div className="hidden md:flex h-full min-h-0 flex-col bg-[#f8fafc] p-4">
                        <div className="flex flex-none items-start justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white/85 p-5 shadow-sm">
                            <div className="flex items-start gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100">
                                    <LockKeyhole className="h-7 w-7 text-rose-600" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-2xl font-black text-slate-950">Open Register</h2>
                                        <Badge className="rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">Register Closed</Badge>
                                    </div>
                                    <p className="mt-1 text-sm font-medium text-slate-500">Count opening cash before POS transactions begin.</p>
                                </div>
                            </div>
                            {lastDrawerSession?.openedByName && (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right text-sm shadow-inner">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Last session</p>
                                    <p className="mt-1 font-black text-slate-800">{lastDrawerSession.openedByName}</p>
                                    {lastDrawerSession.closedAt && (
                                        <p className="text-xs font-semibold text-slate-500">
                                            {new Date(lastDrawerSession.closedAt).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}
                                            {" · "}
                                            {new Date(lastDrawerSession.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                openRegisterMutation.mutate();
                            }}
                            className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
                        >
                            <div className="flex min-h-0 flex-col rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-none items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Opening Cash Count</p>
                                        <h3 className="mt-1 text-xl font-black text-slate-950">Cash counter pad</h3>
                                    </div>
                                    <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl gap-2" onClick={() => setOpenRegisterCounts(createEmptyOpenRegisterCounts())}>
                                        <RefreshCcw className="h-4 w-4" />
                                        Clear
                                    </Button>
                                </div>
                                <div className="mt-4 grid min-h-0 grid-cols-2 gap-3 overflow-y-auto pr-1 xl:grid-cols-3">
                                    {OPEN_REGISTER_DENOMINATIONS.map((denomination) => {
                                        const count = openRegisterCounts[denomination];
                                        const subtotalForDenomination = count * denomination;
                                        const isActive = count > 0;
                                        const isSmallCash = denomination <= 10;

                                        return (
                                            <div key={denomination} className={cn("rounded-2xl border p-3 transition-colors", isActive ? "border-blue-200 bg-blue-50/80 shadow-sm" : isSmallCash ? "border-slate-200 bg-slate-50/70" : "border-slate-200 bg-white")}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <div className="text-lg font-black tabular-nums text-slate-950">{getCurrencySymbol()}{denomination}</div>
                                                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{isSmallCash ? "Small cash" : "Note"}</div>
                                                    </div>
                                                    <div className={cn("rounded-full px-2 py-1 text-[11px] font-black tabular-nums", isActive ? "bg-white text-blue-700" : "bg-slate-100 text-slate-400")}>
                                                        {getCurrencySymbol()}{subtotalForDenomination}
                                                    </div>
                                                </div>
                                                <div className="mt-3 grid grid-cols-[34px_1fr_34px] items-center gap-2">
                                                    <button type="button" className="flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm active:scale-95" onClick={() => updateOpenRegisterCount(denomination, count - 1)}>
                                                        <Minus className="h-4 w-4" />
                                                    </button>
                                                    <Input type="number" inputMode="numeric" min={0} value={count} onChange={(event) => updateOpenRegisterCount(denomination, Number(event.target.value))} className="h-9 rounded-xl border-slate-200 bg-white text-center text-base font-black tabular-nums" />
                                                    <button type="button" className="flex h-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm active:scale-95" onClick={() => updateOpenRegisterCount(denomination, count + 1)}>
                                                        <Plus className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex min-h-0 flex-col rounded-[2rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15">
                                    <Wallet className="h-6 w-6 text-blue-200" />
                                </div>
                                <p className="mt-5 text-[11px] font-black uppercase tracking-[0.16em] text-white/40">Total Opening Float</p>
                                <div className="mt-2 text-5xl font-black tabular-nums">{getCurrencySymbol()}{openRegisterTotal.toLocaleString()}</div>
                                <div className="mt-5 space-y-3 text-sm">
                                    <div className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2">
                                        <span className="text-white/50">Notes total</span>
                                        <span className="font-black tabular-nums">{getCurrencySymbol()}{openRegisterNotesTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2">
                                        <span className="text-white/50">Small cash</span>
                                        <span className="font-black tabular-nums">{getCurrencySymbol()}{openRegisterSmallCashTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2">
                                        <span className="text-white/50">Opened by</span>
                                        <span className="max-w-[150px] truncate font-black">{user?.name || "Unknown"}</span>
                                    </div>
                                </div>
                                <div className="mt-auto rounded-2xl border border-blue-300/20 bg-blue-400/10 p-3 text-xs font-semibold leading-relaxed text-blue-100">
                                    This amount becomes the opening float for the active POS session.
                                </div>
                                <Button type="submit" className="mt-4 h-12 rounded-2xl bg-blue-600 text-base font-black text-white hover:bg-blue-700" disabled={openRegisterMutation.isPending || !user?.id}>
                                    {openRegisterMutation.isPending ? "Opening..." : "Confirm Float & Open"}
                                </Button>
                            </div>
                        </form>
                    </div>
                    <div className="hidden bg-slate-100/80 backdrop-blur-md flex-col items-center justify-center h-full p-6 text-center">
                        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-slate-200">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 mb-6">
                                <LockKeyhole className="h-10 w-10 text-rose-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">Register is Closed</h2>
                            {lastDrawerSession?.openedByName && (
                                <p className="text-sm text-slate-500 mb-2">
                                    Last opened by <strong className="text-slate-700">{lastDrawerSession.openedByName}</strong>
                                    {lastDrawerSession.closedAt && (
                                        <span className="text-slate-400"> · {new Date(lastDrawerSession.closedAt).toLocaleDateString()}</span>
                                    )}
                                </p>
                            )}
                            <p className="text-slate-500 mb-8">Open a register session with a starting cash float before making transactions.</p>
                            <Button className="w-full h-12 text-lg font-bold shadow-lg bg-blue-600 hover:bg-blue-700" onClick={() => setDrawerModalType("open")}>
                                Open Register
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {isDrawerCounting && activeDrawer && drawerResultMeta && (
                /*
                 * This screen is the only way out of a counted drawer.
                 *
                 * The blind count is already saved by the time it appears, and
                 * the whole POS tab is locked behind it, so its "Close for Day"
                 * button is the sole route back to trading. It used to centre
                 * an un-scrollable card taller than a phone, which put that
                 * button off the bottom of the screen with no way to reach it —
                 * a register that could be counted but never closed. It scrolls
                 * now, and it is sized for a phone first.
                 */
                <div className="absolute inset-0 z-50 flex flex-col overflow-y-auto bg-slate-100/80 p-4 text-center backdrop-blur-md sm:p-6 md:items-center md:justify-center">
                    <div className="my-auto w-full max-w-2xl space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8 sm:space-y-6">
                        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 sm:h-20 sm:w-20">
                            <AlertTriangle className="h-7 w-7 text-amber-600 sm:h-10 sm:w-10" />
                        </div>
                        <div className="space-y-2">
                            <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Drawer Under Review</h2>
                            <p className="text-slate-500">
                                Blind drop is complete. This register is waiting for Super Admin review before normal cash activity resumes.
                            </p>
                        </div>

                        <div className={`rounded-3xl border bg-gradient-to-r ${drawerResultMeta.cardClass} p-4 text-left shadow-sm sm:p-6`}>
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
                                <div className="mt-5 grid gap-3 sm:grid-cols-3">
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
                                        className={`h-12 w-full rounded-xl text-base font-bold text-white sm:w-auto ${discrepancyAmount === 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}
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
            <Suspense fallback={null}>
                <CustomerDialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen} customers={customers || []} customersLoading={customersLoading} onSelect={handleSelectCustomer} getCurrencySymbol={getCurrencySymbol} />
                <JobLinkDialog
                    open={isJobDialogOpen}
                    onOpenChange={setIsJobDialogOpen}
                    billableJobs={billableJobs}
                    jobsLoading={jobsLoading}
                    linkedJobCharges={linkedJobCharges}
                    onJobSelection={handleJobSelection}
                    serviceItems={serviceItems}
                    onServiceItemSelect={handleServiceItemSelect}
                    onBilledAmountChange={handleBilledAmountChange}
                    getCurrencySymbol={getCurrencySymbol}
                />
                <InventoryDialog open={isInventoryDialogOpen} onOpenChange={setIsInventoryDialogOpen} inventoryItems={inventoryItems} inventoryLoading={inventoryLoading} selectedInventory={selectedInventory} onInventorySelection={handleInventorySelection} onAddToCart={handleAddInventoryToCart} getCurrencySymbol={getCurrencySymbol} />
                <SuccessDialog
                    open={showSuccessDialog}
                    onOpenChange={setShowSuccessDialog}
                    lastTransaction={lastTransaction}
                    getCurrencySymbol={getCurrencySymbol}
                    onShowInvoice={() => { setShowSuccessDialog(false); setShowInvoicePreview(true); }}
                    onShowReceipt={() => { setShowSuccessDialog(false); setShowReceiptPreview(true); }}
                    onSharePDF={() => { setAutoShareReceipt(true); setShowReceiptPreview(true); }}
                />
                <InvoicePreviewDialog open={showInvoicePreview} onOpenChange={setShowInvoicePreview} lastTransaction={lastTransaction} companyInfo={companyInfo} />
                <ReceiptPreviewDialog
                    open={showReceiptPreview}
                    onOpenChange={(v) => { setShowReceiptPreview(v); if (!v) setAutoShareReceipt(false); }}
                    lastTransaction={lastTransaction}
                    companyInfo={companyInfo}
                    autoShare={autoShareReceipt}
                />
                <HistoryDialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog} posTransactions={Array.isArray(posTransactions) ? posTransactions : (posTransactions?.items || [])} getCurrencySymbol={getCurrencySymbol} onRequestRefund={handleRequestRefund} onSetTransaction={setLastTransaction} onShowInvoice={() => setShowInvoicePreview(true)} onShowReceipt={() => setShowReceiptPreview(true)} />
                <RefundDialog open={showRefundDialog} onOpenChange={setShowRefundDialog} refundTransaction={refundTransaction} getCurrencySymbol={getCurrencySymbol} />
            </Suspense>

            {/* Mobile Cart Bar — dark bottom strip, matches mockup */}
            {isMobile && cartCount > 0 && !mobileCartOpen && (
                <motion.div
                    initial={{ y: 80 }}
                    animate={{ y: 0 }}
                    className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-0 right-0 z-40 bg-slate-900 px-5 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
                    onClick={() => setMobileCartOpen(true)}
                >
                    <div>
                        <p className="text-slate-400 text-[11px] font-medium">{cartCount} Item{cartCount !== 1 ? "s" : ""}</p>
                        <p className="text-white font-black text-lg leading-tight tabular-nums">{getCurrencySymbol()} {total.toLocaleString()}</p>
                    </div>
                    <button type="button" className="bg-blue-600 text-white font-bold text-sm px-5 h-11 rounded-xl active:scale-[0.97] transition-transform shrink-0">
                        View Cart
                    </button>
                </motion.div>
            )}

            {/* Mobile Cart Drawer */}
            {createPortal(
                <AnimatePresence>
                    {isMobile && mobileCartOpen && (
                        <>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[210] bg-black/40 backdrop-blur-sm" onClick={() => setMobileCartOpen(false)} />
                        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="fixed bottom-0 left-0 right-0 z-[220] flex h-[calc(100dvh-0.5rem)] flex-col rounded-t-[2rem] bg-white shadow-2xl">
                            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
                            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
                                <div>
                                    <div className="flex items-center gap-2 text-slate-950"><ShoppingCart className="w-5 h-5 text-blue-600" /><h3 className="text-xl font-black">Cart</h3></div>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-400">{cartCount} item{cartCount === 1 ? "" : "s"} ready for checkout</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600" onClick={() => { setMobileCartOpen(false); setTimeout(() => setShowHistoryDialog(true), 220); }}><FileText className="h-4 w-4" /></Button>
                                    <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => setMobileCartOpen(false)}><X className="h-5 w-5" /></Button>
                                </div>
                            </div>

                            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 pb-5">
                                {/* Mobile Cart Customer */}
                                <div className="rounded-3xl border border-slate-100 bg-white p-3.5 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-sm font-black text-blue-700">
                                                {(customerName || "G")[0].toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Customer</p>
                                                <p className="truncate text-sm font-black text-slate-950">{customerName || "Walk-in customer"}</p>
                                                <p className="truncate text-xs font-semibold text-slate-400">{customerPhone || "No phone added"}</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsCustomerDialogOpen(true)}
                                            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white shadow-sm active:scale-[0.97]"
                                        >
                                            <UserPlus className="h-4 w-4" />
                                            Choose
                                        </button>
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 gap-2">
                                        {/*
                                          * The name, typed.
                                          *
                                          * Until now the only way to put a name on a
                                          * mobile bill was to pick someone already
                                          * saved — and "Choose Customer" has no way to
                                          * add anybody. A walk-in who had never been
                                          * here before could not be named at all,
                                          * which also made a Due sale impossible on a
                                          * phone: checkout refuses Due without one.
                                          *
                                          * The suggestion list under it is the
                                          * autocomplete this file has always computed
                                          * and never rendered.
                                          */}
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Customer name"
                                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                                                value={customerName}
                                                onChange={(e) => {
                                                    setCustomerName(e.target.value);
                                                    setCustomerSearchField("name");
                                                    setShowCustomerAutocomplete(true);
                                                }}
                                                onFocus={() => { setCustomerSearchField("name"); setShowCustomerAutocomplete(true); }}
                                                // A blur that fires before the tap lands would
                                                // close the list out from under the finger.
                                                onBlur={() => window.setTimeout(() => setShowCustomerAutocomplete(false), 150)}
                                            />
                                            {showCustomerAutocomplete && customerSuggestions.length > 0 && (
                                                <div className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                                                    {customerSuggestions.map((c: any) => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => handleSelectCustomerSuggestion(c)}
                                                            className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 active:bg-blue-50"
                                                        >
                                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-xs font-black text-blue-700">
                                                                {(c.name || "?")[0].toUpperCase()}
                                                            </span>
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[13px] font-bold text-slate-900">{c.name || "Unnamed"}</span>
                                                                <span className="block truncate text-[11px] font-semibold text-slate-400">{c.phone || "No phone"}</span>
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            inputMode="tel"
                                            placeholder="Phone number"
                                            className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                                            value={customerPhone}
                                            onChange={(e) => setCustomerPhone(e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Address (optional)"
                                            className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                                            value={customerAddress}
                                            onChange={(e) => setCustomerAddress(e.target.value)}
                                        />
                                        <select value={serviceAreaId} onChange={(event) => setServiceAreaId(event.target.value)} disabled={linkedJobCharges.length > 0} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 disabled:bg-slate-100">
                                            <option value="">{linkedJobCharges.length > 0 ? 'Area inherited from linked jobs' : 'Service area (optional)'}</option>
                                            {serviceAreas.map((area) => <option key={area.id} value={area.id}>{[area.blockOrSector, area.subareaName, area.areaName].filter(Boolean).join(', ')}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {/* Mobile Cart Items */}
                                {cartItems.map(item => {
                                    const price = parseFloat(String(item.price).replace(/[^0-9.-]+/g, "")); const inv = inventoryItems?.find((i: any) => i.id === item.id); const stock = inv?.stock || 0;
                                    return (
                                        <div key={item.id} className="flex gap-3 rounded-3xl border border-slate-100 bg-white p-3.5 shadow-sm">
                                            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">{item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-slate-300" />}</div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="line-clamp-2 text-[13px] font-black leading-snug text-slate-900">{item.name}</p>
                                                        {/* A sourced part was bought for this sale and
                                                            was never stocked, so "Stock 0" reads as a
                                                            warning about something that is not wrong. */}
                                                        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                                                            {item.isSourced ? "Sourced for this sale" : `Stock ${stock}`}
                                                        </p>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-500" onClick={() => removeFromCart(item.id)}><Trash2 className="h-4 w-4" /></Button>
                                                </div>
                                                <div className="mt-2.5 flex items-center justify-between gap-3">
                                                    <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-2xl hover:bg-slate-200" onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}><Minus className="h-3.5 w-3.5" /></Button>
                                                        <span className="min-w-7 text-center text-sm font-black tabular-nums text-slate-800">{item.quantity}</span>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-2xl hover:bg-slate-200" onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}><Plus className="h-3.5 w-3.5" /></Button>
                                                    </div>
                                                    <span className="text-sm font-black tabular-nums text-slate-950">{getCurrencySymbol()}{(price * item.quantity).toFixed(0)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <LinkedJobsInCart />
                                {/*
                                  * Close Register used to sit here, under the
                                  * items and above the checkout button. Ending a
                                  * shift is not a step in taking a payment, and
                                  * putting it in the checkout column meant the
                                  * only way to reach it was to open a cart. It
                                  * now lives on the register's own status bar at
                                  * the top of this tab.
                                  */}
                            </div>

                            {/* Mobile Sticky Footer */}
                            <div className="z-10 space-y-2.5 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Total Due</span>
                                    <span className="text-xl font-black tabular-nums text-slate-900">{getCurrencySymbol()}{total.toFixed(0)}</span>
                                </div>
                                {/* 2×2 brand-colour payment tiles */}
                                {/* Wraps instead of scrolling: "Due" sat off the
                                    right edge with nothing to say it was there. */}
                                <div className="-mx-1 px-1">
                                    <div className="flex flex-wrap gap-2">
                                    {PAYMENT_METHODS.map(m => {
                                        const isSel = paymentMethod === m.value;
                                        if (m.value === "bKash") return (
                                            <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                                                className={cn("flex h-9 min-w-[76px] items-center justify-center rounded-full border px-3 text-xs font-black transition-all active:scale-[0.97]", isSel ? "border-transparent text-white shadow-sm" : "border-slate-200 bg-white text-[#E2136E]")}
                                                style={isSel ? { background: "#E2136E" } : {}}>
                                                bKash
                                            </button>
                                        );
                                        if (m.value === "Nagad") return (
                                            <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                                                className={cn("flex h-9 min-w-[76px] items-center justify-center rounded-full border px-3 text-xs font-black transition-all active:scale-[0.97]", isSel ? "border-transparent text-white shadow-sm" : "border-slate-200 bg-white text-[#F06823]")}
                                                style={isSel ? { background: "#F06823" } : {}}>
                                                Nagad
                                            </button>
                                        );
                                        const Icon = m.icon === "Banknote" ? Banknote : m.icon === "Landmark" ? Landmark : m.icon === "Clock" ? Clock : CreditCard;
                                        const selBg: Record<string, string> = { Cash: "#10b981", Bank: "#0ea5e9", Due: "#8b5cf6" };
                                        return (
                                            <button key={m.value} type="button" onClick={() => setPaymentMethod(m.value)}
                                                className={cn("flex h-9 min-w-[76px] items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-black transition-all active:scale-[0.97]", isSel ? "border-transparent text-white shadow-sm" : "border-slate-200 bg-white text-slate-600")}
                                                style={isSel ? { background: selBg[m.value] || "#64748b" } : {}}>
                                                <Icon className={cn("h-3.5 w-3.5", isSel ? "text-white" : "text-slate-400")} />
                                                {m.label}
                                            </button>
                                        );
                                    })}
                                    </div>
                                </div>
                                <Button className="h-11 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 text-sm font-black text-white shadow-lg shadow-emerald-500/20" onClick={handleCheckout} disabled={checkoutMutation.isPending || cartCount === 0}>
                                    {checkoutMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : (<><CreditCard className="mr-2 h-4 w-4" /> {paymentMethod === "Due" ? "Review Due" : `Review ${getCurrencySymbol()}${total.toFixed(0)}`}</>)}
                                </Button>
                            </div>
                        </motion.div>
                    </>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ─── MOBILE PRODUCT GRID ─────────────────────────────────────── */}
            {createPortal(
                <AnimatePresence>
                    {showPaymentReview && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[280] bg-slate-950/45 backdrop-blur-sm"
                            onClick={() => {
                                cancelHoldConfirm();
                                setShowPaymentReview(false);
                            }}
                        />
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", damping: 28, stiffness: 260 }}
                            className="fixed inset-x-0 bottom-0 z-[290] flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl md:left-1/2 md:max-w-lg md:-translate-x-1/2"
                        >
                            <div className="flex items-center justify-center px-4 pt-3">
                                <div className="h-1.5 w-12 rounded-full bg-slate-200" />
                            </div>
                            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-4 pt-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600">Final Review</p>
                                    <h3 className="text-xl font-black text-slate-950">Confirm payment</h3>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">Check items, customer, and method before billing.</p>
                                </div>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-9 w-9 shrink-0 rounded-full bg-slate-100 text-slate-500"
                                    onClick={() => {
                                        cancelHoldConfirm();
                                        setShowPaymentReview(false);
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-bold text-slate-400">Customer</p>
                                            <p className="mt-0.5 text-sm font-black text-slate-900">{customerName || "Walk-in customer"}</p>
                                            {(customerPhone || customerAddress) && (
                                                <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{[customerPhone, customerAddress].filter(Boolean).join(" - ")}</p>
                                            )}
                                        </div>
                                        <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Method</p>
                                            <p className="text-sm font-black text-slate-900">{paymentMethod}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {cartItems.map((item) => {
                                        const price = parseFloat(String(item.price).replace(/[^0-9.-]+/g, ""));
                                        return (
                                            <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
                                                    {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-slate-300" />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="line-clamp-1 text-sm font-black text-slate-900">{item.name}</p>
                                                    <p className="text-xs font-semibold text-slate-400">Qty {item.quantity} x {getCurrencySymbol()}{price.toFixed(0)}</p>
                                                </div>
                                                <p className="text-sm font-black tabular-nums text-slate-950">{getCurrencySymbol()}{(price * item.quantity).toFixed(0)}</p>
                                            </div>
                                        );
                                    })}
                                    {linkedJobCharges.map((job) => (
                                        <div key={job.jobId} className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                                            <p className="text-sm font-black text-blue-950">Job #{job.jobId}</p>
                                            <p className="mt-0.5 text-xs font-semibold text-blue-700">{job.serviceItemName || "Service charge"}</p>
                                            <p className="mt-1 text-sm font-black tabular-nums text-blue-950">{getCurrencySymbol()}{Number(job.billedAmount || 0).toFixed(0)}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-3xl bg-slate-950 p-4 text-white">
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between text-slate-300"><span>Subtotal</span><span>{getCurrencySymbol()}{subtotal.toFixed(0)}</span></div>
                                        {tax > 0 && <div className="flex justify-between text-slate-300"><span>VAT</span><span>{getCurrencySymbol()}{tax.toFixed(0)}</span></div>}
                                        {pickupDiscount > 0 && <div className="flex justify-between text-emerald-200"><span>Pickup &amp; drop discount</span><span>-{getCurrencySymbol()}{pickupDiscount.toFixed(0)}</span></div>}
                                        {discount > 0 && <div className="flex justify-between text-rose-200"><span>Discount</span><span>-{getCurrencySymbol()}{discount.toFixed(0)}</span></div>}
                                    </div>
                                    <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3">
                                        <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Total</span>
                                        <span className="text-2xl font-black tabular-nums">{getCurrencySymbol()}{total.toFixed(0)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3 border-t border-slate-100 bg-white px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                <Button
                                    variant="outline"
                                    className="h-11 w-full rounded-2xl border-slate-200 font-bold text-slate-600"
                                    onClick={() => {
                                        cancelHoldConfirm();
                                        setShowPaymentReview(false);
                                    }}
                                >
                                    Back to Edit
                                </Button>
                                <button
                                    type="button"
                                    disabled={checkoutMutation.isPending}
                                    onPointerDown={startHoldConfirm}
                                    onPointerUp={cancelHoldConfirm}
                                    onPointerCancel={cancelHoldConfirm}
                                    onPointerLeave={cancelHoldConfirm}
                                    className={cn(
                                        "relative h-14 w-full overflow-hidden rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-lg shadow-emerald-500/25 transition active:scale-[0.99]",
                                        checkoutMutation.isPending && "opacity-60",
                                    )}
                                >
                                    <motion.span
                                        className="absolute inset-y-0 left-0 bg-emerald-400"
                                        initial={false}
                                        animate={{ width: holdConfirming ? "100%" : "0%" }}
                                        transition={{ duration: holdConfirming ? 1.4 : 0.12, ease: "linear" }}
                                    />
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        {checkoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                        {holdConfirming ? "Keep holding..." : "Hold to Confirm"}
                                    </span>
                                </button>
                            </div>
                        </motion.div>
                    </>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <div className="flex flex-col flex-1 min-h-0 overflow-hidden md:hidden">
                {/* Live session indicator — opener name */}
                {hasDrawerSession && activeDrawer && (
                    <div className={cn("mx-3 mt-1 flex flex-none items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px]", isDrawerCounting ? "bg-amber-100" : "bg-emerald-100")}>
                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isDrawerCounting ? "bg-amber-500" : "bg-emerald-500 animate-pulse")} />
                        <span className={cn("font-black uppercase tracking-wide", isDrawerCounting ? "text-amber-800" : "text-emerald-800")}>
                            {isDrawerCounting ? "Under Review" : "Live"}
                        </span>
                        <span className="ml-auto shrink-0 text-slate-400">by</span>
                        <span className="min-w-0 truncate font-bold text-slate-700">{activeDrawer.openedByName}</span>
                        <span className="shrink-0 text-slate-400">
                            {activeDrawer.openedAt ? new Date(activeDrawer.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                        {/* Where a shift is ended: on the bar that says the
                            shift is running, reachable without a cart. Hidden
                            once a count is already in review — that submit is
                            one-shot and must not look repeatable. */}
                        {!isDrawerCounting && (
                            <button
                                type="button"
                                onClick={() => setDrawerModalType('drop')}
                                className="ml-1 flex h-8 shrink-0 items-center rounded-lg border border-rose-200 bg-white px-2.5 text-[11px] font-black text-rose-600 active:scale-[0.97]"
                            >
                                Close
                            </button>
                        )}
                    </div>
                )}
                <MobileProductPicker
                    items={pickerItems}
                    recentItemIds={recentItemIds}
                    isLoading={productsLoading}
                    onAdd={handlePickerAdd}
                    onAddSourcedPart={handleAddSourcedPart}
                    sourcedPartSuggestion={sourcedPartSuggestion}
                    cartBarVisible={cartCount > 0 && !mobileCartOpen}
                />
            </div>

            {/* ─── DESKTOP LAYOUT (hidden on mobile) ──────────────────────── */}
            <div className={`hidden md:flex flex-1 min-h-0 flex-col md:flex-row gap-3 md:gap-4 ${isMobile ? 'pb-24' : 'overflow-hidden'}`}>
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
                                        {activeDrawer.openedAt ? new Date(activeDrawer.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
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
                        // Columns sized by the space this grid actually has, not by the
                        // width of the window. `xl:grid-cols-6` fired on a 1280px+
                        // *viewport*, but the cart panel beside this list is a fixed
                        // ~460px, so on a 1440px screen the product pane is only ~620px
                        // — six columns of 95px. A card needs 89px of content and got a
                        // 62px row, and because the card clips its own overflow, every
                        // product name and price was cut off mid-word. auto-fill/minmax
                        // measures the container instead, so the count falls to whatever
                        // fits and each card keeps a usable 150px floor. auto-rows-min +
                        // content-start stop the rows being stretched to share the
                        // container's height — with a definite height and eight rows to
                        // place, the grid was compressing every row to fit rather than
                        // overflowing into the scroll this container already provides.
                        <motion.div variants={containerVariants} className="grid [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] auto-rows-min content-start gap-3 overflow-y-auto flex-1 min-h-0 pb-4 pr-1 custom-scrollbar">
                            {filteredProducts.map((product: any, idx: number) => {
                                const imgs = parseImages(product.images); const imgUrl = imgs[0] || "";
                                return (
                                    <motion.div variants={bounceItemVariants} key={product.id} className="group bg-white/70 backdrop-blur-sm border border-white/60 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-primary/5 cursor-pointer transition-all duration-300 bc-hover bc-rise relative z-10 hover:z-20 active:scale-[0.98] overflow-hidden flex flex-col"
                                        onClick={() => addToCart({ id: product.id, name: product.name, price: String(product.price), quantity: 1, image: imgUrl })}>
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
                                        <Input placeholder="Walk-in customer" className="h-10 bg-white border-slate-200 focus:border-indigo-400 focus:ring-indigo-100 rounded-xl text-sm" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                                        <Button size="icon" className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 transition-colors shadow-sm" onClick={() => setIsCustomerDialogOpen(true)}>
                                            <UserPlus className="h-5 w-5" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input placeholder="Phone number" className="h-9 bg-white border-slate-200 rounded-lg text-xs" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                                        <Input placeholder="Address" className="h-9 bg-white border-slate-200 rounded-lg text-xs" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
                                        <select value={serviceAreaId} onChange={(event) => setServiceAreaId(event.target.value)} disabled={linkedJobCharges.length > 0} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:bg-slate-100"><option value="">{linkedJobCharges.length > 0 ? 'Area inherited from jobs' : 'Service area (optional)'}</option>{serviceAreas.map((area) => <option key={area.id} value={area.id}>{[area.blockOrSector, area.subareaName, area.areaName].filter(Boolean).join(', ')}</option>)}</select>
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
                                            const price = parseFloat(String(item.price).replace(/[^0-9.-]+/g, ""));
                                            const inv = inventoryItems?.find((i: any) => i.id === item.id);
                                            const stock = inv?.stock || 0;
                                            /**
                                             * A journey has no shelf.
                                             *
                                             * The pickup fare has no inventory row, so `stock` resolved
                                             * to 0 and `isOut` to true — and the cart drew the transport
                                             * line red with a destructive "Stock: 0" badge on every
                                             * collection billed. It charged correctly and looked broken,
                                             * which is the kind of thing a cashier learns to distrust.
                                             */
                                            const isStockTracked = !item.isPickupFare;
                                            const isLow = isStockTracked && stock <= 5 && stock > 0;
                                            const isOut = isStockTracked && stock < item.quantity;
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
                                            {/* Hidden entirely when the shop charges no VAT,
                                                rather than a permanent "VAT (0%): ৳0" row. */}
                                            {tax > 0 && (
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>VAT ({getVatPercentage()}%)</span>
                                                    <span className="font-medium text-slate-700 tabular-nums">{getCurrencySymbol()}{tax.toFixed(2)}</span>
                                                </div>
                                            )}
                                            {/*
                                              * Its own line, above the hand-typed discount.
                                              *
                                              * Whoever is at the till has to be able to see that
                                              * the collection was discounted and why, or the
                                              * customer asks and there is no answer on the screen.
                                              */}
                                            {pickupDiscount > 0 && (
                                                <div className="flex justify-between text-xs text-emerald-600">
                                                    <span>Pickup &amp; drop discount</span>
                                                    <span className="font-medium tabular-nums">-{getCurrencySymbol()}{pickupDiscount.toFixed(2)}</span>
                                                </div>
                                            )}
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
                                    {checkoutMutation.isPending ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>) : (<><CreditCard className="w-5 h-5 mr-2" /> Review Payment</>)}
                                </Button>
                            </div>
                        </div>
                    </BentoCard>
                )}
            </div>
        </motion.div >
    );
}
