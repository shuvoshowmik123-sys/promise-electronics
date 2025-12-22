import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Package, Wrench, Calendar, ChevronRight, ShoppingBag, Clock, CheckCircle, XCircle, Truck, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { customerServiceRequestsApi, shopOrdersApi } from "@/lib/api";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import NativeLayout from "../NativeLayout";
import { useState } from "react";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// Status configurations
const serviceStatusColors: Record<string, string> = {
    "Request Received": "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800",
    "Technician Assigned": "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800",
    "Diagnosis Completed": "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800",
    "Parts Pending": "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800",
    "Repairing": "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-100 dark:border-cyan-800",
    "Ready for Delivery": "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800",
    "Delivered": "bg-green-600 text-white border-green-600",
};

const productOrderStatusColors: Record<string, string> = {
    "Pending": "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800",
    "Accepted": "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800",
    "Processing": "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-100 dark:border-cyan-800",
    "Shipped": "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800",
    "Delivered": "bg-green-600 text-white border-green-600",
    "Declined": "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800",
};

export default function NativeOrderHistory() {
    const [, setLocation] = useLocation();
    const { isAuthenticated } = useCustomerAuth();

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

    const isLoading = serviceLoading || ordersLoading;

    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const handleViewDetails = (request: any) => {
        setSelectedRequest(request);
        setIsDrawerOpen(true);
    };

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] pb-20">
            {/* Header */}
            <div className="bg-[var(--color-native-surface)] px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3 border-b border-[var(--color-native-border)] transition-colors duration-200">
                <Link href="/native/profile">
                    <button className="p-2 -ml-2 rounded-full active:bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)] transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                </Link>
                <h1 className="text-xl font-bold text-[var(--color-native-text)]">Order History</h1>
            </div>

            <main className="flex-1 overflow-y-auto scrollbar-hide p-4">
                <Tabs defaultValue="shop" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6 bg-[var(--color-native-card)] p-1 rounded-xl border border-[var(--color-native-border)] shadow-sm h-auto">
                        <TabsTrigger
                            value="shop"
                            className="py-3 rounded-lg data-[state=active]:bg-[var(--color-native-primary)] data-[state=active]:text-white font-medium transition-all text-[var(--color-native-text-muted)]"
                        >
                            Shop Orders
                        </TabsTrigger>
                        <TabsTrigger
                            value="repair"
                            className="py-3 rounded-lg data-[state=active]:bg-[var(--color-native-primary)] data-[state=active]:text-white font-medium transition-all text-[var(--color-native-text-muted)]"
                        >
                            Repair Requests
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="shop" className="space-y-4 outline-none">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-native-primary)]" />
                            </div>
                        ) : productOrders.length > 0 ? (
                            productOrders.map((order) => (
                                <div
                                    key={order.id}
                                    onClick={() => setLocation(`/track-order?order=${order.id}&type=product`)}
                                    className="bg-[var(--color-native-card)] p-4 rounded-2xl border border-[var(--color-native-border)] shadow-sm active:scale-[0.98] transition-transform"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                                <ShoppingBag className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-[var(--color-native-text)]">{order.orderNumber}</h3>
                                                <p className="text-xs text-[var(--color-native-text-muted)] flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {format(new Date(order.createdAt!), "MMM d, yyyy")}
                                                </p>
                                            </div>
                                        </div>
                                        <Badge className={cn("text-xs font-medium px-2.5 py-0.5 border", productOrderStatusColors[order.status || "Pending"])}>
                                            {order.status || "Pending"}
                                        </Badge>
                                    </div>

                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-sm text-[var(--color-native-text-muted)] mb-1">Total Amount</p>
                                            <p className="text-lg font-bold text-[var(--color-native-primary)]">
                                                ৳{Number(order.total).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex items-center text-xs font-medium text-[var(--color-native-text-muted)] bg-[var(--color-native-input)] px-3 py-1.5 rounded-full">
                                            View Details <ChevronRight className="w-3 h-3 ml-1" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-[var(--color-native-input)] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <ShoppingBag className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--color-native-text)] mb-2">No Orders Yet</h3>
                                <p className="text-[var(--color-native-text-muted)] mb-6">You haven't placed any orders yet.</p>
                                <Link href="/native/shop">
                                    <button className="bg-[var(--color-native-primary)] text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
                                        Start Shopping
                                    </button>
                                </Link>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="repair" className="space-y-4 outline-none">
                        {isLoading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-native-primary)]" />
                            </div>
                        ) : serviceRequests.length > 0 ? (
                            serviceRequests.map((request) => (
                                <div
                                    key={request.id}
                                    onClick={() => handleViewDetails(request)}
                                    className="bg-[var(--color-native-card)] p-4 rounded-2xl border border-[var(--color-native-border)] shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                                                <Wrench className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-[var(--color-native-text)]">{request.ticketNumber}</h3>
                                                <p className="text-xs text-[var(--color-native-text-muted)] flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {format(new Date(request.createdAt), "MMM d, yyyy")}
                                                </p>
                                            </div>
                                        </div>
                                        <Badge className={cn("text-xs font-medium px-2.5 py-0.5 border", serviceStatusColors[request.trackingStatus || "Request Received"])}>
                                            {request.trackingStatus || "Request Received"}
                                        </Badge>
                                    </div>

                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-[var(--color-native-text)]">{request.brand} {request.modelNumber ? `- ${request.modelNumber}` : ''}</p>
                                        <p className="text-xs text-[var(--color-native-text-muted)] line-clamp-1">{request.primaryIssue}</p>
                                    </div>

                                    <div className="flex justify-end">
                                        <div className="flex items-center text-xs font-medium text-[var(--color-native-text-muted)] bg-[var(--color-native-input)] px-3 py-1.5 rounded-full">
                                            Track Status <ChevronRight className="w-3 h-3 ml-1" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-[var(--color-native-input)] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Wrench className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--color-native-text)] mb-2">No Repairs Yet</h3>
                                <p className="text-[var(--color-native-text-muted)] mb-6">You haven't requested any repairs yet.</p>
                                <Link href="/native/repair">
                                    <button className="bg-[var(--color-native-primary)] text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
                                        Request Repair
                                    </button>
                                </Link>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </main>

            <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <DrawerContent className="bg-[var(--color-native-card)] border-[var(--color-native-border)] text-[var(--color-native-text)]">
                    <div className="mx-auto w-full max-w-sm">
                        <DrawerHeader>
                            <DrawerTitle className="text-center text-xl font-bold text-[var(--color-native-text)]">Request Details</DrawerTitle>
                            <DrawerDescription className="text-center text-[var(--color-native-text-muted)]">
                                {selectedRequest?.convertedJobId ? `Job #${selectedRequest.convertedJobId}` : `Ticket #${selectedRequest?.ticketNumber}`}
                            </DrawerDescription>
                        </DrawerHeader>

                        {selectedRequest && (
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between p-3 bg-[var(--color-native-input)] rounded-lg">
                                    <span className="text-sm font-medium text-[var(--color-native-text-muted)]">Status</span>
                                    <Badge className={cn("text-xs font-medium px-2.5 py-0.5 border", serviceStatusColors[selectedRequest.trackingStatus || "Request Received"])}>
                                        {selectedRequest.trackingStatus || "Request Received"}
                                    </Badge>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <h4 className="text-xs font-bold text-[var(--color-native-text-muted)] uppercase mb-1">Device Info</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 border border-[var(--color-native-border)] rounded-md">
                                                <p className="text-[10px] text-[var(--color-native-text-muted)]">Device</p>
                                                <p className="text-sm font-medium text-[var(--color-native-text)]">{selectedRequest.brand} {selectedRequest.modelNumber}</p>
                                            </div>
                                            <div className="p-2 border border-[var(--color-native-border)] rounded-md">
                                                <p className="text-[10px] text-[var(--color-native-text-muted)]">Brand</p>
                                                <p className="text-sm font-medium text-[var(--color-native-text)]">{selectedRequest.brand}</p>
                                            </div>
                                            {selectedRequest.modelNumber && (
                                                <div className="p-2 border border-[var(--color-native-border)] rounded-md col-span-2">
                                                    <p className="text-[10px] text-[var(--color-native-text-muted)]">Model</p>
                                                    <p className="text-sm font-medium text-[var(--color-native-text)]">{selectedRequest.modelNumber}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-bold text-[var(--color-native-text-muted)] uppercase mb-1">Issue Details</h4>
                                        <div className="p-3 border border-[var(--color-native-border)] rounded-md bg-[var(--color-native-input)]/50">
                                            <p className="text-sm font-medium mb-1 text-[var(--color-native-text)]">{selectedRequest.primaryIssue}</p>
                                            {selectedRequest.description && (
                                                <p className="text-xs text-[var(--color-native-text-muted)]">{selectedRequest.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-[var(--color-native-text-muted)] pt-2">
                                        <span>Created on {format(new Date(selectedRequest.createdAt), "PPP")}</span>
                                        {selectedRequest.expectedPickupDate && (
                                            <span className="text-[var(--color-native-primary)] font-medium">
                                                Est. Pickup: {format(new Date(selectedRequest.expectedPickupDate), "MMM d, yyyy")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <DrawerFooter>
                            <DrawerClose asChild>
                                <Button variant="outline" className="bg-[var(--color-native-card)] text-[var(--color-native-text)] border-[var(--color-native-border)] hover:bg-[var(--color-native-input)]">Close</Button>
                            </DrawerClose>
                        </DrawerFooter>
                    </div>
                </DrawerContent>
            </Drawer>
        </NativeLayout>
    );
}
