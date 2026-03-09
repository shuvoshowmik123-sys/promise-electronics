import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Clock, Search, Plus, MoreVertical, Eye, Printer, Truck,
    Activity, ScrollText, Trash2, Loader2, CheckCircle, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { challansApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BentoCard, DashboardSkeleton, HighlightMatch, smartMatch } from "../shared";

interface LineItem {
    tvDetail?: string;
    description?: string;
    jobNo?: string;
    serialNumber?: string;
    status: string;
    defect?: string;
    remarks?: string;
}

export default function ChallanTab() {
    const queryClient = useQueryClient();
    const [challanSearchQuery, setChallanSearchQuery] = useState("");
    const [challanFilterStatus, setChallanFilterStatus] = useState("all");
    const [challanFilterType, setChallanFilterType] = useState("all");

    // Dialog States
    const [isChallanAddDialogOpen, setIsChallanAddDialogOpen] = useState(false);
    const [isChallanViewDialogOpen, setIsChallanViewDialogOpen] = useState(false);
    const [selectedChallan, setSelectedChallan] = useState<any>(null);

    // Form States
    const [challanFormData, setChallanFormData] = useState({
        id: "",
        type: "Customer",
        receiver: "",
        receiverPhone: "",
        receiverAddress: "",
        vehicleNo: "",
        driverName: "",
        driverPhone: "",
        gatePassNo: "",
        notes: "",
    });
    const [lineItems, setLineItems] = useState<LineItem[]>([
        { tvDetail: "", jobNo: "", serialNumber: "", status: "OK", defect: "" }
    ]);

    const { data: challansData, isLoading } = useQuery({
        queryKey: ["challans"],
        queryFn: () => challansApi.getAll(),
    });

    const createChallanMutation = useMutation({
        mutationFn: (data: any) => challansApi.create(data),
        onSuccess: () => {
            toast.success("Challan created successfully");
            queryClient.invalidateQueries({ queryKey: ["challans"] });
            setIsChallanAddDialogOpen(false);
            resetChallanForm();
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to create challan");
        },
    });

    const updateStatusMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            challansApi.updateStatus(id, status),
        onSuccess: () => {
            toast.success("Status updated successfully");
            queryClient.invalidateQueries({ queryKey: ["challans"] });
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to update status");
        },
    });

    if (isLoading) return <DashboardSkeleton />;

    const rawChallans = challansData || [];
    const challans = rawChallans.filter((challan: any) => {
        const matchesSearch = smartMatch(challanSearchQuery,
            challan.id,
            challan.receiver,
            challan.receiverPhone,
            challan.vehicleNo,
            challan.driverName
        );

        const matchesStatus = challanFilterStatus === "all" || challan.status === challanFilterStatus;
        const matchesType = challanFilterType === "all" || challan.type === challanFilterType;

        return matchesSearch && matchesStatus && matchesType;
    });

    const resetChallanForm = () => {
        setChallanFormData({
            id: "",
            type: "Customer",
            receiver: "",
            receiverPhone: "",
            receiverAddress: "",
            vehicleNo: "",
            driverName: "",
            driverPhone: "",
            gatePassNo: "",
            notes: "",
        });
        setLineItems([{ tvDetail: "", jobNo: "", serialNumber: "", status: "OK", defect: "" }]);
    };

    const addLineItem = () => {
        setLineItems([...lineItems, { tvDetail: "", jobNo: "", serialNumber: "", status: "OK", defect: "" }]);
    };

    const removeLineItem = (index: number) => {
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const updateLineItem = (index: number, field: keyof LineItem, value: string) => {
        const newItems = [...lineItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setLineItems(newItems);
    };

    const handleChallanSubmit = () => {
        createChallanMutation.mutate({
            ...challanFormData,
            items: lineItems.length,
            lineItems: JSON.stringify(lineItems),
            status: "Pending"
        });
    };

    const handleChallanStatusUpdate = (id: string, status: string) => {
        updateStatusMutation.mutate({ id, status });
    };

    const getChallanStatusBadge = (status: string) => {
        switch (status) {
            case "Pending":
                return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
            case "Delivered":
                return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle className="w-3 h-3 mr-1" /> Delivered</Badge>;
            case "Received":
                return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><CheckCircle2 className="w-3 h-3 mr-1" /> Received</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    const handlePrintChallan = (challan: any) => {
        const itemsList: LineItem[] = challan.lineItems ? JSON.parse(challan.lineItems) : [];

        const printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Delivery Challan - ${challan.id}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
              
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: 'Roboto', Arial, sans-serif; padding: 40px; color: #000; line-height: 1.3; }
              
              .container { max-width: 800px; margin: 0 auto; padding: 0; }
              
              /* Header */
              .header { text-align: center; margin-bottom: 30px; position: relative; }
              .header h1 { font-size: 24px; font-weight: 700; text-transform: uppercase; margin-bottom: 5px; text-decoration: underline; }
              .company-name { font-size: 18px; font-weight: 700; margin-bottom: 5px; }
              .date-line { font-size: 16px; font-weight: 600; }
              
              /* Corner Marks */
              .corner-tl { position: absolute; top: 0; left: 0; width: 20px; height: 20px; border-top: 1px solid #ccc; border-left: 1px solid #ccc; }
              .corner-tr { position: absolute; top: 0; right: 0; width: 20px; height: 20px; border-top: 1px solid #ccc; border-right: 1px solid #ccc; }

              /* From / To Section */
              .address-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
              .address-col { width: 48%; }
              .address-label { font-weight: 700; margin-bottom: 5px; font-size: 16px; }
              .address-content p { margin-bottom: 4px; font-size: 14px; }
              .address-content strong { font-weight: 700; }
              
              /* Table */
              .items-table { width: 100%; border-collapse: collapse; margin-bottom: 200px; border: 1px solid #000; }
              .items-table th { border: 1px solid #000; padding: 8px; text-align: center; font-size: 14px; font-weight: 700; background: #fff; }
              .items-table td { border: 1px solid #000; padding: 8px; text-align: center; font-size: 14px; }
              
              /* Column Widths */
              .col-sn { width: 50px; }
              .col-detail { text-align: left !important; }
              .col-status { width: 80px; }
              
              /* Footer Signatures */
              .footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 20px; }
              .sig-block { text-align: center; width: 200px; border-top: 1px solid #000; padding-top: 5px; font-size: 14px; font-weight: 700; }
              
              @media print { 
                body { padding: 0; }
                .container { max-width: 100%; }
                @page { margin: 1.5cm; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="corner-tl"></div>
                <div class="corner-tr"></div>
                <h1>CHALLAN</h1>
                <div class="company-name">Promise Electronics</div>
                <div class="date-line">Date: ${challan.createdAt ? format(new Date(challan.createdAt), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy')}</div>
              </div>
              
              <div class="address-section">
                <div class="address-col">
                  <div class="address-label">From</div>
                  <div class="address-content">
                    <p><strong>Shahidul Islam</strong></p>
                    <p><strong>Promise Electronics</strong></p>
                    <p>Naya Paltan, Dhaka</p>
                    <p>01713-080706</p>
                  </div>
                </div>
                <div class="address-col">
                  <div class="address-label">To</div>
                  <div class="address-content">
                    <p><strong>${challan.receiver}</strong></p>
                    <p><strong>1000fix Service Ltd</strong></p>
                    <p>Mohakhali, Dhaka</p>
                    <p>${challan.receiverPhone || '01730-701957'}</p>
                  </div>
                </div>
              </div>
              
              <table class="items-table">
                <thead>
                  <tr>
                    <th class="col-sn">S/N</th>
                    <th class="col-detail">TV Detail</th>
                    <th>Job No</th>
                    <th>S/N</th>
                    <th class="col-status">Status</th>
                    <th>Defect</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsList.length > 0 ? itemsList.map((item: any, idx: number) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td class="col-detail">${item.tvDetail || item.description || ''}</td>
                      <td>${item.jobNo || '-'}</td>
                      <td>${item.serialNumber || '-'}</td>
                      <td>${item.status || 'OK'}</td>
                      <td>${item.defect || item.remarks || ''}</td>
                    </tr>
                  `).join('') : `
                    <tr>
                       <td colspan="6" style="padding: 20px;">No items listed</td>
                    </tr>
                  `}
                </tbody>
              </table>
              
              <div class="footer">
                <div class="sig-block">
                  For Promise Electronics
                </div>
                <div class="sig-block">
                  Received By
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
            printWindow.document.close();
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <BentoCard className="col-span-1 md:col-span-1 h-full min-h-[200px] bg-gradient-to-br from-teal-500 to-emerald-600" title="Total Challans" icon={<ScrollText size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex flex-col justify-end">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{challans.length}</div>
                    <div className="text-white/80 text-sm mt-2">All Time</div>
                </div>
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-1 h-full min-h-[200px] bg-gradient-to-br from-amber-500 to-orange-600" title="Pending" icon={<Clock size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex flex-col justify-end">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{challans.filter((c: any) => c.status === 'Pending').length}</div>
                    <div className="text-white/80 text-sm mt-2">Delivery Pending</div>
                </div>
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-2 h-full min-h-[200px] bg-gradient-to-br from-blue-500 to-indigo-600" title="Recent Activity" icon={<Activity size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex justify-between items-end">
                    <div>
                        <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{challans.filter((c: any) => c.status === 'Delivered').length}</div>
                        <div className="text-white/80 text-sm mt-2">Delivered</div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white/90">{challans.filter((c: any) => c.status === 'Received').length}</div>
                        <div className="text-white/60 text-xs">Received by Client</div>
                    </div>
                </div>
            </BentoCard>

            <BentoCard className="col-span-1 md:col-span-4 min-h-[600px] bg-white border-slate-200 shadow-sm" title="Challan Management" icon={<ScrollText size={24} className="text-indigo-600" />} variant="ghost" disableHover>
                <div className="h-full flex flex-col p-4 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                        <div className="relative flex-1 w-full md:w-auto">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <Input
                                placeholder="Search Challan #, Receiver..."
                                className="pl-10 bg-white border-slate-200"
                                value={challanSearchQuery}
                                onChange={(e) => setChallanSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                            <Select value={challanFilterStatus} onValueChange={setChallanFilterStatus}>
                                <SelectTrigger className="w-[130px] bg-white border-slate-200">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Delivered">Delivered</SelectItem>
                                    <SelectItem value="Received">Received</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={challanFilterType} onValueChange={setChallanFilterType}>
                                <SelectTrigger className="w-[130px] bg-white border-slate-200">
                                    <SelectValue placeholder="Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="Customer">Customer</SelectItem>
                                    <SelectItem value="Corporate">Corporate</SelectItem>
                                    <SelectItem value="Transfer">Transfer</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button onClick={() => setIsChallanAddDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                <Plus className="w-4 h-4 mr-2" /> New Challan
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
                        <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-white rounded-lg mb-2 sticky top-0 z-10 border-b border-slate-100">
                            <div className="col-span-2">Challan #</div>
                            <div className="col-span-3">Receiver</div>
                            <div className="col-span-3">Transport</div>
                            <div className="col-span-1 text-center">Items</div>
                            <div className="col-span-2 text-right">Status</div>
                            <div className="col-span-1 text-right">Actions</div>
                        </div>
                        {challans.map((challan: any) => (
                            <div key={challan.id} className="grid grid-cols-12 gap-4 items-center p-4 bg-white hover:bg-slate-50 rounded-3xl transition-all group border border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-md">
                                <div className="col-span-2">
                                    <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded text-xs group-hover:bg-white group-hover:text-blue-600 border border-slate-200"><HighlightMatch text={challan.id} query={challanSearchQuery} /></span>
                                    <div className="text-[10px] text-slate-400 mt-1">{format(new Date(challan.createdAt), 'dd/MM/yy')}</div>
                                </div>
                                <div className="col-span-3 font-semibold text-slate-800">
                                    <HighlightMatch text={challan.receiver} query={challanSearchQuery} />
                                    <div className="text-xs text-slate-500 font-normal"><HighlightMatch text={challan.receiverPhone} query={challanSearchQuery} /></div>
                                </div>
                                <div className="col-span-3 text-slate-600 text-xs">
                                    <div className="flex items-center gap-1"><Truck className="w-3 h-3" /> <HighlightMatch text={challan.vehicleNo || 'N/A'} query={challanSearchQuery} /></div>
                                    <div className="text-[10px] text-slate-400 pl-4"><HighlightMatch text={challan.driverName} query={challanSearchQuery} /></div>
                                </div>
                                <div className="col-span-1 text-center font-bold text-slate-700">{challan.items}</div>
                                <div className="col-span-2 text-right">
                                    {getChallanStatusBadge(challan.status)}
                                </div>
                                <div className="col-span-1 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                <MoreVertical className="h-4 w-4 text-slate-400" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                            <DropdownMenuItem onClick={() => { setSelectedChallan(challan); setIsChallanViewDialogOpen(true); }}>
                                                <Eye className="w-4 h-4 mr-2" /> View Details
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handlePrintChallan(challan)}>
                                                <Printer className="w-4 h-4 mr-2" /> Print Challan
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => handleChallanStatusUpdate(challan.id, "Pending")}>Mark Pending</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleChallanStatusUpdate(challan.id, "Delivered")}>Mark Delivered</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleChallanStatusUpdate(challan.id, "Received")}>Mark Received</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Create Challan Dialog */}
                <Dialog open={isChallanAddDialogOpen} onOpenChange={(open) => { setIsChallanAddDialogOpen(open); if (!open) resetChallanForm(); }}>
                    <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Create Delivery Challan</DialogTitle>
                            <DialogDescription>Fill in the details for the delivery challan.</DialogDescription>
                        </DialogHeader>

                        <Tabs defaultValue="general" className="w-full">
                            <TabsList className="grid w-full grid-cols-4 bg-slate-100">
                                <TabsTrigger value="general">General</TabsTrigger>
                                <TabsTrigger value="receiver">Receiver</TabsTrigger>
                                <TabsTrigger value="transport">Transport</TabsTrigger>
                                <TabsTrigger value="items">Items</TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Challan ID</Label>
                                        <Input placeholder="Auto-generated if empty" value={challanFormData.id} onChange={(e) => setChallanFormData({ ...challanFormData, id: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Type</Label>
                                        <Select value={challanFormData.type} onValueChange={(value) => setChallanFormData({ ...challanFormData, type: value })}>
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
                                    <Label>Gate Pass No</Label>
                                    <Input placeholder="GP-12345" value={challanFormData.gatePassNo} onChange={(e) => setChallanFormData({ ...challanFormData, gatePassNo: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Notes</Label>
                                    <Textarea placeholder="Additional notes..." value={challanFormData.notes} onChange={(e) => setChallanFormData({ ...challanFormData, notes: e.target.value })} />
                                </div>
                            </TabsContent>

                            <TabsContent value="receiver" className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <Label>Receiver Name / Company</Label>
                                    <Input placeholder="e.g. Hotel Serena Ltd." value={challanFormData.receiver} onChange={(e) => setChallanFormData({ ...challanFormData, receiver: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone Number</Label>
                                    <Input placeholder="+880..." value={challanFormData.receiverPhone} onChange={(e) => setChallanFormData({ ...challanFormData, receiverPhone: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Address</Label>
                                    <Textarea placeholder="Full delivery address..." value={challanFormData.receiverAddress} onChange={(e) => setChallanFormData({ ...challanFormData, receiverAddress: e.target.value })} />
                                </div>
                            </TabsContent>

                            <TabsContent value="transport" className="space-y-4 pt-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Vehicle No</Label>
                                        <Input placeholder="e.g. DHAKA METRO-T-11-2233" value={challanFormData.vehicleNo} onChange={(e) => setChallanFormData({ ...challanFormData, vehicleNo: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Driver Name</Label>
                                        <Input placeholder="Driver Name" value={challanFormData.driverName} onChange={(e) => setChallanFormData({ ...challanFormData, driverName: e.target.value })} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Driver Phone</Label>
                                    <Input placeholder="Driver Contact No" value={challanFormData.driverPhone} onChange={(e) => setChallanFormData({ ...challanFormData, driverPhone: e.target.value })} />
                                </div>
                            </TabsContent>

                            <TabsContent value="items" className="space-y-4 pt-4">
                                <div className="space-y-4">
                                    {lineItems.map((item, index) => (
                                        <Card key={index} className="relative border-slate-200">
                                            <Button variant="ghost" size="icon" className="absolute right-2 top-2 text-red-500 hover:text-red-700 hover:bg-red-50 h-6 w-6" onClick={() => removeLineItem(index)} disabled={lineItems.length === 1}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                            <CardContent className="p-4 grid gap-4">
                                                <div className="grid grid-cols-12 gap-4">
                                                    <div className="col-span-6">
                                                        <Label className="text-xs">TV Detail</Label>
                                                        <Input value={item.tvDetail} onChange={(e) => updateLineItem(index, "tvDetail", e.target.value)} placeholder="e.g. 43'' SAMSUNG" className="h-8 text-sm" />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <Label className="text-xs">Job No</Label>
                                                        <Input value={item.jobNo} onChange={(e) => updateLineItem(index, "jobNo", e.target.value)} placeholder="Job ID" className="h-8 text-sm" />
                                                    </div>
                                                    <div className="col-span-3">
                                                        <Label className="text-xs">Serial (Device)</Label>
                                                        <Input value={item.serialNumber} onChange={(e) => updateLineItem(index, "serialNumber", e.target.value)} placeholder="Serial No" className="h-8 text-sm" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-12 gap-4">
                                                    <div className="col-span-3">
                                                        <Label className="text-xs">Status</Label>
                                                        <Select value={item.status} onValueChange={(value) => updateLineItem(index, "status", value)}>
                                                            <SelectTrigger className="h-8 text-sm">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="OK">OK</SelectItem>
                                                                <SelectItem value="NG">NG</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="col-span-9">
                                                        <Label className="text-xs">Defect / Remarks</Label>
                                                        <Input value={item.defect} onChange={(e) => updateLineItem(index, "defect", e.target.value)} placeholder="Defect description..." className="h-8 text-sm" />
                                                    </div>
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
                            <Button variant="outline" onClick={() => setIsChallanAddDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleChallanSubmit} disabled={createChallanMutation.isPending}>
                                {createChallanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Challan
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* View Challan Dialog */}
                <Dialog open={isChallanViewDialogOpen} onOpenChange={setIsChallanViewDialogOpen}>
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>Challan Details: {selectedChallan?.id}</DialogTitle>
                        </DialogHeader>
                        {selectedChallan && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <h3 className="font-semibold text-slate-900 mb-2">Receiver Details</h3>
                                        <div className="space-y-1 text-sm text-slate-600">
                                            <p><span className="font-medium text-slate-700">Name:</span> {selectedChallan.receiver}</p>
                                            <p><span className="font-medium text-slate-700">Phone:</span> {selectedChallan.receiverPhone}</p>
                                            <p><span className="font-medium text-slate-700">Address:</span> {selectedChallan.receiverAddress}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900 mb-2">Transport Details</h3>
                                        <div className="space-y-1 text-sm text-slate-600">
                                            <p><span className="font-medium text-slate-700">Vehicle:</span> {selectedChallan.vehicleNo}</p>
                                            <p><span className="font-medium text-slate-700">Driver:</span> {selectedChallan.driverName}</p>
                                            <p><span className="font-medium text-slate-700">Phone:</span> {selectedChallan.driverPhone}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-semibold text-slate-900 mb-2">Items</h3>
                                    <div className="border rounded-lg overflow-hidden">
                                        <Table>
                                            <TableHeader className="bg-slate-50">
                                                <TableRow>
                                                    <TableHead>Item Detail</TableHead>
                                                    <TableHead>Job No</TableHead>
                                                    <TableHead>Serial</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {(selectedChallan.lineItems ? JSON.parse(selectedChallan.lineItems) : []).map((item: any, i: number) => (
                                                    <TableRow key={i}>
                                                        <TableCell>{item.tvDetail || item.description}</TableCell>
                                                        <TableCell>{item.jobNo}</TableCell>
                                                        <TableCell>{item.serialNumber}</TableCell>
                                                        <TableCell>{item.status}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsChallanViewDialogOpen(false)}>Close</Button>
                            <Button onClick={() => { setIsChallanViewDialogOpen(false); handlePrintChallan(selectedChallan); }}>
                                <Printer className="w-4 h-4 mr-2" /> Print
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </BentoCard>
        </div>
    );
}
