import { useEffect, useState } from "react";
import { AvatarSelector } from "@/components/profile/AvatarSelector";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { QueryErrorState } from "@/components/customer/QueryErrorState";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { customerServiceRequestsApi, shopOrdersApi, customerWarrantiesApi, reviewsApi, type WarrantyInfo } from "@/lib/api";
import type { ServiceRequest, Order, CustomerReview } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { PillButton, SegmentedToggle, StatusChip, RefBadge, SectionEyebrow } from "@/components/customer/mobile-kit";
import type { StatusTone } from "@/components/customer/mobile-kit";
import { images } from "@/lib/app-config";
import {
  User,
  Phone,
  Mail,
  Package,
  Clock,
  CheckCircle,
  Wrench,
  Truck,
  Calendar,
  ChevronRight,
  Loader2,
  Settings,
  ShoppingBag,
  XCircle,
  MapPin,
  Pencil,
  Shield,
  Star,
  MessageSquare,
  LogOut
} from "lucide-react";
import { format } from "date-fns";

function greetingFor(name?: string | null, t?: (key: any) => string): string {
  const h = new Date().getHours();
  const part = h < 12
    ? (t ? t("profile.greeting.morning") : "Good morning")
    : h < 17
    ? (t ? t("profile.greeting.afternoon") : "Good afternoon")
    : (t ? t("profile.greeting.evening") : "Good evening");
  return name ? `${part}, ${name}` : part;
}

function customerInitial(name?: string | null): string {
  return name?.trim().charAt(0).toUpperCase() || "?";
}

const serviceStatusColors: Record<string, string> = {
  "Request Received": "bg-blue-100 text-blue-700",
  "Technician Assigned": "bg-purple-100 text-purple-700",
  "Diagnosis Completed": "bg-yellow-100 text-yellow-700",
  "Parts Pending": "bg-orange-100 text-orange-700",
  "Repairing": "bg-cyan-100 text-cyan-700",
  "Ready for Delivery": "bg-green-100 text-green-700",
  "Delivered": "bg-green-500 text-white",
};

const serviceStatusIcons: Record<string, any> = {
  "Request Received": Package,
  "Technician Assigned": User,
  "Diagnosis Completed": Settings,
  "Parts Pending": Clock,
  "Repairing": Wrench,
  "Ready for Delivery": CheckCircle,
  "Delivered": Truck,
};

const productOrderStatusColors: Record<string, string> = {
  "Pending": "bg-yellow-100 text-yellow-700",
  "Accepted": "bg-blue-100 text-blue-700",
  "Processing": "bg-cyan-100 text-cyan-700",
  "Shipped": "bg-purple-100 text-purple-700",
  "Delivered": "bg-green-500 text-white",
  "Declined": "bg-red-100 text-red-700",
};

const productOrderStatusIcons: Record<string, any> = {
  "Pending": Clock,
  "Accepted": CheckCircle,
  "Processing": Package,
  "Shipped": Truck,
  "Delivered": CheckCircle,
  "Declined": XCircle,
};

function toneForServiceStatus(status?: string): StatusTone {
  const s = status || "Request Received";
  if (s === "Delivered") return "delivered";
  if (s === "Ready for Delivery") return "done";
  if (["Repairing", "Technician Assigned", "Diagnosis Completed"].includes(s)) return "live";
  if (["Parts Pending", "Request Received"].includes(s)) return "pending";
  return "neutral";
}

function toneForProductStatus(status?: string): StatusTone {
  const s = status || "Pending";
  if (s === "Delivered") return "delivered";
  if (s === "Declined") return "cancelled";
  if (s === "Accepted") return "done";
  if (s === "Processing") return "live";
  if (s === "Pending") return "pending";
  return "neutral";
}

