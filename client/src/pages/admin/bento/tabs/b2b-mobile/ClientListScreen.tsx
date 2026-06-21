import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Plus, Building2, AlertTriangle } from "lucide-react";
import { corporateApi } from "@/lib/api";
import { CreateCorporateClientDialog } from "@/components/admin/corporate/CreateCorporateClientDialog";

interface ClientListScreenProps {
    onBack: () => void;
    onSelectClient: (clientId: string) => void;
}

export default function ClientListScreen({ onBack, onSelectClient }: ClientListScreenProps) {
    const [search, setSearch] = useState("");
    const [createOpen, setCreateOpen] = useState(false);

    const { data: clients = [], isLoading, isError, refetch } = useQuery({
        queryKey: ["corporate-clients"],
        queryFn: corporateApi.getAll,
    });

    const term = search.trim().toLowerCase();
    const filtered = clients.filter((c: any) =>
        !term ||
        c.companyName?.toLowerCase().includes(term) ||
        c.shortCode?.toLowerCase().includes(term) ||
        c.contactPerson?.toLowerCase().includes(term) ||
        c.contactPhone?.includes(search)
    );

    return (
        <div className="flex h-full flex-col bg-slate-50">
            <header
                className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 pb-3"
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
            >
                <button
                    onClick={onBack}
                    aria-label="Back to B2B home"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition active:scale-95"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1">
                    <h1 className="text-base font-bold text-slate-800">Corporate Clients</h1>
                    <p className="text-xs text-slate-400">{clients.length} Total</p>
                </div>
            </header>

            <div className="flex shrink-0 items-center gap-2 px-4 py-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search clients, phone..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                <button
                    onClick={() => setCreateOpen(true)}
                    aria-label="Add corporate client"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition active:scale-95"
                >
                    <Plus size={20} />
                </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-8">
                {isLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-[88px] animate-pulse rounded-2xl border border-slate-100 bg-white" />
                    ))}

                {isError && (
                    <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center">
                        <AlertTriangle className="text-rose-500" size={24} />
                        <p className="text-sm font-medium text-rose-700">Couldn't load clients. Check your connection.</p>
                        <button
                            onClick={() => refetch()}
                            className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-bold text-white transition active:scale-95"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !isError && filtered.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-16 text-center text-slate-400">
                        <Building2 size={32} />
                        <p className="text-sm font-medium">
                            {term ? "No clients match your search." : "No corporate clients yet."}
                        </p>
                    </div>
                )}

                {filtered.map((client: any) => (
                    <button
                        key={client.id}
                        onClick={() => onSelectClient(client.id)}
                        className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
                    >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700">
                            {(client.companyName?.slice(0, 2) || "NA").toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="truncate font-bold text-slate-800">{client.companyName}</span>
                                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                    {client.shortCode}
                                </span>
                            </div>
                            <p className="mt-1 truncate text-sm text-slate-500">{client.contactPerson || "No contact set"}</p>
                            <p className="text-xs text-slate-400">{client.contactPhone || "No phone on file"}</p>
                        </div>
                    </button>
                ))}
            </div>

            <CreateCorporateClientDialog open={createOpen} onOpenChange={setCreateOpen} />
        </div>
    );
}
