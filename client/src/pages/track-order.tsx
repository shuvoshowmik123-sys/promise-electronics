import { useLocation } from "wouter";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { CustomerAuthModal } from "@/components/auth/CustomerAuthModal";
import { QueryErrorState } from "@/components/customer/QueryErrorState";
import { publicSettingsApi, customerServiceRequestsApi, shopOrdersApi, customerWarrantiesApi, type WarrantyInfo, fetchApi } from "@/lib/api";
import type { ServiceRequest, ServiceRequestEvent, Order } from "@shared/schema";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { toast } from "sonner";
import {
  Package,
  Wrench,
  CheckCircle,
  Clock,
  Truck,
  Search,
  User,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Loader2,
  LogOut,
  ChevronRight,
  ShoppingBag,
  XCircle,
  ClipboardCheck,
  FileText,
  DollarSign,
  CheckCircle2,
  X,
  Shield,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { TrackingTimeline } from "@/components/mobile/TrackingTimeline";


import React, { useState, useEffect, useRef, lazy, Suspense } from "react";

const QuoteDetailView = lazy(() => import("./track-order-detail").then(m => ({ default: m.QuoteDetailView })));
const ServiceRequestTimelineWithWarranty = lazy(() => import("./track-order-detail").then(m => ({ default: m.ServiceRequestTimelineWithWarranty })));
const ProductOrderTimeline = lazy(() => import("./track-order-detail").then(m => ({ default: m.ProductOrderTimeline })));

function getQuoteStatusDisplay(quoteStatus: string | null) {
  switch (quoteStatus) {
    case "Pending":
      return { text: "Quote Pending", bg: "bg-yellow-100", color: "text-yellow-700" };
    case "Quoted":
      return { text: "Quote Ready", bg: "bg-blue-100", color: "text-blue-700" };
    case "Accepted":
      return { text: "Quote Accepted", bg: "bg-green-100", color: "text-green-700" };
    case "Declined":
      return { text: "Quote Declined", bg: "bg-red-100", color: "text-red-700" };
    case "Converted":
      return { text: "Converted", bg: "bg-purple-100", color: "text-purple-700" };
    case "Expired":
      return { text: "Expired", bg: "bg-gray-100", color: "text-gray-700" };
    default:
      return null;
  }
}

type TrackingType = "service" | "product";

function parseTrackingQuery(search: string): { orderId: string | null; type: TrackingType } {
  const params = new URLSearchParams(search);
  const order = params.get("order");
  const legacyId = params.get("id");
  const ticket = params.get("ticket");
  const resolved = order || legacyId || ticket;
  const rawType = params.get("type");
  const type: TrackingType = rawType === "product" ? "product" : "service";
  return { orderId: resolved, type };
}

function buildTrackingUrl(orderId: string, type: TrackingType): string {
  return `/track-order?order=${encodeURIComponent(orderId)}&type=${type}`;
}

function ServiceRequestCard({ order, onClick }: { order: ServiceRequest; onClick: () => void }) {
  const isQuote = order.isQuote;
  const quoteStatusDisplay = isQuote ? getQuoteStatusDisplay(order.quoteStatus) : null;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      data-testid={`card-service-request-${order.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isQuote ? "bg-purple-100" : "bg-orange-100"
              }`}>
              {isQuote ? (
                <FileText className="w-6 h-6 text-purple-600" />
              ) : (
                <Wrench className="w-6 h-6 text-orange-600" />
              )}
            </div>
            <div>
              <p className="font-medium">
                #{order.ticketNumber}
                {isQuote && <span className="ml-2 text-xs text-purple-600 font-normal">Quote</span>}
              </p>
              <p className="text-sm text-muted-foreground">{order.brand} - {order.primaryIssue}</p>
              {isQuote && order.quoteAmount && (
                <p className="text-sm font-medium text-primary mt-1">
                  Quoted: ৳{Number(order.quoteAmount).toLocaleString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(order.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {quoteStatusDisplay ? (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${quoteStatusDisplay.bg} ${quoteStatusDisplay.color}`}>
                {quoteStatusDisplay.text}
              </span>
            ) : (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.trackingStatus === "Delivered"
                ? "bg-green-100 text-green-700"
                : order.trackingStatus === "Repairing"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-yellow-100 text-yellow-700"
                }`}>
                {order.trackingStatus}
              </span>
            )}
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductOrderCard({ order, onClick }: { order: Order; onClick: () => void }) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      data-testid={`card-product-order-${order.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="font-medium">#{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">
                ৳{Number(order.total).toLocaleString()} - {order.paymentMethod}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(order.createdAt!), "MMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                order.status === "Delivered" ? "default" :
                  order.status === "Declined" ? "destructive" :
                    order.status === "Pending" ? "secondary" : "outline"
              }
              className={order.status === "Delivered" ? "bg-green-500" : ""}
            >
              {order.status}
            </Badge>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TrackOrderPage() {
  const { t } = useCustomerLanguage();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTicketSearch, setMobileTicketSearch] = useState("");

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [location, setLocation] = useLocation();
  const { customer, isAuthenticated, isLoading: authLoading, logout } = useCustomerAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderType, setSelectedOrderType] = useState<"service" | "product" | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sseConnectedRef = useRef(false);
  const [sseSupported, setSseSupported] = useState(false);

  useEffect(() => {
    const rawType = new URLSearchParams(window.location.search).get("type");
    const { orderId, type } = parseTrackingQuery(window.location.search);
    if (orderId) {
      setSelectedOrderId(orderId);
      setSelectedOrderType(type);
      const canonical = buildTrackingUrl(orderId, type);
      if (`${window.location.pathname}${window.location.search}` !== canonical) {
        window.history.replaceState({}, "", canonical);
      }
    } else {
      setSelectedOrderId(null);
      setSelectedOrderType(null);
      if (rawType === "product") {
        setActiveTab("products");
      } else if (rawType === "service") {
        setActiveTab("repairs");
      }
    }
  }, [location]);

  const { data: serviceRequests, isLoading: serviceLoading, isError: serviceListError, refetch: refetchServiceRequests } = useQuery({
    queryKey: ["/customer/service-requests"],
    queryFn: () => customerServiceRequestsApi.getAll(),
    enabled: isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
  });

  const { data: productOrders, isLoading: ordersLoading, isError: productListError, refetch: refetchProductOrders } = useQuery({
    queryKey: ["/customer/orders"],
    queryFn: () => shopOrdersApi.getAll(),
    enabled: isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
  });

  const { data: serviceRequestDetails, isLoading: serviceRequestDetailLoading, isError: serviceRequestError, refetch: refetchServiceDetails } = useQuery({
    queryKey: ["/customer/service-requests", selectedOrderId],
    queryFn: () => customerServiceRequestsApi.getOne(selectedOrderId!),
    enabled: !!selectedOrderId && selectedOrderType === "service" && isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
    retry: 1,
  });

  // Anonymous ticket lookup - works without auth using ticket number
  const { data: anonymousLookup, isError: anonymousError, isLoading: anonymousLoading, refetch: refetchAnonymous } = useQuery({
    queryKey: ["/public/track", selectedOrderId],
    queryFn: () => fetchApi<any>(`/public/track/${encodeURIComponent(selectedOrderId!)}`),
    enabled: !!selectedOrderId && !isAuthenticated && !authLoading,
    retry: 1,
  });

  const { data: productOrderDetails, isLoading: productOrderDetailLoading, isError: productOrderError, refetch: refetchProductDetails } = useQuery({
    queryKey: ["/customer/orders/detail", selectedOrderId],
    queryFn: () => shopOrdersApi.getOne(selectedOrderId!),
    enabled: !!selectedOrderId && selectedOrderType === "product" && isAuthenticated,
    refetchInterval: sseSupported ? false : 15000,
    retry: 1,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["public-settings"],
    queryFn: publicSettingsApi.getAll,
    staleTime: 5 * 60 * 1000,
  });

  const serviceCenterContact = settings.find(s => s.key === "service_center_contact")?.value || "01700-000000";

  const acceptQuoteMutation = useMutation({
    mutationFn: ({ id, pickupTier, address, servicePreference, scheduledVisitDate }: { id: string; pickupTier: string | null; address: string; servicePreference: "home_pickup" | "service_center"; scheduledVisitDate?: Date | null }) =>
      customerServiceRequestsApi.acceptQuote(id, pickupTier, address, servicePreference, scheduledVisitDate),
    onSuccess: (data) => {
      const isServiceCenter = data.servicePreference === "service_center";
      toast({
        title: "Quote Accepted!",
        description: isServiceCenter
          ? "Please bring your TV to our service center."
          : "Your service request has been confirmed. We'll schedule the pickup soon.",
      });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests", selectedOrderId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to accept quote",
        variant: "destructive",
      });
    },
  });

  const declineQuoteMutation = useMutation({
    mutationFn: (id: string) => customerServiceRequestsApi.declineQuote(id),
    onSuccess: () => {
      toast({
        title: "Quote Declined",
        description: "You've declined this quote. Feel free to request a new one anytime.",
      });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/customer/service-requests", selectedOrderId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to decline quote",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!isAuthenticated) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      return;
    }

    let mounted = true;
    let connectionTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      if (!mounted) return;

      try {
        const eventSource = new EventSource("/api/customer/events", { withCredentials: true });
        eventSourceRef.current = eventSource;
        sseConnectedRef.current = false;

        connectionTimeout = setTimeout(() => {
          if (!sseConnectedRef.current && mounted) {
            eventSource.close();
            setSseSupported(false);
          }
        }, 5000);

        eventSource.onopen = () => {
          if (mounted) {
            if (connectionTimeout) clearTimeout(connectionTimeout);
            sseConnectedRef.current = true;
            setSseSupported(true);
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "connected") {
              return;
            }

            // Determine if this is a service request or product order update
            // Service requests have trackingStatus field, product orders have data.status field
            const isServiceRequest = data.type === "order_update" ||
              (data.type === "order_updated" && data.trackingStatus !== undefined);
            const isProductOrder = data.type === "order_created" ||
              data.type === "order_accepted" ||
              data.type === "order_declined" ||
              (data.type === "order_updated" && data.data?.orderNumber !== undefined);

            // Handle service request updates
            if (isServiceRequest) {
              queryClient.refetchQueries({ queryKey: ["/customer/service-requests"] });

              if (data.orderId === selectedOrderId) {
                queryClient.refetchQueries({ queryKey: ["/customer/service-requests", selectedOrderId] });
              }

              const statusMessage = data.trackingStatus === "Cancelled"
                ? "Request has been cancelled"
                : data.convertedJobId
                  ? `Converted to Job #${data.convertedJobId}`
                  : `Status updated to ${data.trackingStatus || data.status}`;

              toast({
                title: "Service Request Updated!",
                description: statusMessage,
              });
            }

            // Handle product order updates
            if (isProductOrder) {
              queryClient.refetchQueries({ queryKey: ["/customer/orders"] });

              if (data.data?.id === selectedOrderId) {
                queryClient.refetchQueries({ queryKey: ["/customer/orders/detail", selectedOrderId] });
              }

              let toastTitle = "Order Updated!";
              let statusMessage = "";

              if (data.type === "order_created") {
                toastTitle = t("order.placed");
                statusMessage = `Order #${data.data?.orderNumber} has been submitted`;
              } else if (data.type === "order_accepted") {
                toastTitle = "Order Accepted!";
                statusMessage = `Your order #${data.data?.orderNumber} has been accepted`;
              } else if (data.type === "order_declined") {
                toastTitle = "Order Declined";
                statusMessage = data.data?.declineReason || "Your order has been declined";
              } else {
                statusMessage = `Order status: ${data.data?.status}`;
              }

              toast({
                title: toastTitle,
                description: statusMessage,
              });
            }
          } catch {
          }
        };

        eventSource.onerror = () => {
          if (connectionTimeout) clearTimeout(connectionTimeout);
          eventSource.close();
          sseConnectedRef.current = false;

          if (mounted) {
            setSseSupported(false);
          }
        };
      } catch {
        setSseSupported(false);
      }
    };

    connectSSE();

    return () => {
      mounted = false;
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isAuthenticated, selectedOrderId, queryClient, toast]);

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const handleBackToList = () => {
    setSelectedOrderId(null);
    setSelectedOrderType(null);
    window.history.replaceState({}, "", "/track-order");
  };

  const handleSelectOrder = (orderId: string, type: TrackingType) => {
    setSelectedOrderId(orderId);
    setSelectedOrderType(type);
    window.history.replaceState({}, "", buildTrackingUrl(orderId, type));
  };

  const handleMobileTicketSearch = () => {
    const ticket = mobileTicketSearch.trim();
    if (!ticket) {
      toast({
        title: "Ticket number required",
        description: "Please enter your ticket number to track the repair.",
      });
      return;
    }
    setLocation(buildTrackingUrl(ticket, "service"));
  };

  const isLoading = serviceLoading || ordersLoading;
  const allServiceRequests = serviceRequests || [];
  const allProductOrders = productOrders || [];
  const totalOrders = allServiceRequests.length + allProductOrders.length;

  if (authLoading) {
    return (
      <>
        <div className="container mx-auto px-4 py-20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  // Mobile View
  if (isMobile && !selectedOrderId) {
    return (
      <>
        <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+16px)]">
          <div className="mx-auto w-full max-w-[520px] sm:max-w-[560px] space-y-5">
            <div className="rounded-[28px] bg-emerald-600 p-5 text-white shadow-lg shadow-emerald-200">
              <p className="text-sm font-bold text-emerald-50">{t("common.promiseElectronics")}</p>
              <h1 className="mt-2 text-2xl font-bold">{t("track.heroTitle")}</h1>
              <p className="mt-2 text-sm leading-6 text-emerald-50">
                {t("track.heroSubtitle")}
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <Label className="text-sm font-bold text-slate-900">{t("track.ticketLabel")}</Label>
              <div className="mt-3 flex gap-2">
                <Input
                  value={mobileTicketSearch}
                  onChange={(event) => setMobileTicketSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleMobileTicketSearch();
                  }}
                  placeholder={t("track.ticketPlaceholder")}
                  className="h-12 rounded-2xl border-emerald-100"
                />
                <Button
                  type="button"
                  onClick={handleMobileTicketSearch}
                  className="flex h-12 min-w-[104px] items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 font-black hover:bg-emerald-700"
                  aria-label={t("track.trackTicket")}
                >
                  <Search className="h-5 w-5" />
                  <span className="text-sm">{t("dock.track")}</span>
                </Button>
              </div>
            </div>

            {isAuthenticated && totalOrders > 0 && (
              <div>
                <h2 className="mb-3 text-lg font-bold text-slate-950">{t("track.recentRepairs")}</h2>
                <div className="space-y-3">
                  {allServiceRequests.slice(0, 4).map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => handleSelectOrder(order.id, "service")}
                      className="flex w-full items-center justify-between rounded-3xl border border-emerald-100 bg-white p-4 text-left shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">{order.brand} TV</p>
                        <p className="mt-1 truncate text-sm text-slate-500">{order.primaryIssue}</p>
                      </div>
                      <Badge variant="outline" className="ml-3 border-emerald-200 bg-emerald-50 text-emerald-700">
                        {order.trackingStatus}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-2xl border-emerald-200 bg-white text-emerald-700" onClick={() => setLocation("/repair")}>
                <Wrench className="mr-2 h-4 w-4" />
                {t("track.bookRepair")}
              </Button>
              <Button className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700" onClick={() => isAuthenticated ? setLocation("/my-repairs") : setLocation("/login")}>
                <User className="mr-2 h-4 w-4" />
                {isAuthenticated ? t("journey.viewMyRepairs") : t("track.signIn")}
              </Button>
            </div>
          </div>
        </div>
        <CustomerAuthModal
          open={showAuthModal}
          onOpenChange={setShowAuthModal}
          defaultTab="login"
          onSuccess={() => setShowAuthModal(false)}
          title="Track Your Order"
          description="Sign in or create an account to track repair orders."
        />
      </>
    );
  }

  if (isMobile && selectedOrderId && !isAuthenticated && !authLoading) {
    const hasLookup = !!anonymousLookup && !anonymousError;

    return (
      <>
        <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+20px)]">
          <div className="mx-auto max-w-[520px] space-y-5 sm:max-w-[560px]">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBackToList} className="rounded-full text-emerald-700">
                <ChevronRight className="h-6 w-6 rotate-180" />
              </Button>
              <h1 className="text-xl font-black text-slate-950">Track Repair</h1>
            </div>

            <div className="rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm">
              {anonymousLoading ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                  <p className="mt-3 text-sm font-bold text-slate-700">Checking ticket...</p>
                </div>
              ) : hasLookup ? (
                <div className="space-y-4">
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    Ticket found
                  </Badge>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-slate-400">Reference</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-950">#{anonymousLookup.ticketNumber || selectedOrderId}</h2>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">
                    Sign in to see the full timeline, service notes, warranty, and private repair details.
                  </p>
                  <Button className="h-12 w-full rounded-2xl bg-emerald-600 font-black hover:bg-emerald-700" onClick={() => setLocation("/login")}>
                    Sign In for Full Details
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                    <Search className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-950">Ticket not found</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Check the ticket number or sign in if this repair is linked to your account.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-12 rounded-2xl border-emerald-200 text-emerald-700" onClick={handleBackToList}>
                      Try Again
                    </Button>
                    <Button className="h-12 rounded-2xl bg-emerald-600 font-black hover:bg-emerald-700" onClick={() => setLocation("/login")}>
                      Sign In
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <CustomerAuthModal
          open={showAuthModal}
          onOpenChange={setShowAuthModal}
          defaultTab="login"
          onSuccess={() => setShowAuthModal(false)}
          title="Track Your Order"
          description="Sign in or create an account to track repair orders."
        />
      </>
    );
  }

  if (
    isMobile &&
    selectedOrderId &&
    selectedOrderType &&
    isAuthenticated &&
    (
      serviceRequestDetailLoading ||
      productOrderDetailLoading ||
      serviceRequestError ||
      productOrderError ||
      (selectedOrderType === "service" && !serviceRequestDetails) ||
      (selectedOrderType === "product" && !productOrderDetails)
    )
  ) {
    const isLoadingDetail = serviceRequestDetailLoading || productOrderDetailLoading;
    const hasError = serviceRequestError || productOrderError;

    return (
      <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+20px)]">
        <div className="mx-auto max-w-[520px] space-y-5 sm:max-w-[560px]">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleBackToList} className="rounded-full text-emerald-700">
              <ChevronRight className="h-6 w-6 rotate-180" />
            </Button>
            <h1 className="text-xl font-black text-slate-950">Tracking Details</h1>
          </div>

          <div className="rounded-[2rem] border border-emerald-100 bg-white p-6 text-center shadow-sm">
            {isLoadingDetail ? (
              <>
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
                <h2 className="mt-4 text-lg font-black text-slate-950">Loading latest status</h2>
                <p className="mt-2 text-sm text-slate-500">Please wait a moment.</p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <Search className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-black text-slate-950">
                  {hasError ? "Tracking unavailable" : "No tracking detail yet"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  We could not show this order right now. Go back and choose another ticket or try again shortly.
                </p>
                <Button className="mt-5 h-12 w-full rounded-2xl bg-emerald-600 font-black hover:bg-emerald-700" onClick={handleBackToList}>
                  Back to Orders
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isMobile && selectedOrderId && selectedOrderType === "service" && serviceRequestDetails) {
    return (
      <>
        <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+16px)]">
          <div className="mx-auto max-w-[520px] sm:max-w-[560px]">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="icon" onClick={handleBackToList} className="rounded-full text-emerald-700">
              <ChevronRight className="w-6 h-6 rotate-180" />
            </Button>
            <h1 className="text-xl font-heading font-bold text-slate-950">Tracking Details</h1>
          </div>

          {/* Ticket Info Card */}
          <div className="mb-6 rounded-[28px] border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-lg font-bold text-slate-800">{serviceRequestDetails.brand} TV</h2>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                #{serviceRequestDetails.ticketNumber}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 mb-4">{serviceRequestDetails.primaryIssue}</p>
            <div className="flex gap-2 text-xs">
              <div className="px-2 py-1 rounded bg-slate-100 text-slate-600">
                {format(new Date(serviceRequestDetails.createdAt), "MMM d, yyyy")}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <a href="tel:+8801700000000" className="flex min-h-11 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-bold text-emerald-700">
                <Phone className="mr-2 h-4 w-4" />
                {t("order.call")}
              </a>
              <a href="/support" className="flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-bold text-white">
                {t("common.support")}
              </a>
            </div>
          </div>

          {/* Timeline */}
          <h3 className="text-lg font-bold text-slate-950 px-2 mb-2">Repair Progress</h3>
          <TrackingTimeline order={serviceRequestDetails} />
          </div>
        </div>
      </>
    );
  }

  if (isMobile && selectedOrderId && selectedOrderType === "product" && productOrderDetails) {
    return (
      <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-[calc(7.25rem+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+20px)]">
        <div className="mx-auto max-w-[520px] space-y-5 sm:max-w-[560px]">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleBackToList} className="rounded-full text-emerald-700">
              <ChevronRight className="h-6 w-6 rotate-180" />
            </Button>
            <h1 className="text-xl font-black text-slate-950">Order Details</h1>
          </div>
          <div className="rounded-[2rem] border border-emerald-100 bg-white p-5 shadow-sm">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              {productOrderDetails.status}
            </Badge>
            <h2 className="mt-4 text-2xl font-black text-slate-950">#{productOrderDetails.orderNumber}</h2>
            <p className="mt-2 text-sm text-slate-500">Total ৳{Number(productOrderDetails.total).toLocaleString()}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12 rounded-2xl border-emerald-200 text-emerald-700" onClick={handleBackToList}>
                {t("order.orders")}
              </Button>
              <Button className="h-12 rounded-2xl bg-emerald-600 font-black hover:bg-emerald-700" onClick={() => setLocation("/support")}>
                {t("common.support")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-slate-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2">Track Your Orders</h1>
              <p className="text-slate-300">
                View the status of your orders and repair requests in real-time.
              </p>
            </div>
            {isAuthenticated && customer && (
              <div className="hidden md:flex items-center gap-4">
                <div className="text-right">
                  <p className="font-medium">{customer.name}</p>
                  <p className="text-sm text-slate-400">{customer.phone}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {!isAuthenticated ? (
          selectedOrderId ? (
            anonymousLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : anonymousError ? (
              <div className="max-w-2xl mx-auto py-8">
                <QueryErrorState
                  title="Search Failed"
                  message="We couldn't connect to our tracking system. Please check your connection and try again."
                  onRetry={() => refetchAnonymous()}
                  showHomeLink={false}
                />
              </div>
            ) : anonymousLookup ? (
              <div className="max-w-2xl mx-auto">
                <Card className="border-none shadow-lg">
                  <CardHeader>
                    <CardTitle>Tracking: #{anonymousLookup.ticketNumber}</CardTitle>
                    <CardDescription>{anonymousLookup.brand} — {anonymousLookup.primaryIssue}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3 mb-4">
                      <Badge variant="outline">{anonymousLookup.trackingStatus}</Badge>
                      <span className="text-sm text-muted-foreground">
                        Submitted: {format(new Date(anonymousLookup.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Sign in for full timeline, real-time updates, and warranty info.
                    </p>
                    <Button onClick={() => setShowAuthModal(true)}>Sign In for Full Details</Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="max-w-md mx-auto text-center py-12">
                <XCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
                <h3 className="text-xl font-bold mb-2">Ticket Not Found</h3>
                <p className="text-muted-foreground mb-6">
                  No repair request found for "{selectedOrderId}".
                </p>
                <Button variant="outline" onClick={() => setLocation("/home")}>Return Home</Button>
              </div>
            )
          ) : (
            <div className="max-w-md mx-auto text-center py-12">
              <Package className="w-20 h-20 mx-auto mb-6 text-primary/30" />
              <h2 className="text-2xl font-bold mb-3">{t("track.signInToTrack")}</h2>
              <p className="text-muted-foreground mb-6">
                Login or create an account to view and track your orders in real-time.
              </p>
              <Button size="lg" onClick={() => setShowAuthModal(true)} data-testid="button-open-auth">
                {t("auth.signInRegister")}
              </Button>
            </div>
          )
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : selectedOrderId && selectedOrderType ? (
          (selectedOrderType === "service" && serviceRequestError) || (selectedOrderType === "product" && productOrderError) ? (
            <div className="max-w-2xl mx-auto">
              <Button
                variant="ghost"
                className="mb-4"
                onClick={handleBackToList}
              >
                &larr; Back to Orders
              </Button>
              <QueryErrorState
                title="Order Not Found"
                message={`We couldn't load the details for this ${selectedOrderType}. It may have been removed or you may have a connection issue.`}
                onRetry={() => selectedOrderType === "service" ? refetchServiceDetails() : refetchProductDetails()}
                showHomeLink={false}
              />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <Button
                variant="ghost"
                className="mb-4"
                onClick={handleBackToList}
                data-testid="button-back-to-orders"
              >
                &larr; Back to Orders
              </Button>
              {selectedOrderType === "service" && serviceRequestDetails ? (
                serviceRequestDetails.isQuote && serviceRequestDetails.quoteStatus !== "Accepted" ? (
                  <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
                    <QuoteDetailView
                      order={serviceRequestDetails}
                      onAccept={(pickupTier, address, servicePreference, scheduledVisitDate) =>
                        acceptQuoteMutation.mutate({ id: serviceRequestDetails.id, pickupTier, address, servicePreference, scheduledVisitDate })
                      }
                      onDecline={() => declineQuoteMutation.mutate(serviceRequestDetails.id)}
                      isAccepting={acceptQuoteMutation.isPending}
                      isDeclining={declineQuoteMutation.isPending}
                      serviceCenterContact={serviceCenterContact}
                    />
                  </Suspense>
                ) : (
                  <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
                    <ServiceRequestTimelineWithWarranty
                      order={serviceRequestDetails}
                      events={(serviceRequestDetails as any).timeline || []}
                    />
                  </Suspense>
                )
              ) : selectedOrderType === "product" && productOrderDetails ? (
                <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
                  <ProductOrderTimeline order={productOrderDetails as unknown as Order & { items?: any[] }} />
                </Suspense>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}
            </div>
          )
        ) : serviceListError || productListError ? (
          <div className="max-w-2xl mx-auto py-12">
            <QueryErrorState
              title="Failed to Load Orders"
              message="We couldn't load your orders and repair requests. Please check your connection and try again."
              onRetry={() => {
                refetchServiceRequests();
                refetchProductOrders();
              }}
              showHomeLink={false}
            />
          </div>
        ) : totalOrders > 0 ? (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-bold mb-4">Your Orders ({totalOrders})</h2>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({totalOrders})
                </TabsTrigger>
                <TabsTrigger value="products" data-testid="tab-products">
                  <ShoppingBag className="w-4 h-4 mr-1" /> Products ({allProductOrders.length})
                </TabsTrigger>
                <TabsTrigger value="repairs" data-testid="tab-repairs">
                  <Wrench className="w-4 h-4 mr-1" /> Repairs ({allServiceRequests.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4 mt-4">
                {[...allProductOrders.map(o => ({ ...o, type: "product" as const })),
                ...allServiceRequests.map(o => ({ ...o, type: "service" as const }))]
                  .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
                  .map(order =>
                    order.type === "product" ? (
                      <ProductOrderCard
                        key={`product-${order.id}`}
                        order={order as unknown as Order}
                        onClick={() => handleSelectOrder(order.id, "product")}
                      />
                    ) : (
                      <ServiceRequestCard
                        key={`service-${order.id}`}
                        order={order as ServiceRequest}
                        onClick={() => handleSelectOrder(order.id, "service")}
                      />
                    )
                  )}
              </TabsContent>

              <TabsContent value="products" className="space-y-4 mt-4">
                {allProductOrders.length === 0 ? (
                  <Card className="text-center p-8">
                    <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No product orders yet</p>
                    <Button className="mt-4" onClick={() => setLocation("/shop")} data-testid="button-shop-now">
                      Shop Now
                    </Button>
                  </Card>
                ) : (
                  allProductOrders.map(order => (
                    <ProductOrderCard
                      key={order.id}
                      order={order as unknown as Order}
                      onClick={() => handleSelectOrder(order.id, "product")}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="repairs" className="space-y-4 mt-4">
                {allServiceRequests.length === 0 ? (
                  <Card className="text-center p-8">
                    <Wrench className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No repair requests yet</p>
                    <Button className="mt-4" onClick={() => setLocation("/repair")} data-testid="button-submit-request">
                      Submit Repair Request
                    </Button>
                  </Card>
                ) : (
                  allServiceRequests.map(order => (
                    <ServiceRequestCard
                      key={order.id}
                      order={order}
                      onClick={() => handleSelectOrder(order.id, "service")}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <Card className="max-w-md mx-auto text-center p-8">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">No Orders Found</h2>
            <p className="text-muted-foreground mb-6">
              You haven't placed any orders or repair requests yet.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setLocation("/shop")} data-testid="button-shop-now">
                <ShoppingBag className="w-4 h-4 mr-2" /> Shop Now
              </Button>
              <Button variant="outline" onClick={() => setLocation("/repair")} data-testid="button-submit-request">
                <Wrench className="w-4 h-4 mr-2" /> Repair Request
              </Button>
            </div>
          </Card>
        )}
      </div>

      <CustomerAuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        defaultTab="login"
        onSuccess={() => setShowAuthModal(false)}
        title="Track Your Order"
        description="Sign in or create an account to track your repair orders and view their status."
      />
    </>
  );
}
