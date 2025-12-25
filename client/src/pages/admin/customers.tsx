import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, MoreHorizontal, Loader2, Trash2, Edit, Eye, Users, ShoppingBag, Wrench, Phone, Mail, MapPin, Calendar, CheckCircle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminCustomersApi, type AdminCustomer, type CustomerDetails } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

export default function AdminCustomersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAdminAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomer | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const { data: customers = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: adminCustomersApi.getAll,
    enabled: !!currentUser,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const sseConnectedRef = useRef(false);

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
          }
        }, 5000);

        eventSource.onopen = () => {
          if (mounted) {
            if (connectionTimeout) clearTimeout(connectionTimeout);
            sseConnectedRef.current = true;
          }
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "connected") return;

            if (data.type === "customer_created") {
              queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
              toast.info("New customer registered!", {
                description: `${data.data?.name || "A new customer"} just created an account`,
              });
            }
          } catch (e) {
            console.error("SSE message parse error:", e);
          }
        };

        eventSource.onerror = () => {
          if (connectionTimeout) clearTimeout(connectionTimeout);
          eventSource.close();
          sseConnectedRef.current = false;
        };
      } catch (e) {
        console.error("Failed to create EventSource:", e);
      }
    };

    connectSSE();

    return () => {
      mounted = false;
      if (connectionTimeout) clearTimeout(connectionTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminCustomersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      setIsEditOpen(false);
      toast.success("Customer updated successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update customer");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminCustomersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      setIsDeleteOpen(false);
      toast.success("Customer deleted successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete customer");
    },
  });

  const filteredCustomers = customers.filter((customer) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      customer.name.toLowerCase().includes(searchLower) ||
      customer.phone.includes(searchTerm) ||
      (customer.email && customer.email.toLowerCase().includes(searchLower))
    );
  });

  const handleViewCustomer = async (customer: AdminCustomer) => {
    setSelectedCustomer(customer);
    setIsViewOpen(true);
    setIsLoadingDetails(true);
    try {
      const details = await adminCustomersApi.getOne(customer.id);
      setCustomerDetails(details);
    } catch (error) {
      toast.error("Failed to load customer details");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleEditCustomer = (customer: AdminCustomer) => {
    setSelectedCustomer(customer);
    setEditFormData({
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone,
      address: customer.address || "",
    });
    setIsEditOpen(true);
  };

  const handleDeleteCustomer = (customer: AdminCustomer) => {
    setSelectedCustomer(customer);
    setIsDeleteOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedCustomer) return;
    updateMutation.mutate({
      id: selectedCustomer.id,
      data: editFormData,
    });
  };

  const handleConfirmDelete = () => {
    if (!selectedCustomer) return;
    deleteMutation.mutate(selectedCustomer.id);
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return `à§³${num.toLocaleString("en-BD")}`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "Pending": "secondary",
      "Accepted": "default",
      "Processing": "default",
      "Shipped": "default",
      "Delivered": "default",
      "Declined": "destructive",
      "Cancelled": "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">Customers</h1>
            <p className="text-muted-foreground">Manage registered customer accounts</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-lg py-1 px-3">
              <Users className="w-4 h-4 mr-2" />
              {customers.length} Customers
            </Badge>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by name, phone, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-customers"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No customers found</h3>
                <p className="text-muted-foreground">
                  {searchTerm ? "Try adjusting your search" : "Customers will appear here when they register"}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-center">Orders</TableHead>
                      <TableHead className="text-center">Service Requests</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {customer.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{customer.name}</p>
                              <p className="text-xs text-muted-foreground">{customer.id.substring(0, 8)}...</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="w-3 h-3 text-muted-foreground" />
                              {customer.phone}
                            </div>
                            {customer.email && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Mail className="w-3 h-3" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-blue-50">
                            <ShoppingBag className="w-3 h-3 mr-1" />
                            {customer.totalOrders}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-orange-50">
                            <Wrench className="w-3 h-3 mr-1" />
                            {customer.totalServiceRequests}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {customer.joinedAt ? format(new Date(customer.joinedAt), "MMM d, yyyy") : "N/A"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {customer.isVerified ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="w-3 h-3 mr-1" />
                              Unverified
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-customer-actions-${customer.id}`}>
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleViewCustomer(customer)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditCustomer(customer)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDeleteCustomer(customer)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
            <DialogDescription>
              View customer profile, orders, and service requests
            </DialogDescription>
          </DialogHeader>
          {isLoadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : customerDetails ? (
            <Tabs defaultValue="profile" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="orders">Orders ({customerDetails.orders?.length || 0})</TabsTrigger>
                <TabsTrigger value="requests">Service Requests ({customerDetails.serviceRequests?.length || 0})</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="space-y-4 mt-4">
                <div className="flex items-start gap-4">
                  <Avatar className="w-16 h-16">
                    <AvatarFallback className="bg-primary/10 text-primary text-xl">
                      {customerDetails.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-semibold">{customerDetails.name}</h3>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        {customerDetails.phone}
                      </div>
                      {customerDetails.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          {customerDetails.email}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Joined {customerDetails.joinedAt ? format(new Date(customerDetails.joinedAt), "MMMM d, yyyy") : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Address</Label>
                    <p className="mt-1">{customerDetails.address || "Not provided"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Verification Status</Label>
                    <p className="mt-1">
                      {customerDetails.isVerified ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">Verified</Badge>
                      ) : (
                        <Badge variant="secondary">Unverified</Badge>
                      )}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <ShoppingBag className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{customerDetails.totalOrders}</p>
                          <p className="text-sm text-muted-foreground">Total Orders</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                          <Wrench className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{customerDetails.totalServiceRequests}</p>
                          <p className="text-sm text-muted-foreground">Service Requests</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="orders" className="mt-4">
                <ScrollArea className="h-[400px]">
                  {customerDetails.orders?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No orders yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customerDetails.orders?.map((order: any) => (
                        <Card key={order.id}>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{order.orderNumber}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(order.createdAt), "MMM d, yyyy h:mm a")}
                                </p>
                              </div>
                              <div className="text-right">
                                {getStatusBadge(order.status)}
                                <p className="text-lg font-semibold mt-1">{formatCurrency(order.total)}</p>
                              </div>
                            </div>
                            {order.items && order.items.length > 0 && (
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-sm text-muted-foreground mb-2">Items:</p>
                                {order.items.map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between text-sm">
                                    <span>{item.productName} x{item.quantity}</span>
                                    <span>{formatCurrency(item.total)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
              <TabsContent value="requests" className="mt-4">
                <ScrollArea className="h-[400px]">
                  {customerDetails.serviceRequests?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No service requests yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customerDetails.serviceRequests?.map((request: any) => (
                        <Card key={request.id}>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{request.ticketNumber}</p>
                                <p className="text-sm">{request.brand} - {request.primaryIssue}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(request.createdAt), "MMM d, yyyy")}
                                </p>
                              </div>
                              <Badge variant={request.status === "Completed" ? "default" : "secondary"}>
                                {request.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editFormData.address}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                data-testid="input-edit-address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit">
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
              The customer's orders and service requests will remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
