import { useEffect, useState } from "react";
import { AvatarSelector } from "@/components/profile/AvatarSelector";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { useLocation } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { customerServiceRequestsApi, shopOrdersApi, customerWarrantiesApi, reviewsApi, type WarrantyInfo } from "@/lib/api";
import type { ServiceRequest, Order, CustomerReview } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
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
  MessageSquare
} from "lucide-react";
import { format } from "date-fns";

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
  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["/customer/inquiries"],
    queryFn: async () => {
      const res = await fetch("/api/customer/inquiries");
      if (!res.ok) throw new Error("Failed to fetch inquiries");
      return res.json();
    },
  });

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
  const { customer, isAuthenticated, isLoading: authLoading, updateProfile } = useCustomerAuth();
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [editingAddress, setEditingAddress] = useState("");
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Review form state
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewContent, setReviewContent] = useState("");
  const [showReviewSuccess, setShowReviewSuccess] = useState(false);

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

  const handleSaveAddress = async () => {
    setIsSavingAddress(true);
    try {
      await updateProfile({ address: editingAddress });
      toast({ title: "Address updated successfully" });
      setShowAddressDialog(false);
    } catch (error) {
      toast({ title: "Failed to update address", variant: "destructive" });
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleAvatarUpdate = async (avatar: string) => {
    try {
      await updateProfile({ profileImageUrl: avatar });
      toast({ title: "Avatar updated successfully" });
    } catch (error) {
      toast({ title: "Failed to update avatar", variant: "destructive" });
    }
  };

  const { data: serviceRequests = [], isLoading: serviceLoading } = useQuery({
    queryKey: ["/customer/service-requests"],
    queryFn: () => customerServiceRequestsApi.getAll(),
    enabled: isAuthenticated,
  });

  const { data: productOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["/customer/orders"],
    queryFn: () => shopOrdersApi.getAll(),
    enabled: isAuthenticated,
  });

  const { data: warranties = [], isLoading: warrantiesLoading } = useQuery({
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
      <PublicLayout>
        <div className="container mx-auto px-4 py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PublicLayout>
    );
  }

  if (!isAuthenticated || !customer) {
    return (
      <PublicLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold text-slate-800">Login Required</h2>
            <p className="text-slate-600">Please login to view your profile and manage orders.</p>
            <Button onClick={() => setShowAuthModal(true)}>Login / Sign Up</Button>
          </div>
          <CustomerAuthModal
            open={showAuthModal}
            onOpenChange={(open) => {
              setShowAuthModal(open);
              if (!open && !isAuthenticated) setLocation("/");
            }}
          />
        </div>
      </PublicLayout>
    );
  }

  const activeServiceRequests = serviceRequests.filter(o => o.trackingStatus !== "Delivered");
  const completedServiceRequests = serviceRequests.filter(o => o.trackingStatus === "Delivered");

  const activeProductOrders = productOrders.filter(o => !["Delivered", "Declined"].includes(o.status || ""));
  const completedProductOrders = productOrders.filter(o => ["Delivered", "Declined"].includes(o.status || ""));

  const totalOrders = serviceRequests.length + productOrders.length;
  const totalCompleted = completedServiceRequests.length + completedProductOrders.filter(o => o.status === "Delivered").length;

  const isLoading = serviceLoading || ordersLoading;

  return (
    <PublicLayout>
      {/* Neumorphic Profile Header */}
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

      {/* Neumorphic Profile Content */}
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
                      <p className="text-xs md:text-sm text-muted-foreground">Full Name</p>
                      <p className="font-medium text-sm md:text-base">{customer.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                    <Phone className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    <div>
                      <p className="text-xs md:text-sm text-muted-foreground">Phone Number</p>
                      <p className="font-medium text-sm md:text-base">{customer.phone || <span className="text-muted-foreground italic">Not provided</span>}</p>
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
                        <p className="text-xs md:text-sm text-muted-foreground">Address</p>
                        <p className="font-medium text-sm md:text-base">{customer.address || <span className="text-muted-foreground italic">Not provided</span>}</p>
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
                      <p className="text-xs md:text-sm text-muted-foreground">Member Since</p>
                      <p className="font-medium text-sm md:text-base">
                        {(() => {
                          try {
                            const dateValue = (customer as any).createdAt || (customer as any).created_at;
                            if (dateValue) {
                              return format(new Date(dateValue), "MMMM d, yyyy");
                            }
                            return "Recently joined";
                          } catch {
                            return "Recently joined";
                          }
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 md:pt-4 border-t border-slate-200">
                    <div className="grid grid-cols-2 gap-2 md:gap-4 text-center">
                      <div className="p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                        <p className="text-xl md:text-2xl font-bold text-primary">{totalOrders}</p>
                        <p className="text-xs md:text-sm text-muted-foreground">Total Orders</p>
                      </div>
                      <div className="p-2 md:p-3 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl">
                        <p className="text-xl md:text-2xl font-bold text-green-600">{totalCompleted}</p>
                        <p className="text-xs md:text-sm text-muted-foreground">Completed</p>
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
                        Active ({activeProductOrders.length})
                      </TabsTrigger>
                      <TabsTrigger value="completed" data-testid="tab-completed-product-orders">
                        Completed ({completedProductOrders.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active" className="space-y-4">
                      {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                      ) : activeProductOrders.length > 0 ? (
                        activeProductOrders.map((order) => (
                          <ProductOrderCard
                            key={order.id}
                            order={order}
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
                      {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                      ) : completedProductOrders.length > 0 ? (
                        completedProductOrders.map((order) => (
                          <ProductOrderCard
                            key={order.id}
                            order={order}
                            onClick={() => setLocation(`/track-order?order=${order.id}&type=product`)}
                          />
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
                          <h3 className="text-lg font-medium mb-2">No Completed Orders</h3>
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
                        Active ({activeServiceRequests.length})
                      </TabsTrigger>
                      <TabsTrigger value="completed" data-testid="tab-completed-repair-orders">
                        Completed ({completedServiceRequests.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active" className="space-y-4">
                      {isLoading ? (
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
                          <h3 className="text-lg font-medium mb-2">No Active Requests</h3>
                          <p className="text-muted-foreground mb-4">
                            You don't have any active repair requests.
                          </p>
                          <Button onClick={() => setLocation("/repair")} data-testid="button-new-request">
                            Submit New Request
                          </Button>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="completed" className="space-y-4">
                      {isLoading ? (
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
                          <h3 className="text-lg font-medium mb-2">No Completed Requests</h3>
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
                  {warrantiesLoading ? (
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

              {/* Inquiries Section - Mobile Only */}
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

              {/* Submit Review Section */}
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
              <Label htmlFor="address">Address</Label>
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
              onClick={handleSaveAddress}
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
    </PublicLayout >
  );
}
