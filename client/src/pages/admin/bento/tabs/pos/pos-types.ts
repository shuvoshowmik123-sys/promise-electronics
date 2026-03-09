export type CartItem = {
    id: string;
    name: string;
    price: string;
    quantity: number;
    image?: string;
};

export type LinkedJobCharge = {
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
    assistedByNames?: string | null;
};

export type StoredLinkedJobCharge = {
    jobId: string;
    serviceItemId: string | null;
    serviceItemName: string | null;
    billedAmount: number;
    customerName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    assistedByNames?: string | null;
};

export type TransactionData = {
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

export const PAYMENT_METHODS = [
    { value: "Cash", label: "Cash", icon: "Banknote", gradient: "from-green-500 to-emerald-600", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", ring: "ring-green-500" },
    { value: "Bank", label: "Bank", icon: "Landmark", gradient: "from-sky-500 to-blue-600", color: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", ring: "ring-sky-500" },
    { value: "bKash", label: "bKash", icon: "Smartphone", gradient: "from-rose-500 to-pink-600", color: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", ring: "ring-rose-500" },
    { value: "Nagad", label: "Nagad", icon: "Smartphone", gradient: "from-orange-500 to-amber-600", color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", ring: "ring-orange-500" },
    { value: "Due", label: "Due", icon: "Clock", gradient: "from-purple-500 to-violet-600", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", ring: "ring-purple-500" },
];

export const parseTransactionForReprint = (transaction: any): TransactionData => {
    let parsedItems: CartItem[] = [];
    let parsedLinkedJobs: StoredLinkedJobCharge[] = [];

    if (transaction.items) {
        if (typeof transaction.items === 'string') {
            try { parsedItems = JSON.parse(transaction.items); } catch { parsedItems = []; }
        } else if (Array.isArray(transaction.items)) {
            parsedItems = transaction.items;
        }
    }

    if (transaction.linkedJobs) {
        let rawLinkedJobs: any[] = [];
        if (typeof transaction.linkedJobs === 'string') {
            try { rawLinkedJobs = JSON.parse(transaction.linkedJobs); } catch { rawLinkedJobs = []; }
        } else if (Array.isArray(transaction.linkedJobs)) {
            rawLinkedJobs = transaction.linkedJobs;
        }
        parsedLinkedJobs = rawLinkedJobs.map((item: any) => {
            if (typeof item === 'string') {
                return { jobId: item, serviceItemId: null, serviceItemName: null, billedAmount: 0, customerName: null, customerPhone: null, customerAddress: null };
            }
            return {
                jobId: item.jobId || '', serviceItemId: item.serviceItemId || null,
                serviceItemName: item.serviceItemName || null, billedAmount: item.billedAmount || 0,
                customerName: item.customerName || null, customerPhone: item.customerPhone || null,
                customerAddress: item.customerAddress || null,
            };
        });
    }

    return {
        id: transaction.id, invoiceNumber: transaction.invoiceNumber,
        customer: transaction.customer, customerPhone: transaction.customerPhone || null,
        customerAddress: transaction.customerAddress || null, items: parsedItems,
        linkedJobs: parsedLinkedJobs, subtotal: transaction.subtotal,
        tax: transaction.tax, taxRate: transaction.taxRate || "5",
        discount: transaction.discount || "0", total: transaction.total,
        paymentMethod: transaction.paymentMethod,
        paymentStatus: transaction.paymentStatus || (transaction.paymentMethod === "Due" ? "Due" : "Paid"),
        createdAt: transaction.createdAt,
    };
};

export const parseImages = (imagesJson: string | null): string[] => {
    if (!imagesJson) return [];
    try { return JSON.parse(imagesJson); } catch { return []; }
};