function ServiceOrderCard({ order, onClick }: { order: ServiceRequest; onClick: () => void }) {
  const StatusIcon = serviceStatusIcons[order.trackingStatus || "Request Received"] || Package;
  const statusColor = serviceStatusColors[order.trackingStatus || "Request Received"] || "bg-gray-100 text-gray-700";

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30"
      onClick={onClick}
      data-testid={`card-service-order-${order.id}`}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-base md:text-lg truncate">{order.ticketNumber}</p>
              <p className="text-xs md:text-sm text-muted-foreground truncate">{order.brand} - {order.primaryIssue}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                {format(new Date(order.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-3 flex-shrink-0 ml-2">
            <Badge className={`${statusColor} text-xs md:text-sm`}>
              {order.trackingStatus || "Pending"}
            </Badge>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductOrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  const StatusIcon = productOrderStatusIcons[order.status || "Pending"] || Package;
  const statusColor = productOrderStatusColors[order.status || "Pending"] || "bg-gray-100 text-gray-700";

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30"
      onClick={onClick}
      data-testid={`card-product-order-${order.id}`}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-base md:text-lg truncate">{order.orderNumber}</p>
              <p className="text-xs md:text-sm text-muted-foreground truncate">
                ৳{Number(order.total).toLocaleString()} - {order.paymentMethod}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                {format(new Date(order.createdAt!), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-3 flex-shrink-0 ml-2">
            <Badge className={`${statusColor} text-xs md:text-sm`}>
              {order.status || "Pending"}
            </Badge>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InquiriesList() {
  const { data: inquiries = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["/customer/inquiries"],
    queryFn: async () => {
      const res = await fetch("/api/customer/inquiries");
      if (!res.ok) throw new Error("Failed to fetch inquiries");
      return res.json();
    },
  });

  if (isError) {
    return <div className="py-4"><QueryErrorState compact message="Failed to load inquiries" onRetry={() => refetch()} /></div>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (inquiries.length === 0) {
    return (
      <div className="text-center py-6">
        <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No inquiries found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {inquiries.map((inquiry: any) => (
        <div key={inquiry.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-2">
            <Badge variant={inquiry.status === "Replied" ? "default" : "secondary"} className="text-xs">
              {inquiry.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {format(new Date(inquiry.createdAt), "MMM d, yyyy")}
            </span>
          </div>
          <p className="text-sm text-slate-800 mb-2">{inquiry.message}</p>
          {inquiry.reply && (
            <div className="bg-slate-50 p-2 rounded border-l-2 border-primary text-xs mt-2">
              <p className="font-semibold text-primary mb-1">Reply:</p>
              <p className="text-slate-600">{inquiry.reply}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MyProfilePage() {
  const [, setLocation] = useLocation();
  const { customer, isAuthenticated, isLoading: authLoading, updateProfile, logout } = useCustomerAuth();
  const { t } = useCustomerLanguage();
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [showAddressSheet, setShowAddressSheet] = useState(false);
  const [editingAddress, setEditingAddress] = useState("");
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewContent, setReviewContent] = useState("");
  const [showReviewSuccess, setShowReviewSuccess] = useState(false);

  const [mobileProductTab, setMobileProductTab] = useState<"active" | "completed">("active");
  const [mobileServiceTab, setMobileServiceTab] = useState<"active" | "completed">("active");

  const reviewMutation = useMutation({
    mutationFn: reviewsApi.submit,
    onSuccess: () => {
      setShowReviewSuccess(true);
      setReviewRating(5);
      setReviewTitle("");
      setReviewContent("");
      toast({ title: "Review submitted", description: "Thank you! Your review will appear after approval." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to submit review", description: error.message, variant: "destructive" });
    }
  });

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewContent.trim()) {
      toast({ title: "Please write your review", variant: "destructive" });
      return;
    }
    reviewMutation.mutate({
      rating: reviewRating,
      title: reviewTitle.trim() || undefined,
      content: reviewContent.trim()
    });
  };

  const handleEditAddress = () => {
    setEditingAddress(customer?.address || "");
    setShowAddressDialog(true);
  };

  const handleSaveAddress = async (close: () => void) => {
    setIsSavingAddress(true);
    try {
      await updateProfile({ address: editingAddress });
      toast({ title: "Address updated successfully" });
      close();
    } catch {
      toast({ title: "Failed to update address", variant: "destructive" });
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleAvatarUpdate = async (avatar: string) => {
    try {
      await updateProfile({ profileImageUrl: avatar });
      toast({ title: "Avatar updated successfully" });
    } catch {
      toast({ title: "Failed to update avatar", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setLocation("/");
    } catch {
      toast({ title: "Failed to log out", variant: "destructive" });
    }
  };

  const { data: serviceRequests = [], isLoading: serviceLoading, isError: serviceError, refetch: refetchServices } = useQuery({
    queryKey: ["/customer/service-requests"],
    queryFn: () => customerServiceRequestsApi.getAll(),
    enabled: isAuthenticated,
  });

  const { data: productOrders = [], isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useQuery({
    queryKey: ["/customer/orders"],
    queryFn: () => shopOrdersApi.getAll(),
    enabled: isAuthenticated,
  });

  const { data: warranties = [], isLoading: warrantiesLoading, isError: warrantiesError, refetch: refetchWarranties } = useQuery({
    queryKey: ["/customer/warranties"],
    queryFn: () => customerWarrantiesApi.getAll(),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setShowAuthModal(true);
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) {
    return (
      <>
        <div className="hidden md:flex container mx-auto px-4 py-20 items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
        <div className="md:hidden min-h-[60vh] flex items-center justify-center bg-slate-50">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </>
    );
  }

  if (!isAuthenticated || !customer) {
    return (
      <>
        <div className="hidden md:block min-h-[60vh]">
          <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-slate-800">{t("auth.loginRequired")}</h2>
              <p className="text-slate-600">Please login to view your profile and manage orders.</p>
              <Button onClick={() => setShowAuthModal(true)}>Login / Sign Up</Button>
            </div>
          </div>
        </div>
        <div className="md:hidden min-h-[60vh] flex flex-col items-center justify-center p-6 bg-slate-50">
          <div className="text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{t("auth.loginRequired")}</h2>
              <p className="text-sm text-slate-500 mt-1">Please login to view your profile and manage orders.</p>
            </div>
            <PillButton onClick={() => setShowAuthModal(true)} data-testid="button-mobile-login">
              Login / Sign Up
            </PillButton>
          </div>
        </div>
        <CustomerAuthModal
          open={showAuthModal}
          onOpenChange={(open) => {
            setShowAuthModal(open);
            if (!open && !isAuthenticated) setLocation("/");
          }}
        />
      </>
    );
  }

  const activeServiceRequests = serviceRequests.filter(o => o.trackingStatus !== "Delivered");
  const completedServiceRequests = serviceRequests.filter(o => o.trackingStatus === "Delivered");

  const activeProductOrders = productOrders.filter(o => !["Delivered", "Declined"].includes(o.status || ""));
  const completedProductOrders = productOrders.filter(o => ["Delivered", "Declined"].includes(o.status || ""));

  const totalOrders = serviceRequests.length + productOrders.length;
  const totalCompleted = completedServiceRequests.length + completedProductOrders.filter(o => o.status === "Delivered").length;

  const isLoading = serviceLoading || ordersLoading;

  const mobileActiveProductOrders = mobileProductTab === "active" ? activeProductOrders : completedProductOrders;
  const mobileActiveServiceRequests = mobileServiceTab === "active" ? activeServiceRequests : completedServiceRequests;

  return (
    <>
      <div className="hidden md:block">
        <motion.div
          className="bg-gradient-to-r from-primary to-primary/80 text-white py-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="container mx-auto px-4">
            <div className="flex items-center gap-4 md:gap-6">
              <div className="w-16 h-16 md:w-24 md:h-24 flex-shrink-0">
                <AvatarSelector
                  currentAvatar={(customer as any).profileImageUrl}
                  onSelect={handleAvatarUpdate}
                />
              </div>
              <div className="min-w-0 flex-1 ml-2 md:ml-0">
                <h1 className="text-lg md:text-4xl font-heading font-bold mb-1 truncate">
                  Welcome, {customer.name}!
                </h1>
                <p className="text-white/80 text-xs md:text-base">
                  Manage your profile and track your orders
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 min-h-screen">
          <div className="container mx-auto px-4 py-4 md:py-8">
            <div className="grid lg:grid-cols-3 gap-4 md:gap-8">
              <motion.div
                className="lg:col-span-1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl max-w-sm md:max-w-none">
                  <CardHeader className="pb-2 md:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <div className="w-6 h-6 md:w-8 md:h-8 bg-white shadow-neumorph-inset rounded-md md:rounded-lg flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                      </div>
                      Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 md:space-y-4">
                    <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                      <User className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">{t("profile.fullName")}</p>
                        <p className="font-medium text-sm md:text-base">{customer.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                      <Phone className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">{t("profile.phoneNumber")}</p>
                        <p className="font-medium text-sm md:text-base">{customer.phone || <span className="text-muted-foreground italic">{t("profile.notProvided")}</span>}</p>
                      </div>
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                        <Mail className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        <div>
                          <p className="text-xs md:text-sm text-muted-foreground">Email</p>
                          <p className="font-medium text-sm md:text-base">{customer.email}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 md:gap-3 p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                      <div className="flex items-center gap-2 md:gap-3">
                        <MapPin className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                        <div>
                          <p className="text-xs md:text-sm text-muted-foreground">{t("profile.address")}</p>
                          <p className="font-medium text-sm md:text-base">{customer.address || <span className="text-muted-foreground italic">{t("profile.notProvided")}</span>}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={handleEditAddress}
                        data-testid="button-edit-address"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                      <Calendar className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                      <div>
                        <p className="text-xs md:text-sm text-muted-foreground">{t("profile.memberSince")}</p>
                        <p className="font-medium text-sm md:text-base">
                          {(() => {
                            try {
                              const dateValue = (customer as any).createdAt || (customer as any).created_at;
                              if (dateValue) {
                                return format(new Date(dateValue), "MMMM d, yyyy");
                              }
                              return t("profile.recentlyJoined");
                            } catch {
                              return t("profile.recentlyJoined");
                            }
                          })()}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 md:pt-4 border-t border-slate-200">
                      <div className="grid grid-cols-2 gap-2 md:gap-4 text-center">
                        <div className="p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                          <p className="text-xl md:text-2xl font-bold text-primary">{totalOrders}</p>
                          <p className="text-xs md:text-sm text-muted-foreground">{t("profile.totalOrders")}</p>
                        </div>
                        <div className="p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                          <p className="text-xl md:text-2xl font-bold text-green-600">{totalCompleted}</p>
                          <p className="text-xs md:text-sm text-muted-foreground">{t("profile.completed")}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                className="lg:col-span-2 space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader className="pb-2 md:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <div className="w-6 h-6 md:w-8 md:h-8 bg-white shadow-neumorph-inset rounded-md md:rounded-lg flex items-center justify-center flex-shrink-0">
                        <ShoppingBag className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                      </div>
                      Product Orders
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                      View your product orders and their current status
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="active" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="active" data-testid="tab-active-product-orders">
                          {t("profile.active")} ({activeProductOrders.length})
                        </TabsTrigger>
                        <TabsTrigger value="completed" data-testid="tab-completed-product-orders">
                          {t("profile.completed")} ({completedProductOrders.length})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="active" className="space-y-4">
                        {ordersError ? (
                          <div className="py-4">
                            <QueryErrorState compact message="Failed to load active orders" onRetry={() => refetchOrders()} />
                          </div>
                        ) : isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        ) : activeProductOrders.length > 0 ? (
                          activeProductOrders.map((order) => (
                            <ProductOrderCard
                              key={order.id}
                              order={order as unknown as Order}
                              onClick={() => setLocation(`/track-order?order=${order.id}&type=product`)}
                            />
                          ))
                        ) : (
                          <div className="text-center py-8">
                            <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                            <h3 className="text-lg font-medium mb-2">No Active Orders</h3>
                            <p className="text-muted-foreground mb-4">
                              You don't have any active product orders.
                            </p>
                            <Button onClick={() => setLocation("/shop")} data-testid="button-shop-now">
                              Shop Now
                            </Button>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="completed" className="space-y-4">
                        {ordersError ? (
                          <div className="py-4">
                            <QueryErrorState compact message="Failed to load completed orders" onRetry={() => refetchOrders()} />
                          </div>
                        ) : isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        ) : completedProductOrders.length > 0 ? (
                          completedProductOrders.map((order) => (
                            <ProductOrderCard
                              key={order.id}
                              order={order as unknown as Order}
                              onClick={() => setLocation(`/track-order?order=${order.id}&type=product`)}
                            />
                          ))
                        ) : (
                          <div className="text-center py-8">
                            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                            <h3 className="text-lg font-medium mb-2">{t("profile.noCompletedOrders")}</h3>
                            <p className="text-muted-foreground">
                              Your completed product orders will appear here.
                            </p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader className="pb-2 md:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <div className="w-6 h-6 md:w-8 md:h-8 bg-white shadow-neumorph-inset rounded-md md:rounded-lg flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                      </div>
                      Repair Requests
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                      View your repair requests and their current status
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="active" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="active" data-testid="tab-active-repair-orders">
                          {t("profile.active")} ({activeServiceRequests.length})
                        </TabsTrigger>
                        <TabsTrigger value="completed" data-testid="tab-completed-repair-orders">
                          {t("profile.completed")} ({completedServiceRequests.length})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="active" className="space-y-4">
                        {serviceError ? (
                          <div className="py-4">
                            <QueryErrorState compact message="Failed to load active repair requests" onRetry={() => refetchServices()} />
                          </div>
                        ) : isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        ) : activeServiceRequests.length > 0 ? (
                          activeServiceRequests.map((order) => (
                            <ServiceOrderCard
                              key={order.id}
                              order={order}
                              onClick={() => setLocation(`/track-order?order=${order.id}&type=service`)}
                            />
                          ))
                        ) : (
                          <div className="text-center py-8">
                            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                            <h3 className="text-lg font-medium mb-2">{t("profile.noActive")}</h3>
                            <p className="text-muted-foreground mb-4">
                              You don't have any active repair requests.
                            </p>
                            <Button onClick={() => setLocation("/repair")} data-testid="button-new-request">
                              {t("profile.submitNew")}
                            </Button>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="completed" className="space-y-4">
                        {serviceError ? (
                          <div className="py-4">
                            <QueryErrorState compact message="Failed to load completed repair requests" onRetry={() => refetchServices()} />
                          </div>
                        ) : isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        ) : completedServiceRequests.length > 0 ? (
                          completedServiceRequests.map((order) => (
                            <ServiceOrderCard
                              key={order.id}
                              order={order}
                              onClick={() => setLocation(`/track-order?order=${order.id}&type=service`)}
                            />
                          ))
                        ) : (
                          <div className="text-center py-8">
                            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                            <h3 className="text-lg font-medium mb-2">{t("profile.noCompleted")}</h3>
                            <p className="text-muted-foreground">
                              Your completed repair requests will appear here.
                            </p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader className="pb-2 md:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <div className="w-6 h-6 md:w-8 md:h-8 bg-white shadow-neumorph-inset rounded-md md:rounded-lg flex items-center justify-center flex-shrink-0">
                        <Shield className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                      </div>
                      Warranties
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                      View warranty status for your completed repairs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {warrantiesError ? (
                      <div className="py-4">
                        <QueryErrorState compact message="Failed to load warranties" onRetry={() => refetchWarranties()} />
                      </div>
                    ) : warrantiesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : warranties.length > 0 ? (
                      <div className="space-y-3">
                        {warranties.map((warranty) => (
                          <div
                            key={warranty.jobId}
                            className="p-3 md:p-4 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl"
                            data-testid={`warranty-card-${warranty.jobId}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-semibold text-sm md:text-base">{warranty.jobId}</p>
                                <p className="text-xs md:text-sm text-muted-foreground">{warranty.device}</p>
                                <p className="text-xs text-muted-foreground">{warranty.issue}</p>
                              </div>
                              <Badge
                                className={warranty.serviceWarranty.isActive || warranty.partsWarranty.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}
                                data-testid={`warranty-status-${warranty.jobId}`}
                              >
                                {warranty.serviceWarranty.isActive || warranty.partsWarranty.isActive ? "Active" : "Expired"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <div className={`p-2 rounded-lg ${warranty.serviceWarranty.isActive ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`} data-testid={`warranty-service-${warranty.jobId}`}>
                                <div className="flex items-center gap-1 mb-1">
                                  <CheckCircle className={`w-3 h-3 ${warranty.serviceWarranty.isActive ? "text-green-600" : "text-gray-400"}`} />
                                  <span className="text-xs font-medium">Service Warranty</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {warranty.serviceWarranty.days} days
                                </p>
                                {warranty.serviceWarranty.expiryDate && (
                                  <p className="text-xs text-muted-foreground">
                                    Expires: {format(new Date(warranty.serviceWarranty.expiryDate), "MMM d, yyyy")}
                                  </p>
                                )}
                                {warranty.serviceWarranty.isActive && warranty.serviceWarranty.remainingDays > 0 && (
                                  <p className="text-xs font-medium text-green-600">
                                    {warranty.serviceWarranty.remainingDays} days left
                                  </p>
                                )}
                              </div>
                              <div className={`p-2 rounded-lg ${warranty.partsWarranty.isActive ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`} data-testid={`warranty-parts-${warranty.jobId}`}>
                                <div className="flex items-center gap-1 mb-1">
                                  <CheckCircle className={`w-3 h-3 ${warranty.partsWarranty.isActive ? "text-green-600" : "text-gray-400"}`} />
                                  <span className="text-xs font-medium">Parts Warranty</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {warranty.partsWarranty.days} days
                                </p>
                                {warranty.partsWarranty.expiryDate && (
                                  <p className="text-xs text-muted-foreground">
                                    Expires: {format(new Date(warranty.partsWarranty.expiryDate), "MMM d, yyyy")}
                                  </p>
                                )}
                                {warranty.partsWarranty.isActive && warranty.partsWarranty.remainingDays > 0 && (
                                  <p className="text-xs font-medium text-green-600">
                                    {warranty.partsWarranty.remainingDays} days left
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                        <h3 className="text-lg font-medium mb-2">No Warranties</h3>
                        <p className="text-muted-foreground">
                          Warranties for your completed repairs will appear here.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="block md:hidden">
                  <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <div className="w-6 h-6 bg-white shadow-neumorph-inset rounded-md flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-primary" />
                        </div>
                        My Inquiries
                      </CardTitle>
                      <CardDescription className="text-xs">
                        View your inquiries and admin replies
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <InquiriesList />
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                  <CardHeader className="pb-2 md:pb-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <div className="w-6 h-6 md:w-8 md:h-8 bg-white shadow-neumorph-inset rounded-md md:rounded-lg flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-3 h-3 md:w-4 md:h-4 text-primary" />
                      </div>
                      Share Your Experience
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                      Help others by sharing your experience with our service
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {showReviewSuccess ? (
                      <div className="text-center py-8">
                        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                        <h3 className="text-lg font-medium mb-2">Thank You!</h3>
                        <p className="text-muted-foreground mb-4">
                          Your review has been submitted and is pending approval.
                        </p>
                        <Button variant="outline" onClick={() => setShowReviewSuccess(false)} data-testid="button-write-another-review">
                          Write Another Review
                        </Button>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmitReview} className="space-y-4">
                        <div className="space-y-2">
                          <Label>Rating</Label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className="focus:outline-none"
                                data-testid={`button-rating-${star}`}
                              >
                                <Star
                                  className={`w-8 h-8 transition-colors ${star <= reviewRating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300 hover:text-yellow-300"
                                    }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="review-title">Title (Optional)</Label>
                          <Input
                            id="review-title"
                            value={reviewTitle}
                            onChange={(e) => setReviewTitle(e.target.value)}
                            placeholder="Summarize your experience"
                            data-testid="input-review-title"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="review-content">Your Review</Label>
                          <Textarea
                            id="review-content"
                            value={reviewContent}
                            onChange={(e) => setReviewContent(e.target.value)}
                            placeholder="Tell us about your experience with our service..."
                            rows={4}
                            data-testid="input-review-content"
                          />
                        </div>
                        <Button
                          type="submit"
                          disabled={reviewMutation.isPending || !reviewContent.trim()}
                          className="w-full"
                          data-testid="button-submit-review"
                        >
                          {reviewMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <Star className="w-4 h-4 mr-2" />
                              Submit Review
                            </>
                          )}
                        </Button>
                      </form>
                    )}
                  </CardContent>
                </Card>

              </motion.div>
            </div>
          </div>
        </div>

        <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Address</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="address">{t("profile.address")}</Label>
                <Input
                  id="address"
                  value={editingAddress}
                  onChange={(e) => setEditingAddress(e.target.value)}
                  placeholder="Enter your address"
                  data-testid="input-edit-address"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddressDialog(false)}
                data-testid="button-cancel-address"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleSaveAddress(() => setShowAddressDialog(false))}
                disabled={isSavingAddress}
                data-testid="button-save-address"
              >
                {isSavingAddress ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="md:hidden min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50/70 via-white to-white pb-[calc(7.25rem+env(safe-area-inset-bottom))]">
        <section className="mx-auto flex max-w-[520px] flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top)+12px)] sm:max-w-[560px]">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100">
              <img src={images.logo} alt="Promise Electronics" className="h-8 w-8 object-contain" />
            </Link>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600">Promise Care</p>
              <h1 className="text-2xl font-black leading-none text-slate-950">{t("dock.profile")}</h1>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingAddress(customer.address || "");
                setShowAddressSheet(true);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm transition active:scale-95"
              aria-label="Edit profile"
              data-testid="button-mobile-edit-address"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-[1.6rem] bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-700 p-3.5 text-white shadow-xl shadow-emerald-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-white/15 text-2xl font-black ring-1 ring-white/20">
                {customerInitial(customer.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/80">{greetingFor(customer.name, t)}</p>
                <h2 className="mt-1 truncate text-2xl font-black">{customer.name}</h2>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] text-white hover:bg-white/20">{t("profile.promiseMember")}</Badge>
                  <Badge className="rounded-full bg-emerald-300 px-2.5 py-1 text-[10px] text-emerald-950 hover:bg-emerald-300">{t("status.active")}</Badge>
                </div>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/10">
                <Phone className="mb-1.5 h-3.5 w-3.5 text-emerald-200" />
                <p className="truncate font-semibold">{customer.phone}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/10">
                <MapPin className="mb-1.5 h-3.5 w-3.5 text-emerald-200" />
                <p className="truncate font-semibold">{customer.address || t("profile.notProvided")}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[1.35rem] bg-white p-2.5 text-center shadow-sm ring-1 ring-slate-100">
              <p className="text-xl font-black text-slate-950">{serviceRequests?.length || 0}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t("profile.repairs")}</p>
            </div>
            <div className="rounded-[1.35rem] bg-white p-2.5 text-center shadow-sm ring-1 ring-slate-100">
              <p className="text-xl font-black text-slate-950">{warranties.length}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t("profile.warranty")}</p>
            </div>
            <div className="rounded-[1.35rem] bg-white p-2.5 text-center shadow-sm ring-1 ring-slate-100">
              <p className="text-xl font-black text-slate-950">{activeServiceRequests.length}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{t("status.pending")}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              { label: t("profile.repairs"), icon: Wrench, href: "/my-repairs" },
              { label: t("profile.warranty"), icon: Shield, href: "/my-warranties" },
              { label: t("profile.address"), icon: MapPin, action: true },
              { label: t("profile.support"), icon: MessageSquare, href: "/support" },
            ].map((item) => {
              const Icon = item.icon;
              const content = (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-black text-slate-700">{item.label}</span>
                </>
              );
              if (item.action) {
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setEditingAddress(customer.address || "");
                      setShowAddressSheet(true);
                    }}
                    className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[1.35rem] bg-white shadow-sm ring-1 ring-slate-100 transition active:scale-95"
                  >
                    {content}
                  </button>
                );
              }
              return (
                <Link key={item.label} href={item.href || "/"} className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[1.35rem] bg-white shadow-sm ring-1 ring-slate-100 transition active:scale-95">
                  {content}
                </Link>
              );
            })}
          </div>

          {(() => {
            const recentRepair = activeServiceRequests[0] || completedServiceRequests[0] || serviceRequests?.[0];
            if (!recentRepair) {
              return (
                <div className="rounded-[1.5rem] bg-white p-4 shadow-sm ring-1 ring-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Recent Repair</p>
                  <p className="mt-1 text-sm font-bold text-slate-900">No repair activity yet</p>
                  <p className="mt-1 text-xs text-slate-500">Book a repair when your TV needs care.</p>
                </div>
              );
            }
            return (
              <button
                type="button"
                onClick={() => setLocation("/track-order?order=" + recentRepair.id + "&type=service")}
                className="rounded-[1.5rem] bg-white p-4 text-left shadow-sm ring-1 ring-slate-100 transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Recent Repair</p>
                    <h3 className="mt-1 truncate text-base font-black text-slate-950">{recentRepair.brand || "Device"} {recentRepair.modelNumber || ""}</h3>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">{recentRepair.primaryIssue || recentRepair.description || recentRepair.ticketNumber || "Repair request"}</p>
                  </div>
                  <StatusChip tone={toneForServiceStatus(recentRepair.status)}>{recentRepair.status}</StatusChip>
                </div>
              </button>
            );
          })()}

          <div className="rounded-[1.5rem] bg-white shadow-sm ring-1 ring-slate-100">
            <button
              type="button"
              onClick={() => {
                setEditingAddress(customer.address || "");
                setShowAddressSheet(true);
              }}
              className="flex min-h-[50px] w-full items-center justify-between px-4 text-left transition active:scale-[0.99]"
            >
              <span className="flex items-center gap-3 text-sm font-black text-slate-900"><Settings className="h-4 w-4 text-emerald-600" />{t("profile.personalDetails")}</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
            <div className="h-px bg-slate-100" />
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-[50px] w-full items-center justify-between px-4 text-left transition active:scale-[0.99]"
            >
              <span className="flex items-center gap-3 text-sm font-black text-rose-600"><LogOut className="h-4 w-4" />{t("profile.logout")}</span>
              <ChevronRight className="h-4 w-4 text-rose-300" />
            </button>
          </div>
        </section>

        <div className="hidden">
          {/* Quick action grid */}
          <div className="-mt-2 grid grid-cols-4 gap-2">
            {[
              { label: t("profile.repairs"), icon: Wrench, href: "/my-repairs", tone: "bg-blue-50 text-blue-600" },
              { label: t("profile.warranty"), icon: Shield, href: "/my-warranties", tone: "bg-emerald-50 text-emerald-600" },
              { label: t("profile.address"), icon: MapPin, href: "#address", tone: "bg-amber-50 text-amber-600", on: () => { setEditingAddress(customer.address || ""); setShowAddressSheet(true); } },
              { label: t("profile.support"), icon: MessageSquare, href: "/support", tone: "bg-rose-50 text-rose-600" },
            ].map((a) => {
              const Icon = a.icon;
              const inner = (
                <>
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${a.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="mt-1.5 text-[11px] font-semibold text-slate-700">{a.label}</span>
                </>
              );
              return a.on ? (
                <button key={a.label} type="button" onClick={a.on} className="flex flex-col items-center rounded-2xl bg-white p-2 shadow-sm shadow-slate-200/40 transition active:scale-95" data-testid={`mobile-quick-${a.label.toLowerCase()}`}>
                  {inner}
                </button>
              ) : (
                <Link key={a.label} href={a.href}>
                  <div className="flex flex-col items-center rounded-2xl bg-white p-2 shadow-sm shadow-slate-200/40 transition active:scale-95" data-testid={`mobile-quick-${a.label.toLowerCase()}`}>
                    {inner}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Personal details card */}
          <div className="rounded-3xl bg-white p-2 shadow-sm shadow-slate-200/50">
            <SectionEyebrow className="px-3 pt-2 pb-1" tone="blue">{t("profile.personalDetails")}</SectionEyebrow>
            <div className="flex items-center gap-3 p-3">
              <div className="h-9 w-9 flex-shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("profile.fullName")}</p>
                <p className="truncate text-sm font-semibold text-slate-800">{customer.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3">
              <div className="h-9 w-9 flex-shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                <Phone className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("profile.phoneNumber")}</p>
                <p className="truncate text-sm font-semibold text-slate-800">{customer.phone || <span className="text-slate-400">{t("profile.notProvided")}</span>}</p>
              </div>
            </div>
            {customer.email && (
              <div className="flex items-center gap-3 p-3">
                <div className="h-9 w-9 flex-shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Email</p>
                  <p className="truncate text-sm font-semibold text-slate-800">{customer.email}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => { setEditingAddress(customer.address || ""); setShowAddressSheet(true); }}
              className="flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.99]"
              data-testid="button-mobile-edit-address-row"
            >
              <div className="h-9 w-9 flex-shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                <MapPin className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("profile.address")}</p>
                <p className="truncate text-sm font-semibold text-slate-800">{customer.address || <span className="text-slate-400">{t("profile.notProvided")}</span>}</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
            </button>
            <div className="flex items-center gap-3 p-3">
              <div className="h-9 w-9 flex-shrink-0 rounded-full bg-blue-50 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("profile.memberSince")}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {(() => {
                    try {
                      const dv = (customer as any).createdAt || (customer as any).created_at;
                      return dv ? format(new Date(dv), "MMMM d, yyyy") : t("profile.recentlyJoined");
                    } catch {
                      return t("profile.recentlyJoined");
                    }
                  })()}
                </p>
              </div>
            </div>
          </div>

          {/* Repair history */}
          <div>
            <SectionEyebrow className="mb-2" tone="blue">{t("profile.repairHistory")}</SectionEyebrow>
            <SegmentedToggle
              value={mobileServiceTab}
              onChange={setMobileServiceTab}
              options={[
                { value: "active", label: `${t("profile.active")} (${activeServiceRequests.length})` },
                { value: "completed", label: `${t("profile.completed")} (${completedServiceRequests.length})` },
              ]}
            />
            <div className="mt-3 space-y-3">
              {serviceError ? (
                <div className="py-4"><QueryErrorState compact message="Failed to load repair requests" onRetry={() => refetchServices()} /></div>
              ) : isLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
              ) : mobileActiveServiceRequests.length > 0 ? (
                mobileActiveServiceRequests.map((order) => (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => setLocation(`/track-order?order=${order.id}&type=service`)}
                    className="w-full rounded-3xl bg-white p-4 text-left shadow-sm shadow-slate-200/50 transition active:scale-[0.99]"
                    data-testid={`card-mobile-service-order-${order.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <RefBadge>{order.ticketNumber}</RefBadge>
                      <StatusChip tone={toneForServiceStatus(order.trackingStatus)}>{order.trackingStatus || "Pending"}</StatusChip>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-600">{order.brand} - {order.primaryIssue}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      <Calendar className="mr-1 inline h-3 w-3" />
                      {format(new Date(order.createdAt), "MMM d, yyyy")}
                    </p>
                  </button>
                ))
              ) : (
                <div className="rounded-3xl bg-white py-8 text-center">
                  <Package className="mx-auto mb-3 h-12 w-12 text-slate-200" />
                  <h3 className="text-sm font-bold text-slate-700">{mobileServiceTab === "active" ? t("profile.noActive") : t("profile.noCompleted")}</h3>
                  <p className="mt-1 mb-4 text-xs text-slate-400">
                    {mobileServiceTab === "active" ? "You don't have any active repair requests." : "Your completed repair requests will appear here."}
                  </p>
                  {mobileServiceTab === "active" && (
                    <PillButton onClick={() => setLocation("/repair")} data-testid="button-mobile-new-request">{t("profile.submitNew")}</PillButton>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Warranty claims */}
          <div>
            <SectionEyebrow className="mb-2" tone="blue">Warranty Claims</SectionEyebrow>
            {warrantiesError ? (
              <div className="py-4"><QueryErrorState compact message="Failed to load warranties" onRetry={() => refetchWarranties()} /></div>
            ) : warrantiesLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>
            ) : warranties.length > 0 ? (
              <div className="space-y-3">
                {warranties.map((warranty) => (
                  <div key={warranty.jobId} className="rounded-3xl bg-white p-4 shadow-sm shadow-slate-200/50" data-testid={`card-mobile-warranty-${warranty.jobId}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{warranty.device}</p>
                        <RefBadge className="mt-1">{warranty.jobId}</RefBadge>
                      </div>
                      <StatusChip tone={warranty.serviceWarranty.isActive || warranty.partsWarranty.isActive ? "done" : "neutral"}>
                        {warranty.serviceWarranty.isActive || warranty.partsWarranty.isActive ? "Active" : "Expired"}
                      </StatusChip>
                    </div>
                    <div className="mt-3 space-y-2">
                      {warranty.serviceWarranty.isActive && warranty.serviceWarranty.remainingDays > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Service warranty</span>
                          <span className="font-semibold text-emerald-600">{warranty.serviceWarranty.remainingDays} days left</span>
                        </div>
                      )}
                      {warranty.partsWarranty.isActive && warranty.partsWarranty.remainingDays > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">Parts warranty</span>
                          <span className="font-semibold text-emerald-600">{warranty.partsWarranty.remainingDays} days left</span>
                        </div>
                      )}
                      {warranty.serviceWarranty.expiryDate && (
                        <p className="text-xs text-slate-400">Service expires {format(new Date(warranty.serviceWarranty.expiryDate), "MMM d, yyyy")}</p>
                      )}
                      {!warranty.serviceWarranty.expiryDate && warranty.partsWarranty.expiryDate && (
                        <p className="text-xs text-slate-400">Parts expires {format(new Date(warranty.partsWarranty.expiryDate), "MMM d, yyyy")}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl bg-white py-8 text-center">
                <Shield className="mx-auto mb-3 h-12 w-12 text-slate-200" />
                <h3 className="text-sm font-bold text-slate-700">No Warranties</h3>
                <p className="mt-1 text-xs text-slate-400">Warranties for your completed repairs will appear here.</p>
              </div>
            )}
          </div>

          {/* Notification settings row (links to support) */}
          <button
            type="button"
            onClick={() => setLocation("/support")}
            className="flex w-full items-center gap-3 rounded-3xl bg-white p-4 text-left shadow-sm shadow-slate-200/50 transition active:scale-[0.99]"
            data-testid="mobile-row-notifications"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Settings className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">Notification Settings</p>
              <p className="text-xs text-slate-400">Manage how we contact you</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </button>

          {/* Inquiries */}
          <div className="rounded-3xl bg-white p-4 shadow-sm shadow-slate-200/50">
            <SectionEyebrow className="mb-1" tone="blue">Inquiries</SectionEyebrow>
            <h3 className="mb-3 text-base font-bold text-slate-800">My Inquiries</h3>
            <InquiriesList />
          </div>

          {/* Feedback */}
          <div className="rounded-3xl bg-white p-5 shadow-sm shadow-slate-200/50">
            <SectionEyebrow className="mb-1" tone="blue">Feedback</SectionEyebrow>
            <h3 className="text-base font-bold text-slate-800">Share Your Experience</h3>
            {showReviewSuccess ? (
              <div className="py-6 text-center">
                <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
                <h4 className="font-bold text-slate-800">Thank You!</h4>
                <p className="mt-1 mb-4 text-xs text-slate-500">Your review has been submitted and is pending approval.</p>
                <PillButton variant="secondary" onClick={() => setShowReviewSuccess(false)} data-testid="button-mobile-write-another-review">Write Another Review</PillButton>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="mt-4 space-y-4">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} type="button" onClick={() => setReviewRating(star)} className="focus:outline-none" data-testid={`button-mobile-rating-${star}`}>
                      <Star className={`h-8 w-8 transition-colors ${star <= reviewRating ? "fill-yellow-400 text-yellow-400" : "text-slate-300"}`} />
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mobile-review-title" className="text-xs font-semibold">Title (Optional)</Label>
                  <Input id="mobile-review-title" value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="Summarize your experience" data-testid="input-mobile-review-title" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mobile-review-content" className="text-xs font-semibold">Your Review</Label>
                  <Textarea id="mobile-review-content" value={reviewContent} onChange={(e) => setReviewContent(e.target.value)} placeholder="Tell us about your experience with our service..." rows={4} data-testid="input-mobile-review-content" />
                </div>
                <PillButton type="submit" disabled={reviewMutation.isPending || !reviewContent.trim()} data-testid="button-mobile-submit-review">
                  {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                  Submit Review
                </PillButton>
              </form>
            )}
          </div>

          {/* Logout — calm, near bottom, not dominant */}
          <button
            type="button"
            onClick={handleLogout}
            className="mx-auto mt-2 flex h-11 w-full max-w-[240px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-500 shadow-sm transition active:scale-95 hover:text-rose-600 hover:border-rose-200"
            data-testid="button-mobile-logout"
          >
            <LogOut className="h-4 w-4" />
            {t("profile.logout")}
          </button>
        </div>

        <Sheet open={showAddressSheet} onOpenChange={setShowAddressSheet}>
          <SheetContent side="bottom" className="rounded-t-3xl pb-8">
            <SheetHeader className="text-left">
              <SheetTitle>Edit Address</SheetTitle>
              <SheetDescription>Update your delivery address</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-6">
              <div className="space-y-2">
                <Label htmlFor="mobile-address">{t("profile.address")}</Label>
                <Input id="mobile-address" value={editingAddress} onChange={(e) => setEditingAddress(e.target.value)} placeholder="Enter your address" data-testid="input-mobile-edit-address" />
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <PillButton onClick={() => handleSaveAddress(() => setShowAddressSheet(false))} disabled={isSavingAddress} data-testid="button-mobile-save-address">
                {isSavingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Address
              </PillButton>
              <PillButton variant="ghost" onClick={() => setShowAddressSheet(false)} data-testid="button-mobile-cancel-address">Cancel</PillButton>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
