import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Clock, Search, Plus, MoreVertical, Eye, Printer, Truck,
    Activity, ScrollText, Trash2, Loader2, CheckCircle, CheckCircle2, Download, FileText
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
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
    BentoCard,
    DashboardSkeleton,
    HighlightMatch,
    MobileCommandRail,
    MobileMicroMetricGrid,
    MobileScrollContent,
    MobileSegmentTabs,
    MobileTabHeader,
    MobileTabLayout,
    smartMatch
} from "../shared";
import { buildChallanPdf, getLineItems, type LineItem } from "./challan/helpers";
import { MobileChallanCard } from "./challan/MobileChallanCard";
import { MobileChallanDetailSheet } from "./challan/MobileChallanDetailSheet";
import { MobileChallanPdfPreviewSheet } from "./challan/MobileChallanPdfPreviewSheet";
import { ChallanStatusConfirmDialog, type ChallanStatusConfirmAction } from "./challan/ChallanStatusConfirmDialog";

interface ChallanTabProps {
    initialSearchQuery?: string;
    initialChallanId?: string;
    onSearchConsumed?: () => void;
}

export default function ChallanTab({ initialSearchQuery, initialChallanId, onSearchConsumed }: ChallanTabProps = {}) {
    const queryClient = useQueryClient();
    const isMobile = useIsMobile();
    const [challanSearchQuery, setChallanSearchQuery] = useState("");
    const [challanFilterStatus, setChallanFilterStatus] = useState("all");
    const [challanFilterType, setChallanFilterType] = useState("all");

    // Dialog States
    const [isChallanAddDialogOpen, setIsChallanAddDialogOpen] = useState(false);
    const [isChallanViewDialogOpen, setIsChallanViewDialogOpen] = useState(false);
    const [selectedChallan, setSelectedChallan] = useState<any>(null);
    const [pdfPreviewChallan, setPdfPreviewChallan] = useState<any>(null);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
    const [isPdfPreviewLoading, setIsPdfPreviewLoading] = useState(false);
    const [statusConfirmAction, setStatusConfirmAction] = useState<ChallanStatusConfirmAction | null>(null);

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

    useEffect(() => {
        return () => {
            if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        };
    }, [pdfPreviewUrl]);

    const { data: challansData, isLoading } = useQuery({
        queryKey: ["challans"],
        queryFn: () => challansApi.getAll(),
    });

    useEffect(() => {
        if (!initialSearchQuery) return;
        setChallanSearchQuery(initialSearchQuery);
        onSearchConsumed?.();
    }, [initialSearchQuery]);

    useEffect(() => {
        if (!initialChallanId || !challansData?.length) return;
        const match = challansData.find((challan: any) => challan.id === initialChallanId);
        if (!match) return;
        setChallanSearchQuery(match.id);
        setSelectedChallan(match);
        setIsChallanViewDialogOpen(true);
    }, [initialChallanId, challansData]);

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
        mutationFn: ({ id, status }: { id: string; status: string }) => challansApi.updateStatus(id, status),
        onMutate: async ({ id, status }) => {
            await queryClient.cancelQueries({ queryKey: ["challans"] });
            const previousChallans = queryClient.getQueryData<any[]>(["challans"]);

            queryClient.setQueryData<any[]>(["challans"], (current) => {
                if (!current) return current;
                return current.map((challan) => (challan.id === id ? { ...challan, status } : challan));
            });

            return { previousChallans };
        },
        onError: (error: Error, _variables, context) => {
            if (context?.previousChallans) {
                queryClient.setQueryData(["challans"], context.previousChallans);
            }
            toast.error(error.message || "Failed to update status");
        },
        onSuccess: () => {
            toast.success("Status updated successfully");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["challans"] });
            setStatusConfirmAction(null);
        },
    });

    if (isLoading) return <DashboardSkeleton />;

    const rawChallans = challansData || [];
    const pendingCount = rawChallans.filter((c: any) => c.status === "Pending").length;
    const deliveredCount = rawChallans.filter((c: any) => c.status === "Delivered").length;
    const receivedCount = rawChallans.filter((c: any) => c.status === "Received").length;
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

    const requestChallanStatusUpdate = (challan: any, status: "Delivered" | "Received" | "Pending") => {
        setStatusConfirmAction({
            id: challan.id,
            status,
            receiver: challan.receiver,
        });
    };

    const confirmChallanStatusUpdate = () => {
        if (!statusConfirmAction) return;
        handleChallanStatusUpdate(statusConfirmAction.id, statusConfirmAction.status);
    };

    const openChallanDetails = (challan: any) => {
        setSelectedChallan(challan);
        setIsChallanViewDialogOpen(true);
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
        const itemsList = getLineItems(challan);

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

    const handleDownloadChallanPdf = async (challan: any) => {
        const doc = await buildChallanPdf(challan);
        doc.save(`${challan.id || "challan"}.pdf`);
    };

    const handleOpenChallanPdfPreview = async (challan: any) => {
        setPdfPreviewChallan(challan);
        setIsPdfPreviewLoading(true);
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl("");
        try {
            const doc = await buildChallanPdf(challan);
            const blob = doc.output("blob");
            setPdfPreviewUrl(URL.createObjectURL(blob));
        } catch (error: any) {
            toast.error(error?.message || "Failed to generate PDF preview");
            setPdfPreviewChallan(null);
        } finally {
            setIsPdfPreviewLoading(false);
        }
    };

    const closePdfPreview = () => {
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl("");
        setPdfPreviewChallan(null);
        setIsPdfPreviewLoading(false);
    };

    return (
        <>
        <MobileTabLayout className="md:hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <MobileTabHeader className="border-teal-100/70 bg-gradient-to-b from-teal-50 via-slate-50 to-[#f8fafc] pt-2">
                <MobileMicroMetricGrid
                    items={[
                        { label: "Total", value: rawChallans.length, meta: "All challans", tone: "emerald" },
                        { label: "Pending", value: pendingCount, meta: "Need delivery", tone: "amber" },
                        { label: "Delivered", value: deliveredCount, meta: "Sent out", tone: "emerald" },
                        { label: "Received", value: receivedCount, meta: "Closed", tone: "blue" },
                    ]}
                />
                <MobileCommandRail
                    items={[
                        {
                            key: "new",
                            title: "New",
                            icon: <Plus className="h-3.5 w-3.5" />,
                            tone: "emerald",
                            onClick: () => setIsChallanAddDialogOpen(true),
                        },
                        {
                            key: "pending",
                            title: "Pending",
                            badge: pendingCount || null,
                            icon: <Clock className="h-3.5 w-3.5" />,
                            tone: pendingCount > 0 ? "amber" : "slate",
                            onClick: () => setChallanFilterStatus("Pending"),
                        },
                        {
                            key: "received",
                            title: "Received",
                            badge: receivedCount || null,
                            icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                            tone: receivedCount > 0 ? "blue" : "slate",
                            onClick: () => setChallanFilterStatus("Received"),
                        },
                    ]}
                />
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                        placeholder="Search challan, receiver, driver..."
                        className="h-10 rounded-xl border-slate-200 bg-white pl-9 text-sm shadow-sm"
                        value={challanSearchQuery}
                        onChange={(e) => setChallanSearchQuery(e.target.value)}
                    />
                </div>
                <MobileSegmentTabs
                    value={challanFilterStatus}
                    onChange={setChallanFilterStatus}
                    tone={challanFilterStatus === "Pending" ? "amber" : challanFilterStatus === "Delivered" ? "emerald" : challanFilterStatus === "Received" ? "blue" : "slate"}
                    items={[
                        { value: "all", label: "All", badge: <span className="rounded-full bg-white/70 px-1.5 text-[10px]">{rawChallans.length}</span> },
                        { value: "Pending", label: "Pending", badge: pendingCount ? <span className="rounded-full bg-white/70 px-1.5 text-[10px]">{pendingCount}</span> : null },
                        { value: "Delivered", label: "Delivered", badge: deliveredCount ? <span className="rounded-full bg-white/70 px-1.5 text-[10px]">{deliveredCount}</span> : null },
                        { value: "Received", label: "Received", badge: receivedCount ? <span className="rounded-full bg-white/70 px-1.5 text-[10px]">{receivedCount}</span> : null },
                    ]}
                />
                <MobileSegmentTabs
                    value={challanFilterType}
                    onChange={setChallanFilterType}
                    tone="emerald"
                    items={[
                        { value: "all", label: "All Types" },
                        { value: "Customer", label: "Customer" },
                        { value: "Corporate", label: "Corporate" },
                        { value: "Transfer", label: "Transfer" },
                    ]}
                />
            </MobileTabHeader>

            <MobileScrollContent className="space-y-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
                {challans.length === 0 ? (
                    <div className="flex min-h-[56vh] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 text-center shadow-sm">
                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-50 text-teal-700">
                            <ScrollText className="h-8 w-8" />
                        </div>
                        <h3 className="mt-4 text-lg font-black text-slate-950">No challans found</h3>
                        <p className="mt-1 text-sm font-medium text-slate-500">Clear filters or create a new delivery challan.</p>
                        <div className="mt-4 grid w-full grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                className="h-11 rounded-2xl"
                                onClick={() => {
                                    setChallanFilterStatus("all");
                                    setChallanFilterType("all");
                                    setChallanSearchQuery("");
                                }}
                            >
                                Clear
                            </Button>
                            <Button className="h-11 rounded-2xl bg-teal-600 font-black text-white hover:bg-teal-700" onClick={() => setIsChallanAddDialogOpen(true)}>
                                New
                            </Button>
                        </div>
                    </div>
                ) : challans.map((challan: any) => (
                    <MobileChallanCard
                        key={challan.id}
                        challan={challan}
                        searchQuery={challanSearchQuery}
                        onView={openChallanDetails}
                        onPreviewPdf={handleOpenChallanPdfPreview}
                        onSend={(item) => requestChallanStatusUpdate(item, "Delivered")}
                        onReceive={(item) => requestChallanStatusUpdate(item, "Received")}
                        onReset={(item) => requestChallanStatusUpdate(item, "Pending")}
                    />
                ))}
            </MobileScrollContent>
        </MobileTabLayout>

        <ChallanStatusConfirmDialog
            action={statusConfirmAction}
            isPending={updateStatusMutation.isPending}
            onCancel={() => setStatusConfirmAction(null)}
            onConfirm={confirmChallanStatusUpdate}
        />

        <MobileChallanDetailSheet
            open={isChallanViewDialogOpen}
            challan={selectedChallan}
            onClose={() => setIsChallanViewDialogOpen(false)}
            onPreviewPdf={handleOpenChallanPdfPreview}
        />

        <MobileChallanPdfPreviewSheet
            open={!!pdfPreviewChallan}
            challan={pdfPreviewChallan}
            isLoading={isPdfPreviewLoading}
            onClose={closePdfPreview}
            onDownload={() => pdfPreviewChallan && handleDownloadChallanPdf(pdfPreviewChallan)}
        />

        <div className="hidden md:grid md:grid-cols-4 gap-6 pb-24 md:pb-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <BentoCard className="col-span-1 md:col-span-1 h-full min-h-[200px] bg-gradient-to-br from-teal-500 to-emerald-600" title="Total Challans" icon={<ScrollText size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex flex-col justify-end">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{rawChallans.length}</div>
                    <div className="text-white/80 text-sm mt-2">All Time</div>
                </div>
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-1 h-full min-h-[200px] bg-gradient-to-br from-amber-500 to-orange-600" title="Pending" icon={<Clock size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex flex-col justify-end">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{pendingCount}</div>
                    <div className="text-white/80 text-sm mt-2">Delivery Pending</div>
                </div>
            </BentoCard>
            <BentoCard className="col-span-1 md:col-span-2 h-full min-h-[200px] bg-gradient-to-br from-blue-500 to-indigo-600" title="Recent Activity" icon={<Activity size={24} className="text-white" />} variant="vibrant">
                <div className="flex-1 flex justify-between items-end">
                    <div>
                        <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{deliveredCount}</div>
                        <div className="text-white/80 text-sm mt-2">Delivered</div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white/90">{receivedCount}</div>
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
                                            <DropdownMenuItem onClick={() => openChallanDetails(challan)}>
                                                <Eye className="w-4 h-4 mr-2" /> View Details
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handlePrintChallan(challan)}>
                                                <Printer className="w-4 h-4 mr-2" /> Print Challan
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => handleChallanStatusUpdate(challan.id, "Pending")}>Mark Pending</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => requestChallanStatusUpdate(challan, "Delivered")}>Mark Delivered</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => requestChallanStatusUpdate(challan, "Received")}>Mark Received</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Create Challan Dialog */}
                <Dialog open={isChallanAddDialogOpen} onOpenChange={(open) => { setIsChallanAddDialogOpen(open); if (!open) resetChallanForm(); }}>
                    <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl max-w-4xl max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none max-md:border-0 max-md:p-4">
                        <DialogHeader>
                            <DialogTitle>Create Delivery Challan</DialogTitle>
                            <DialogDescription>Fill in the details for the delivery challan.</DialogDescription>
                        </DialogHeader>

                        <Tabs defaultValue="general" className="w-full">
                            <TabsList className="grid w-full grid-cols-4 bg-slate-100 max-md:h-auto max-md:rounded-2xl max-md:p-1">
                                <TabsTrigger value="general">General</TabsTrigger>
                                <TabsTrigger value="receiver">Receiver</TabsTrigger>
                                <TabsTrigger value="transport">Transport</TabsTrigger>
                                <TabsTrigger value="items">Items</TabsTrigger>
                            </TabsList>

                            <TabsContent value="general" className="space-y-4 pt-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                                            <Button variant="ghost" size="icon" className="absolute right-2 top-2 text-red-500 hover:text-red-700 hover:bg-red-50 h-9 w-9 md:h-6 md:w-6" onClick={() => removeLineItem(index)} disabled={lineItems.length === 1}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                            <CardContent className="p-4 grid gap-4">
                                                <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                                                    <div className="md:col-span-6">
                                                        <Label className="text-xs">TV Detail</Label>
                                                        <Input value={item.tvDetail} onChange={(e) => updateLineItem(index, "tvDetail", e.target.value)} placeholder="e.g. 43'' SAMSUNG" className="h-8 text-sm" />
                                                    </div>
                                                    <div className="md:col-span-3">
                                                        <Label className="text-xs">Job No</Label>
                                                        <Input value={item.jobNo} onChange={(e) => updateLineItem(index, "jobNo", e.target.value)} placeholder="Job ID" className="h-8 text-sm" />
                                                    </div>
                                                    <div className="md:col-span-3">
                                                        <Label className="text-xs">Serial (Device)</Label>
                                                        <Input value={item.serialNumber} onChange={(e) => updateLineItem(index, "serialNumber", e.target.value)} placeholder="Serial No" className="h-8 text-sm" />
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                                                    <div className="md:col-span-3">
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
                                                    <div className="md:col-span-9">
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
                        <DialogFooter className="max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:border-t max-md:border-slate-100 max-md:bg-white max-md:pt-3">
                            <Button variant="outline" className="max-md:h-11 max-md:rounded-2xl" onClick={() => setIsChallanAddDialogOpen(false)}>Cancel</Button>
                            <Button className="max-md:h-11 max-md:rounded-2xl max-md:bg-teal-600 max-md:font-black max-md:hover:bg-teal-700" onClick={handleChallanSubmit} disabled={createChallanMutation.isPending}>
                                {createChallanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Challan
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* View Challan Dialog */}
                {!isMobile && <Dialog open={isChallanViewDialogOpen} onOpenChange={setIsChallanViewDialogOpen}>
                    <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl max-w-3xl max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-hidden max-md:rounded-b-none max-md:border-0 max-md:p-0">
                        <DialogHeader className="max-md:border-b max-md:border-slate-100 max-md:p-4 max-md:pr-14">
                            <DialogTitle className="max-md:text-base max-md:leading-tight">
                                <span className="max-md:block">Challan Details</span>
                                <span className="font-mono text-teal-700 max-md:block max-md:break-all max-md:text-sm">{selectedChallan?.id}</span>
                            </DialogTitle>
                        </DialogHeader>
                        {selectedChallan && (
                            <div className="space-y-6 max-md:max-h-[calc(90dvh-8rem)] max-md:overflow-y-auto max-md:p-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
                                        <h3 className="font-black text-slate-900 mb-2 md:font-semibold">Receiver Details</h3>
                                        <div className="space-y-1 text-sm text-slate-600">
                                            <p><span className="font-medium text-slate-700">Name:</span> {selectedChallan.receiver}</p>
                                            <p><span className="font-medium text-slate-700">Phone:</span> {selectedChallan.receiverPhone}</p>
                                            <p><span className="font-medium text-slate-700">Address:</span> {selectedChallan.receiverAddress}</p>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 md:rounded-none md:border-0 md:bg-transparent md:p-0">
                                        <h3 className="font-black text-slate-900 mb-2 md:font-semibold">Transport Details</h3>
                                        <div className="space-y-1 text-sm text-slate-600">
                                            <p><span className="font-medium text-slate-700">Vehicle:</span> {selectedChallan.vehicleNo}</p>
                                            <p><span className="font-medium text-slate-700">Driver:</span> {selectedChallan.driverName}</p>
                                            <p><span className="font-medium text-slate-700">Phone:</span> {selectedChallan.driverPhone}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="font-semibold text-slate-900 mb-2">Items</h3>
                                    <div className="space-y-2 md:hidden">
                                        {getLineItems(selectedChallan).length === 0 ? (
                                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm font-medium text-slate-500">No items listed</div>
                                        ) : getLineItems(selectedChallan).map((item: any, i: number) => (
                                            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-black text-slate-950">{item.tvDetail || item.description || "Item detail not set"}</p>
                                                        <p className="mt-1 truncate font-mono text-xs font-bold text-teal-700">{item.jobNo || "No job no"}</p>
                                                    </div>
                                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{item.status || "OK"}</span>
                                                </div>
                                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                                    <div className="rounded-xl bg-slate-50 px-2 py-2">
                                                        <p className="font-black uppercase text-slate-400">Serial</p>
                                                        <p className="mt-1 truncate font-semibold text-slate-700">{item.serialNumber || "-"}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-slate-50 px-2 py-2">
                                                        <p className="font-black uppercase text-slate-400">Defect</p>
                                                        <p className="mt-1 truncate font-semibold text-slate-700">{item.defect || item.remarks || "-"}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="hidden border rounded-lg overflow-hidden md:block">
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
                                                {getLineItems(selectedChallan).map((item: any, i: number) => (
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
                        <DialogFooter className="max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:border-t max-md:border-slate-100 max-md:bg-white max-md:p-4">
                            <Button variant="outline" className="max-md:h-11 max-md:rounded-2xl" onClick={() => setIsChallanViewDialogOpen(false)}>Close</Button>
                            <Button className="hidden md:inline-flex" onClick={() => { setIsChallanViewDialogOpen(false); handlePrintChallan(selectedChallan); }}>
                                <Printer className="w-4 h-4 mr-2" /> Print
                            </Button>
                            <Button className="h-11 rounded-2xl bg-teal-600 font-black hover:bg-teal-700 md:hidden" onClick={() => handleOpenChallanPdfPreview(selectedChallan)}>
                                <Download className="w-4 h-4 mr-2" /> Save (PDF)
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>}
            </BentoCard>
        </div>
        </>
    );
}
