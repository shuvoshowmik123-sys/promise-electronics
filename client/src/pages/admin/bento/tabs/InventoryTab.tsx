import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
    Banknote, AlertCircle, ShoppingCart, Package, Plus, Search, Filter,
    MoreHorizontal, Download, Globe, Tv, Monitor, Smartphone, LayoutGrid, Cpu, Zap, Volume2, Gamepad2, Wrench, Image as ImageIcon, Eye, ChevronLeft, ChevronRight, X, Link, AlertTriangle, AlertOctagon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from "@/components/ui/sheet";
import { inventoryApi, settingsApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WastageModal } from "@/components/inventory/WastageModal";
import { BentoCard, DashboardSkeleton, containerVariants, itemVariants, HighlightMatch, smartMatch } from "../shared";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { InsertInventoryItem, InventoryItem } from "@shared/schema";

export default function InventoryTab() {
    const queryClient = useQueryClient();
    const { hasPermission } = useAdminAuth();

    const [isAddEditDrawerOpen, setIsAddEditDrawerOpen] = useState(false);
    const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
    const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);
    const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
    const [previewImages, setPreviewImages] = useState<string[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [stockAdjustment, setStockAdjustment] = useState<number>(0);
    const [serialsInput, setSerialsInput] = useState<string>("");
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [featuresList, setFeaturesList] = useState<string[]>([]);

    // Search and filter state
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const [showFilters, setShowFilters] = useState(false);

    const [formData, setFormData] = useState({
        id: "",
        name: "",
        category: "",
        description: "",
        itemType: "product",
        stock: 0,
        price: "",
        minPrice: null as string | null,
        maxPrice: null as string | null,
        status: "In Stock",
        lowStockThreshold: 5,
        images: null as string | null,
        showOnWebsite: false,
        showOnAndroidApp: true,
        showOnHotDeals: false,
        hotDealPrice: null as string | null,
        icon: null as string | null,
        estimatedDays: null as string | null,
        displayOrder: 0,
        features: null as string | null,
        isSerialized: false,
        reorderQuantity: null as string | null,
        preferredSupplier: null as string | null,
    });

    const serviceIcons = [
        { value: "Tv", label: "TV", icon: Tv },
        { value: "Monitor", label: "Monitor", icon: Monitor },
        { value: "Smartphone", label: "Smartphone", icon: Smartphone },
        { value: "LayoutGrid", label: "Display", icon: LayoutGrid },
        { value: "Cpu", label: "Electronics", icon: Cpu },
        { value: "Zap", label: "Power", icon: Zap },
        { value: "Volume2", label: "Audio", icon: Volume2 },
        { value: "Gamepad2", label: "Gaming", icon: Gamepad2 },
        { value: "Wrench", label: "General", icon: Wrench },
    ];

    const { data: inventoryData, isLoading } = useQuery({
        queryKey: ["inventory"],
        queryFn: inventoryApi.getAll,
    });

    const items = inventoryData || [];

    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    const getCurrencySymbol = () => {
        const currencySetting = settings.find(s => s.key === "currency_symbol");
        return currencySetting?.value || "৳";
    };

    const getShopCategories = (): string[] => {
        const shopCategoriesSetting = settings.find(s => s.key === "shop_categories");
        if (shopCategoriesSetting?.value) {
            try {
                const parsed = JSON.parse(shopCategoriesSetting.value);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch { }
        }
        return ["Televisions", "Spare Parts", "Accessories", "Audio Systems", "Cables"];
    };

    const shopCategories = getShopCategories();

    const getServiceFilterCategories = (): string[] => {
        const serviceFilterSetting = settings.find(s => s.key === "service_filter_categories");
        if (serviceFilterSetting?.value) {
            try {
                const parsed = JSON.parse(serviceFilterSetting.value);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch { }
        }
        return ["LED TV Repair", "LCD TV Repair", "Smart TV Repair", "Monitor Repair", "Projector Repair"];
    };

    const serviceFilterCategories = getServiceFilterCategories();

    const getCategoriesForType = (itemType: string) => {
        return itemType === "service" ? serviceFilterCategories : shopCategories;
    };

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const highlight = searchParams.get('highlight');
        if (highlight) setSearchQuery(highlight);
    }, []);

    const filteredItems = items.filter((item) => {
        const matchesSearch = smartMatch(searchQuery,
            item.id,
            item.name,
            item.category,
            item.description,
            item.features
        );

        const matchesCategory = filterCategory === "all" || item.category === filterCategory;

        return matchesSearch && matchesCategory;
    });

    const handleExport = () => {
        const headers = ["SKU", "Name", "Category", "Stock", "Price", "Status", "On Website"];
        const csvData = filteredItems.map(item => [
            item.id,
            `"${(item.name || "").replace(/"/g, '""')}"`,
            item.category || "",
            item.stock?.toString() || "0",
            item.price || "0",
            item.status || "",
            item.showOnWebsite ? "Yes" : "No"
        ]);

        const csvContent = [headers.join(","), ...csvData.map(row => row.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        toast.success("Inventory exported successfully");
    };

    const clearFilters = () => {
        setSearchQuery("");
        setFilterCategory("all");
    };

    const createMutation = useMutation({
        mutationFn: inventoryApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Item added successfully");
            setIsAddEditDrawerOpen(false);
            resetForm();
        },
        onError: (error: Error) => toast.error(error.message || "Failed to add item"),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<InsertInventoryItem> }) =>
            inventoryApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Item updated successfully");
            setIsAddEditDrawerOpen(false);
            setSelectedItem(null);
        },
        onError: (error: Error) => toast.error(error.message || "Failed to update item"),
    });

    const deleteMutation = useMutation({
        mutationFn: inventoryApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Item deleted successfully");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to delete item"),
    });

    const stockMutation = useMutation({
        mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
            inventoryApi.updateStock(id, quantity),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Stock adjusted successfully");
            setIsStockDialogOpen(false);
            setSelectedItem(null);
            setStockAdjustment(0);
        },
        onError: (error: Error) => toast.error(error.message || "Failed to adjust stock"),
    });

    const addSerialsMutation = useMutation({
        mutationFn: ({ id, serials }: { id: string; serials: string[] }) =>
            inventoryApi.addSerials(id, serials),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            toast.success("Serials added successfully");
            setIsStockDialogOpen(false);
            setSelectedItem(null);
            setSerialsInput("");
        },
        onError: (error: Error) => toast.error(error.message || "Failed to add serials"),
    });

    const resetForm = () => {
        setFormData({
            id: "",
            name: "",
            category: "",
            description: "",
            itemType: "product",
            stock: 0,
            price: "",
            minPrice: null,
            maxPrice: null,
            status: "In Stock",
            lowStockThreshold: 5,
            images: null,
            showOnWebsite: false,
            showOnAndroidApp: true,
            showOnHotDeals: false,
            hotDealPrice: null,
            icon: null,
            estimatedDays: null,
            displayOrder: 0,
            features: null,
            isSerialized: false,
            reorderQuantity: null,
            preferredSupplier: null,
        });
        setImageUrls([]);
        setFeaturesList([]);
        setSerialsInput("");
        setSelectedItem(null);
    };

    const parseFeatures = (featuresJson: string | null): string[] => {
        if (!featuresJson) return [];
        try { return JSON.parse(featuresJson); } catch { return []; }
    };

    const addFeature = () => setFeaturesList([...featuresList, ""]);
    const updateFeature = (index: number, value: string) => {
        const updated = [...featuresList];
        updated[index] = value;
        setFeaturesList(updated);
    };
    const removeFeature = (index: number) => setFeaturesList(featuresList.filter((_, i) => i !== index));

    const parseImages = (imagesJson: string | null): string[] => {
        if (!imagesJson) return [];
        try { return JSON.parse(imagesJson); } catch { return []; }
    };

    const isValidUrl = (url: string): boolean => {
        if (!url.trim()) return false;
        try {
            const parsed = new URL(url);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch { return false; }
    };

    const addImageUrl = () => setImageUrls([...imageUrls, ""]);
    const updateImageUrl = (index: number, value: string) => {
        const updated = [...imageUrls];
        updated[index] = value;
        setImageUrls(updated);
    };
    const removeImageUrl = (index: number) => setImageUrls(imageUrls.filter((_, i) => i !== index));
    const getValidImageUrls = (): string[] => imageUrls.filter(url => url.trim() && isValidUrl(url));
    const getValidFeatures = (): string[] => featuresList.filter(f => f.trim());

    const openAddForm = () => {
        resetForm();
        setIsAddEditDrawerOpen(true);
    };

    const handleEdit = (item: InventoryItem) => {
        setSelectedItem(item);
        setImageUrls(parseImages(item.images));
        setFeaturesList(parseFeatures(item.features));
        setFormData({
            id: item.id,
            name: item.name,
            category: item.category,
            description: item.description || "",
            itemType: item.itemType || "product",
            stock: Number(item.stock),
            price: item.price.toString(),
            minPrice: item.minPrice ? item.minPrice.toString() : null,
            maxPrice: item.maxPrice ? item.maxPrice.toString() : null,
            status: item.status,
            lowStockThreshold: item.lowStockThreshold || 5,
            images: item.images,
            showOnWebsite: item.showOnWebsite || false,
            showOnAndroidApp: item.showOnAndroidApp ?? true,
            showOnHotDeals: item.showOnHotDeals || false,
            hotDealPrice: item.hotDealPrice ? item.hotDealPrice.toString() : null,
            icon: item.icon || null,
            estimatedDays: item.estimatedDays || null,
            displayOrder: item.displayOrder || 0,
            features: item.features || null,
            isSerialized: item.isSerialized || false,
            reorderQuantity: item.reorderQuantity ? item.reorderQuantity.toString() : null,
            preferredSupplier: item.preferredSupplier || null,
        });
        setIsAddEditDrawerOpen(true);
    };

    const handleStockAdjust = (item: InventoryItem) => {
        setSelectedItem(item);
        setStockAdjustment(0);
        setSerialsInput("");
        setIsStockDialogOpen(true);
    };

    const handleWastage = (item: InventoryItem) => {
        setSelectedItem(item);
        setIsWastageModalOpen(true);
    };

    const handleImagePreview = (item: InventoryItem) => {
        const itemImages = parseImages(item.images);
        if (itemImages.length > 0) {
            setPreviewImages(itemImages);
            setPreviewIndex(0);
            setIsImagePreviewOpen(true);
        }
    };

    const handleSubmitForm = () => {
        if (!formData.name || !formData.name.trim()) {
            toast.error("Please enter a name for the item");
            return;
        }
        if (!formData.category) {
            toast.error("Please select a category");
            return;
        }
        const validUrls = getValidImageUrls();
        const validFeatures = getValidFeatures();
        const dataWithImagesAndFeatures = {
            ...formData,
            price: parseFloat(formData.price.toString()),
            minPrice: formData.minPrice ? parseFloat(formData.minPrice.toString()) : null,
            maxPrice: formData.maxPrice ? parseFloat(formData.maxPrice.toString()) : null,
            hotDealPrice: formData.hotDealPrice ? parseFloat(formData.hotDealPrice.toString()) : null,
            images: validUrls.length > 0 ? JSON.stringify(validUrls) : null,
            features: validFeatures.length > 0 ? JSON.stringify(validFeatures) : null,
            isSerialized: formData.isSerialized,
            reorderQuantity: formData.reorderQuantity ? parseInt(formData.reorderQuantity.toString()) : null,
            preferredSupplier: formData.preferredSupplier || null,
        };

        if (selectedItem) {
            updateMutation.mutate({ id: selectedItem.id, data: dataWithImagesAndFeatures as Partial<InsertInventoryItem> });
        } else {
            createMutation.mutate(dataWithImagesAndFeatures as InsertInventoryItem);
        }
    };

    // Derived Stats
    const totalValue = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.stock)), 0);
    const lowStockItemsCount = items.filter(item => item.status === "Low Stock" || item.stock <= (item.lowStockThreshold || 5)).length;

    if (isLoading) return <DashboardSkeleton />;

    return (
        <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* KPI Cards */}
            <motion.div variants={itemVariants}>
                <BentoCard className="h-[200px] bg-gradient-to-br from-violet-500 to-purple-600" title="Total Stock Value" icon={<Banknote size={24} className="text-white" />} variant="vibrant">
                    <div className="flex flex-col justify-center h-full pb-2">
                        <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono">{getCurrencySymbol()} {totalValue.toLocaleString()}</div>
                        <div className="text-white/80 text-sm mt-1">{items.length} total items in inventory</div>
                    </div>
                </BentoCard>
            </motion.div>
            <motion.div variants={itemVariants}>
                <BentoCard className="h-[200px] bg-gradient-to-br from-rose-500 to-red-600" title="Low Stock Alerts" icon={<AlertCircle size={24} className="text-white" />} variant="vibrant">
                    <div className="flex flex-col justify-center h-full pb-2">
                        <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono">{lowStockItemsCount}</div>
                        <div className="text-white/80 text-sm mt-1">Items need reordering</div>
                    </div>
                </BentoCard>
            </motion.div>
            <motion.div variants={itemVariants}>
                <BentoCard className="h-[200px] bg-gradient-to-br from-cyan-500 to-blue-600" title="Quick Actions" icon={<ShoppingCart size={24} className="text-white" />} variant="vibrant">
                    <div className="flex flex-col justify-center gap-3 h-full pb-4">
                        {hasPermission("canCreate") && (
                            <Button variant="secondary" onClick={openAddForm} className="w-full h-12 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/20 hover:border-white/40 shadow-sm justify-start px-4 transition-all">
                                <Plus className="mr-3 h-5 w-5 opacity-90" />
                                <span className="font-medium text-[15px]">Add New Item</span>
                            </Button>
                        )}
                        {hasPermission("canExport") && (
                            <Button variant="secondary" onClick={handleExport} className="w-full h-12 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/20 hover:border-white/40 shadow-sm justify-start px-4 transition-all">
                                <Download className="mr-3 h-5 w-5 opacity-90" />
                                <span className="font-medium text-[15px]">Export CSV</span>
                            </Button>
                        )}
                    </div>
                </BentoCard>
            </motion.div>

            {/* Inventory Grid List */}
            <motion.div className="col-span-1 md:col-span-3 min-h-[500px]" variants={itemVariants}>
                <BentoCard className="h-full flex flex-col" title="Inventory Management" icon={<Package size={24} className="text-slate-400" />} variant="glass" disableHover>

                    {/* Filter Toolbar */}
                    <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
                        <div className="relative flex-1 w-full max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by SKU, Name, or Category..."
                                className="pl-9 bg-white/50 backdrop-blur-sm border-white/20 rounded-xl"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Select value={filterCategory} onValueChange={setFilterCategory}>
                                <SelectTrigger className="w-[180px] bg-white/50 rounded-xl">
                                    <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                                    <SelectValue placeholder="All Categories" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {shopCategories.map((cat) => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                    {serviceFilterCategories.map((cat) => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {filterCategory !== "all" && (
                                <Button variant="ghost" size="icon" onClick={clearFilters} className="rounded-xl bg-white/50 text-slate-500 hover:text-slate-800">
                                    <X className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Inventory Items Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 flex-grow h-[500px] min-h-[500px] pb-4">
                        {filteredItems.length === 0 ? (
                            <div className="col-span-full flex flex-col items-center justify-center p-12 text-center h-full">
                                <Package className="h-16 w-16 text-slate-300 mb-4" />
                                <h3 className="text-lg font-medium text-slate-700">No Inventory Found</h3>
                                <p className="text-slate-500 max-w-sm mt-2">No items match your search or filter criteria. Add a new item to get started.</p>
                            </div>
                        ) : filteredItems.map(item => {
                            const itemImages = parseImages(item.images);
                            const outOfStock = item.stock === 0;
                            const isLowStock = item.stock <= (item.lowStockThreshold || 5) && !outOfStock;
                            return (
                                <div key={item.id} className="p-4 bg-white/60 backdrop-blur-md rounded-2xl border border-white/40 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between h-[180px] group relative overflow-hidden">
                                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 bg-white/80 backdrop-blur shadow-sm rounded-full">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="rounded-xl border-white/20 bg-white/90 backdrop-blur-xl">
                                                {itemImages.length > 0 && (
                                                    <DropdownMenuItem onClick={() => handleImagePreview(item)}><Eye className="h-4 w-4 mr-2" /> View Images</DropdownMenuItem>
                                                )}
                                                {hasPermission("canEdit") && (
                                                    <DropdownMenuItem onClick={() => handleEdit(item)}><Wrench className="h-4 w-4 mr-2" /> Edit Item</DropdownMenuItem>
                                                )}
                                                {hasPermission("canEdit") && (
                                                    <DropdownMenuItem onClick={() => handleStockAdjust(item)}><Package className="h-4 w-4 mr-2" /> Adjust Stock</DropdownMenuItem>
                                                )}
                                                {hasPermission("canEdit") && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => handleWastage(item)} className="text-red-600 focus:text-red-700 focus:bg-red-50">
                                                            <AlertOctagon className="h-4 w-4 mr-2" /> Report Wastage
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                                {hasPermission("canDelete") && (
                                                    <DropdownMenuItem className="text-destructive" onClick={() => {
                                                        if (confirm("Are you sure you want to delete this item?")) deleteMutation.mutate(item.id);
                                                    }}>
                                                        <X className="h-4 w-4 mr-2" /> Delete Item
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <div className="flex gap-3">
                                        <div className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 shrink-0 flex items-center justify-center relative cursor-pointer group-hover:ring-2 ring-primary/20 transition-all" onClick={() => handleImagePreview(item)}>
                                            {itemImages.length > 0 ? (
                                                <img src={itemImages[0]} alt={item.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon className="h-6 w-6 text-slate-300" />
                                            )}
                                            {itemImages.length > 1 && (
                                                <div className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 font-bold rounded-tl-md">+{itemImages.length - 1}</div>
                                            )}
                                        </div>
                                        <div className="overflow-hidden pr-6">
                                            <div className="font-bold text-slate-800 line-clamp-2 leading-tight" title={item.name}><HighlightMatch text={item.name} query={searchQuery} /></div>
                                            <div className="text-[10px] text-slate-400 font-mono mt-1 w-full truncate space-x-2">
                                                <span><HighlightMatch text={item.id} query={searchQuery} /></span>
                                                <span>â€¢</span>
                                                <span><HighlightMatch text={item.category} query={searchQuery} /></span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end mt-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Price</span>
                                            <span className="text-lg font-bold text-slate-700">{getCurrencySymbol()} {Number(item.price).toLocaleString()}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Stock</span>
                                            <Badge variant={outOfStock ? "destructive" : isLowStock ? "secondary" : "outline"} className={cn("rounded-md border-0 bg-opacity-20", outOfStock ? "bg-rose-100 text-rose-700" : isLowStock ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700 font-bold")}>
                                                {item.stock} Units
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </BentoCard>
            </motion.div>

            {/* Sliding Action Drawer (Add/Edit Form) */}
            <Sheet open={isAddEditDrawerOpen} onOpenChange={setIsAddEditDrawerOpen}>
                <SheetContent className="w-full sm:max-w-2xl bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl overflow-y-auto">
                    <SheetHeader className="mb-6">
                        <SheetTitle className="text-2xl font-bold">{selectedItem ? "Edit Item" : "Add New Item"}</SheetTitle>
                        <SheetDescription>
                            {selectedItem ? "Update product or service information below." : "Add a new product or service to your catalog."}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="space-y-6 pb-20">
                        {/* Type & Categories */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Item Type</Label>
                                <Select value={formData.itemType || "product"} onValueChange={(value: "product" | "service") => setFormData({ ...formData, itemType: value })}>
                                    <SelectTrigger className="bg-slate-50">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="product">Product</SelectItem>
                                        <SelectItem value="service">Service</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{formData.itemType === "service" ? "Service Category" : "Category"}</Label>
                                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                                    <SelectTrigger className="bg-slate-50">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getCategoriesForType(formData.itemType || "product").map((cat) => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Basic Info */}
                        <div className="space-y-2">
                            <Label>Item Name</Label>
                            <Input placeholder={formData.itemType === "service" ? "TV Screen Repair" : 'Sony 55" Panel'} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-slate-50" />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea placeholder="Detailed description..." value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="bg-slate-50 resize-none" />
                        </div>

                        {formData.itemType === "product" && (
                            <div className="flex items-center justify-between p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                                <div>
                                    <Label className="text-base text-indigo-900 font-semibold flex items-center gap-2">
                                        <Package className="h-4 w-4" />
                                        Serial Number Tracking
                                    </Label>
                                    <p className="text-xs text-indigo-700/80 mt-1">Require technicians to scan individual serials during repair jobs.</p>
                                </div>
                                <Switch checked={formData.isSerialized} onCheckedChange={(val) => setFormData({ ...formData, isSerialized: val })} className="data-[state=checked]:bg-indigo-600" />
                            </div>
                        )}

                        {/* Pricing & Stock (Product vs Service) */}
                        {formData.itemType === "product" ? (
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label>Stock Qty</Label>
                                    <Input type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })} className="bg-slate-50" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Price ({getCurrencySymbol()})</Label>
                                    <Input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="bg-slate-50" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Low Stock Alert</Label>
                                    <Input type="number" value={formData.lowStockThreshold || 5} onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 5 })} className="bg-slate-50" />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 bg-primary/5 p-4 rounded-xl border border-primary/10">
                                <h4 className="font-semibold text-sm text-primary flex items-center gap-2"><Wrench className="h-4 w-4" /> Service Details</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Min Price ({getCurrencySymbol()})</Label>
                                        <Input type="number" value={formData.minPrice || ""} onChange={(e) => setFormData({ ...formData, minPrice: e.target.value || null, price: e.target.value || "0" })} className="bg-white" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Max Price ({getCurrencySymbol()})</Label>
                                        <Input type="number" value={formData.maxPrice || ""} onChange={(e) => setFormData({ ...formData, maxPrice: e.target.value || null })} className="bg-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Service Icon</Label>
                                        <Select value={formData.icon || "Wrench"} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
                                            <SelectTrigger className="bg-white">
                                                <SelectValue placeholder="Select an icon" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {serviceIcons.map((ic) => <SelectItem key={ic.value} value={ic.value}>{ic.label}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Estimated Time</Label>
                                        <Input placeholder="3-5 days" value={formData.estimatedDays || ""} onChange={(e) => setFormData({ ...formData, estimatedDays: e.target.value || null })} className="bg-white" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <Label className="text-base font-semibold">Images</Label>
                            <div className="space-y-2">
                                {imageUrls.map((url, i) => (
                                    <div key={i} className="flex gap-2 items-center">
                                        <Input value={url} onChange={(e) => updateImageUrl(i, e.target.value)} placeholder="https://..." className="bg-slate-50" />
                                        <Button variant="ghost" size="icon" onClick={() => removeImageUrl(i)} className="text-destructive"><X className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={addImageUrl} className="w-full border-dashed"><Plus className="h-4 w-4 mr-2" /> Add Image URL</Button>
                            </div>
                        </div>

                        {/* Visibility Toggles */}
                        <div className="space-y-3 pt-4 border-t border-slate-100">
                            <Label className="text-base font-semibold">Visibility Settings</Label>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <Label className="flex flex-col gap-1 cursor-pointer">
                                    <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-emerald-600" /> Website Visible</span>
                                    <span className="text-xs text-slate-500 font-normal">Show in public catalog</span>
                                </Label>
                                <Switch checked={formData.showOnWebsite || false} onCheckedChange={(val) => setFormData({ ...formData, showOnWebsite: val })} />
                            </div>
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <Label className="flex flex-col gap-1 cursor-pointer">
                                    <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-blue-600" /> App Visible</span>
                                    <span className="text-xs text-slate-500 font-normal">Show in mobile application</span>
                                </Label>
                                <Switch checked={formData.showOnAndroidApp ?? true} onCheckedChange={(val) => setFormData({ ...formData, showOnAndroidApp: val })} />
                            </div>
                        </div>
                    </div>

                    <SheetFooter className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-100 flex flex-row justify-end space-x-2">
                        <Button variant="outline" onClick={() => setIsAddEditDrawerOpen(false)}>Cancel</Button>
                        <Button onClick={handleSubmitForm} disabled={createMutation.isPending || updateMutation.isPending} className="px-8 shadow-md">
                            {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : (selectedItem ? "Save Changes" : "Create Item")}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>

            {/* Quick Stock Adjustment Dialog */}
            <Dialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white">
                        <div className="flex justify-between items-start">
                            <h2 className="text-2xl font-bold tracking-tight">Adjust Stock</h2>
                            <Package className="h-8 w-8 opacity-50" />
                        </div>
                        <p className="mt-2 text-white/80 line-clamp-1">{selectedItem?.name}</p>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <span className="font-semibold text-slate-500 uppercase tracking-wider text-xs">Current Stock</span>
                            <span className="text-2xl font-bold font-mono text-slate-800">{selectedItem?.stock}</span>
                        </div>

                        {selectedItem?.isSerialized ? (
                            <div className="space-y-2">
                                <Label>Scan or Paste Serial Numbers</Label>
                                <Textarea
                                    placeholder="One serial number per line or separated by commas..."
                                    className="h-32 bg-white border-slate-200 resize-none font-mono text-sm"
                                    value={serialsInput}
                                    onChange={(e) => setSerialsInput(e.target.value)}
                                />
                                <p className="text-xs text-slate-500 flex justify-between">
                                    <span>Press Enter to separate serials.</span>
                                    <strong className="text-indigo-600">{serialsInput.split(/[\n,]+/).filter(s => s.trim().length > 0).length} serials detected</strong>
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label>Adjustment (+ or -)</Label>
                                <div className="relative">
                                    <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input type="number" className="pl-9 h-12 text-lg font-mono relative bg-white border-slate-200" value={stockAdjustment} onChange={(e) => setStockAdjustment(parseInt(e.target.value) || 0)} />
                                </div>
                                <p className="text-xs text-slate-500 text-right mt-1">
                                    New Total: <strong className="text-indigo-600 text-sm">{(Number(selectedItem?.stock || 0) + stockAdjustment)}</strong>
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setIsStockDialogOpen(false)} className="rounded-xl">Cancel</Button>

                            {selectedItem?.isSerialized ? (
                                <Button
                                    className="rounded-xl px-8 shadow-md bg-indigo-600 hover:bg-indigo-700"
                                    onClick={() => {
                                        const serialsArray = serialsInput.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0);
                                        if (serialsArray.length === 0) {
                                            toast.error("Please enter at least one serial number");
                                            return;
                                        }
                                        addSerialsMutation.mutate({ id: selectedItem.id, serials: serialsArray });
                                    }}
                                    disabled={addSerialsMutation.isPending}
                                >
                                    {addSerialsMutation.isPending ? "Adding Serials..." : "Receive Stock"}
                                </Button>
                            ) : (
                                <Button
                                    className="rounded-xl px-8 shadow-md bg-indigo-600 hover:bg-indigo-700"
                                    onClick={() => stockMutation.mutate({ id: selectedItem?.id || "", quantity: stockAdjustment })}
                                    disabled={stockMutation.isPending}
                                >
                                    {stockMutation.isPending ? "Updating..." : "Update Stock"}
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Image Preview Viewer */}
            {isImagePreviewOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm" onClick={() => setIsImagePreviewOpen(false)}>
                    <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-white/50 hover:text-white hover:bg-white/10" onClick={() => setIsImagePreviewOpen(false)}>
                        <X className="h-6 w-6" />
                    </Button>
                    <div className="relative w-full max-w-5xl h-[80vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <img src={previewImages[previewIndex]} alt="Preview" className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-lg" />

                        {previewImages.length > 1 && (
                            <>
                                <Button variant="ghost" size="icon" className="absolute left-8 text-white/50 hover:text-white hover:bg-white/10 h-16 w-16 rounded-full" onClick={() => setPreviewIndex((i) => (i === 0 ? previewImages.length - 1 : i - 1))}>
                                    <ChevronLeft className="h-10 w-10" />
                                </Button>
                                <Button variant="ghost" size="icon" className="absolute right-8 text-white/50 hover:text-white hover:bg-white/10 h-16 w-16 rounded-full" onClick={() => setPreviewIndex((i) => (i === previewImages.length - 1 ? 0 : i + 1))}>
                                    <ChevronRight className="h-10 w-10" />
                                </Button>
                                <div className="absolute bottom-[-60px] flex gap-2">
                                    {previewImages.map((img, i) => (
                                        <button key={i} onClick={() => setPreviewIndex(i)} className={cn("w-14 h-14 rounded-lg overflow-hidden border-2 transition-all", i === previewIndex ? "border-white scale-110" : "border-white/20 opacity-50 hover:opacity-100")}>
                                            <img src={img} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )
            }

            <WastageModal
                item={selectedItem as any}
                open={isWastageModalOpen}
                onOpenChange={setIsWastageModalOpen}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["inventory"] });
                }}
            />
        </motion.div >
    );
}
