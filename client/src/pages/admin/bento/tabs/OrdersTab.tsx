import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
    Package, Search, MoreVertical, Check, X, Eye, Clock, FileText, ArrowLeft
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { adminOrdersApi, type Order, type OrderItem } from "@/lib/api";
import { BentoCard, DashboardSkeleton, StatusBadge, containerVariants, itemVariants, smartMatch } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function OrdersTab({ initialSearchQuery, onSearchConsumed }: { initialSearchQuery?: string; onSearchConsumed?: () => void } = {}) {
    const [searchQuery, setSearchQuery] = useState(initialSearchQuery || "");

    useEffect(() => {
        if (initialSearchQuery) {
            setSearchQuery(initialSearchQuery);
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);

    const [declineDialog, setDeclineDialog] = useState<{ open: boolean; orderId: string | null; reason: string }>({
        open: false,
        orderId: null,
        reason: ""
    });
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    const queryClient = useQueryClient();

    const { data: orders, isLoading } = useQuery({
        queryKey: ["admin-orders"],
        queryFn: () => adminOrdersApi.getAll()
    });

    const acceptMutation = useMutation({
        mutationFn: (orderId: string) => adminOrdersApi.accept(orderId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
            toast.success("Order accepted successfully");
        },
        onError: () => toast.error("Failed to accept order")
    });

    const declineMutation = useMutation({
        mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
            adminOrdersApi.decline(orderId, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
            toast.success("Order declined");
            setDeclineDialog({ open: false, orderId: null, reason: "" });
        },
        onError: () => toast.error("Failed to decline order")
    });

    const filteredOrders = (orders || []).filter((order: Order) =>
        smartMatch(searchQuery, order.customerName, order.customerPhone, order.id)
    );

    const autoOpenedQueryRef = useRef<string | null>(null);

    // Auto-open exact single search matches
    useEffect(() => {
        if (searchQuery && filteredOrders.length === 1 && !selectedOrder) {
            if (autoOpenedQueryRef.current === searchQuery) return;
            autoOpenedQueryRef.current = searchQuery;
            setSelectedOrder(filteredOrders[0]);
        }
    }, [searchQuery, filteredOrders, selectedOrder]);

    if (isLoading) return <DashboardSkeleton />;

    const pendingCount = (orders || []).filter((o: Order) => o.status === "Pending").length;
    const acceptedCount = (orders || []).filter((o: Order) => o.status === "Accepted").length;
    const deliveredCount = (orders || []).filter((o: Order) => o.status === "Delivered").length;

    return (
        <>
            <motion.div
                className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-blue-500 to-indigo-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="text-sm opacity-80 uppercase tracking-widest">Total Orders</div>
                            <div className="text-4xl font-bold mt-2">{orders?.length || 0}</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-orange-500 to-amber-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="text-sm opacity-80 uppercase tracking-widest flex items-center gap-2">
                                <Clock size={14} /> Pending
                            </div>
                            <div className="text-4xl font-bold mt-2">{pendingCount}</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-emerald-500 to-green-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="text-sm opacity-80 uppercase tracking-widest flex items-center gap-2">
                                <Check size={14} /> Accepted
                            </div>
                            <div className="text-4xl font-bold mt-2">{acceptedCount}</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-violet-500 to-purple-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="text-sm opacity-80 uppercase tracking-widest flex items-center gap-2">
                                <Package size={14} /> Delivered
                            </div>
                            <div className="text-4xl font-bold mt-2">{deliveredCount}</div>
                        </div>
                    </BentoCard>
                </motion.div>
            </motion.div>

            {/* Search & Table */}
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 flex flex-col h-full min-h-[500px]">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-slate-800">All Orders</h3>
                    <div className="relative w-80">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                        <Input
                            placeholder="Search by customer, phone, or order ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 rounded-xl border-slate-200"
                        />
                    </div>
                </div>

                <div className="overflow-auto flex-1">
                    <table className="w-full">
                        <thead className="sticky top-0 bg-slate-50 z-10">
                            <tr className="border-b border-slate-200">
                                <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Order ID</th>
                                <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Customer</th>
                                <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Items</th>
                                <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Total</th>
                                <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                                <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Date</th>
                                <th className="text-center py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-slate-400">
                                        No orders found
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map((order: Order) => (
                                    <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-4 px-4">
                                            <span className="font-mono text-sm text-slate-700">#{order.id.slice(0, 8)}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="font-medium text-slate-900">{order.customerName}</div>
                                            <div className="text-xs text-slate-500">{order.customerPhone}</div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="text-sm text-slate-700">{order.items?.length || 0} item(s)</div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="font-bold text-slate-900">৳ {order.total.toLocaleString()}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <StatusBadge status={order.status} />
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="text-sm text-slate-600">
                                                {format(new Date(order.createdAt), "MMM dd, yyyy")}
                                            </span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex items-center justify-center gap-2">
                                                {order.status === "Pending" && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                                                            onClick={() => acceptMutation.mutate(order.id)}
                                                        >
                                                            <Check size={16} />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                                            onClick={() => setDeclineDialog({ open: true, orderId: order.id, reason: "" })}
                                                        >
                                                            <X size={16} />
                                                        </Button>
                                                    </>
                                                )}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                                            <MoreVertical size={16} />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                                                            <Eye size={14} className="mr-2" />
                                                            View Details
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Decline Dialog */}
            <Dialog open={declineDialog.open} onOpenChange={(open) => setDeclineDialog({ ...declineDialog, open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Decline Order</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for declining this order. The customer will be notified.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="Enter decline reason..."
                        value={declineDialog.reason}
                        onChange={(e) => setDeclineDialog({ ...declineDialog, reason: e.target.value })}
                        className="min-h-[100px]"
                    />
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setDeclineDialog({ open: false, orderId: null, reason: "" })}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (declineDialog.orderId) {
                                    declineMutation.mutate({ orderId: declineDialog.orderId, reason: declineDialog.reason });
                                }
                            }}
                            disabled={!declineDialog.reason.trim()}
                        >
                            Decline Order
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Order Details Sheet */}
            <Sheet open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <SheetContent className="w-full sm:max-w-2xl sm:w-[600px] border-l border-slate-200/60 p-0 flex flex-col bg-slate-50">
                    <SheetHeader className="p-6 border-b border-slate-200/60 bg-white">
                        <div className="flex items-center justify-between">
                            <SheetTitle className="text-xl font-bold flex items-center gap-2">
                                <FileText className="h-5 w-5 text-indigo-600" />
                                Order Details
                            </SheetTitle>
                            {selectedOrder && <StatusBadge status={selectedOrder.status} />}
                        </div>
                        <SheetDescription>
                            Review order #{selectedOrder?.id.slice(0, 8)} details and items.
                        </SheetDescription>
                    </SheetHeader>

                    {selectedOrder && (
                        <ScrollArea className="flex-1">
                            <div className="p-6 space-y-6">
                                {/* Customer Info */}
                                <BentoCard variant="ghost" className="p-4 shadow-sm border-slate-200/60 bg-white">
                                    <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                        Customer Information
                                    </h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1">Name</p>
                                            <p className="text-sm font-medium">{selectedOrder.customerName}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1">Phone</p>
                                            <p className="text-sm font-medium">{selectedOrder.customerPhone || "N/A"}</p>
                                        </div>
                                        <div className="col-span-2">
                                            <p className="text-xs text-slate-500 mb-1">Address</p>
                                            <p className="text-sm">{selectedOrder.customerAddress || "No address provided."}</p>
                                        </div>
                                    </div>
                                </BentoCard>

                                {/* Order Items */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-slate-900 flex items-center justify-between">
                                        Order Items
                                        <Badge variant="secondary" className="font-normal text-xs bg-indigo-50 text-indigo-700">
                                            {selectedOrder.items?.length || 0} items
                                        </Badge>
                                    </h4>

                                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                                        <div className="space-y-3">
                                            {selectedOrder.items.map((item, index) => (
                                                <div key={index} className="bg-white border text-sm rounded-xl p-3 shadow-sm border-slate-200/60">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="font-medium text-slate-900">{item.productName}</div>
                                                            {item.variantName && (
                                                                <div className="text-xs text-slate-500 mt-0.5">Variant: {item.variantName}</div>
                                                            )}
                                                            <div className="text-xs text-slate-500 mt-1">
                                                                Qty: <span className="font-medium">{item.quantity}</span> × ৳ {Number(item.price).toLocaleString()}
                                                            </div>
                                                        </div>
                                                        <div className="font-bold text-slate-900">
                                                            ৳ {Number(item.total).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 bg-white border border-dashed rounded-xl border-slate-200">
                                            <p className="text-sm text-slate-500">No items found for this order.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Summary */}
                                <BentoCard variant="ghost" className="p-4 shadow-sm border-slate-200/60 bg-white">
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Subtotal</span>
                                            <span className="font-medium">৳ {Number(selectedOrder.subtotal).toLocaleString()}</span>
                                        </div>
                                        {/* You can add shipping/tax here if available */}
                                        <Separator className="my-2" />
                                        <div className="flex justify-between items-center px-1">
                                            <span className="font-semibold text-slate-900">Total</span>
                                            <span className="text-xl font-bold text-indigo-600">৳ {Number(selectedOrder.total).toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-xs mt-2 pt-2 border-t border-slate-100">
                                            <span className="text-slate-500">Payment Method</span>
                                            <span className="font-medium uppercase text-slate-700">{selectedOrder.paymentMethod}</span>
                                        </div>
                                    </div>
                                </BentoCard>

                            </div>
                        </ScrollArea>
                    )}

                    {/* Action Footer */}
                    {selectedOrder && selectedOrder.status === "Pending" && (
                        <div className="p-4 bg-white border-t border-slate-200/60 flex items-center justify-end gap-3 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
                            <Button
                                variant="outline"
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => {
                                    setSelectedOrder(null);
                                    setDeclineDialog({ open: true, orderId: selectedOrder.id, reason: "" });
                                }}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Decline
                            </Button>
                            <Button
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => {
                                    acceptMutation.mutate(selectedOrder.id);
                                    setSelectedOrder(null);
                                }}
                            >
                                <Check className="h-4 w-4 mr-2" />
                                Accept Order
                            </Button>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}
