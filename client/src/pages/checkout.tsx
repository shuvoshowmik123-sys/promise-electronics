import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
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
  User, Lock, StickyNote
} from "lucide-react";
import { Link } from "wouter";
import { PillButton, RefBadge } from "@/components/customer/mobile-kit";

export default function CheckoutPage() {
  const { items, updateQuantity, removeItem, clearCart, total } = useCart();
  const { isAuthenticated, customer } = useCustomerAuth();
  const { t } = useCustomerLanguage();
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
      toast.error(error.message || "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderSuccess) {
    return (
      <>
        <div className="md:hidden flex min-h-[100dvh] flex-col items-center justify-start bg-gradient-to-b from-blue-50/50 via-white to-white px-5 pt-12 pb-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm"
            data-testid="mobile-order-success-card"
          >
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-xl font-black text-slate-900">{t("order.placed")}</h1>
            <p className="mx-auto mt-2 max-w-[16rem] text-sm font-medium text-slate-500">
              Thank you. We will call you shortly to confirm.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <span className="text-sm font-bold text-slate-500">Order #</span>
              <RefBadge className="text-xs" data-testid="mobile-order-number">
                {orderSuccess}
              </RefBadge>
            </div>
            <div className="mt-6 space-y-3">
              <Link href={`/track-order?order=${encodeURIComponent(orderSuccess)}&type=product`}>
                <PillButton variant="secondary" data-testid="mobile-button-track-order">
                  {t("order.trackOrder")}
                </PillButton>
              </Link>
              <Link href="/shop">
                <PillButton data-testid="mobile-button-continue-shopping">
                  {t("cart.continue")}
                </PillButton>
              </Link>
            </div>
          </motion.div>
        </div>

        <div className="hidden md:block">
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
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">{t("order.placedFull")}</h1>
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
                        <Link href={`/track-order?order=${encodeURIComponent(orderSuccess)}&type=product`}>
                          {t("order.trackOrder")}
                        </Link>
                      </Button>
                      <Button asChild className="shadow-neumorph-sm">
                        <Link href="/shop">
                          {t("cart.continue")}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <div className="md:hidden flex min-h-[100dvh] flex-col items-center justify-start bg-gradient-to-b from-blue-50/50 via-white to-white px-5 pt-12 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm"
            data-testid="mobile-login-required-card"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <Lock className="h-8 w-8 text-slate-400" />
            </div>
            <h1 className="text-xl font-black text-slate-900">{t("auth.loginRequired")}</h1>
            <p className="mx-auto mt-2 max-w-[16rem] text-sm font-medium text-slate-500">
              {t("auth.loginDesc")}
            </p>
            <div className="mt-6">
              <PillButton onClick={() => setShowAuthModal(true)} data-testid="mobile-button-checkout-login">
                <User className="h-5 w-5" />
                {t("auth.signInRegister")}
              </PillButton>
            </div>
          </motion.div>
        </div>

        <div className="hidden md:block">
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
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">{t("auth.loginRequired")}</h1>
                    <p className="text-slate-600 mb-6">
                      Please login or create an account to complete your purchase.
                    </p>
                    <Button onClick={() => setShowAuthModal(true)} data-testid="button-checkout-login" className="shadow-neumorph-sm">
                      <User className="w-4 h-4 mr-2" />
                      {t("auth.signInRegister")}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
        <CustomerAuthModal
          open={showAuthModal}
          onOpenChange={setShowAuthModal}
          defaultTab="login"
          onSuccess={() => setShowAuthModal(false)}
        />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <div className="md:hidden flex min-h-[100dvh] flex-col items-center justify-start bg-gradient-to-b from-blue-50/50 via-white to-white px-5 pt-12 pb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm"
            data-testid="mobile-empty-cart-card"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
              <ShoppingBag className="h-8 w-8 text-slate-400" />
            </div>
            <h1 className="text-xl font-black text-slate-900">{t("checkout.empty")}</h1>
            <p className="mx-auto mt-2 max-w-[16rem] text-sm font-medium text-slate-500">
              {t("checkout.emptyDesc")}
            </p>
            <div className="mt-6">
              <Link href="/shop">
                <PillButton data-testid="mobile-button-browse-products">
                  <ArrowLeft className="h-5 w-5" />
                  {t("checkout.browse")}
                </PillButton>
              </Link>
            </div>
          </motion.div>
        </div>

        <div className="hidden md:block">
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
                    <h1 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">{t("checkout.empty")}</h1>
                    <p className="text-slate-600 mb-6">
                      {t("checkout.emptyDesc")}
                    </p>
                    <Button asChild className="shadow-neumorph-sm">
                      <Link href="/shop">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        {t("checkout.browse")}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="md:hidden flex min-h-[100dvh] flex-col bg-gradient-to-b from-blue-50/50 via-white to-white">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <Link href="/shop">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue-600 transition active:scale-90 active:bg-blue-50"
              aria-label="Back"
              data-testid="mobile-button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <h1 className="text-base font-black text-slate-900" data-testid="mobile-page-title">{t("checkout.title")}</h1>
          <span className="h-9 w-9" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-[calc(8rem+env(safe-area-inset-bottom))]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="space-y-3" data-testid="mobile-order-items">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"
                  data-testid={`mobile-cart-item-${item.id}`}
                >
                  <div className="flex gap-3">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-20 w-20 rounded-2xl object-cover bg-slate-100"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
                        <ShoppingBag className="h-8 w-8 text-slate-300" />
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                      <div>
                        <h3 className="truncate text-sm font-black text-slate-900">{item.name}</h3>
                        {item.variantName && (
                          <p className="text-xs font-semibold text-slate-500">{item.variantName}</p>
                        )}
                        <p className="mt-1 text-sm font-bold text-blue-600">{formatCurrency(item.price)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition active:scale-90"
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            data-testid={`mobile-button-decrease-${item.id}`}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold" data-testid={`mobile-text-quantity-${item.id}`}>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition active:scale-90"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            data-testid={`mobile-button-increase-${item.id}`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition active:scale-90"
                          onClick={() => removeItem(item.id)}
                          data-testid={`mobile-button-remove-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Line Total</span>
                    <span className="text-sm font-black text-slate-900" data-testid={`mobile-line-total-${item.id}`}>
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" data-testid="mobile-delivery-card">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">{t("checkout.shipping")}</h2>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("checkout.phone")}</Label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-300" />
                    <Input
                      type="tel"
                      placeholder="01XXXXXXXXX"
                      className="h-12 rounded-xl border-slate-200 bg-blue-50/40 pl-11 font-medium"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      data-testid="mobile-input-phone"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">{t("checkout.address")}</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3 h-5 w-5 text-slate-300" />
                    <Textarea
                      placeholder="House, Road, Area, District"
                      rows={3}
                      className="rounded-xl border-slate-200 bg-blue-50/40 pl-11 pt-2.5 font-medium"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      data-testid="mobile-input-address"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Order Notes <span className="text-slate-300">(optional)</span></Label>
                  <div className="relative">
                    <StickyNote className="absolute left-3.5 top-3 h-5 w-5 text-slate-300" />
                    <Textarea
                      placeholder="Any special instructions"
                      rows={2}
                      className="rounded-xl border-slate-200 bg-blue-50/40 pl-11 pt-2.5 font-medium"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      data-testid="mobile-input-notes"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("checkout.total")}</p>
              <p className="text-xl font-black text-slate-900" data-testid="mobile-text-total">{formatCurrency(total)}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <Truck className="h-4 w-4" />
              {t("checkout.cod")}
            </div>
          </div>
          <PillButton
            onClick={handlePlaceOrder}
            disabled={isSubmitting}
            data-testid="mobile-button-place-order"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle className="h-5 w-5" />
            )}
            {t("checkout.place")}
          </PillButton>
        </div>
      </div>

      <div className="hidden md:block">
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
                    {t("checkout.back")}
                  </Link>
                </Button>
                <h1 className="text-3xl font-bold text-slate-800" data-testid="text-page-title">{t("checkout.title")}</h1>
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
                        {t("checkout.shipping")}
                      </CardTitle>
                    </CardHeader>
                <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">{t("checkout.phone")} *</Label>
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
                        <Label htmlFor="address">{t("checkout.address")} *</Label>
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
                      <CardTitle>{t("checkout.orderSummary")}</CardTitle>
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
                        <span>{t("checkout.total")}</span>
                        <span className="text-primary" data-testid="text-total">{formatCurrency(total)}</span>
                      </div>

                      <div className="bg-white shadow-neumorph-inset p-4 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 font-medium">
                          <CreditCard className="w-4 h-4 text-primary" />
                          {t("checkout.payment")}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Truck className="w-4 h-4" />
                          {t("checkout.cod")} (COD)
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
                            {t("checkout.place")}
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
      </div>
    </>
  );
}
