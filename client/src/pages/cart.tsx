import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCart, type CartItem } from "@/contexts/CartContext";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Package,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { CustomerErrorBoundary } from "@/components/customer/CustomerErrorBoundary";
import { PillButton } from "@/components/customer/mobile-kit";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { items, removeItem, updateQuantity, clearCart, itemCount, total } = useCart();
  const { t } = useCustomerLanguage();

  return (
    <CustomerErrorBoundary>
      <div className="md:hidden flex flex-col min-h-screen bg-slate-50">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-start pt-12 px-6 pb-24" data-testid="mobile-empty-cart">
            <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8 text-center">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="w-10 h-10 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">{t("cart.empty")}</h2>
              <p className="text-slate-500 mb-6">
                {t("cart.emptyDesc")}
              </p>
              <PillButton
                onClick={() => setLocation("/shop")}
                data-testid="mobile-button-empty-continue"
              >
                {t("cart.continue")}
              </PillButton>
            </div>
          </div>
        ) : (
          <>
            <header className="sticky top-0 z-10 flex items-center justify-between bg-slate-50 px-4 py-4">
              <button
                type="button"
                onClick={() => setLocation("/shop")}
                className="p-2 -ml-2 rounded-full hover:bg-slate-100"
                data-testid="mobile-button-back"
              >
                <ArrowLeft className="w-6 h-6 text-slate-800" />
              </button>
              <h1 className="text-lg font-bold text-slate-800">
                {t("cart.title")} ({itemCount})
              </h1>
              <button
                type="button"
                onClick={clearCart}
                className="text-sm font-semibold text-red-600 px-2"
                data-testid="mobile-button-clear-cart"
              >
                {t("cart.clear")}
              </button>
            </header>

            <main className="flex-1 overflow-y-auto px-4 pb-44 space-y-3">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.05 }}
                >
                  <div
                    className="bg-white rounded-3xl shadow-sm p-4"
                    data-testid={`mobile-cart-item-${item.id}`}
                  >
                    <div className="flex gap-4">
                      <div className="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            data-testid={`mobile-item-image-${item.id}`}
                          />
                        ) : (
                          <Package className="w-8 h-8 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3
                              className="font-semibold text-slate-900 leading-tight"
                              data-testid={`mobile-item-name-${item.id}`}
                            >
                              {item.name}
                            </h3>
                            {item.variantName && (
                              <p className="text-sm text-slate-500 mt-0.5">
                                {item.variantName}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-2 -mr-2 -mt-2 text-slate-400 hover:text-red-600"
                            data-testid={`mobile-button-remove-${item.id}`}
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        <p
                          className="text-sm font-medium text-slate-700 mt-2"
                          data-testid={`mobile-item-price-${item.id}`}
                        >
                          Unit: ৳{item.price.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200 disabled:opacity-40"
                          data-testid={`mobile-button-decrease-${item.id}`}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span
                          className="w-6 text-center font-semibold"
                          data-testid={`mobile-text-quantity-${item.id}`}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200"
                          data-testid={`mobile-button-increase-${item.id}`}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <p
                        className="font-bold text-slate-900"
                        data-testid={`mobile-item-subtotal-${item.id}`}
                      >
                        ৳{(item.price * item.quantity).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </main>

            <div
              className="fixed bottom-0 left-0 right-0 z-20 bg-white rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)] p-4 space-y-3"
              data-testid="mobile-summary-bar"
            >
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t("cart.subtotal")} ({itemCount} items)</span>
                <span className="font-semibold" data-testid="mobile-text-subtotal">
                  ৳{total.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">Total</span>
                <span
                  className="text-2xl font-bold text-blue-600"
                  data-testid="mobile-text-total"
                >
                  ৳{total.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500">Cash on Delivery</p>
              <PillButton
                onClick={() => setLocation("/checkout")}
                icon={<ArrowRight className="w-4 h-4" />}
                data-testid="mobile-button-checkout"
              >
                {t("cart.checkout")}
              </PillButton>
              <PillButton
                variant="ghost"
                onClick={() => setLocation("/shop")}
                data-testid="mobile-button-continue-shopping"
              >
                {t("cart.browsMore")}
              </PillButton>
            </div>
          </>
        )}
      </div>

      <div className="hidden md:block">
        {items.length === 0 ? (
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
                    <h2 className="text-xl font-bold mb-2">{t("cart.empty")}</h2>
                    <p className="text-muted-foreground mb-6">
                      {t("cart.emptyDesc")}
                    </p>
                    <Button
                      onClick={() => setLocation("/shop")}
                      data-testid="button-continue-shopping"
                      className="shadow-neumorph-sm hover:shadow-neumorph"
                    >
                      {t("cart.continue")}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        ) : (
          <>
            {/* Neumorphic Header */}
            <div className="bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 py-12">
              <div className="container mx-auto px-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2 text-slate-800">{t("cart.title")}</h1>
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
                        {t("cart.clear")}
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
                              <span className="text-muted-foreground">{t("cart.subtotal")} ({itemCount} items)</span>
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
                            {t("cart.checkout")}
                            <ArrowRight className="w-4 h-4 ml-2" />
                          </Button>

                          <Button
                            variant="outline"
                            className="w-full bg-white shadow-neumorph-sm hover:shadow-neumorph border-none"
                            onClick={() => setLocation("/shop")}
                            data-testid="button-continue-shopping"
                          >
                            {t("cart.browsMore")}
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </CustomerErrorBoundary>
  );
}
