import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  Package,
  ArrowRight
} from "lucide-react";

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { items, removeItem, updateQuantity, clearCart, itemCount, total } = useCart();

  if (items.length === 0) {
    return (
      <PublicLayout>
        <div className="min-h-[60vh] bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 py-16">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="max-w-md mx-auto text-center bg-slate-100 shadow-neumorph border-none rounded-2xl">
                <CardContent className="pt-12 pb-8">
                  <div className="w-20 h-20 bg-white shadow-neumorph-inset rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShoppingCart className="w-10 h-10 text-muted-foreground/50" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">Your Cart is Empty</h2>
                  <p className="text-muted-foreground mb-6">
                    Add some products to your cart and they will appear here.
                  </p>
                  <Button 
                    onClick={() => setLocation("/shop")} 
                    data-testid="button-continue-shopping"
                    className="shadow-neumorph-sm hover:shadow-neumorph"
                  >
                    Continue Shopping
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      {/* Neumorphic Header */}
      <div className="bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 py-12">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2 text-slate-800">Shopping Cart</h1>
            <p className="text-muted-foreground">
              Review your items before checkout
            </p>
          </motion.div>
        </div>
      </div>

      {/* Neumorphic Cart Content */}
      <div className="bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 py-8">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Cart Items ({itemCount})</h2>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive"
                  onClick={clearCart}
                  data-testid="button-clear-cart"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Cart
                </Button>
              </div>

              {items.map((item, index) => (
                <motion.div
                  key={`${item.productId}-${item.variantId || 'default'}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl" data-testid={`card-cart-item-${item.productId}`}>
                    <CardContent className="p-3 md:p-4">
                      <div className="flex items-center gap-2 md:gap-4">
                        <div className="w-14 h-14 md:w-20 md:h-20 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
                          )}
                        </div>
                    
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm md:text-base truncate" data-testid={`text-item-name-${item.productId}`}>{item.name}</h3>
                          {item.variantName && (
                            <p className="text-xs md:text-sm text-muted-foreground">{item.variantName}</p>
                          )}
                          <p className="text-primary font-bold text-sm md:text-base mt-1">৳{item.price.toLocaleString()}</p>
                        </div>

                        <div className="flex items-center gap-1 md:gap-2">
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-6 w-6 md:h-8 md:w-8 rounded-md md:rounded-lg shadow-neumorph-sm border-none bg-white"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            data-testid={`button-decrease-${item.productId}`}
                          >
                            <Minus className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                          <span className="w-6 md:w-8 text-center text-sm md:text-base font-medium" data-testid={`text-quantity-${item.productId}`}>{item.quantity}</span>
                          <Button 
                            variant="outline" 
                            size="icon"
                            className="h-6 w-6 md:h-8 md:w-8 rounded-md md:rounded-lg shadow-neumorph-sm border-none bg-white"
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            data-testid={`button-increase-${item.productId}`}
                          >
                            <Plus className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                        </div>

                        <div className="text-right min-w-[60px] md:min-w-[80px] hidden sm:block">
                          <p className="font-bold text-sm md:text-base" data-testid={`text-subtotal-${item.productId}`}>
                            ৳{(item.price * item.quantity).toLocaleString()}
                          </p>
                        </div>

                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-6 w-6 md:h-8 md:w-8 text-destructive hover:text-destructive"
                          onClick={() => removeItem(item.productId)}
                          data-testid={`button-remove-${item.productId}`}
                        >
                          <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="sticky top-4 bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal ({itemCount} items)</span>
                        <span>৳{total.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Shipping</span>
                        <span className="text-green-600">Free</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold">Total</span>
                        <span className="text-2xl font-bold text-primary" data-testid="text-cart-total">
                          ৳{total.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Cash on Delivery
                      </p>
                    </div>

                    <Button 
                      className="w-full shadow-neumorph-sm hover:shadow-neumorph" 
                      size="lg"
                      onClick={() => setLocation("/checkout")}
                      data-testid="button-proceed-checkout"
                    >
                      Proceed to Checkout
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>

                    <Button 
                      variant="outline" 
                      className="w-full bg-white shadow-neumorph-sm hover:shadow-neumorph border-none"
                      onClick={() => setLocation("/shop")}
                      data-testid="button-continue-shopping"
                    >
                      Continue Shopping
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
