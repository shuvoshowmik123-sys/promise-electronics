import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
    Building2, FileText, CheckCircle2, Wrench, Search, Filter, Plus, MoreVertical, ArrowRight,
    Globe, CreditCard, ExternalLink, Phone, User
} from "lucide-react";
import { BentoCard } from "../shared/BentoCard";
import { StatusBadge } from "../shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { containerVariants, itemVariants } from "../shared/animations";
import { corporateApi, jobTicketsApi } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format, subMonths } from "date-fns";
import { useState } from "react";
import { CreateCorporateClientDialog } from "@/components/admin/corporate/CreateCorporateClientDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface CorporateTabProps {
    onSelectClient?: (clientId: string) => void;
}

export default function CorporateTab({ onSelectClient }: CorporateTabProps) {
    const { data: clients = [], isLoading } = useQuery({
        queryKey: ["corporate-clients"],
        queryFn: corporateApi.getAll,
    });

    const { data: jobsData } = useQuery({
        queryKey: ["corporate-jobs-all"],
        queryFn: () => jobTicketsApi.getAll("corporate"),
    });
    const corporateJobs = jobsData?.items || [];

    const [isGeneratingBill, setIsGeneratingBill] = useState(false);
    const [selectedBillClient, setSelectedBillClient] = useState<any | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const filteredClients = clients.filter((c: any) =>
        c.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.shortCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contactPhone?.includes(searchTerm)
    );

    const handleGenerateBill = async () => {
        if (!selectedBillClient) return;
        setIsGeneratingBill(true);
        try {
            // Default to generating for the previous calendar month
            const lastMonth = subMonths(new Date(), 1);

            await corporateApi.autoGenerateStatement({
                corporateClientId: selectedBillClient.id,
                year: lastMonth.getFullYear(),
                month: lastMonth.getMonth() + 1, // JS months are 0-indexed
            });

            toast({
                title: "Statement Generated",
                description: `Successfully generated consolidated statement for ${selectedBillClient.companyName}`,
            });
            setSelectedBillClient(null);
        } catch (error: any) {
            toast({
                title: "Generation Failed",
                description: error.message || "Failed to auto-generate statement.",
                variant: "destructive"
            });
        } finally {
            setIsGeneratingBill(false);
        }
    };

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const stats = {
        activeJobs: corporateJobs.filter((j: any) => ['In Progress', 'Diagnosing', 'Repairing'].includes(j.status)).length,
        pendingQuotes: corporateJobs.filter((j: any) => ['Pending', 'Approval Requested', 'Quoted'].includes(j.status)).length,
        completedMonth: corporateJobs.filter((j: any) => {
            if (!['Completed', 'Delivered'].includes(j.status) || !j.completedAt) return false;
            const d = new Date(j.completedAt);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        }).length
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-6 lg:h-full lg:min-h-0"
        >
            {/* Corporate Stats - Horizontal Snap on Mobile, Grid on Desktop */}
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 md:pb-0 md:grid md:grid-cols-3 md:gap-6 hide-scrollbar shrink-0">
                <motion.div variants={itemVariants} className="min-h-[140px] h-auto md:h-[200px] min-w-[85vw] sm:min-w-[300px] md:min-w-0 md:w-auto snap-center flex">
                    <BentoCard
                        className="flex-1 p-5 md:p-6 bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20"
                        title="Active Clients"
                        icon={<Building2 size={24} className="text-white" />}
                        variant="vibrant"
                    >
                        <div className="text-4xl font-black text-white mt-2 md:mt-4 tracking-tight">{clients.length}</div>
                        <div className="text-white/80 text-sm mt-1 md:mt-2 font-medium">B2B Partners</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants} className="min-h-[140px] h-auto md:h-[200px] min-w-[85vw] sm:min-w-[300px] md:min-w-0 md:w-auto snap-center flex">
                    <BentoCard
                        className="flex-1 p-5 md:p-6 bg-gradient-to-br from-fuchsia-500 to-pink-600 shadow-lg shadow-pink-500/20"
                        title="Quotes Pending"
                        icon={<FileText size={24} className="text-white" />}
                        variant="vibrant"
                    >
                        <div className="text-4xl font-black text-white mt-2 md:mt-4 tracking-tight">{stats.pendingQuotes}</div>
                        <div className="text-white/80 text-sm mt-1 md:mt-2 font-medium">Waiting Approval</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants} className="min-h-[140px] h-auto md:h-[200px] min-w-[85vw] sm:min-w-[300px] md:min-w-0 md:w-auto snap-center flex">
                    <BentoCard
                        className="flex-1 p-5 md:p-6 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20"
                        title="Completed (Feb)"
                        icon={<CheckCircle2 size={24} className="text-white" />}
                        variant="vibrant"
                    >
                        <div className="text-4xl font-black text-white mt-2 md:mt-4 tracking-tight">{stats.completedMonth}</div>
                        <div className="text-white/80 text-sm mt-1 md:mt-2 font-medium">Repairs Delivered</div>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Main Content Area */}
            <motion.div variants={itemVariants} className="flex-1 lg:min-h-0 flex flex-col">

                {/* ------------------------------------------------------------------------- */}
                {/* 📱 MOBILE VIEW: Premium Card List (Hidden on Desktop)                     */}
                {/* ------------------------------------------------------------------------- */}
                <div className="flex flex-col lg:hidden">
                    <div className="flex flex-col gap-4 mb-4 shrink-0">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
                                <Building2 className="text-emerald-500" size={26} />
                                B2B Clients
                            </h2>
                            <Button onClick={() => setIsCreateDialogOpen(true)} size="icon" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg shadow-emerald-500/30">
                                <Plus size={20} />
                            </Button>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Search VIP clients..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-11 pr-4 h-12 bg-white/70 backdrop-blur-xl border border-white/60 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all placeholder:text-slate-400 font-medium"
                            />
                        </div>
                    </div>

                    {/* Non-Scrolling Card Stack (Scrolls natively with the page) */}
                    <div className="pb-24 space-y-4 px-1">
                        {isLoading ? (
                            <div className="p-8 text-center text-slate-500 font-medium animate-pulse">Loading premium clients...</div>
                        ) : filteredClients.map((client: any) => (
                            <BentoCard key={client.id} className="p-5 border-white/60 bg-white/60 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]" disableHover>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-14 w-14 border-2 border-emerald-100 shadow-sm">
                                            <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-bold text-xl">
                                                {client.companyName.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{client.companyName}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">{client.shortCode}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-emerald-600 rounded-full">
                                                <MoreVertical size={18} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => onSelectClient?.(client.id)}>View Details</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => window.open(`/corporate/login`, '_blank')}>Open Portal</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setSelectedBillClient(client)}>Generate Bill</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                <div className="bg-slate-50/50 rounded-2xl p-4 mb-4 space-y-3 border border-slate-100/80">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2"><User size={15} /> Contact</span>
                                        <span className="font-semibold text-slate-700">{client.contactPerson}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2"><Phone size={15} /> Phone</span>
                                        <span className="font-semibold text-slate-700">{client.contactPhone}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2"><Globe size={15} /> Domain</span>
                                        <span className="font-semibold text-slate-700 truncate max-w-[120px]">{client.domain || "N/A"}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 flex items-center gap-2"><CreditCard size={15} /> Billing</span>
                                        <span className="font-semibold text-slate-700">{client.billingType}</span>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 rounded-xl font-semibold h-11"
                                        onClick={() => window.open(`/corporate/login`, '_blank')}
                                    >
                                        <ExternalLink size={18} className="mr-2" /> Open Portal
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-11 h-11 border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl flex-shrink-0"
                                        onClick={() => setSelectedBillClient(client)}
                                    >
                                        <FileText size={18} />
                                    </Button>
                                </div>
                            </BentoCard>
                        ))}
                    </div>
                </div>

                {/* ------------------------------------------------------------------------- */}
                {/* 💻 DESKTOP VIEW: High-Density Table (Hidden on Mobile)                    */}
                {/* ------------------------------------------------------------------------- */}
                <BentoCard
                    className="hidden lg:flex flex-col h-full overflow-hidden"
                    title="Corporate Clients"
                    icon={<Building2 size={24} className="text-emerald-500" />}
                    variant="glass"
                    disableHover
                >
                    <div className="flex flex-col h-full min-h-0">
                        {/* Toolbar */}
                        <div className="flex gap-4 items-center justify-between mb-6 shrink-0">
                            <div className="relative w-96 group">
                                <Search className="absolute left-3 top-2.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search clients, phones, emails..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white/50 border border-slate-200/60 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all placeholder:text-slate-400"
                                />
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" className="rounded-xl border-slate-200/60 bg-white/50 hover:bg-white text-slate-600" onClick={() => toast({ title: "Coming Soon", description: "Advanced filtering is under development." })}>
                                    <Filter size={16} className="mr-2" /> Filter
                                </Button>
                                <Button variant="default" onClick={() => setIsCreateDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all">
                                    <Plus size={16} className="mr-2" /> Add Client
                                </Button>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 overflow-hidden flex-1 flex flex-col min-h-0 shadow-sm">
                            <div className="w-full overflow-y-auto custom-scrollbar flex-1">
                                <table className="w-full min-w-[800px]">
                                    <thead className="bg-slate-50/80 text-xs uppercase text-slate-500 font-bold tracking-wider border-b border-slate-100/80 sticky top-0 z-10 backdrop-blur-xl">
                                        <tr>
                                            <th className="px-6 py-4 text-left">Company</th>
                                            <th className="px-6 py-4 text-left">Contact</th>
                                            <th className="px-6 py-4 text-left">Details</th>
                                            <th className="px-6 py-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50">
                                        {isLoading ? (
                                            <tr><td colSpan={4} className="p-10 text-center text-slate-500 font-medium animate-pulse">Loading premium clients...</td></tr>
                                        ) : filteredClients.map((client: any) => (
                                            <tr
                                                key={client.id}
                                                className="hover:bg-white/80 transition-colors group cursor-pointer"
                                                onClick={() => onSelectClient?.(client.id)}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-4">
                                                        <Avatar className="h-10 w-10 border-2 border-slate-100 bg-white shadow-sm transition-transform group-hover:scale-105">
                                                            <AvatarFallback className="text-emerald-700 font-bold bg-emerald-50">
                                                                {client.companyName.substring(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <div className="font-bold text-slate-800">{client.companyName}</div>
                                                            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mt-0.5">{client.shortCode}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-slate-700 font-semibold">{client.contactPerson}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5">{client.contactPhone}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <Globe className="h-3.5 w-3.5 text-slate-400" />
                                                            <span className="text-xs font-medium text-slate-600 truncate max-w-[180px]">
                                                                {client.domain || "N/A"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                                                            <span className="text-xs font-medium text-slate-600">
                                                                {client.billingType} <span className="text-slate-400">({client.billingCycle})</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-9 w-9 text-slate-500 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 rounded-xl transition-transform hover:scale-105"
                                                            title="Generate Monthly Statement"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedBillClient(client);
                                                            }}
                                                        >
                                                            <FileText size={16} />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-transform hover:scale-105">
                                                            <ExternalLink size={16} />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </BentoCard>
            </motion.div>

            {/* Auto Generate Bill Modal */}
            <Dialog open={!!selectedBillClient} onOpenChange={() => setSelectedBillClient(null)}>
                <DialogContent className="sm:max-w-md w-[95vw] shadow-2xl shadow-indigo-500/10 border-indigo-100/50 rounded-[2rem]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <FileText className="text-indigo-500" size={24} />
                            Generate Statement
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 pt-4">
                        <div className="bg-indigo-50/50 p-4 border border-indigo-100 rounded-2xl">
                            <h3 className="text-sm font-semibold text-indigo-900 mb-1">Target Client</h3>
                            <p className="text-lg font-bold text-indigo-700">{selectedBillClient?.companyName}</p>
                            <p className="text-sm text-indigo-600/70">{selectedBillClient?.shortCode}</p>
                        </div>

                        <div className="bg-amber-50/80 p-4 border border-amber-200/50 rounded-2xl text-amber-800 text-sm leading-relaxed">
                            This will automatically sweep all <strong className="font-bold">Completed</strong> and <strong className="font-bold">Delivered</strong> jobs from the previous calendar month ({format(subMonths(new Date(), 1), 'MMMM yyyy')}) that haven't been billed yet, and compile them into a consolidated Master Invoice.
                        </div>

                        <div className="flex gap-3 justify-end pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setSelectedBillClient(null)}
                                className="rounded-xl font-medium border-slate-200 hover:bg-slate-50 h-12"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleGenerateBill}
                                disabled={isGeneratingBill}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-xl font-semibold h-12 px-6"
                            >
                                {isGeneratingBill ? "Generating..." : "Generate Statement"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <CreateCorporateClientDialog
                open={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
            />
        </motion.div>
    );
}
