import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminOrdersApi, type Order } from "@/lib/api";
import { format } from "date-fns";
import { 
  Search, Eye, Clock, CheckCircle, XCircle, Package, Truck, 
  ShoppingBag, Phone, MapPin, Loader2, Wifi, Check, X, 
  ChevronRight, CreditCard
} from "lucide-react";
import { toast } from "sonner";

export default function AdminOrdersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [orderToDecline, setOrderToDecline] = useState<Order | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [sseSupported, setSseSupported] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sseConnectedRef = useRef(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;
    let connectionTimeout: NodeJS.Timeout | null = null;
    
    const connectSSE = () => {
      if (!mounted) return;
      
      try {
        const eventSource = new EventSource("/api/admin/events", { withCredentials: true });
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
            
            if (data.type === "connected") return;
            
            if (data.type === "order_created" || data.type === "order_updated" || 
                data.type === "order_accepted" || data.type === "order_declined") {
              queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
              if (data.type === "order_created") {
                toast.success(`New order: #${data.data.orderNumber}`);
              }
            }
          } catch (e) {
            console.error("SSE message parse error:", e);
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
      } catch (e) {
        console.error("Failed to create EventSource:", e);
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
    };
  }, [queryClient]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: adminOrdersApi.getAll,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: sseSupported ? false : 15000,
  });

  const acceptMutation = useMutation({
    mutationFn: (id: string) => adminOrdersApi.accept(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order accepted");
    },
    onError: () => {
      toast.error("Failed to accept order");
    },
  });

  const declineMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => 
      adminOrdersApi.decline(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order declined");
      setShowDeclineDialog(false);
      setOrderToDecline(null);
      setDeclineReason("");
    },
    onError: () => {
      toast.error("Failed to decline order");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminOrdersApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order status updated");
      if (selectedOrder) {
        adminOrdersApi.getOne(selectedOrder.id).then((order) => {
          setSelectedOrder(order);
        });
      }
    },
    onError: () => {
      toast.error("Failed to update order status");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "Accepted":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><CheckCircle className="w-3 h-3 mr-1" /> Accepted</Badge>;
      case "Processing":
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><Package className="w-3 h-3 mr-1" /> Processing</Badge>;
      case "Shipped":
        return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200"><Truck className="w-3 h-3 mr-1" /> Shipped</Badge>;
      case "Delivered":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" /> Delivered</Badge>;
      case "Declined":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" /> Declined</Badge>;
      case "Cancelled":
        return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200"><XCircle className="w-3 h-3 mr-1" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getNextStatus = (currentStatus: string): string | null => {
    switch (currentStatus) {
      case "Accepted": return "Processing";
      case "Processing": return "Shipped";
      case "Shipped": return "Delivered";
      default: return null;
    }
  };

  const filteredOrders = orders.filter((order: Order) => {
    const matchesSearch = 
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerPhone.includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount: string) => {
    return `à§³${parseFloat(amount).toLocaleString("en-BD")}`;
  };

  const orderStats = {
    pending: orders.filter((o: Order) => o.status === "Pending").length,
    processing: orders.filter((o: Order) => ["Accepted", "Processing", "Shipped"].includes(o.status)).length,
    delivered: orders.filter((o: Order) => o.status === "Delivered").length,
    total: orders.length,
  };

  const handleViewDetails = async (order: Order) => {
    try {
      const fullOrder = await adminOrdersApi.getOne(order.id);
      setSelectedOrder(fullOrder);
      setShowDetailsDialog(true);
    } catch (error) {
      toast.error("Failed to fetch order details");
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800" data-testid="text-page-title">Shop Orders</h1>
            <p className="text-slate-600">Manage customer orders from the online shop</p>
          </div>
          <div className="flex items-center gap-2">
            {sseSupported ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Wifi className="w-3 h-3 mr-1" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-slate-50 text-slate-600">
                Polling
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600" data-testid="text-pending-count">{orderStats.pending}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">In Progress</p>
                  <p className="text-2xl font-bold text-blue-600" data-testid="text-processing-count">{orderStats.processing}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Delivered</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-delivered-count">{orderStats.delivered}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Total Orders</p>
                  <p className="text-2xl font-bold text-slate-800" data-testid="text-total-count">{orderStats.total}</p>
                </div>
                <ShoppingBag className="w-8 h-8 text-slate-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle>All Orders</CardTitle>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Search by order #, name, or phone..."
                    className="pl-9 w-full md:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-40" data-testid="select-status-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Accepted">Accepted</SelectItem>
                    <SelectItem value="Processing">Processing</SelectItem>
                    <SelectItem value="Shipped">Shipped</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                    <SelectItem value="Declined">Declined</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No orders found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order: Order) => (
                      <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                        <TableCell className="font-mono font-medium" data-testid={`text-order-number-${order.id}`}>
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.customerPhone}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(order.total)}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>{format(new Date(order.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(order)}
                              data-testid={`button-view-${order.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {order.status === "Pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => acceptMutation.mutate(order.id)}
                                  disabled={acceptMutation.isPending}
                                  data-testid={`button-accept-${order.id}`}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setOrderToDecline(order);
                                    setShowDeclineDialog(true);
                                  }}
                                  data-testid={`button-decline-${order.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {getNextStatus(order.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateStatusMutation.mutate({ 
                                  id: order.id, 
                                  status: getNextStatus(order.status)! 
                                })}
                                disabled={updateStatusMutation.isPending}
                                data-testid={`button-next-status-${order.id}`}
                              >
                                <ChevronRight className="w-4 h-4 mr-1" />
                                {getNextStatus(order.status)}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Order Details - {selectedOrder?.orderNumber}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                {getStatusBadge(selectedOrder.status)}
                <span className="text-sm text-slate-500">
                  {format(new Date(selectedOrder.createdAt), "MMMM dd, yyyy 'at' HH:mm")}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-slate-500">Customer Name</Label>
                  <p className="font-medium">{selectedOrder.customerName}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-slate-500">Phone</Label>
                  <p className="font-medium flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    {selectedOrder.customerPhone}
                  </p>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-slate-500">Delivery Address</Label>
                  <p className="font-medium flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {selectedOrder.customerAddress}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-500">Payment Method</Label>
                <p className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <Badge variant="outline">{selectedOrder.paymentMethod}</Badge>
                </p>
              </div>

              {selectedOrder.declineReason && (
                <div className="bg-red-50 p-3 rounded-lg space-y-1">
                  <Label className="text-red-700">Decline Reason</Label>
                  <p className="text-red-600">{selectedOrder.declineReason}</p>
                </div>
              )}

              {selectedOrder.notes && (
                <div className="space-y-1">
                  <Label className="text-slate-500">Customer Notes</Label>
                  <p className="text-slate-600 bg-slate-50 p-2 rounded">{selectedOrder.notes}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-slate-500">Order Items</Label>
                <div className="border rounded-lg divide-y">
                  {selectedOrder.items?.map((item, index) => (
                    <div key={index} className="p-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        {item.variantName && (
                          <p className="text-sm text-slate-500">{item.variantName}</p>
                        )}
                        <p className="text-sm text-slate-500">
                          {formatCurrency(item.price)} x {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium">{formatCurrency(item.total)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span>{formatCurrency(selectedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(selectedOrder.total)}</span>
                </div>
              </div>

              {selectedOrder.status === "Pending" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      acceptMutation.mutate(selectedOrder.id);
                      setShowDetailsDialog(false);
                    }}
                    disabled={acceptMutation.isPending}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Accept Order
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => {
                      setOrderToDecline(selectedOrder);
                      setShowDeclineDialog(true);
                      setShowDetailsDialog(false);
                    }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Decline Order
                  </Button>
                </div>
              )}

              {getNextStatus(selectedOrder.status) && (
                <Button
                  className="w-full"
                  onClick={() => {
                    updateStatusMutation.mutate({
                      id: selectedOrder.id,
                      status: getNextStatus(selectedOrder.status)!,
                    });
                  }}
                  disabled={updateStatusMutation.isPending}
                >
                  <ChevronRight className="w-4 h-4 mr-2" />
                  Move to {getNextStatus(selectedOrder.status)}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-600">
              Are you sure you want to decline order <strong>{orderToDecline?.orderNumber}</strong>?
            </p>
            <div className="space-y-2">
              <Label htmlFor="declineReason">Reason for declining (optional)</Label>
              <Textarea
                id="declineReason"
                placeholder="e.g., Out of stock, Invalid address, etc."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                data-testid="input-decline-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeclineDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (orderToDecline) {
                  declineMutation.mutate({ id: orderToDecline.id, reason: declineReason });
                }
              }}
              disabled={declineMutation.isPending}
              data-testid="button-confirm-decline"
            >
              {declineMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Decline Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
