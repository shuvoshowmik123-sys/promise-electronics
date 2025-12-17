import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { shopOrdersApi } from "@/lib/api";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  ShoppingBag, Minus, Plus, Trash2, MapPin, Phone, 
  CreditCard, Truck, Loader2, CheckCircle, ArrowLeft,
  User, Lock
} from "lucide-react";
import { Link } from "wouter";

export default function CheckoutPage() {
  const { items, updateQuantity, removeItem, clearCart, total } = useCart();
  const { isAuthenticated, customer } = useCustomerAuth();
  const [, setLocation] = useLocation();
  
  const [phone, setPhone] = useState(customer?.phone || "");
  const [address, setAddress] = useState(customer?.address || "");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    if (customer?.phone && !phone) {
      setPhone(customer.phone);
    }
    if (customer?.address && !address) {
      setAddress(customer.address);
    }
  }, [customer]);

  const formatCurrency = (amount: number) => {
    return `৳${amount.toLocaleString("en-BD")}`;
  };

  const handlePlaceOrder = async () => {
    if (!isAuthenticated) {
      toast.error("Please login to place an order");
      return;
    }

    if (!phone || phone.trim().length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }

    if (!address || address.trim().length < 10) {
      toast.error("Please enter a valid delivery address");
      return;
    }

    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    setIsSubmitting(true);

    try {
      const orderItems = items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      }));

      const order = await shopOrdersApi.create({
        items: orderItems,
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim() || undefined,
      });

      setOrderSuccess(order.orderNumber || order.id);
      clearCart();
      toast.success("Order placed successfully!");
    } catch (error: any) {
      console.error("Order error:", error);
      toast.error(error.message || "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderSuccess) {
    return (
      <PublicLayout>
        <div className="min-h-[60vh] bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 py-12">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="max-w-lg mx-auto text-center bg-slate-100 shadow-neumorph border-none rounded-2xl">
                <CardContent className="pt-6 pb-6 md:pt-8 md:pb-8">
                  <div className="w-14 h-14 md:w-20 md:h-20 bg-green-100 shadow-neumorph-inset rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                    <CheckCircle className="w-7 h-7 md:w-10 md:h-10 text-green-600" />
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">Order Placed Successfully!</h1>
                  <p className="text-slate-600 mb-4">
                    Thank you for your order. Your order number is:
                  </p>
                  <p className="text-xl font-mono font-bold text-primary mb-6" data-testid="text-order-number">
                    {orderSuccess}
                  </p>
                  <p className="text-sm text-slate-500 mb-6">
                    We will contact you shortly to confirm your order. 
                    You can track your order using the order number above.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button asChild variant="outline" className="bg-white shadow-neumorph-sm border-none">
                      <Link href={`/track-order?id=${orderSuccess}`}>
                        Track Order
                      </Link>
                    </Button>
                    <Button asChild className="shadow-neumorph-sm">
                      <Link href="/shop">
                        Continue Shopping
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <PublicLayout>
        <div className="min-h-[60vh] bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 py-12">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="max-w-md mx-auto text-center bg-slate-100 shadow-neumorph border-none rounded-2xl">
                <CardContent className="pt-6 pb-6 md:pt-8 md:pb-8">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white shadow-neumorph-inset rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                    <Lock className="w-6 h-6 md:w-8 md:h-8 text-slate-400" />
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">Login Required</h1>
                  <p className="text-slate-600 mb-6">
                    Please login or create an account to complete your purchase.
                  </p>
                  <Button onClick={() => setShowAuthModal(true)} data-testid="button-checkout-login" className="shadow-neumorph-sm">
                    <User className="w-4 h-4 mr-2" />
                    Sign In / Register
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
        <CustomerAuthModal
          open={showAuthModal}
          onOpenChange={setShowAuthModal}
          defaultTab="login"
          onSuccess={() => setShowAuthModal(false)}
        />
      </PublicLayout>
    );
  }

  if (items.length === 0) {
    return (
      <PublicLayout>
        <div className="min-h-[60vh] bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 py-12">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="max-w-md mx-auto text-center bg-slate-100 shadow-neumorph border-none rounded-2xl">
                <CardContent className="pt-6 pb-6 md:pt-8 md:pb-8">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-white shadow-neumorph-inset rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                    <ShoppingBag className="w-6 h-6 md:w-8 md:h-8 text-slate-400" />
                  </div>
                  <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">Your Cart is Empty</h1>
                  <p className="text-slate-600 mb-6">
                    Add some products to your cart to proceed with checkout.
                  </p>
                  <Button asChild className="shadow-neumorph-sm">
                    <Link href="/shop">
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Browse Products
                    </Link>
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
      {/* Neumorphic Checkout */}
      <div className="bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 min-h-screen py-8">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6">
              <Button variant="ghost" asChild className="mb-4">
                <Link href="/shop">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Shop
                </Link>
              </Button>
              <h1 className="text-3xl font-bold text-slate-800" data-testid="text-page-title">Checkout</h1>
              <p className="text-slate-600">Review your order and complete your purchase</p>
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-white shadow-neumorph-inset rounded-lg flex items-center justify-center">
                        <ShoppingBag className="w-4 h-4 text-primary" />
                      </div>
                      Order Items ({items.length})
                    </CardTitle>
                  </CardHeader>
              <CardContent>
                    <div className="space-y-4">
                      {items.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex items-center gap-4 py-4 border-b border-slate-200 last:border-0"
                          data-testid={`cart-item-${item.id}`}
                        >
                          {item.image && (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-16 h-16 object-cover rounded-xl shadow-neumorph-inset"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-800 truncate">{item.name}</h3>
                            {item.variantName && (
                              <p className="text-sm text-slate-500">{item.variantName}</p>
                            )}
                            <p className="text-primary font-medium">{formatCurrency(item.price)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-lg shadow-neumorph-sm border-none bg-white"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              data-testid={`button-decrease-${item.id}`}
                            >
                              <Minus className="w-4 h-4" />
                            </Button>
                            <span className="w-8 text-center font-medium" data-testid={`text-quantity-${item.id}`}>
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-lg shadow-neumorph-sm border-none bg-white"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              data-testid={`button-increase-${item.id}`}
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="text-right w-24">
                            <p className="font-medium">{formatCurrency(item.price * item.quantity)}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => removeItem(item.id)}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-white shadow-neumorph-inset rounded-lg flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-primary" />
                      </div>
                      Delivery Information
                    </CardTitle>
                  </CardHeader>
              <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="01XXXXXXXXX"
                          className="pl-10 bg-white shadow-neumorph-inset border-none"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          data-testid="input-phone"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Delivery Address *</Label>
                      <Textarea
                        id="address"
                        placeholder="Enter your full delivery address including area, road, and house number"
                        rows={3}
                        className="bg-white shadow-neumorph-inset border-none"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        data-testid="input-address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Order Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        placeholder="Any special instructions for delivery"
                        rows={2}
                        className="bg-white shadow-neumorph-inset border-none"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        data-testid="input-notes"
                      />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            <div className="lg:col-span-1">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Card className="sticky top-4 bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader>
                    <CardTitle>Order Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Subtotal ({items.length} items)</span>
                        <span>{formatCurrency(total)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Delivery</span>
                        <span className="text-green-600">Free</span>
                      </div>
                    </div>
                    
                    <Separator className="bg-slate-200" />
                    
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-primary" data-testid="text-total">{formatCurrency(total)}</span>
                    </div>

                    <div className="bg-white shadow-neumorph-inset p-4 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <CreditCard className="w-4 h-4 text-primary" />
                        Payment Method
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Truck className="w-4 h-4" />
                        Cash on Delivery (COD)
                      </div>
                      <p className="text-xs text-slate-500">
                        Pay when your order is delivered to your doorstep
                      </p>
                    </div>

                    <Button 
                      className="w-full shadow-neumorph-sm hover:shadow-neumorph" 
                      size="lg"
                      onClick={handlePlaceOrder}
                      disabled={isSubmitting}
                      data-testid="button-place-order"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Placing Order...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Place Order
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-center text-slate-500">
                      By placing this order, you agree to our terms and conditions.
                    </p>
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
