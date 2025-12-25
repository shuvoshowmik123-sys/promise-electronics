import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Search, UserPlus, Trash2, CreditCard, Plus, ShoppingCart, Package, Link, ListPlus, Loader2, Minus, FileText, Receipt, CheckCircle, Printer, Banknote, Smartphone, Clock, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, jobTicketsApi, posTransactionsApi, productsApi, settingsApi, adminCustomersApi } from "@/lib/api";
import { toast } from "sonner";
import { Invoice, Receipt as ReceiptPrint, PrintStyles } from "@/components/print";

type CartItem = {
  id: string;
  name: string;
  price: string;
  quantity: number;
  image?: string;
};

type LinkedJobCharge = {
  jobId: string;
  serviceItemId: string | null;
  serviceItemName: string | null;
  minPrice: number;
  maxPrice: number;
  billedAmount: number;
  isValid: boolean;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
};

type StoredLinkedJobCharge = {
  jobId: string;
  serviceItemId: string | null;
  serviceItemName: string | null;
  billedAmount: number;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
};

type TransactionData = {
  id: string;
  invoiceNumber: string | null;
  customer: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  items: CartItem[];
  linkedJobs: StoredLinkedJobCharge[];
  subtotal: string;
  tax: string;
  taxRate: string;
  discount: string;
  total: string;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
};

