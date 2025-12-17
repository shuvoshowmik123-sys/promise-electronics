import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { challansApi } from "@/lib/api";
import { Plus, Search, Filter, Truck, FileText, Printer, Loader2, X, Trash2, MapPin, Phone, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useRef } from "react";
import type { InsertChallan, Challan } from "@shared/schema";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  remarks: string;
}

export default function AdminChallanPage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAdminAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedChallan, setSelectedChallan] = useState<Challan | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Form State
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit: "pcs", remarks: "" }
  ]);

  const [formData, setFormData] = useState<Partial<InsertChallan>>({
    id: "",
    receiver: "",
    receiverAddress: "",
    receiverPhone: "",
    type: "Customer",
    status: "Pending",
    items: 1,
    vehicleNo: "",
    driverName: "",
    driverPhone: "",
    gatePassNo: "",
    notes: "",
  });

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ["challans"],
    queryFn: challansApi.getAll,
  });

  // Filter challans based on search query and filters
  const filteredChallans = challans.filter((challan) => {
    const matchesSearch = searchQuery === "" ||
      challan.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      challan.receiver?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      challan.vehicleNo?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === "all" || challan.status === filterStatus;
    const matchesType = filterType === "all" || challan.type === filterType;

    return matchesSearch && matchesStatus && matchesType;
  });

  const clearFilters = () => {
    setSearchQuery("");
    setFilterStatus("all");
    setFilterType("all");
  };

  const hasActiveFilters = filterStatus !== "all" || filterType !== "all";

  const createMutation = useMutation({
    mutationFn: (data: InsertChallan) => challansApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challans"] });
      toast.success("Challan created successfully");
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create challan");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertChallan> }) =>
      challansApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challans"] });
      toast.success("Challan updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update challan");
    },
  });

  const resetForm = () => {
    setFormData({
      id: "",
      receiver: "",
      receiverAddress: "",
      receiverPhone: "",
      type: "Customer",
      status: "Pending",
      items: 1,
      vehicleNo: "",
      driverName: "",
      driverPhone: "",
      gatePassNo: "",
      notes: "",
    });
    setLineItems([{ description: "", quantity: 1, unit: "pcs", remarks: "" }]);
  };

  const handleStatusUpdate = (id: string, status: "Pending" | "Delivered" | "Received") => {
    updateMutation.mutate({ id, data: { status } });
  };

  const handleViewChallan = (challan: Challan) => {
    setSelectedChallan(challan);
    setIsViewDialogOpen(true);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unit: "pcs", remarks: "" }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      const newItems = [...lineItems];
      newItems.splice(index, 1);
      setLineItems(newItems);
    }
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: any) => {
    const newItems = [...lineItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setLineItems(newItems);
  };

  const handleSubmit = () => {
    // Calculate total items
    const totalItems = lineItems.reduce((sum, item) => sum + item.quantity, 0);

    const submissionData: InsertChallan = {
      ...formData as InsertChallan,
      items: totalItems,
      lineItems: JSON.stringify(lineItems),
    };

    createMutation.mutate(submissionData);
  };

  const handlePrintChallan = (challan: Challan) => {
    const itemsList: LineItem[] = challan.lineItems ? JSON.parse(challan.lineItems) : [];

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Delivery Challan - ${challan.id}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
              
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Inter', Arial, sans-serif; padding: 40px; color: #111; line-height: 1.5; }
              
              .container { max-width: 800px; margin: 0 auto; border: 1px solid #ddd; padding: 0; }
              
              /* Header */
              .header { padding: 30px; border-bottom: 2px solid #000; display: flex; justify-content: space-between; align-items: flex-start; }
              .company-info h1 { font-size: 28px; font-weight: 800; margin-bottom: 5px; color: #000; text-transform: uppercase; letter-spacing: 1px; }
              .company-info p { font-size: 13px; color: #444; margin-bottom: 2px; }
              
              .challan-badge { text-align: right; }
              .challan-title { 
                background: #000; color: #fff; padding: 8px 20px; 
                font-size: 18px; font-weight: 700; text-transform: uppercase; 
                display: inline-block; margin-bottom: 10px;
                border-radius: 4px;
              }
              .copy-type { font-size: 12px; font-weight: 600; text-transform: uppercase; border: 1px solid #000; padding: 2px 8px; display: inline-block; }
              
              /* Info Grid */
              .info-section { display: flex; border-bottom: 1px solid #ddd; }
              .info-col { flex: 1; padding: 20px; }
              .info-col:first-child { border-right: 1px solid #ddd; }
              
              .info-group { margin-bottom: 15px; }
              .info-label { font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600; margin-bottom: 4px; display: block; }
              .info-value { font-size: 14px; font-weight: 500; }
              .info-value.large { font-size: 16px; font-weight: 700; }
              
              /* Table */
              .items-table { width: 100%; border-collapse: collapse; }
              .items-table th { background: #f5f5f5; text-align: left; padding: 12px 15px; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #000; font-weight: 700; }
              .items-table td { padding: 12px 15px; border-bottom: 1px solid #eee; font-size: 14px; }
              .items-table tr:last-child td { border-bottom: none; }
              .col-idx { width: 50px; text-align: center; }
              .col-qty { width: 100px; text-align: right; }
              .col-unit { width: 80px; }
              
              /* Footer */
              .footer { padding: 30px; background: #f9f9f9; border-top: 1px solid #ddd; }
              .notes-section { margin-bottom: 40px; }
              .notes-box { background: #fff; border: 1px solid #ddd; padding: 15px; font-size: 13px; border-radius: 4px; min-height: 60px; }
              
              .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
              .sig-box { text-align: center; width: 200px; }
              .sig-line { border-top: 1px solid #000; padding-top: 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
              
              /* Print Specific */
              @media print { 
                body { padding: 0; }
                .container { border: none; max-width: 100%; }
                .no-print { display: none; }
                @page { margin: 2cm; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="company-info">
                  <h1>Promise Electronics</h1>
                  <p>123 Electronics Avenue, Dhaka-1200</p>
                  <p>Phone: +880 1700-000000 | Email: info@promise.com</p>
                  <p>BIN: 123456789 | TIN: 987654321</p>
                </div>
                <div class="challan-badge">
                  <div class="challan-title">Delivery Challan</div>
                  <br>
                  <div class="copy-type">Original Copy</div>
                </div>
              </div>
              
              <div class="info-section">
                <div class="info-col">
                  <div class="info-group">
                    <span class="info-label">Challan No</span>
                    <div class="info-value large" style="font-family: monospace;">${challan.id}</div>
                  </div>
                  <div class="info-group">
                    <span class="info-label">Date</span>
                    <div class="info-value">${challan.createdAt ? format(new Date(challan.createdAt), 'dd MMM yyyy') : 'N/A'}</div>
                  </div>
                  <div class="info-group">
                    <span class="info-label">Gate Pass No</span>
                    <div class="info-value">${challan.gatePassNo || '-'}</div>
                  </div>
                </div>
                <div class="info-col">
                  <div class="info-group">
                    <span class="info-label">Ship To (Receiver)</span>
                    <div class="info-value large">${challan.receiver}</div>
                    ${challan.receiverAddress ? `<div class="info-value" style="font-size: 13px; color: #555; margin-top: 2px;">${challan.receiverAddress}</div>` : ''}
                    ${challan.receiverPhone ? `<div class="info-value" style="font-size: 13px; color: #555;">Tel: ${challan.receiverPhone}</div>` : ''}
                  </div>
                </div>
              </div>
              
              <div class="info-section">
                <div class="info-col">
                  <div class="info-group">
                    <span class="info-label">Transport Mode</span>
                    <div class="info-value">Road Transport</div>
                  </div>
                  <div class="info-group">
                    <span class="info-label">Vehicle No</span>
                    <div class="info-value">${challan.vehicleNo || '-'}</div>
                  </div>
                </div>
                <div class="info-col">
                  <div class="info-group">
                    <span class="info-label">Driver Name</span>
                    <div class="info-value">${challan.driverName || '-'}</div>
                  </div>
                  <div class="info-group">
                    <span class="info-label">Driver Phone</span>
                    <div class="info-value">${challan.driverPhone || '-'}</div>
                  </div>
                </div>
              </div>
              
              <table class="items-table">
                <thead>
                  <tr>
                    <th class="col-idx">#</th>
                    <th>Description of Goods</th>
                    <th class="col-qty">Quantity</th>
                    <th class="col-unit">Unit</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsList.length > 0 ? itemsList.map((item, idx) => `
                    <tr>
                      <td class="col-idx">${idx + 1}</td>
                      <td>${item.description}</td>
                      <td class="col-qty">${item.quantity}</td>
                      <td class="col-unit">${item.unit}</td>
                      <td>${item.remarks || '-'}</td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td class="col-idx">1</td>
                      <td>General Items (See Notes)</td>
                      <td class="col-qty">${challan.items}</td>
                      <td class="col-unit">Units</td>
                      <td>-</td>
                    </tr>
                  `}
                </tbody>
              </table>
              
              <div class="footer">
                <div class="notes-section">
                  <span class="info-label">Notes / Special Instructions</span>
                  <div class="notes-box">
                    ${challan.notes || 'No additional notes.'}
                  </div>
                </div>
                
                <div class="signatures">
                  <div class="sig-box">
                    <div class="sig-line">Prepared By</div>
                  </div>
                  <div class="sig-box">
                    <div class="sig-line">Driver / Transporter</div>
                  </div>
                  <div class="sig-box">
                    <div class="sig-line">Received By</div>
                  </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #888;">
                  This is a computer generated document.
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold" data-testid="text-page-title">Delivery Challan</h1>
            <p className="text-muted-foreground">Manage road transport documentation and delivery challans.</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            {hasPermission("canCreate") && (
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto" data-testid="button-create-challan">
                  <Plus className="w-4 h-4" /> Create New Challan
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Delivery Challan</DialogTitle>
                <DialogDescription>Fill in the details for the delivery challan.</DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="receiver">Receiver</TabsTrigger>
                  <TabsTrigger value="transport">Transport</TabsTrigger>
                  <TabsTrigger value="items">Items</TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="challan-id">Challan ID</Label>
                      <Input
                        id="challan-id"
                        placeholder="Auto-generated if empty"
                        value={formData.id}
                        onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Type</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Customer">Customer Delivery</SelectItem>
                          <SelectItem value="Corporate">Corporate Order</SelectItem>
                          <SelectItem value="Transfer">Branch Transfer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gate-pass">Gate Pass No</Label>
                    <Input
                      id="gate-pass"
                      placeholder="GP-12345"
                      value={formData.gatePassNo || ""}
                      onChange={(e) => setFormData({ ...formData, gatePassNo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Additional notes or instructions..."
                      value={formData.notes || ""}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="receiver" className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="receiver">Receiver Name / Company</Label>
                    <Input
                      id="receiver"
                      placeholder="e.g. Hotel Serena Ltd."
                      value={formData.receiver}
                      onChange={(e) => setFormData({ ...formData, receiver: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="receiver-phone">Phone Number</Label>
                    <Input
                      id="receiver-phone"
                      placeholder="+880..."
                      value={formData.receiverPhone || ""}
                      onChange={(e) => setFormData({ ...formData, receiverPhone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="receiver-address">Address</Label>
                    <Textarea
                      id="receiver-address"
                      placeholder="Full delivery address..."
                      value={formData.receiverAddress || ""}
                      onChange={(e) => setFormData({ ...formData, receiverAddress: e.target.value })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="transport" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vehicle-no">Vehicle No</Label>
                      <Input
                        id="vehicle-no"
                        placeholder="e.g. DHAKA METRO-T-11-2233"
                        value={formData.vehicleNo || ""}
                        onChange={(e) => setFormData({ ...formData, vehicleNo: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driver-name">Driver Name</Label>
                      <Input
                        id="driver-name"
                        placeholder="Driver Name"
                        value={formData.driverName || ""}
                        onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="driver-phone">Driver Phone</Label>
                    <Input
                      id="driver-phone"
                      placeholder="Driver Contact No"
                      value={formData.driverPhone || ""}
                      onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="items" className="space-y-4 pt-4">
                  <div className="space-y-4">
                    {lineItems.map((item, index) => (
                      <Card key={index} className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => removeLineItem(index)}
                          disabled={lineItems.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <CardContent className="p-4 grid gap-4">
                          <div className="grid grid-cols-12 gap-4">
                            <div className="col-span-6">
                              <Label className="text-xs">Description</Label>
                              <Input
                                value={item.description}
                                onChange={(e) => updateLineItem(index, "description", e.target.value)}
                                placeholder="Item name / description"
                              />
                            </div>
                            <div className="col-span-3">
                              <Label className="text-xs">Quantity</Label>
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 0)}
                              />
                            </div>
                            <div className="col-span-3">
                              <Label className="text-xs">Unit</Label>
                              <Input
                                value={item.unit}
                                onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                                placeholder="pcs, kg, etc"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Remarks</Label>
                            <Input
                              value={item.remarks}
                              onChange={(e) => updateLineItem(index, "remarks", e.target.value)}
                              placeholder="Serial no, color, etc."
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <Button variant="outline" onClick={addLineItem} className="w-full border-dashed">
                      <Plus className="w-4 h-4 mr-2" /> Add Item
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Challan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col gap-4 bg-white p-4 rounded-lg border shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Challan No, Receiver, Vehicle..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant={showFilters ? "default" : "outline"}
                className="gap-2 flex-1 sm:flex-none"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" /> Filters
                {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">!</Badge>}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-4 pt-2 border-t">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                    <SelectItem value="Received">Received</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Customer">Customer</SelectItem>
                    <SelectItem value="Corporate">Corporate</SelectItem>
                    <SelectItem value="Transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    <X className="w-4 h-4 mr-1" /> Clear filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Challan No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Receiver</TableHead>
                  <TableHead>Vehicle No</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">Loading challans...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredChallans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {challans.length === 0 ? "No challans found" : "No challans match your search"}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredChallans.map((challan) => (
                    <TableRow key={challan.id}>
                      <TableCell className="font-medium font-mono text-xs">
                        {challan.id}
                      </TableCell>
                      <TableCell>
                        {challan.createdAt ? format(new Date(challan.createdAt), 'dd MMM yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{challan.receiver}</span>
                          {challan.receiverPhone && <span className="text-xs text-muted-foreground">{challan.receiverPhone}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {challan.vehicleNo ? (
                          <div className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded w-fit">
                            <Truck className="w-3 h-3" /> {challan.vehicleNo}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>{challan.items} Units</TableCell>
                      <TableCell>
                        {hasPermission("canEdit") ? (
                          <Select
                            value={challan.status}
                            onValueChange={(value: any) => handleStatusUpdate(challan.id, value)}
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              <SelectValue>
                                <Badge className={
                                  challan.status === "Delivered" ? "bg-green-500" :
                                    challan.status === "Received" ? "bg-blue-500" :
                                      "bg-yellow-500"
                                }>
                                  {challan.status}
                                </Badge>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pending">Pending</SelectItem>
                              <SelectItem value="Delivered">Delivered</SelectItem>
                              <SelectItem value="Received">Received</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={
                            challan.status === "Delivered" ? "bg-green-500" :
                              challan.status === "Received" ? "bg-blue-500" :
                                "bg-yellow-500"
                          }>
                            {challan.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Print"
                            onClick={() => handlePrintChallan(challan)}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Details"
                            onClick={() => handleViewChallan(challan)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Challan Details
              </DialogTitle>
              <DialogDescription>
                Viewing details for challan {selectedChallan?.id}
              </DialogDescription>
            </DialogHeader>
            {selectedChallan && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Challan No</Label>
                    <p className="font-mono font-bold text-lg">{selectedChallan.id}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <p className="font-medium">{selectedChallan.createdAt ? format(new Date(selectedChallan.createdAt), 'dd MMM yyyy, hh:mm a') : 'N/A'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 p-4 bg-slate-50 rounded-lg">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2"><User className="w-4 h-4" /> Receiver Details</h4>
                    <div className="space-y-1">
                      <p className="font-medium">{selectedChallan.receiver}</p>
                      {selectedChallan.receiverPhone && <p className="text-sm text-muted-foreground">{selectedChallan.receiverPhone}</p>}
                      {selectedChallan.receiverAddress && <p className="text-sm text-muted-foreground">{selectedChallan.receiverAddress}</p>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Transport Details</h4>
                    <div className="space-y-1">
                      <p className="text-sm"><span className="text-muted-foreground">Vehicle:</span> {selectedChallan.vehicleNo || "N/A"}</p>
                      <p className="text-sm"><span className="text-muted-foreground">Driver:</span> {selectedChallan.driverName || "N/A"}</p>
                      <p className="text-sm"><span className="text-muted-foreground">Phone:</span> {selectedChallan.driverPhone || "N/A"}</p>
                      <p className="text-sm"><span className="text-muted-foreground">Gate Pass:</span> {selectedChallan.gatePassNo || "N/A"}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-3">Items List</h4>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="w-[50px]">#</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedChallan.lineItems ? (
                          JSON.parse(selectedChallan.lineItems).map((item: LineItem, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell className="font-medium">{item.description}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell>{item.unit}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">{item.remarks}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                              No detailed items found. Total count: {selectedChallan.items}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {selectedChallan.notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <div className="mt-1 p-3 bg-yellow-50 border border-yellow-100 rounded-md text-sm">
                      {selectedChallan.notes}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  if (selectedChallan) handlePrintChallan(selectedChallan);
                }}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Challan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
