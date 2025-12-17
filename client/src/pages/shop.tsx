import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { inventoryApi, settingsApi } from "@/lib/api";
import { Filter, SlidersHorizontal, X, Loader2, ShoppingBag, ShoppingCart, ChevronLeft, ChevronRight, Package, Eye, Image, Search, Plus, MessageSquare } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import type { InventoryItem } from "@shared/schema";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

export default function ShopPage() {
  usePageTitle("Shop Spare Parts & Electronics");
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const { addItem } = useCart();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<number[]>([0, 100]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const handleAddToCart = (item: InventoryItem) => {
    const itemImages = parseImages(item.images);
    addItem({
      productId: item.id,
      name: item.name,
      price: Number(item.price),
      image: itemImages.length > 0 ? itemImages[0] : undefined,
    });
    toast.success(`${item.name} added to cart`);
  };

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const search = params.get("search");
    if (search) {
      setSearchQuery(search);
    }
  }, [searchString]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["shop-inventory"],
    queryFn: inventoryApi.getWebsiteItems,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
  });

  const parseImages = (imagesJson: string | null): string[] => {
    if (!imagesJson) return [];
    try {
      return JSON.parse(imagesJson);
    } catch {
      return [];
    }
  };

  const getShopCategories = (): string[] => {
    const shopCategoriesSetting = settings.find(s => s.key === "shop_categories");
    if (shopCategoriesSetting?.value) {
      try {
        return JSON.parse(shopCategoriesSetting.value);
      } catch {
        return [];
      }
    }
    return [];
  };

  const handleViewDetails = (item: InventoryItem) => {
    setSelectedItem(item);
    setCurrentImageIndex(0);
    setIsDetailOpen(true);
  };

  const shopCategories = getShopCategories();
  const categories = shopCategories.length > 0 ? shopCategories : Array.from(new Set(items.map(item => item.category)));

  // Calculate max price from items
  const maxPrice = Math.max(...items.map(item => Number(item.price) || 0), 200000);
  const pricePercentage = (priceRange[1] / 100) * maxPrice;

  // Filter items based on selected filters
  const filteredItems = items.filter(item => {
    // Text search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesName = item.name.toLowerCase().includes(query);
      const matchesDescription = item.description?.toLowerCase().includes(query) || false;
      const matchesCategory = item.category.toLowerCase().includes(query);
      if (!matchesName && !matchesDescription && !matchesCategory) {
        return false;
      }
    }
    
    // Category filter
    if (selectedCategories.length > 0 && !selectedCategories.includes(item.category)) {
      return false;
    }
    
    // Price filter
    const itemPrice = Number(item.price) || 0;
    if (itemPrice > pricePercentage) {
      return false;
    }
    
    // Status filter
    if (selectedStatus.length > 0 && !selectedStatus.includes(item.status)) {
      return false;
    }
    
    return true;
  });

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatus(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
    setPriceRange([0, 100]);
    setSelectedStatus([]);
    setLocation("/shop");
  };

  const FilterContent = () => (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold mb-3">Categories</h4>
        <div className="space-y-2">
          {categories.length > 0 ? categories.map((cat) => (
            <div key={cat} className="flex items-center space-x-2">
              <Checkbox 
                id={cat} 
                data-testid={`checkbox-category-${cat}`}
                checked={selectedCategories.includes(cat)}
                onCheckedChange={() => toggleCategory(cat)}
              />
              <label htmlFor={cat} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {cat}
              </label>
            </div>
          )) : (
            ['Televisions', 'Audio Systems', 'Spare Parts', 'Accessories', 'Cables'].map((cat) => (
              <div key={cat} className="flex items-center space-x-2">
                <Checkbox 
                  id={cat} 
                  data-testid={`checkbox-category-${cat}`}
                  checked={selectedCategories.includes(cat)}
                  onCheckedChange={() => toggleCategory(cat)}
                />
                <label htmlFor={cat} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  {cat}
                </label>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Price Range (BDT)</h4>
          <span className="text-sm font-bold text-primary">
            Max: ৳{(pricePercentage).toLocaleString()}
          </span>
        </div>
        <Slider 
          value={priceRange} 
          onValueChange={setPriceRange}
          max={100} 
          step={1} 
          className="py-4" 
          data-testid="slider-price" 
        />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">৳0</span>
          <span className="font-semibold text-primary">
            ৳{(pricePercentage).toLocaleString()}
          </span>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">Availability</h4>
        <div className="space-y-2">
          {['In Stock', 'Low Stock'].map((status) => (
            <div key={status} className="flex items-center space-x-2">
              <Checkbox 
                id={status} 
                data-testid={`checkbox-status-${status}`}
                checked={selectedStatus.includes(status)}
                onCheckedChange={() => toggleStatus(status)}
              />
              <label htmlFor={status} className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                {status}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <PublicLayout>
      {/* Neumorphic Header */}
      <div className="bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 border-b border-slate-200/50 py-10">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-heading font-bold mb-2" data-testid="text-page-title">Parts & Accessories</h1>
          <p className="text-muted-foreground">Browse our collection of genuine electronics parts and accessories.</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Neumorphic Sidebar */}
          <div className="hidden lg:block w-64 space-y-8 flex-shrink-0">
            <div className="p-5 rounded-2xl bg-slate-100 shadow-neumorph border-none">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center"><Filter className="w-4 h-4 mr-2" /> Filters</h3>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-primary" 
                  data-testid="button-clear-filters"
                  onClick={clearFilters}
                >
                  Clear
                </Button>
              </div>
              <FilterContent />
            </div>
          </div>

          <div className="flex-1">
            {/* Neumorphic Search Input */}
            <div className="mb-6">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 rounded-full bg-white shadow-neumorph-inset border-none focus-visible:ring-primary/30"
                  data-testid="input-shop-search"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                    onClick={() => {
                      setSearchQuery("");
                      setLocation("/shop");
                    }}
                    data-testid="button-clear-search"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <p className="text-sm text-muted-foreground order-2 sm:order-1" data-testid="text-results-count">
                Showing {filteredItems.length} results{searchQuery && ` for "${searchQuery}"`}
              </p>
              
              <div className="flex items-center gap-2 w-full sm:w-auto order-1 sm:order-2 justify-between sm:justify-end">
                <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden" data-testid="button-mobile-filters">
                      <Filter className="w-4 h-4 mr-2" /> Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[300px] sm:w-[400px]">
                    <SheetHeader className="mb-6">
                      <SheetTitle>Filters</SheetTitle>
                    </SheetHeader>
                    <FilterContent />
                  </SheetContent>
                </Sheet>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground hidden sm:inline">Sort by:</span>
                  <select className="text-sm border-none bg-transparent font-medium focus:ring-0 cursor-pointer" data-testid="select-sort">
                    <option>Popularity</option>
                    <option>Price: Low to High</option>
                    <option>Price: High to Low</option>
                    <option>Newest Arrivals</option>
                  </select>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Loading products...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16" data-testid="empty-state">
                <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">{items.length === 0 ? "No products available" : "No products match your filters"}</h3>
                <p className="text-sm text-muted-foreground">{items.length === 0 ? "Check back later for new products!" : "Try adjusting your filters"}</p>
              </div>
            ) : (
              <>
                {/* Neumorphic Product Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                  {filteredItems.map((item) => {
                    const itemImages = parseImages(item.images);
                    const hasImages = itemImages.length > 0;
                    
                    return (
                      <Card 
                        key={item.id} 
                        className="group overflow-hidden bg-slate-100 shadow-neumorph hover:shadow-neumorph-lg transition-all duration-300 border-none rounded-2xl" 
                        data-testid={`card-product-${item.id}`}
                      >
                        <div className="aspect-[4/3] overflow-hidden bg-white m-2 md:m-3 rounded-lg md:rounded-xl shadow-neumorph-inset relative">
                          {hasImages ? (
                            <>
                              <img 
                                src={itemImages[0]} 
                                alt={item.name} 
                                className="object-cover h-full w-full group-hover:scale-105 transition-transform duration-500"
                                data-testid={`img-product-${item.id}`}
                              />
                              {itemImages.length > 1 && (
                                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                  <Image className="h-3 w-3" />
                                  {itemImages.length}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-12 w-12 text-muted-foreground" />
                            </div>
                          )}
                          {item.status === "Low Stock" && (
                            <Badge className="absolute top-2 left-2 bg-orange-500 text-white text-xs">
                              Low Stock
                            </Badge>
                          )}
                        </div>
                        <CardContent className="p-2 md:p-4">
                          <div className="text-[10px] md:text-xs text-muted-foreground mb-0.5 md:mb-1" data-testid={`text-category-${item.id}`}>
                            {item.category}
                          </div>
                          <h3 className="font-bold text-foreground line-clamp-2 mb-1 md:mb-2 h-8 md:h-12 text-xs md:text-base group-hover:text-primary transition-colors" data-testid={`text-name-${item.id}`}>
                            {item.name}
                          </h3>
                          <div className="flex items-baseline gap-1 mb-2 md:mb-3">
                            <span className="text-sm md:text-lg font-bold text-primary" data-testid={`text-price-${item.id}`}>
                              ৳{Number(item.price).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] md:text-xs text-muted-foreground mb-2 md:mb-3">
                            <span data-testid={`text-stock-${item.id}`}>
                              {item.stock} in stock
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 md:gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full h-7 md:h-9 text-xs md:text-sm" 
                              onClick={() => handleViewDetails(item)}
                              data-testid={`button-details-${item.id}`}
                            >
                              <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1" /> Details
                            </Button>
                            {item.itemType === "service" ? (
                              <Button 
                                size="sm" 
                                className="w-full h-7 md:h-9 text-xs md:text-sm bg-teal-600 hover:bg-teal-700" 
                                onClick={() => setLocation("/repair")}
                                data-testid={`button-get-quote-${item.id}`}
                              >
                                <MessageSquare className="h-3 w-3 md:h-4 md:w-4 mr-1" /> Quote
                              </Button>
                            ) : (
                              <Button 
                                size="sm" 
                                className="w-full h-7 md:h-9 text-xs md:text-sm" 
                                disabled={item.status === "Out of Stock"}
                                onClick={() => handleAddToCart(item)}
                                data-testid={`button-add-to-cart-${item.id}`}
                              >
                                <ShoppingCart className="h-3 w-3 md:h-4 md:w-4 mr-1" /> Add
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                
                {filteredItems.length > 0 && (
                  <div className="mt-12 flex justify-center">
                    <Button variant="outline" size="lg" data-testid="button-load-more">Load More Products</Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Product Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedItem ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedItem.name}</DialogTitle>
                <DialogDescription>
                  {selectedItem.description || "View product information and images"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {(() => {
                    const itemImages = parseImages(selectedItem.images);
                    return itemImages.length > 0 ? (
                      <>
                        <div className="relative aspect-square bg-slate-100 rounded-lg overflow-hidden">
                          <img
                            src={itemImages[currentImageIndex]}
                            alt={`${selectedItem.name} - Image ${currentImageIndex + 1}`}
                            className="w-full h-full object-contain"
                          />
                          {itemImages.length > 1 && (
                            <>
                              <Button
                                variant="outline"
                                size="icon"
                                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80"
                                onClick={() => setCurrentImageIndex((i) => (i === 0 ? itemImages.length - 1 : i - 1))}
                                data-testid="button-prev-image"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80"
                                onClick={() => setCurrentImageIndex((i) => (i === itemImages.length - 1 ? 0 : i + 1))}
                                data-testid="button-next-image"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                        {itemImages.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {itemImages.map((img, i) => (
                              <button
                                key={i}
                                onClick={() => setCurrentImageIndex(i)}
                                className={`w-16 h-16 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                                  i === currentImageIndex ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-slate-300"
                                }`}
                                data-testid={`thumbnail-${i}`}
                              >
                                <img src={img} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="aspect-square bg-slate-100 rounded-lg flex items-center justify-center">
                        <Package className="h-20 w-20 text-muted-foreground" />
                      </div>
                    );
                  })()}
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Category</p>
                    <Badge variant="outline">{selectedItem.category}</Badge>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Price</p>
                    <p className="text-2xl font-bold text-primary">৳{Number(selectedItem.price).toLocaleString()}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Availability</p>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={selectedItem.status === "Out of Stock" ? "destructive" : selectedItem.status === "Low Stock" ? "secondary" : "outline"}
                        className={selectedItem.status === "Low Stock" ? "bg-orange-100 text-orange-700" : ""}
                      >
                        {selectedItem.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">({selectedItem.stock} units)</span>
                    </div>
                  </div>
                  
                  {selectedItem.description && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Description</p>
                      <p className="text-sm">{selectedItem.description}</p>
                    </div>
                  )}
                  
                  <div className="pt-4 space-y-3">
                    {selectedItem.itemType === "service" ? (
                      <Button 
                        className="w-full bg-teal-600 hover:bg-teal-700" 
                        size="lg"
                        onClick={() => {
                          setIsDetailOpen(false);
                          setLocation("/repair");
                        }}
                        data-testid="button-get-quote-detail"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" /> Get Quote
                      </Button>
                    ) : (
                      <Button 
                        className="w-full" 
                        size="lg"
                        disabled={selectedItem.status === "Out of Stock"}
                        onClick={() => {
                          handleAddToCart(selectedItem);
                          setIsDetailOpen(false);
                        }}
                        data-testid="button-add-to-cart-detail"
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" /> Add to Cart
                      </Button>
                    )}
                    <p className="text-xs text-center text-muted-foreground">
                      {selectedItem.itemType === "service" ? "Request a free service quote" : "Cash on Delivery available"}
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>Product Details</DialogTitle>
              <DialogDescription>Loading product information...</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}
