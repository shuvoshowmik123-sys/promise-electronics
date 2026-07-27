import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { corporateApi } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { hasGranularPermission } from "@/lib/permissions";
import { toast } from "sonner";

const COLUMN_OPTIONS: { key: string; label: string }[] = [
    { key: "clientJobNumber", label: "Client Job No." },
    { key: "promiseJobNumber", label: "Promise Job No." },
    { key: "tvSerial", label: "TV Serial" },
    { key: "brandModel", label: "Brand / Model" },
    { key: "tvSize", label: "TV Size" },
    { key: "service", label: "Service" },
    { key: "amount", label: "Amount" },
];

interface Props {
    clientId: string;
    clientType?: string | null;
}

export function LtdBillingPresetEditor({ clientId, clientType }: Props) {
    const { user, permissions } = useAdminAuth();
    const canConfigure = hasGranularPermission(user?.role, permissions, "corporate.bills.configureTemplates");
    const queryClient = useQueryClient();

    const isLtd = clientType === "limited_company";

    const { data: preset, isLoading } = useQuery({
        queryKey: ["ltdBillingPreset", clientId],
        queryFn: () => corporateApi.getBillingPreset(clientId),
        enabled: !!clientId && isLtd,
    });

    const [recipientPolicy, setRecipientPolicy] = useState<"company_only" | "attention_person">("company_only");
    const [enabledColumns, setEnabledColumns] = useState<string[]>(COLUMN_OPTIONS.map((c) => c.key));
    const [attentionName, setAttentionName] = useState("");
    const [attentionContact, setAttentionContact] = useState("");
    const [billingAddress, setBillingAddress] = useState("");

    useEffect(() => {
        if (preset) {
            setRecipientPolicy(preset.recipientPolicy);
            setEnabledColumns(preset.enabledColumns?.length ? preset.enabledColumns : COLUMN_OPTIONS.map((c) => c.key));
            setAttentionName(preset.attentionName || "");
            setAttentionContact(preset.attentionContact || "");
            setBillingAddress(preset.billingAddress || "");
        }
    }, [preset]);

    const toggleColumn = (key: string) => {
        setEnabledColumns((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
        );
    };

    const mutation = useMutation({
        mutationFn: () => corporateApi.updateBillingPreset(clientId, {
            recipientPolicy,
            enabledColumns,
            attentionName: recipientPolicy === "attention_person" ? attentionName || null : null,
            attentionContact: recipientPolicy === "attention_person" ? attentionContact || null : null,
            billingAddress: recipientPolicy === "attention_person" ? billingAddress || null : null,
        }),
        onSuccess: () => {
            toast.success("Preset saved — applies to future Corporate Ltd. bills only.");
            queryClient.invalidateQueries({ queryKey: ["ltdBillingPreset", clientId] });
        },
        onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
    });

    if (!isLtd) return null;
    if (!canConfigure) return null;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Settings2 className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800">Corporate Ltd. Billing Preset</h3>
                    <p className="text-xs text-slate-500">Saved once per client. Edits affect future bills only — issued bill snapshots are immutable.</p>
                </div>
            </div>

            <div className="space-y-5">
                <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recipient / Header</Label>
                    <div className="mt-2 flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            onClick={() => setRecipientPolicy("company_only")}
                            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition ${recipientPolicy === "company_only" ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                        >
                            <div className="font-semibold">Company only</div>
                            <div className="text-xs text-slate-500">Bill to the company name only.</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setRecipientPolicy("attention_person")}
                            className={`flex-1 rounded-xl border px-4 py-3 text-left text-sm transition ${recipientPolicy === "attention_person" ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                        >
                            <div className="font-semibold">Attention person</div>
                            <div className="text-xs text-slate-500">Company + attention name, contact, address.</div>
                        </button>
                    </div>
                </div>

                {recipientPolicy === "attention_person" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="text-xs text-slate-500">Attention name</Label>
                            <input
                                value={attentionName}
                                onChange={(e) => setAttentionName(e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="e.g. Accounts manager"
                            />
                        </div>
                        <div>
                            <Label className="text-xs text-slate-500">Attention contact</Label>
                            <input
                                value={attentionContact}
                                onChange={(e) => setAttentionContact(e.target.value)}
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="Phone / email"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <Label className="text-xs text-slate-500">Billing address</Label>
                            <textarea
                                value={billingAddress}
                                onChange={(e) => setBillingAddress(e.target.value)}
                                rows={2}
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                placeholder="Approved billing address"
                            />
                        </div>
                    </div>
                )}

                <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Document columns</Label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {COLUMN_OPTIONS.map((col) => (
                            <label
                                key={col.key}
                                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50"
                            >
                                <span className="text-sm text-slate-700">{col.label}</span>
                                <Switch
                                    checked={enabledColumns.includes(col.key)}
                                    onCheckedChange={() => toggleColumn(col.key)}
                                />
                            </label>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end pt-1">
                    <Button
                        onClick={() => mutation.mutate()}
                        disabled={mutation.isPending || enabledColumns.length === 0}
                        className="gap-2 rounded-xl"
                    >
                        {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save preset
                    </Button>
                </div>
            </div>
        </div>
    );
}
