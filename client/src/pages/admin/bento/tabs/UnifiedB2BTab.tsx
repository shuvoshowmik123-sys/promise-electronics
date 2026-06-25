import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import { Building2, Search, Plus, FileText, Globe, CreditCard, ExternalLink, ArrowRight, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { containerVariants, itemVariants, BentoCard, MobileTabHeader, MobileScrollContent } from "../shared";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { subMonths } from "date-fns";
import { CreateCorporateClientDialog } from "@/components/admin/corporate/CreateCorporateClientDialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

// We'll import the existing tabs which we'll render dynamically
import CorporateRepairsTab from "./CorporateRepairsTab";

interface UnifiedB2BTabProps {
    initialClientId?: string | null;
    initialJobId?: string | null;
    initialSearchQuery?: string;
    onSearchConsumed?: () => void;
    onBack?: () => void;
}

export default function UnifiedB2BTab({ initialClientId, initialJobId, initialSearchQuery, onSearchConsumed, onBack }: UnifiedB2BTabProps) {
    // Determine if we should show the Client List (CorporateTab) or the Client Details (CorporateRepairsTab)
    const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId || null);

    useEffect(() => {
        if (initialClientId !== undefined) {
            setSelectedClientId(initialClientId);
        }
    }, [initialClientId]);

    if (selectedClientId) {
        // If a client is selected, show the unified workplace (which is essentially what CorporateRepairsTab is becoming)
        return (
            <CorporateRepairsTab
                initialClientId={selectedClientId}
                initialJobId={initialJobId}
                initialSearchQuery={initialSearchQuery}
                onSearchConsumed={onSearchConsumed}
                onBack={() => {
                    setSelectedClientId(null);
                    if (onBack) onBack();
                }}
            />
        );
    }

    // Otherwise, render the client selection view (previously CorporateTab)
    return <CorporateClientList onSelectClient={setSelectedClientId} />;
}