export default function AdminPOSPage() {
  const queryClient = useQueryClient();
  const [isMobile, setIsMobile] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [linkedJobCharges, setLinkedJobCharges] = useState<LinkedJobCharge[]>([]);
  const [selectedInventory, setSelectedInventory] = useState<{ id: string, qty: number }[]>([]);
  const [isJobDialogOpen, setIsJobDialogOpen] = useState(false);
  const [isInventoryDialogOpen, setIsInventoryDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [discount, setDiscount] = useState(0);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<TransactionData | null>(null);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [selectedHistoryTransaction, setSelectedHistoryTransaction] = useState<TransactionData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash");
  const [productSearch, setProductSearch] = useState("");
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const invoiceRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const PAYMENT_METHODS = [
    { value: "Cash", label: "Cash", icon: Banknote, color: "text-green-600" },
    { value: "Bank", label: "Bank Transfer", icon: CreditCard, color: "text-blue-600" },
    { value: "bKash", label: "bKash", icon: Smartphone, color: "text-pink-600" },
    { value: "Nagad", label: "Nagad", icon: Smartphone, color: "text-orange-600" },
    { value: "Due", label: "Due (Credit)", icon: Clock, color: "text-red-600" },
  ];

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: inventoryApi.getAll,
  });

  const parseImages = (imagesJson: string | null): string[] => {
    if (!imagesJson) return [];
    try {
      return JSON.parse(imagesJson);
    } catch {
      return [];
    }
  };

  const { data: inventoryItems, isLoading: inventoryLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: inventoryApi.getAll,
  });

  const { data: jobTickets, isLoading: jobsLoading } = useQuery({
    queryKey: ["job-tickets"],
    queryFn: jobTicketsApi.getAll,
  });

  // Only show completed jobs for billing (exclude Pending, In Progress, Cancelled)
  const completedJobs = jobTickets?.filter((job) => job.status === "Completed") ?? [];

  const { data: posTransactions } = useQuery({
    queryKey: ["pos-transactions"],
    queryFn: posTransactionsApi.getAll,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
  });

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: adminCustomersApi.getAll,
  });

  const filteredCustomers = customers?.filter(customer =>
    customerSearch === "" ||
    customer.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.phone?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.email?.toLowerCase().includes(customerSearch.toLowerCase())
  ) || [];

  const handleSelectCustomer = (customer: { name?: string | null; phone?: string | null; address?: string | null }) => {
    setCustomerName(customer.name || "");
    setCustomerPhone(customer.phone || "");
    setCustomerAddress(customer.address || "");
    setIsCustomerDialogOpen(false);
    setCustomerSearch("");
    toast.success("Customer details added");
  };

  const getSettingValue = (key: string, defaultValue: string) => {
    const setting = settings?.find((s) => s.key === key);
    return setting?.value || defaultValue;
  };

  const getVatPercentage = () => {
    return parseFloat(getSettingValue("vat_percentage", "5"));
  };

  const getCompanyInfo = () => {
    return {
      name: getSettingValue("site_name", "PROMISE ELECTRONICS"),
      logo: getSettingValue("logo_url", ""),
      address: getSettingValue("company_address", "Dhaka, Bangladesh"),
      phone: getSettingValue("support_phone", "+880 1700-000000"),
      email: getSettingValue("company_email", "support@promise-electronics.com"),
      website: getSettingValue("company_website", "www.promise-electronics.com"),
    };
  };

  const parseTransactionForReprint = (transaction: any): TransactionData => {
    let parsedItems: CartItem[] = [];
    let parsedLinkedJobs: StoredLinkedJobCharge[] = [];

    if (transaction.items) {
      if (typeof transaction.items === 'string') {
        try {
          parsedItems = JSON.parse(transaction.items);
        } catch {
          parsedItems = [];
        }
      } else if (Array.isArray(transaction.items)) {
        parsedItems = transaction.items;
      }
    }

    if (transaction.linkedJobs) {
      let rawLinkedJobs: any[] = [];
      if (typeof transaction.linkedJobs === 'string') {
        try {
          rawLinkedJobs = JSON.parse(transaction.linkedJobs);
        } catch {
          rawLinkedJobs = [];
        }
      } else if (Array.isArray(transaction.linkedJobs)) {
        rawLinkedJobs = transaction.linkedJobs;
      }

      parsedLinkedJobs = rawLinkedJobs.map((item: any) => {
        if (typeof item === 'string') {
          return { jobId: item, serviceItemId: null, serviceItemName: null, billedAmount: 0, customerName: null, customerPhone: null, customerAddress: null };
        }
        return {
          jobId: item.jobId || '',
          serviceItemId: item.serviceItemId || null,
          serviceItemName: item.serviceItemName || null,
          billedAmount: item.billedAmount || 0,
          customerName: item.customerName || null,
          customerPhone: item.customerPhone || null,
          customerAddress: item.customerAddress || null,
        };
      });
    }

    return {
      id: transaction.id,
      invoiceNumber: transaction.invoiceNumber,
      customer: transaction.customer,
      customerPhone: transaction.customerPhone || null,
      customerAddress: transaction.customerAddress || null,
      items: parsedItems,
      linkedJobs: parsedLinkedJobs,
      subtotal: transaction.subtotal,
      tax: transaction.tax,
      taxRate: transaction.taxRate || "5",
      discount: transaction.discount || "0",
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      paymentStatus: transaction.paymentStatus || (transaction.paymentMethod === "Due" ? "Due" : "Paid"),
      createdAt: transaction.createdAt,
    };
  };

  const checkoutMutation = useMutation({
    mutationFn: posTransactionsApi.create,
    onSuccess: (response) => {
      const transactionData = parseTransactionForReprint(response);
      setLastTransaction(transactionData);
      setShowSuccessDialog(true);
      setCartItems([]);
      setLinkedJobCharges([]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setDiscount(0);
      setPaymentMethod("Cash");
      queryClient.invalidateQueries({ queryKey: ["pos-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
      queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
    },
    onError: (error: Error) => {
      toast.error(`Checkout failed: ${error.message}`);
    },
  });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const addToCart = (item: CartItem) => {
    setCartItems(prev => {
      const existing = prev.find(cartItem => cartItem.id === item.id);
      if (existing) {
        return prev.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const updateCartItemQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setCartItems(prev =>
      prev.map(item => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const handleJobSelection = (jobId: string, checked: boolean) => {
    if (checked) {
      const job = completedJobs.find(j => j.id === jobId);
      setLinkedJobCharges(prev => [
        ...prev,
        {
          jobId,
          serviceItemId: null,
          serviceItemName: null,
          minPrice: 0,
          maxPrice: 0,
          billedAmount: 0,
          isValid: false,
          customerName: job?.customer || null,
          customerPhone: job?.customerPhone || null,
          customerAddress: job?.customerAddress || null,
        }
      ]);
    } else {
      setLinkedJobCharges(prev => prev.filter(j => j.jobId !== jobId));
    }
  };

  const updateJobCharge = (jobId: string, updates: Partial<LinkedJobCharge>) => {
    setLinkedJobCharges(prev => prev.map(j =>
      j.jobId === jobId ? { ...j, ...updates } : j
    ));
  };

  const handleServiceItemSelect = (jobId: string, serviceItemId: string) => {
    const serviceItem = serviceItems?.find(s => s.id === serviceItemId);
    if (!serviceItem) return;

    const minPrice = serviceItem.minPrice ?? serviceItem.price ?? 0;
    const maxPrice = serviceItem.maxPrice ?? serviceItem.price ?? 0;
    const defaultAmount = minPrice;

    updateJobCharge(jobId, {
      serviceItemId,
      serviceItemName: serviceItem.name,
      minPrice,
      maxPrice: maxPrice || minPrice,
      billedAmount: defaultAmount,
      isValid: true,
    });
  };

  const handleBilledAmountChange = (jobId: string, amount: number) => {
    const charge = linkedJobCharges.find(j => j.jobId === jobId);
    if (!charge) return;

    const isValid = amount >= charge.minPrice && amount <= charge.maxPrice;
    updateJobCharge(jobId, { billedAmount: amount, isValid });
  };

  const serviceItems = inventoryItems?.filter(item => item.itemType === "service") || [];

  const handleInventorySelection = (itemId: string, qty: number) => {
    if (qty <= 0) {
      setSelectedInventory(prev => prev.filter(item => item.id !== itemId));
      return;
    }
    setSelectedInventory(prev => {
      const existing = prev.find(item => item.id === itemId);
      if (existing) {
        return prev.map(item => item.id === itemId ? { ...item, qty } : item);
      }
      return [...prev, { id: itemId, qty }];
    });
  };

  const handleAddInventoryToCart = () => {
    if (!inventoryItems) return;

    selectedInventory.forEach(selected => {
      const item = inventoryItems.find(inv => inv.id === selected.id);
      if (item) {
        const itemImages = parseImages(item.images);
        const itemImage = itemImages.length > 0 ? itemImages[0] : undefined;
        const cartItem: CartItem = {
          id: item.id,
          name: item.name,
          price: String(item.price),
          quantity: selected.qty,
          image: itemImage,
        };
        setCartItems(prev => {
          const existing = prev.find(c => c.id === item.id);
          if (existing) {
            return prev.map(c =>
              c.id === item.id
                ? { ...c, quantity: c.quantity + selected.qty }
                : c
            );
          }
          return [...prev, cartItem];
        });
      }
    });

    setSelectedInventory([]);
    setIsInventoryDialogOpen(false);
    toast.success(`Added ${selectedInventory.length} item(s) to cart`);
  };

  const calculateSubtotal = () => {
    const cartTotal = cartItems.reduce((sum, item) => {
      const price = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
      return sum + price * item.quantity;
    }, 0);
    const jobChargesTotal = linkedJobCharges.reduce((sum, j) => sum + (j.billedAmount || 0), 0);
    return cartTotal + jobChargesTotal;
  };

  const calculateTax = (subtotal: number) => {
    const vatRate = getVatPercentage() / 100;
    return subtotal * vatRate;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax(subtotal);
    return subtotal + tax - discount;
  };

  const handleCheckout = () => {
    if (cartItems.length === 0 && linkedJobCharges.length === 0) {
      toast.error("Cart is empty!");
      return;
    }

    const invalidJobs = linkedJobCharges.filter(j => !j.isValid);
    if (invalidJobs.length > 0) {
      toast.error("Please select a service and valid billing amount for all linked jobs");
      return;
    }

    if (paymentMethod === "Due" && !customerName.trim()) {
      toast.error("Customer name is required for Due/Credit payments!");
      return;
    }

    const subtotal = calculateSubtotal();
    const tax = calculateTax(subtotal);
    const total = calculateTotal();
    const transactionId = `POS-${Date.now()}`;
    const paymentStatus = paymentMethod === "Due" ? "Due" : "Paid";

    const vatRate = getVatPercentage();

    const linkedJobsData = linkedJobCharges.map(j => ({
      jobId: j.jobId,
      serviceItemId: j.serviceItemId,
      serviceItemName: j.serviceItemName,
      billedAmount: j.billedAmount,
      customerName: j.customerName,
      customerPhone: j.customerPhone,
      customerAddress: j.customerAddress,
    }));

    checkoutMutation.mutate({
      id: transactionId,
      customer: customerName || null,
      customerPhone: customerPhone || null,
      customerAddress: customerAddress || null,
      items: JSON.stringify(cartItems),
      linkedJobs: linkedJobCharges.length > 0 ? JSON.stringify(linkedJobsData) : null,
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      taxRate: parseFloat(vatRate.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
    });
  };

  const filteredProducts = products?.filter(product =>
    productSearch === "" ||
    product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.id.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.category?.toLowerCase().includes(productSearch.toLowerCase())
  ) || [];

  const ProductGrid = () => (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Scan Barcode or Search Products..."
            className="pl-10 h-12"
            data-testid="input-product-search"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
        </div>
      </div>

      {productsLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-products" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-4 flex-1">
          {filteredProducts.map((product) => {
            const price = String(product.price);
            const productImages = parseImages(product.images);
            const imageUrl = productImages.length > 0 ? productImages[0] : '';
            return (
              <Card
                key={product.id}
                className="cursor-pointer hover:border-primary transition-colors group h-fit"
                onClick={() => addToCart({
                  id: product.id,
                  name: product.name,
                  price: price,
                  quantity: 1,
                  image: imageUrl
                })}
                data-testid={`card-product-${product.id}`}
              >
                <CardContent className="p-2 sm:p-3 flex flex-col gap-1">
                  <div className="aspect-square bg-gray-100 rounded-md p-2 flex items-center justify-center overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="10">No Image</text></svg>';
                      }} data-testid={`img-product-${product.id}`} />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-xs sm:text-sm line-clamp-2 group-hover:text-primary">
                      {product.name}
                    </h3>
                    <p className="font-bold text-primary mt-0.5 text-sm" data-testid={`text-product-price-${product.id}`}>
                      à§³{price}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const CartSection = () => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax(subtotal);
    const total = calculateTotal();
    const transactionId = `POS-${Date.now()}`;

    return (
      <div className="flex flex-col bg-white rounded-lg border shadow-sm h-full">
        <div className="p-4 border-b bg-slate-50 rounded-t-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold" data-testid="text-current-sale">Current Sale</h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1 text-xs"
                onClick={() => setShowHistoryDialog(true)}
                data-testid="button-transaction-history"
              >
                <FileText className="h-3 w-3" /> History
              </Button>
              <Badge variant="secondary" className="text-xs" data-testid="text-transaction-id">
                {transactionId}
              </Badge>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Customer Name"
                  className="pl-9 bg-white"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  data-testid="input-customer-name"
                />
              </div>
              <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    data-testid="button-add-customer"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl" data-testid="dialog-customer-select">
                  <DialogHeader>
                    <DialogTitle>Select Customer</DialogTitle>
                    <DialogDescription>Search and select a customer to auto-fill details.</DialogDescription>
                  </DialogHeader>
                  <div className="flex items-center gap-2 mb-4">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone or email..."
                      className="flex-1"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      data-testid="input-customer-search"
                    />
                  </div>
                  {customersLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-customers" />
                    </div>
                  ) : filteredCustomers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No customers found</p>
                    </div>
                  ) : (
                    <div className="border rounded-md max-h-[300px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead className="w-20"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCustomers.map((customer) => (
                            <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                              <TableCell>
                                <div className="font-medium">{customer.name || "-"}</div>
                                <div className="text-xs text-muted-foreground">{customer.email || ""}</div>
                              </TableCell>
                              <TableCell>{customer.phone || "-"}</TableCell>
                              <TableCell className="max-w-[150px] truncate">{customer.address || "-"}</TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSelectCustomer(customer)}
                                  data-testid={`button-select-customer-${customer.id}`}
                                >
                                  Select
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsCustomerDialogOpen(false);
                        setCustomerSearch("");
                      }}
                      data-testid="button-cancel-customer-dialog"
                    >
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Phone Number"
                className="bg-white"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                data-testid="input-customer-phone"
              />
              <Input
                placeholder="Address"
                className="bg-white"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                data-testid="input-customer-address"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <Dialog open={isJobDialogOpen} onOpenChange={setIsJobDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs"
                  data-testid="button-link-job-tickets"
                >
                  <Link className="h-3 w-3" /> Link Job Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl" data-testid="dialog-job-tickets">
                <DialogHeader>
                  <DialogTitle>Link Job Tickets</DialogTitle>
                  <DialogDescription>Select multiple job tickets to link to this invoice.</DialogDescription>
                </DialogHeader>
                {jobsLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-jobs" />
                  </div>
                ) : completedJobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No completed job tickets available for billing</p>
                    <p className="text-xs mt-1">Only completed jobs can be linked to invoices</p>
                  </div>
                ) : (
                  <div className="border rounded-md max-h-[300px] overflow-y-auto mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Job ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Device</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {completedJobs.map((job) => (
                          <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                            <TableCell>
                              <Checkbox
                                checked={linkedJobCharges.some(j => j.jobId === job.id)}
                                onCheckedChange={(checked) => handleJobSelection(job.id, !!checked)}
                                data-testid={`checkbox-job-${job.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono">{job.id}</TableCell>
                            <TableCell>{job.customer}</TableCell>
                            <TableCell>{job.device}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">{job.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsJobDialogOpen(false)}
                    data-testid="button-cancel-job-dialog"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      setIsJobDialogOpen(false);
                      if (linkedJobCharges.length > 0) {
                        toast.success(`Linked ${linkedJobCharges.length} job ticket(s)`);
                      }
                    }}
                    data-testid="button-confirm-link-jobs"
                  >
                    Link {linkedJobCharges.length} Jobs
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isInventoryDialogOpen} onOpenChange={setIsInventoryDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 text-xs"
                  data-testid="button-add-inventory"
                >
                  <ListPlus className="h-3 w-3" /> Add from Inventory
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl" data-testid="dialog-inventory">
                <DialogHeader>
                  <DialogTitle>Add Inventory Items</DialogTitle>
                  <DialogDescription>Search and add parts or items directly from inventory.</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 mb-4">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search inventory..."
                    className="flex-1"
                    data-testid="input-inventory-search"
                  />
                </div>
                {inventoryLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-inventory" />
                  </div>
                ) : (
                  <div className="border rounded-md max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead className="w-24">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventoryItems?.map((item) => {
                          const selected = selectedInventory.find(i => i.id === item.id);
                          return (
                            <TableRow key={item.id} data-testid={`row-inventory-${item.id}`}>
                              <TableCell>
                                <div className="font-medium">{item.name}</div>
                                <div className="text-xs text-muted-foreground">{item.id}</div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={item.stock > 0 ? "secondary" : "destructive"}>
                                  {item.stock} left
                                </Badge>
                              </TableCell>
                              <TableCell>à§³{item.price}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max={item.stock}
                                  className="h-8 w-20"
                                  value={selected?.qty || 0}
                                  onChange={(e) => handleInventorySelection(item.id, parseInt(e.target.value) || 0)}
                                  data-testid={`input-inventory-qty-${item.id}`}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsInventoryDialogOpen(false)}
                    data-testid="button-cancel-inventory-dialog"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddInventoryToCart}
                    disabled={selectedInventory.length === 0}
                    data-testid="button-confirm-add-inventory"
                  >
                    Add Items
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]">
          {cartItems.length === 0 && linkedJobCharges.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Cart is empty</p>
            </div>
          ) : (
            <>
              {cartItems.map((item) => {
                const price = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
                const itemTotal = price * item.quantity;

                return (
                  <div key={item.id} className="flex gap-3 items-start group" data-testid={`cart-item-${item.id}`}>
                    <div className="w-12 h-12 bg-gray-100 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect fill="%23e2e8f0" width="48" height="48"/><text x="24" y="28" text-anchor="middle" fill="%239ca3af" font-size="8">No Img</text></svg>';
                        }} data-testid={`img-cart-${item.id}`} />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1" data-testid={`text-cart-item-name-${item.id}`}>
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center border rounded">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                            data-testid={`button-decrease-qty-${item.id}`}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="px-2 text-xs font-medium" data-testid={`text-cart-qty-${item.id}`}>
                            {item.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
                            data-testid={`button-increase-qty-${item.id}`}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Ã— à§³{price.toFixed(2)}
                        </span>
                        <span className="text-xs font-bold ml-auto" data-testid={`text-cart-item-total-${item.id}`}>
                          à§³{itemTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-100 lg:opacity-0 group-hover:opacity-100"
                      onClick={() => removeFromCart(item.id)}
                      data-testid={`button-remove-item-${item.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}

              {linkedJobCharges.length > 0 && (
                <div className="bg-blue-50 p-3 rounded-md border border-blue-100" data-testid="section-linked-jobs">
                  <p className="text-xs font-bold text-blue-700 mb-2">
                    Linked Jobs ({linkedJobCharges.length})
                  </p>
                  {linkedJobCharges.map(charge => {
                    const job = jobTickets?.find(j => j.id === charge.jobId);
                    const hasWarranty = job && (job.serviceWarrantyDays !== undefined || job.partsWarrantyDays !== undefined || job.serviceExpiryDate || job.partsExpiryDate);
                    const checkWarrantyActive = (expiryDate: Date | string | null | undefined) => {
                      if (!expiryDate) return false;
                      return new Date(expiryDate) > new Date();
                    };
                    const serviceActive = checkWarrantyActive(job?.serviceExpiryDate);
                    const partsActive = checkWarrantyActive(job?.partsExpiryDate);
                    return (
                      <div key={charge.jobId} className="mb-3 pb-3 border-b border-blue-100 last:border-b-0 last:pb-0 last:mb-0" data-testid={`linked-job-${charge.jobId}`}>
                        <div className="flex justify-between text-xs text-blue-600 mb-1">
                          <span className="font-medium">{charge.jobId}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-blue-400 hover:text-red-500"
                            onClick={() => handleJobSelection(charge.jobId, false)}
                            data-testid={`button-remove-job-${charge.jobId}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-[10px] text-blue-500 mb-2">
                          <span className="font-medium">{job?.device || "Device"}</span>
                          {job?.issue && <span className="ml-2 text-gray-500">â€¢ {job.issue}</span>}
                        </div>

                        <div className="space-y-2 mt-2">
                          <div>
                            <Label className="text-[10px] text-blue-600 mb-1 block">Service Type</Label>
                            <Select
                              value={charge.serviceItemId || ""}
                              onValueChange={(value) => handleServiceItemSelect(charge.jobId, value)}
                            >
                              <SelectTrigger className="h-7 text-xs bg-white" data-testid={`select-service-${charge.jobId}`}>
                                <SelectValue placeholder="Select service..." />
                              </SelectTrigger>
                              <SelectContent>
                                {serviceItems.map(item => (
                                  <SelectItem key={item.id} value={item.id} className="text-xs">
                                    {item.name} (à§³{item.minPrice || item.price} - à§³{item.maxPrice || item.price})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {charge.serviceItemId && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <Label className="text-[10px] text-blue-600">Bill Amount</Label>
                                <span className="text-[10px] text-gray-500">
                                  Range: à§³{charge.minPrice} - à§³{charge.maxPrice}
                                </span>
                              </div>
                              <Input
                                type="number"
                                min={charge.minPrice}
                                max={charge.maxPrice}
                                value={charge.billedAmount}
                                onChange={(e) => handleBilledAmountChange(charge.jobId, parseFloat(e.target.value) || 0)}
                                className={`h-7 text-xs bg-white ${!charge.isValid ? 'border-red-400 focus:ring-red-400' : ''}`}
                                data-testid={`input-billing-${charge.jobId}`}
                              />
                              {!charge.isValid && charge.billedAmount > 0 && (
                                <p className="text-[10px] text-red-500 mt-1">
                                  Amount must be between à§³{charge.minPrice} and à§³{charge.maxPrice}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {hasWarranty && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1 text-[10px]">
                              <Shield className="w-3 h-3 text-blue-500" />
                              <span className="font-medium text-blue-600">Warranty</span>
                            </div>
                            {(job?.serviceWarrantyDays !== undefined || job?.serviceExpiryDate) && (
                              <div className={`text-[10px] pl-4 ${serviceActive ? "text-green-600" : "text-gray-500"}`}>
                                Service: {job?.serviceWarrantyDays ?? 0}d
                                {job?.serviceExpiryDate && ` (${serviceActive ? "Active" : "Expired"} - ${new Date(job.serviceExpiryDate).toLocaleDateString()})`}
                              </div>
                            )}
                            {(job?.partsWarrantyDays !== undefined || job?.partsExpiryDate) && (
                              <div className={`text-[10px] pl-4 ${partsActive ? "text-green-600" : "text-gray-500"}`}>
                                Parts: {job?.partsWarrantyDays ?? 0}d
                                {job?.partsExpiryDate && ` (${partsActive ? "Active" : "Expired"} - ${new Date(job.partsExpiryDate).toLocaleDateString()})`}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t bg-slate-50 rounded-b-lg space-y-4 mt-auto">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span data-testid="text-subtotal">à§³{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT ({getVatPercentage()}%)</span>
              <span data-testid="text-tax">à§³{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <Input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="h-7 w-24 text-right text-sm"
                data-testid="input-discount"
              />
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span data-testid="text-total">à§³{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            <Label className="text-xs font-medium">Payment Method</Label>
            <div className="grid grid-cols-5 gap-1">
              {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                const isSelected = paymentMethod === method.value;
                return (
                  <Button
                    key={method.value}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className={`flex flex-col items-center gap-1 h-auto py-2 px-1 ${isSelected ? "" : method.color}`}
                    onClick={() => setPaymentMethod(method.value)}
                    data-testid={`button-payment-${method.value.toLowerCase()}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-medium leading-tight">{method.value}</span>
                  </Button>
                );
              })}
            </div>
            {paymentMethod === "Due" && (
              <p className="text-xs text-amber-600 mt-1">Customer name required for credit sales</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="w-full"
              disabled={cartItems.length === 0}
              data-testid="button-suspend"
            >
              Suspend
            </Button>
            <Button
              className="w-full gap-2"
              onClick={handleCheckout}
              disabled={checkoutMutation.isPending || (cartItems.length === 0 && linkedJobCharges.length === 0)}
              data-testid="button-checkout"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" /> {paymentMethod === "Due" ? "Create Due" : "Pay Now"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const FilterIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
  );

  const handleSelectForReprint = (transaction: any) => {
    const parsed = parseTransactionForReprint(transaction);
    setSelectedHistoryTransaction(parsed);
  };

  const handleReprintInvoice = () => {
    if (selectedHistoryTransaction) {
      setLastTransaction(selectedHistoryTransaction);
      setShowHistoryDialog(false);
      setShowInvoicePreview(true);
    }
  };

  const handleReprintReceipt = () => {
    if (selectedHistoryTransaction) {
      setLastTransaction(selectedHistoryTransaction);
      setShowHistoryDialog(false);
      setShowReceiptPreview(true);
    }
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
            <title>Invoice - ${lastTransaction?.id}</title>
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
              .mt-auto { margin-top: auto; }
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
              .border-gray-400 { border-color: #9ca3af; }
              .bg-gray-100 { background-color: #f3f4f6; }
              .rounded { border-radius: 0.25rem; }
              .w-48 { width: 12rem; }
              .w-72 { width: 18rem; }
              .w-full { width: 100%; }
              .h-16 { height: 4rem; }
              .w-16 { width: 4rem; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 0.75rem 1rem; }
              tr.border-b { border-bottom: 1px solid #e5e7eb; }
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

  const handlePrintReceipt = () => {
    if (!receiptRef.current) return;
    const printContent = receiptRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt - ${lastTransaction?.id}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Courier New', monospace; font-size: 10px; line-height: 1.2; }
              .text-center { text-align: center; }
              .font-bold { font-weight: 700; }
              .text-xs { font-size: 10px; }
              .text-sm { font-size: 12px; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              .mb-1, .mb-2 { margin-bottom: 4px; }
              .pb-2 { padding-bottom: 4px; }
              .pt-1, .pt-2 { padding-top: 4px; }
              .mt-1, .mt-2 { margin-top: 4px; }
              .p-2 { padding: 4px; }
              .border-b, .border-t { border-style: dashed; border-color: #888; }
              .border-b { border-bottom-width: 1px; }
              .border-t { border-top-width: 1px; }
              .text-gray-600 { color: #666; }
              .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .pr-2 { padding-right: 4px; }
              .mx-auto { margin-left: auto; margin-right: auto; }
              .h-8, .w-8 { height: 24px; width: 24px; }
              .object-contain { object-fit: contain; }
              @page { size: 57mm auto; margin: 0; }
              @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <div style="width: 57mm; padding: 2mm;">
              ${printContent}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const companyInfo = getCompanyInfo();

  return (
    <>
      <PrintStyles />

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-checkout-success">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-6 w-6" />
              Transaction Complete!
            </DialogTitle>
            <DialogDescription>
              Invoice {lastTransaction?.invoiceNumber || lastTransaction?.id} has been processed successfully.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Customer:</span>
              <span className="font-medium">{lastTransaction?.customer || "Walk-in Customer"}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Payment:</span>
              <span className="font-medium">{lastTransaction?.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>Total:</span>
              <span className="text-primary" data-testid="text-success-total">à§³{lastTransaction ? parseFloat(lastTransaction.total).toFixed(2) : "0.00"}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowInvoicePreview(true)}
              data-testid="button-generate-invoice"
            >
              <FileText className="h-4 w-4" />
              Generate Invoice
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowReceiptPreview(true)}
              data-testid="button-generate-receipt"
            >
              <Receipt className="h-4 w-4" />
              Generate Receipt
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => setShowSuccessDialog(false)} className="w-full" data-testid="button-new-sale">
              Start New Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvoicePreview} onOpenChange={setShowInvoicePreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-invoice-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Preview (A4 Size)
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            {lastTransaction && (
              <Invoice
                ref={invoiceRef}
                data={lastTransaction}
                company={companyInfo}
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowInvoicePreview(false)}>
              Close
            </Button>
            <Button onClick={handlePrintInvoice} className="gap-2" data-testid="button-print-invoice">
              <Printer className="h-4 w-4" />
              Print Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReceiptPreview} onOpenChange={setShowReceiptPreview}>
        <DialogContent className="max-w-sm" data-testid="dialog-receipt-preview">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Receipt Preview (57mm Thermal)
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white flex justify-center p-4">
            {lastTransaction && (
              <ReceiptPrint
                ref={receiptRef}
                data={lastTransaction}
                company={companyInfo}
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReceiptPreview(false)}>
              Close
            </Button>
            <Button onClick={handlePrintReceipt} className="gap-2" data-testid="button-print-receipt">
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="dialog-transaction-history">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Transaction History
            </DialogTitle>
            <DialogDescription>
              Select a transaction to reprint its invoice or receipt
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posTransactions?.map((transaction) => (
                  <TableRow
                    key={transaction.id}
                    className={`cursor-pointer ${selectedHistoryTransaction?.id === transaction.id ? "bg-primary/10" : ""}`}
                    onClick={() => handleSelectForReprint(transaction)}
                    data-testid={`row-transaction-${transaction.id}`}
                  >
                    <TableCell className="font-mono text-sm">
                      {transaction.invoiceNumber || transaction.id}
                    </TableCell>
                    <TableCell>{transaction.customer || "Walk-in"}</TableCell>
                    <TableCell>
                      {new Date(transaction.createdAt).toLocaleDateString("en-BD", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      à§³{parseFloat(transaction.total).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectForReprint(transaction);
                            handleReprintInvoice();
                          }}
                          data-testid={`button-reprint-invoice-${transaction.id}`}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectForReprint(transaction);
                            handleReprintReceipt();
                          }}
                          data-testid={`button-reprint-receipt-${transaction.id}`}
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!posTransactions || posTransactions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                      No transactions found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {selectedHistoryTransaction && (
            <div className="border-t pt-4 mt-4">
              <p className="text-sm text-gray-600 mb-3">
                Selected: <span className="font-semibold">{selectedHistoryTransaction.invoiceNumber || selectedHistoryTransaction.id}</span>
              </p>
              <div className="flex gap-2">
                <Button onClick={handleReprintInvoice} className="gap-2" data-testid="button-reprint-selected-invoice">
                  <FileText className="h-4 w-4" />
                  Reprint Invoice
                </Button>
                <Button onClick={handleReprintReceipt} variant="outline" className="gap-2" data-testid="button-reprint-selected-receipt">
                  <Receipt className="h-4 w-4" />
                  Reprint Receipt
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowHistoryDialog(false);
              setSelectedHistoryTransaction(null);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isMobile ? (
        <Tabs defaultValue="products" className="h-[calc(100vh-10rem)] flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="products" data-testid="tab-products">
              <Package className="w-4 h-4 mr-2" /> Products
            </TabsTrigger>
            <TabsTrigger value="cart" data-testid="tab-cart">
              <ShoppingCart className="w-4 h-4 mr-2" /> Cart ({cartItems.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="products" className="flex-1 overflow-hidden mt-0">
            {ProductGrid()}
          </TabsContent>
          <TabsContent value="cart" className="flex-1 overflow-hidden mt-0">
            {CartSection()}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex h-[calc(100vh-8rem)] gap-6">
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {ProductGrid()}
          </div>
          <div className="w-96 flex flex-col h-full">
            {CartSection()}
          </div>
        </div>
      )}
    </>
  );
}
