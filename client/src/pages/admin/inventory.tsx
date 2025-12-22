import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inventoryApi, settingsApi } from "@/lib/api";
import { Plus, Search, Filter, MoreHorizontal, AlertTriangle, Download, Loader2, Package, Image, X, Globe, Eye, ChevronLeft, ChevronRight, Link, Wrench, Tv, Monitor, Smartphone, LayoutGrid, Cpu, Zap, Volume2, Gamepad2, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import type { InsertInventoryItem, InventoryItem } from "@shared/schema";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export default function AdminInventoryPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAdminAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState<number>(0);
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
    icon: null as string | null,
    estimatedDays: null as string | null,
    displayOrder: 0,
    features: null as string | null,
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

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: inventoryApi.getAll,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });

  const getShopCategories = (): string[] => {
    const shopCategoriesSetting = settings.find(s => s.key === "shop_categories");
    if (shopCategoriesSetting?.value) {
      try {
        const parsed = JSON.parse(shopCategoriesSetting.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // fallback to defaults
      }
    }
    // Default fallback categories
    return ["Televisions", "Spare Parts", "Accessories", "Audio Systems", "Cables"];
  };

  const shopCategories = getShopCategories();

  // Get service filter categories from settings (for inventory service items and customer portal)
  const getServiceFilterCategories = (): string[] => {
    const serviceFilterSetting = settings.find(s => s.key === "service_filter_categories");
    if (serviceFilterSetting?.value) {
      try {
        const parsed = JSON.parse(serviceFilterSetting.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // fallback to defaults
      }
    }
    // Default fallback categories
    return ["LED TV Repair", "LCD TV Repair", "Smart TV Repair", "Monitor Repair", "Projector Repair"];
  };

  const serviceFilterCategories = getServiceFilterCategories();

  // Get appropriate categories based on item type
  const getCategoriesForType = (itemType: string) => {
    if (itemType === "service") {
      return serviceFilterCategories;
    }
    return shopCategories;
  };

  // Filter items based on search query and category
  const filteredItems = items.filter((item) => {
    const matchesSearch = searchQuery === "" ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = filterCategory === "all" || item.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  // Export inventory to CSV
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

  const hasActiveFilters = filterCategory !== "all";

  const createMutation = useMutation({
    mutationFn: inventoryApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Item added successfully");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add item");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertInventoryItem> }) =>
      inventoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Item updated successfully");
      setIsEditDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update item");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: inventoryApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Item deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete item");
    },
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
    onError: (error: Error) => {
      toast.error(error.message || "Failed to adjust stock");
    },
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
      icon: null,
      estimatedDays: null,
      displayOrder: 0,
      features: null,
    });
    setImageUrls([]);
    setFeaturesList([]);
  };

  const parseFeatures = (featuresJson: string | null): string[] => {
    if (!featuresJson) return [];
    try {
      return JSON.parse(featuresJson);
    } catch {
      return [];
    }
  };

  const addFeature = () => {
    setFeaturesList([...featuresList, ""]);
  };

  const updateFeature = (index: number, value: string) => {
    const updated = [...featuresList];
    updated[index] = value;
    setFeaturesList(updated);
  };

  const removeFeature = (index: number) => {
    setFeaturesList(featuresList.filter((_, i) => i !== index));
  };

  const parseImages = (imagesJson: string | null): string[] => {
    if (!imagesJson) return [];
    try {
      return JSON.parse(imagesJson);
    } catch {
      return [];
    }
  };

  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    const existingImages = parseImages(item.images);
    setImageUrls(existingImages);
    const existingFeatures = parseFeatures(item.features);
    setFeaturesList(existingFeatures);
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
      icon: item.icon || null,
      estimatedDays: item.estimatedDays || null,
      displayOrder: item.displayOrder || 0,
      features: item.features || null,
    });
    setIsEditDialogOpen(true);
  };

  const handleStockAdjust = (item: InventoryItem) => {
    setSelectedItem(item);
    setStockAdjustment(0);
    setIsStockDialogOpen(true);
  };

  const handleImagePreview = (item: InventoryItem) => {
    const itemImages = parseImages(item.images);
    if (itemImages.length > 0) {
      setPreviewImages(itemImages);
      setPreviewIndex(0);
      setIsImagePreviewOpen(true);
    }
  };

  const addImageUrl = () => {
    setImageUrls([...imageUrls, ""]);
  };

  const updateImageUrl = (index: number, value: string) => {
    const updated = [...imageUrls];
    updated[index] = value;
    setImageUrls(updated);
  };

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const getValidImageUrls = (): string[] => {
    return imageUrls.filter(url => url.trim() && isValidUrl(url));
  };

  const getValidFeatures = (): string[] => {
    return featuresList.filter(f => f.trim());
  };

  const handleSubmitAdd = () => {
    if (!formData.id || !formData.id.trim()) {
      toast.error("Please enter a SKU/ID for the item");
      return;
    }
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
      images: validUrls.length > 0 ? JSON.stringify(validUrls) : null,
      features: validFeatures.length > 0 ? JSON.stringify(validFeatures) : null
    };
    createMutation.mutate(dataWithImagesAndFeatures as InsertInventoryItem);
  };

  const handleSubmitEdit = () => {
    if (!selectedItem) return;
    const validUrls = getValidImageUrls();
    const validFeatures = getValidFeatures();
    const dataWithImagesAndFeatures = {
      ...formData,
      price: parseFloat(formData.price.toString()),
      minPrice: formData.minPrice ? parseFloat(formData.minPrice.toString()) : null,
      maxPrice: formData.maxPrice ? parseFloat(formData.maxPrice.toString()) : null,
      images: validUrls.length > 0 ? JSON.stringify(validUrls) : null,
      features: validFeatures.length > 0 ? JSON.stringify(validFeatures) : null
    };
    updateMutation.mutate({ id: selectedItem.id, data: dataWithImagesAndFeatures as Partial<InsertInventoryItem> });
  };

  const totalItems = items.length;
  const lowStockItems = items.filter(item => item.status === "Low Stock").length;
  const totalValue = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.stock)), 0);
  const websiteItems = items.filter(item => item.showOnWebsite).length;

  const ImageUrlSection = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{formData.itemType === "service" ? "Service Image URLs" : "Product Image URLs"}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addImageUrl}
          data-testid="button-add-image-url"
        >
          <Plus className="h-3 w-3 mr-1" /> Add URL
        </Button>
      </div>

      {imageUrls.length === 0 ? (
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
          <Link className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No image URLs added</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={addImageUrl}
            data-testid="button-add-first-url"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Image URL
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {imageUrls.map((url, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={url}
                  onChange={(e) => updateImageUrl(index, e.target.value)}
                  className={url && !isValidUrl(url) ? "border-red-500" : ""}
                  data-testid={`input-image-url-${index}`}
                />
                {url && !isValidUrl(url) && (
                  <p className="text-xs text-red-500">Please enter a valid URL (http:// or https://)</p>
                )}
              </div>
              {url && isValidUrl(url) && (
                <div className="w-12 h-10 rounded border overflow-hidden bg-slate-100 flex-shrink-0">
                  <img
                    src={url}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                onClick={() => removeImageUrl(index)}
                data-testid={`button-remove-url-${index}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {imageUrls.length > 0 && getValidImageUrls().length > 0 && (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-2">Image Previews ({getValidImageUrls().length})</p>
          <div className="flex gap-2 flex-wrap">
            {getValidImageUrls().map((url, index) => (
              <div key={index} className="w-16 h-16 rounded-md overflow-hidden border bg-white">
                <img
                  src={url}
                  alt={`Preview ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="%23f1f5f9" width="64" height="64"/><text x="32" y="36" text-anchor="middle" fill="%2394a3b8" font-size="10">Error</text></svg>';
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">Inventory Management</h1>
            <p className="text-muted-foreground">Track stock levels, spare parts, and low stock alerts.</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
            {hasPermission("canCreate") && (
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto" data-testid="button-add-item">
                  <Plus className="w-4 h-4" /> Add New Item
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Item</DialogTitle>
                <DialogDescription>Add a new item to your inventory.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="item-type">Item Type</Label>
                    <Select value={formData.itemType || "product"} onValueChange={(value: "product" | "service") => setFormData({ ...formData, itemType: value })}>
                      <SelectTrigger id="item-type" data-testid="input-item-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Product</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="item-id">Item ID</Label>
                    <Input
                      id="item-id"
                      data-testid="input-item-id"
                      placeholder={formData.itemType === "service" ? "SRV-001" : "INV-001"}
                      value={formData.id}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">{formData.itemType === "service" ? "Service Category" : "Category"}</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                      <SelectTrigger id="category" data-testid="input-category">
                        <SelectValue placeholder={formData.itemType === "service" ? "Select service category" : "Select a category"} />
                      </SelectTrigger>
                      <SelectContent>
                        {getCategoriesForType(formData.itemType || "product").map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                        {formData.itemType === "service" && serviceFilterCategories.length === 0 && (
                          <div className="px-2 py-1 text-xs text-muted-foreground">
                            No categories. Add them in Settings → Service Filter
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-name">{formData.itemType === "service" ? "Service Name" : "Item Name"}</Label>
                  <Input
                    id="item-name"
                    data-testid="input-item-name"
                    placeholder={formData.itemType === "service" ? "TV Screen Repair" : 'Sony 55" LED Panel'}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    data-testid="input-description"
                    placeholder={formData.itemType === "service" ? "Describe the service..." : "Enter product description..."}
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                {formData.itemType === "service" ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="min-price">Min Price (৳)</Label>
                        <Input
                          id="min-price"
                          data-testid="input-min-price"
                          type="number"
                          placeholder="2500"
                          value={formData.minPrice || ""}
                          onChange={(e) => setFormData({ ...formData, minPrice: e.target.value || null, price: e.target.value || "0" })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max-price">Max Price (৳)</Label>
                        <Input
                          id="max-price"
                          data-testid="input-max-price"
                          type="number"
                          placeholder="15000"
                          value={formData.maxPrice || ""}
                          onChange={(e) => setFormData({ ...formData, maxPrice: e.target.value || null })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="icon">Service Icon</Label>
                        <Select value={formData.icon || "Wrench"} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
                          <SelectTrigger id="icon" data-testid="input-icon">
                            <SelectValue placeholder="Select an icon" />
                          </SelectTrigger>
                          <SelectContent>
                            {serviceIcons.map((iconItem) => {
                              const IconComponent = iconItem.icon;
                              return (
                                <SelectItem key={iconItem.value} value={iconItem.value}>
                                  <div className="flex items-center gap-2">
                                    <IconComponent className="h-4 w-4" />
                                    <span>{iconItem.label}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="estimated-days">Estimated Time</Label>
                        <Input
                          id="estimated-days"
                          data-testid="input-estimated-days"
                          placeholder="3-5 days"
                          value={formData.estimatedDays || ""}
                          onChange={(e) => setFormData({ ...formData, estimatedDays: e.target.value || null })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="display-order">Display Order</Label>
                      <Input
                        id="display-order"
                        data-testid="input-display-order"
                        type="number"
                        placeholder="0"
                        value={formData.displayOrder || 0}
                        onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                      />
                      <p className="text-xs text-muted-foreground">Lower numbers appear first on the services page</p>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>What's Included</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addFeature}
                          data-testid="button-add-feature"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Feature
                        </Button>
                      </div>

                      {featuresList.length === 0 ? (
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                          <Package className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No features added yet</p>
                          <p className="text-xs text-muted-foreground mt-1">Add bullet points that describe what's included in this service</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={addFeature}
                            data-testid="button-add-first-feature"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add First Feature
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {featuresList.map((feature, index) => (
                            <div key={`add-feature-${index}`} className="flex gap-2 items-center">
                              <Input
                                placeholder="e.g., Expert diagnosis and testing"
                                value={feature}
                                onChange={(e) => updateFeature(index, e.target.value)}
                                data-testid={`input-feature-${index}`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                onClick={() => removeFeature(index)}
                                data-testid={`button-remove-feature-${index}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {featuresList.length > 0 && getValidFeatures().length > 0 && (
                        <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-2">Preview ({getValidFeatures().length} features)</p>
                          <ul className="space-y-1">
                            {getValidFeatures().map((feature, index) => (
                              <li key={index} className="text-sm flex items-center gap-2">
                                <span className="text-green-500">✓</span>
                                {feature}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stock">Stock Qty</Label>
                      <Input
                        id="stock"
                        data-testid="input-stock"
                        type="number"
                        placeholder="10"
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Price (৳)</Label>
                      <Input
                        id="price"
                        data-testid="input-price"
                        type="number"
                        placeholder="5000"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="threshold">Low Stock Alert</Label>
                      <Input
                        id="threshold"
                        data-testid="input-threshold"
                        type="number"
                        placeholder="5"
                        value={formData.lowStockThreshold || 5}
                        onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 5 })}
                      />
                    </div>
                  </div>
                )}

                <ImageUrlSection />

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label htmlFor="showOnWebsite" className="cursor-pointer">
                        {formData.itemType === "service" ? "Show on Services Page" : "Show on Website"}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {formData.itemType === "service"
                          ? "Display this service on the public services page"
                          : "Display this item on the public shop page"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="showOnWebsite"
                    data-testid="switch-show-on-website"
                    checked={formData.showOnWebsite || false}
                    onCheckedChange={(checked) => setFormData({ ...formData, showOnWebsite: checked })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel-add">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitAdd}
                  disabled={createMutation.isPending}
                  data-testid="button-submit-add"
                >
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Item
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm flex items-center justify-between" data-testid="card-total-items">
            <div>
              <p className="text-sm text-muted-foreground">Total Items</p>
              <h3 className="text-2xl font-bold" data-testid="text-total-items">{totalItems}</h3>
            </div>
            <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm flex items-center justify-between" data-testid="card-low-stock">
            <div>
              <p className="text-sm text-muted-foreground">Low Stock Alerts</p>
              <h3 className="text-2xl font-bold text-orange-500" data-testid="text-low-stock">{lowStockItems}</h3>
            </div>
            <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm flex items-center justify-between" data-testid="card-total-value">
            <div>
              <p className="text-sm text-muted-foreground">Total Value</p>
              <h3 className="text-2xl font-bold" data-testid="text-total-value">৳{totalValue.toLocaleString()}</h3>
            </div>
            <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
              <span className="font-bold">৳</span>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm flex items-center justify-between" data-testid="card-website-items">
            <div>
              <p className="text-sm text-muted-foreground">On Website</p>
              <h3 className="text-2xl font-bold text-blue-500" data-testid="text-website-items">{websiteItems}</h3>
            </div>
            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <Globe className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by SKU, Name, or Category..."
                className="pl-9"
                data-testid="input-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant={showFilters ? "default" : "outline"}
                className="gap-2 flex-1 sm:flex-none"
                data-testid="button-filter"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" /> Categories
                {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">!</Badge>}
              </Button>
              {hasPermission("canExport") && (
                <Button variant="outline" data-testid="button-export" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" /> Export
                </Button>
              )}
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-4 pt-2 border-t">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {shopCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    <X className="w-4 h-4 mr-1" /> Clear filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-16">Image</TableHead>
                  <TableHead>SKU ID</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Website</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">Loading inventory...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8" data-testid="empty-state">
                      <Package className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {items.length === 0 ? "No items in inventory" : "No items match your search or filters"}
                      </p>
                      {items.length === 0 && (
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() => setIsAddDialogOpen(true)}
                          data-testid="button-add-first-item"
                        >
                          <Plus className="w-4 h-4 mr-2" /> Add Your First Item
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => {
                    const itemImages = parseImages(item.images);
                    return (
                      <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                        <TableCell>
                          {itemImages.length > 0 ? (
                            <div
                              className="relative w-12 h-12 rounded-md overflow-hidden border cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                              onClick={() => handleImagePreview(item)}
                              data-testid={`image-preview-${item.id}`}
                            >
                              <img
                                src={itemImages[0]}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect fill="%23f1f5f9" width="48" height="48"/><text x="24" y="28" text-anchor="middle" fill="%2394a3b8" font-size="8">Error</text></svg>';
                                }}
                              />
                              {itemImages.length > 1 && (
                                <div className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
                                  +{itemImages.length - 1}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-md bg-slate-100 flex items-center justify-center">
                              <Image className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium font-mono text-xs" data-testid={`text-sku-${item.id}`}>
                          {item.id}
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-name-${item.id}`}>
                          {item.name}
                        </TableCell>
                        <TableCell data-testid={`text-category-${item.id}`}>{item.category}</TableCell>
                        <TableCell data-testid={`text-stock-${item.id}`}>{item.stock}</TableCell>
                        <TableCell data-testid={`text-price-${item.id}`}>৳{Number(item.price).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.status === "Out of Stock"
                                ? "destructive"
                                : item.status === "Low Stock"
                                  ? "secondary"
                                  : "outline"
                            }
                            className={item.status === "Low Stock" ? "bg-orange-100 text-orange-700 border-orange-200" : ""}
                            data-testid={`badge-status-${item.id}`}
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.showOnWebsite ? (
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200" data-testid={`badge-website-${item.id}`}>
                              <Globe className="h-3 w-3 mr-1" /> Live
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-website-${item.id}`}>
                              Hidden
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${item.id}`}>
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              {itemImages.length > 0 && (
                                <DropdownMenuItem onClick={() => handleImagePreview(item)} data-testid={`menu-preview-${item.id}`}>
                                  <Eye className="h-4 w-4 mr-2" /> View Images
                                </DropdownMenuItem>
                              )}
                              {hasPermission("canEdit") && (
                                <DropdownMenuItem onClick={() => handleEdit(item)} data-testid={`menu-edit-${item.id}`}>
                                  Edit Item
                                </DropdownMenuItem>
                              )}
                              {hasPermission("canEdit") && (
                                <DropdownMenuItem onClick={() => handleStockAdjust(item)} data-testid={`menu-adjust-${item.id}`}>
                                  Adjust Stock
                                </DropdownMenuItem>
                              )}
                              {hasPermission("canDelete") && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this item?")) {
                                      deleteMutation.mutate(item.id);
                                    }
                                  }}
                                  data-testid={`menu-delete-${item.id}`}
                                >
                                  Delete Item
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit {formData.itemType === "service" ? "Service" : "Item"}</DialogTitle>
              <DialogDescription>Update {formData.itemType === "service" ? "service" : "item"} details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">{formData.itemType === "service" ? "Service Name" : "Item Name"}</Label>
                  <Input
                    id="edit-name"
                    data-testid="input-edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-category">{formData.itemType === "service" ? "Service Category" : "Category"}</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger id="edit-category" data-testid="input-edit-category">
                      <SelectValue placeholder={formData.itemType === "service" ? "Select service category" : "Select a category"} />
                    </SelectTrigger>
                    <SelectContent>
                      {getCategoriesForType(formData.itemType || "product").map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                      {formData.itemType === "service" && serviceFilterCategories.length === 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          No categories. Add them in Settings → Service Filter
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  data-testid="input-edit-description"
                  placeholder={formData.itemType === "service" ? "Describe the service..." : "Enter product description..."}
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              {formData.itemType === "service" ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-min-price">Min Price (৳)</Label>
                      <Input
                        id="edit-min-price"
                        data-testid="input-edit-min-price"
                        type="number"
                        placeholder="2500"
                        value={formData.minPrice || ""}
                        onChange={(e) => setFormData({ ...formData, minPrice: e.target.value || null, price: e.target.value || "0" })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-max-price">Max Price (৳)</Label>
                      <Input
                        id="edit-max-price"
                        data-testid="input-edit-max-price"
                        type="number"
                        placeholder="15000"
                        value={formData.maxPrice || ""}
                        onChange={(e) => setFormData({ ...formData, maxPrice: e.target.value || null })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-icon">Service Icon</Label>
                      <Select value={formData.icon || "Wrench"} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
                        <SelectTrigger id="edit-icon" data-testid="input-edit-icon">
                          <SelectValue placeholder="Select an icon" />
                        </SelectTrigger>
                        <SelectContent>
                          {serviceIcons.map((iconItem) => {
                            const IconComponent = iconItem.icon;
                            return (
                              <SelectItem key={iconItem.value} value={iconItem.value}>
                                <div className="flex items-center gap-2">
                                  <IconComponent className="h-4 w-4" />
                                  <span>{iconItem.label}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-estimated-days">Estimated Time</Label>
                      <Input
                        id="edit-estimated-days"
                        data-testid="input-edit-estimated-days"
                        placeholder="3-5 days"
                        value={formData.estimatedDays || ""}
                        onChange={(e) => setFormData({ ...formData, estimatedDays: e.target.value || null })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-display-order">Display Order</Label>
                    <Input
                      id="edit-display-order"
                      data-testid="input-edit-display-order"
                      type="number"
                      placeholder="0"
                      value={formData.displayOrder || 0}
                      onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">Lower numbers appear first on the services page</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>What's Included</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addFeature}
                        data-testid="button-edit-add-feature"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Feature
                      </Button>
                    </div>

                    {featuresList.length === 0 ? (
                      <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                        <Package className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No features added yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Add bullet points that describe what's included in this service</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={addFeature}
                          data-testid="button-edit-add-first-feature"
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add First Feature
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {featuresList.map((feature, index) => (
                          <div key={`edit-feature-${index}`} className="flex gap-2 items-center">
                            <Input
                              placeholder="e.g., Expert diagnosis and testing"
                              value={feature}
                              onChange={(e) => updateFeature(index, e.target.value)}
                              data-testid={`input-edit-feature-${index}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                              onClick={() => removeFeature(index)}
                              data-testid={`button-edit-remove-feature-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {featuresList.length > 0 && getValidFeatures().length > 0 && (
                      <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-2">Preview ({getValidFeatures().length} features)</p>
                        <ul className="space-y-1">
                          {getValidFeatures().map((feature, index) => (
                            <li key={index} className="text-sm flex items-center gap-2">
                              <span className="text-green-500">✓</span>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-stock">Stock Qty</Label>
                    <Input
                      id="edit-stock"
                      data-testid="input-edit-stock"
                      type="number"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-price">Price (৳)</Label>
                    <Input
                      id="edit-price"
                      data-testid="input-edit-price"
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-threshold">Low Stock Alert</Label>
                    <Input
                      id="edit-threshold"
                      data-testid="input-edit-threshold"
                      type="number"
                      value={formData.lowStockThreshold || 5}
                      onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) || 5 })}
                    />
                  </div>
                </div>
              )}

              <ImageUrlSection />

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="edit-showOnWebsite" className="cursor-pointer">
                      {formData.itemType === "service" ? "Show on Services Page" : "Show on Website"}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {formData.itemType === "service"
                        ? "Display this service on the public services page"
                        : "Display this item on the public shop page"}
                    </p>
                  </div>
                </div>
                <Switch
                  id="edit-showOnWebsite"
                  data-testid="switch-edit-show-on-website"
                  checked={formData.showOnWebsite || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, showOnWebsite: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button
                onClick={handleSubmitEdit}
                disabled={updateMutation.isPending}
                data-testid="button-submit-edit"
              >
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update {formData.itemType === "service" ? "Service" : "Item"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stock Adjustment Dialog */}
        <Dialog open={isStockDialogOpen} onOpenChange={setIsStockDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adjust Stock</DialogTitle>
              <DialogDescription>
                Current stock for {selectedItem?.name}: {selectedItem?.stock} units
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stock-adjustment">Stock Adjustment</Label>
                <Input
                  id="stock-adjustment"
                  data-testid="input-stock-adjustment"
                  type="number"
                  placeholder="Enter positive or negative value"
                  value={stockAdjustment}
                  onChange={(e) => setStockAdjustment(parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  New stock will be: {(Number(selectedItem?.stock || 0) + stockAdjustment)} units
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsStockDialogOpen(false)} data-testid="button-cancel-stock">
                Cancel
              </Button>
              <Button
                onClick={() => stockMutation.mutate({ id: selectedItem?.id || "", quantity: stockAdjustment })}
                disabled={stockMutation.isPending}
                data-testid="button-submit-stock"
              >
                {stockMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Adjust Stock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Image Preview Dialog */}
        <Dialog open={isImagePreviewOpen} onOpenChange={setIsImagePreviewOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Product Images</DialogTitle>
            </DialogHeader>
            <div className="relative">
              {previewImages.length > 0 && (
                <>
                  <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden">
                    <img
                      src={previewImages[previewIndex]}
                      alt={`Product image ${previewIndex + 1}`}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="%23f1f5f9" width="200" height="200"/><text x="100" y="105" text-anchor="middle" fill="%2394a3b8" font-size="16">Image failed to load</text></svg>';
                      }}
                    />
                  </div>
                  {previewImages.length > 1 && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        className="absolute left-2 top-1/2 -translate-y-1/2"
                        onClick={() => setPreviewIndex((i) => (i === 0 ? previewImages.length - 1 : i - 1))}
                        data-testid="button-prev-image"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2"
                        onClick={() => setPreviewIndex((i) => (i === previewImages.length - 1 ? 0 : i + 1))}
                        data-testid="button-next-image"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <div className="flex justify-center gap-2 mt-4">
                        {previewImages.map((img, i) => (
                          <button
                            key={i}
                            onClick={() => setPreviewIndex(i)}
                            className={`w-16 h-12 rounded-md overflow-hidden border-2 transition-all ${i === previewIndex ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-slate-300"
                              }`}
                            data-testid={`thumbnail-${i}`}
                          >
                            <img
                              src={img}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><rect fill="%23f1f5f9" width="64" height="48"/></svg>';
                              }}
                            />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