// Below is the extracted contents of the old CorporateTab
function CorporateClientList({ onSelectClient }: { onSelectClient: (id: string) => void }) {
    const { toast } = useToast();
    const isMobile = useIsMobile();
    const { data: clients = [], isLoading } = useQuery({
        queryKey: ["corporate-clients"],
        queryFn: corporateApi.getAll,
    });

    const [isGeneratingBill, setIsGeneratingBill] = useState(false);
    const [selectedBillClient, setSelectedBillClient] = useState<any | null>(null);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const normalizedSearchTerm = searchTerm.toLowerCase();

    const filteredClients = clients.filter((c: any) =>
        c.companyName?.toLowerCase().includes(normalizedSearchTerm) ||
        c.shortCode?.toLowerCase().includes(normalizedSearchTerm) ||
        c.contactPhone?.includes(searchTerm) ||
        c.contactEmail?.toLowerCase().includes(normalizedSearchTerm) ||
        c.email?.toLowerCase().includes(normalizedSearchTerm)
    );

    useEffect(() => {
        const anyOpen = !!selectedBillClient || isCreateDialogOpen;
        if (isMobile && anyOpen) {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
            return () => {
                window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
            };
        }
    }, [selectedBillClient, isCreateDialogOpen, isMobile]);

    const handleGenerateBill = async () => {
        if (!selectedBillClient) return;
        setIsGeneratingBill(true);
        try {
            const lastMonth = subMonths(new Date(), 1);
            await corporateApi.autoGenerateStatement({
                corporateClientId: selectedBillClient.id,
                year: lastMonth.getFullYear(),
                month: lastMonth.getMonth() + 1,
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

    return (
        <div className="flex flex-col h-full w-full overflow-hidden md:overflow-visible">
            {/* ─── MOBILE ─── */}
            <MobileTabHeader>
                <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="min-w-0">
                        <h2 className="text-[17px] font-black text-slate-950 truncate">B2B Clients</h2>
                        <p className="text-[11px] font-medium text-slate-500">{filteredClients.length} companies</p>
                    </div>
                    <Button size="sm" onClick={() => setIsCreateDialogOpen(true)} className="shrink-0 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1 px-2.5">
                        <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                        placeholder="Search company, phone, email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 rounded-xl border-slate-200 bg-white pl-8 pr-2 text-xs font-semibold shadow-sm"
                    />
                </div>
            </MobileTabHeader>

            <MobileScrollContent className="md:hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />)}
                    </div>
                ) : filteredClients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <Building2 className="h-10 w-10 mb-3 opacity-25" />
                        <p className="text-sm font-bold text-slate-600">No clients found</p>
                        <p className="text-xs text-slate-400 mt-1">Try a different search term</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredClients.map((client: any) => (
                            <button
                                key={client.id}
                                type="button"
                                onClick={() => onSelectClient(client.id)}
                                className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm active:scale-[0.99] transition"
                            >
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10 shrink-0 border-2 border-emerald-100">
                                        <AvatarFallback className="text-emerald-700 font-bold bg-emerald-50 text-xs">
                                            {(client.companyName?.slice(0, 2) || "NA").toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-black text-[14px] text-slate-900 truncate">{client.companyName}</p>
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{client.shortCode}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                                </div>
                                <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px]">
                                    <span className="flex items-center gap-1 text-slate-600 font-medium truncate">
                                        <Globe className="h-3 w-3 shrink-0 text-slate-400" /> {client.contactPerson || "—"}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className="text-slate-500 font-medium truncate">{client.contactPhone || "—"}</span>
                                    <span className="ml-auto shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{client.billingType}</span>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setSelectedBillClient(client); }}
                                        className="flex-1 h-8 flex items-center justify-center gap-1 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 active:bg-slate-50"
                                    >
                                        <FileText className="h-3 w-3" /> Statement
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); window.open("/corporate/login", "_blank"); }}
                                        className="flex-1 h-8 flex items-center justify-center gap-1 rounded-lg border border-slate-200 text-[10px] font-bold text-emerald-600 active:bg-emerald-50"
                                    >
                                        <ExternalLink className="h-3 w-3" /> Portal
                                    </button>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </MobileScrollContent>

            {/* ─── DESKTOP (unchanged) ─── */}
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="hidden md:flex flex-col gap-6 lg:h-full lg:min-h-0 flex-1">
                <motion.div variants={itemVariants} className="flex-1 lg:min-h-0 flex flex-col">
                    <BentoCard
                        className="flex flex-col h-full overflow-hidden"
                        title="Corporate Clients"
                        icon={<Building2 size={24} className="text-emerald-500" />}
                        variant="glass"
                        disableHover
                    >
                        <div className="flex flex-col h-full min-h-0">
                            <div className="flex gap-4 items-center justify-between mb-6 shrink-0 flex-wrap">
                                <div className="relative w-full md:w-96 group">
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
                                    <Button variant="default" onClick={() => setIsCreateDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all">
                                        <Plus size={16} className="mr-2" /> Add Client
                                    </Button>
                                </div>
                            </div>
                            <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-900">
                                Company, batch, challan, and panel-continuous work stays in B2B. Use normal Jobs only for individual customers.
                            </div>
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
                                                <tr key={client.id} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => onSelectClient(client.id)}>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <Avatar className="h-10 w-10 border-2 border-slate-100 bg-white shadow-sm transition-transform group-hover:scale-105">
                                                                <AvatarFallback className="text-emerald-700 font-bold bg-emerald-50">
                                                                    {(client.companyName?.slice(0, 2) || "NA").toUpperCase()}
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
                                                                size="icon" variant="ghost" className="h-9 w-9 text-slate-500 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 rounded-xl transition-transform hover:scale-105"
                                                                title="Generate Monthly Statement"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedBillClient(client); }}
                                                            >
                                                                <FileText size={16} />
                                                            </Button>
                                                            <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-transform hover:scale-105" onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.open(`/corporate/login`, '_blank');
                                                            }}>
                                                                <ExternalLink size={16} />
                                                            </Button>
                                                            <Button size="icon" variant="ghost" className="h-9 w-9 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-transform hover:scale-105" onClick={() => onSelectClient(client.id)}>
                                                                <ArrowRight size={16} />
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
            </motion.div>

            {/* Auto Generate Bill Modal */}
            <Dialog open={!!selectedBillClient} onOpenChange={() => setSelectedBillClient(null)}>
                <DialogContent className="sm:max-w-md w-[95vw] shadow-2xl shadow-indigo-500/10 border-indigo-100/50 rounded-[2rem]">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <FileText className="text-indigo-500" size={24} /> Generate Statement
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 pt-4">
                        <div className="bg-indigo-50/50 p-4 border border-indigo-100 rounded-2xl">
                            <h3 className="text-sm font-semibold text-indigo-900 mb-1">Target Client</h3>
                            <p className="text-lg font-bold text-indigo-700">{selectedBillClient?.companyName}</p>
                            <p className="text-sm text-indigo-600/70">{selectedBillClient?.shortCode}</p>
                        </div>
                        <div className="flex gap-3 justify-end pt-2">
                            <Button variant="outline" onClick={() => setSelectedBillClient(null)} className="rounded-xl font-medium border-slate-200 hover:bg-slate-50 h-12">Cancel</Button>
                            <Button onClick={handleGenerateBill} disabled={isGeneratingBill} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 rounded-xl font-semibold h-12 px-6">
                                {isGeneratingBill ? "Generating..." : "Generate Statement"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <CreateCorporateClientDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />
        </div>
    );
}
