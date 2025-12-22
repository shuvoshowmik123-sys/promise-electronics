import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import NativeLayout from "../NativeLayout";
import { Search, ShoppingCart, Package, Loader2, Eye, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function Shop() {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const { toast } = useToast();

    const { data: items = [], isLoading } = useQuery({
        queryKey: ["shop-inventory"],
        queryFn: inventoryApi.getWebsiteItems,
    });

    const parseImages = (imagesJson: string | null): string[] => {
        if (!imagesJson) return [];
        try {
            return JSON.parse(imagesJson);
        } catch {
            return [];
        }
    };

    const filteredItems = items.filter((item: any) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
            item.name.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        );
    });

    const handleAddToCart = (item: any) => {
        toast({
            title: "Added to Cart",
            description: `${item.name} has been added to your cart.`,
        });
        setSelectedItem(null);
    };

    return (
        <NativeLayout className="pb-32">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-[var(--color-native-surface)]/90 backdrop-blur-md px-6 py-3 shadow-sm transition-colors duration-200">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--color-native-text-muted)]" />
                    <input
                        type="text"
                        placeholder="Search parts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[var(--color-native-input)] rounded-full py-2 pl-10 pr-4 text-sm text-[var(--color-native-text)] placeholder:text-[var(--color-native-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-native-primary)]/20 border border-[var(--color-native-border)]"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2"
                        >
                            <X className="h-4 w-4 text-[var(--color-native-text-muted)]" />
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 px-4 pt-4 overflow-y-auto scrollbar-hide">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-[var(--color-native-text-muted)]">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <p className="text-sm">Loading products...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-center px-8">
                        <Package className="w-12 h-12 text-[var(--color-native-text-muted)] mb-4" />
                        <h3 className="text-lg font-bold text-[var(--color-native-text)] mb-2">No Products Found</h3>
                        <p className="text-[var(--color-native-text-muted)] text-sm">
                            Try adjusting your search terms.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {filteredItems.map((item: any) => {
                            const images = parseImages(item.images);
                            const image = images.length > 0 ? images[0] : null;

                            return (
                                <div
                                    key={item.id}
                                    className="bg-[var(--color-native-card)] rounded-2xl overflow-hidden border border-[var(--color-native-border)] shadow-sm active:scale-[0.98] transition-transform"
                                    onClick={() => setSelectedItem(item)}
                                >
                                    <div className="aspect-square bg-[var(--color-native-input)] relative">
                                        {image ? (
                                            <img src={image} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[var(--color-native-text-muted)]">
                                                <Package className="w-8 h-8" />
                                            </div>
                                        )}
                                        {item.status === "Low Stock" && (
                                            <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                Low Stock
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <p className="text-[10px] text-[var(--color-native-text-muted)] mb-1 truncate">{item.category}</p>
                                        <h3 className="font-bold text-[var(--color-native-text)] text-sm line-clamp-2 h-10 mb-2">
                                            {item.name}
                                        </h3>
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-[var(--color-native-primary)]">
                                                ৳{Number(item.price).toLocaleString()}
                                            </span>
                                            <div className="w-6 h-6 rounded-full bg-[var(--color-native-input)] flex items-center justify-center text-[var(--color-native-text-muted)]">
                                                <ShoppingCart className="w-3 h-3" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Product Detail Modal */}
            <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
                <DialogContent className="max-w-[90vw] rounded-2xl p-0 overflow-hidden bg-[var(--color-native-card)] border-[var(--color-native-border)]">
                    {selectedItem && (
                        <div className="flex flex-col max-h-[80vh]">
                            <div className="aspect-square bg-[var(--color-native-input)] relative shrink-0">
                                {parseImages(selectedItem.images).length > 0 ? (
                                    <img
                                        src={parseImages(selectedItem.images)[0]}
                                        alt={selectedItem.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--color-native-text-muted)]">
                                        <Package className="w-16 h-16" />
                                    </div>
                                )}
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <p className="text-xs text-[var(--color-native-text-muted)] mb-1">{selectedItem.category}</p>
                                        <h2 className="text-xl font-bold text-[var(--color-native-text)]">{selectedItem.name}</h2>
                                    </div>
                                    <span className="text-xl font-bold text-[var(--color-native-primary)]">
                                        ৳{Number(selectedItem.price).toLocaleString()}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 mb-6">
                                    <Badge variant={selectedItem.status === "Out of Stock" ? "destructive" : "outline"} className="border-[var(--color-native-border)] text-[var(--color-native-text)]">
                                        {selectedItem.status}
                                    </Badge>
                                    <span className="text-xs text-[var(--color-native-text-muted)]">
                                        {selectedItem.stock} units available
                                    </span>
                                </div>

                                <p className="text-sm text-[var(--color-native-text-muted)] leading-relaxed mb-8">
                                    {selectedItem.description || "No description available."}
                                </p>

                                <Button
                                    className="w-full rounded-full font-bold py-6 bg-[var(--color-native-primary)] hover:bg-[var(--color-native-primary)]/90 text-white"
                                    disabled={selectedItem.status === "Out of Stock"}
                                    onClick={() => handleAddToCart(selectedItem)}
                                >
                                    <ShoppingCart className="w-4 h-4 mr-2" />
                                    Add to Cart
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </NativeLayout>
    );
}
