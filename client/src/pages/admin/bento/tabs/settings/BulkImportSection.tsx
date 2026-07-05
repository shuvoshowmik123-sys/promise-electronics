/**
 * Bulk Import Section (Phase 35A)
 *
 * Wizard-style CSV bulk import for first-time setup data.
 * Rendered inside the Settings panel sheet (mobile) / popup (desktop).
 * Super Admin only — the API returns 403 for other roles.
 */

import { useRef, useState } from "react";
import {
    Upload, Download, FileText, ChevronLeft, Loader2, CheckCircle2,
    AlertTriangle, XCircle, Wrench, ShoppingBag, Package, Layers, Barcode, FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
    catalogImportApi,
    type CatalogImportType, type CatalogImportMode,
    type CatalogImportPreview, type CatalogImportCommitResult,
} from "@/lib/api";

const IMPORT_TYPES: { value: CatalogImportType; label: string; helper: string; icon: any }[] = [
    { value: "service_categories", label: "Service Categories", helper: "Category names for repair services", icon: FolderTree },
    { value: "service_catalog", label: "Service Catalog", helper: "Repair services with price ranges", icon: Wrench },
    { value: "inventory_items", label: "Inventory Items", helper: "Stock items, parts, and services", icon: Package },
    { value: "shop_products", label: "Shop Products", helper: "Products shown in the online shop", icon: ShoppingBag },
    { value: "product_variants", label: "Product Variants", helper: "Variants of existing shop products", icon: Layers },
    { value: "inventory_serials", label: "Inventory Serials", helper: "Serial numbers for stocked items", icon: Barcode },
];

const MODES: { value: CatalogImportMode; label: string; helper: string }[] = [
    { value: "createOnly", label: "Create only", helper: "Skip rows that already exist" },
    { value: "updateExisting", label: "Update existing", helper: "Only update matching records" },
    { value: "createAndUpdate", label: "Create + update", helper: "Create new, update matching" },
];

type Step = 1 | 2 | 3 | 4;

export default function BulkImportSection() {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<Step>(1);
    const [importType, setImportType] = useState<CatalogImportType | null>(null);
    const [csvText, setCsvText] = useState("");
    const [fileName, setFileName] = useState<string | null>(null);
    const [mode, setMode] = useState<CatalogImportMode>("createOnly");
    const [autoCreateCategories, setAutoCreateCategories] = useState(false);
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
    const [result, setResult] = useState<CatalogImportCommitResult | null>(null);

    const selectedTypeMeta = IMPORT_TYPES.find(t => t.value === importType);

    const handleDownloadTemplate = async (type: CatalogImportType) => {
        try {
            const csv = await catalogImportApi.getImportTemplate(type);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${type}-template.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast({ title: "Download failed", description: "Could not download the template.", variant: "destructive" });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 1_048_576) {
            toast({ title: "File too large", description: "CSV must be under 1MB.", variant: "destructive" });
            e.target.value = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setCsvText(String(reader.result ?? ""));
            setFileName(file.name);
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const handlePreview = async () => {
        if (!importType || !csvText.trim()) return;
        setLoading(true);
        try {
            const res = await catalogImportApi.previewCatalogImport({
                type: importType, csvText, mode,
                options: { autoCreateCategories },
            });
            setPreview(res);
            setStep(3);
        } catch (err: any) {
            toast({ title: "Preview failed", description: err?.message || "Could not validate the CSV.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const importableCount = preview
        ? preview.rows.filter(r => r.status !== "invalid" && r.action !== "skip").length
        : 0;

    const handleCommit = async () => {
        if (!importType || !csvText.trim()) return;
        setLoading(true);
        try {
            const res = await catalogImportApi.commitCatalogImport({
                type: importType, csvText, mode,
                options: { autoCreateCategories },
            });
            setResult(res);
            setStep(4);
        } catch (err: any) {
            toast({ title: "Import failed", description: err?.message || "Could not commit the import.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const resetWizard = () => {
        setStep(1);
        setImportType(null);
        setCsvText("");
        setFileName(null);
        setMode("createOnly");
        setAutoCreateCategories(false);
        setPreview(null);
        setResult(null);
    };

    const StepDot = ({ n, label }: { n: Step; label: string }) => (
        <div className="flex items-center gap-1.5">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${step >= n ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>{n}</span>
            <span className={`text-[11px] font-semibold hidden sm:inline ${step >= n ? "text-slate-800" : "text-slate-400"}`}>{label}</span>
        </div>
    );

    const rowStatusBadge = (status: string, action: string) => {
        if (status === "invalid") return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Invalid</span>;
        if (action === "skip") return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Skip</span>;
        if (action === "update") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Update</span>;
        return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Create</span>;
    };

    const rowLabel = (normalized: Record<string, any>) => {
        return normalized.name || normalized.variantName || normalized.serialNumber || "—";
    };

    return (
        <div className="space-y-4 pb-2">
            {/* Step indicator */}
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5">
                <StepDot n={1} label="Type" />
                <div className="h-px flex-1 mx-2 bg-slate-200" />
                <StepDot n={2} label="CSV & Mode" />
                <div className="h-px flex-1 mx-2 bg-slate-200" />
                <StepDot n={3} label="Preview" />
                <div className="h-px flex-1 mx-2 bg-slate-200" />
                <StepDot n={4} label="Done" />
            </div>

            {/* ── Step 1: Choose type ── */}
            {step === 1 && (
                <div className="space-y-3">
                    <p className="text-sm text-slate-600">Choose what you want to import. Download the sample CSV to see the exact columns.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {IMPORT_TYPES.map(t => {
                            const Icon = t.icon;
                            const active = importType === t.value;
                            return (
                                <button
                                    key={t.value}
                                    type="button"
                                    onClick={() => setImportType(t.value)}
                                    className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${active ? "border-blue-500 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
                                >
                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-blue-100" : "bg-slate-100"}`}>
                                        <Icon className={`h-4 w-4 ${active ? "text-blue-600" : "text-slate-500"}`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-bold text-slate-900">{t.label}</p>
                                        <p className="text-[11px] text-slate-500 truncate">{t.helper}</p>
                                    </div>
                                    {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}
                                </button>
                            );
                        })}
                    </div>
                    <div className="sticky bottom-0 flex flex-col sm:flex-row gap-2 border-t border-slate-100 bg-white py-3">
                        <Button
                            variant="outline"
                            className="h-11 sm:h-10 rounded-xl"
                            disabled={!importType}
                            onClick={() => importType && handleDownloadTemplate(importType)}
                        >
                            <Download className="w-4 h-4 mr-2" /> Download Sample CSV
                        </Button>
                        <Button
                            className="h-11 sm:h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex-1"
                            disabled={!importType}
                            onClick={() => setStep(2)}
                        >
                            Continue
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Step 2: CSV + mode ── */}
            {step === 2 && importType && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                        {selectedTypeMeta && <selectedTypeMeta.icon className="h-4 w-4 text-blue-600" />}
                        <p className="text-[13px] font-bold text-slate-800">{selectedTypeMeta?.label}</p>
                        <button type="button" onClick={() => setStep(1)} className="ml-auto text-[12px] font-semibold text-blue-600">Change</button>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">CSV Data</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
                            <Button variant="outline" className="h-10 rounded-xl" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="w-4 h-4 mr-2" /> Upload CSV File
                            </Button>
                            {fileName && (
                                <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
                                    <FileText className="w-3.5 h-3.5 text-slate-400" /> {fileName}
                                </span>
                            )}
                        </div>
                        <Textarea
                            placeholder="…or paste CSV text here (first line must be the header row)"
                            value={csvText}
                            onChange={(e) => { setCsvText(e.target.value); setFileName(null); }}
                            className="min-h-[140px] rounded-xl bg-slate-50 font-mono text-[12px] focus:bg-white"
                        />
                        <p className="text-[11px] text-slate-400">Max 1MB · up to 1000 rows per import.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Import Mode</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {MODES.map(m => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => setMode(m.value)}
                                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${mode === m.value ? "border-blue-500 bg-blue-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
                                >
                                    <p className={`text-[13px] font-bold ${mode === m.value ? "text-blue-700" : "text-slate-800"}`}>{m.label}</p>
                                    <p className="text-[11px] text-slate-500">{m.helper}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {importType === "service_catalog" && (
                        <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 cursor-pointer">
                            <Checkbox checked={autoCreateCategories} onCheckedChange={(v) => setAutoCreateCategories(v === true)} className="mt-0.5" />
                            <span>
                                <span className="block text-[13px] font-semibold text-slate-800">Auto-create missing categories</span>
                                <span className="block text-[11px] text-slate-500">Service categories referenced in the CSV that don't exist yet will be created.</span>
                            </span>
                        </label>
                    )}

                    <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white py-3">
                        <Button variant="outline" className="h-11 sm:h-10 rounded-xl" onClick={() => setStep(1)}>
                            <ChevronLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                        <Button
                            className="h-11 sm:h-10 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex-1"
                            disabled={!csvText.trim() || loading}
                            onClick={handlePreview}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Preview Import
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Step 3: Preview ── */}
            {step === 3 && preview && (
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center">
                            <p className="text-lg font-extrabold text-slate-900">{preview.totalRows}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</p>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 text-center">
                            <p className="text-lg font-extrabold text-emerald-700">{preview.validRows}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Valid</p>
                        </div>
                        <div className={`rounded-xl border px-3 py-2.5 text-center ${preview.invalidRows > 0 ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}>
                            <p className={`text-lg font-extrabold ${preview.invalidRows > 0 ? "text-red-700" : "text-slate-400"}`}>{preview.invalidRows}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-wider ${preview.invalidRows > 0 ? "text-red-600" : "text-slate-400"}`}>Invalid</p>
                        </div>
                    </div>

                    {preview.warnings.length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 space-y-1">
                            {preview.warnings.map((w, i) => (
                                <p key={i} className="flex items-start gap-1.5 text-[12px] text-amber-800">
                                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Desktop table */}
                    <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="max-h-[320px] overflow-y-auto overflow-x-auto">
                            <table className="w-full text-[12px]">
                                <thead className="sticky top-0 bg-slate-50 text-left">
                                    <tr className="border-b border-slate-200">
                                        <th className="px-3 py-2 font-bold text-slate-500 w-12">Row</th>
                                        <th className="px-3 py-2 font-bold text-slate-500">Record</th>
                                        <th className="px-3 py-2 font-bold text-slate-500 w-20">Action</th>
                                        <th className="px-3 py-2 font-bold text-slate-500">Errors / Warnings</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.rows.map(r => (
                                        <tr key={r.rowNumber} className="border-b border-slate-100 last:border-0">
                                            <td className="px-3 py-2 font-mono text-slate-500">{r.rowNumber}</td>
                                            <td className="px-3 py-2 font-semibold text-slate-800">{rowLabel(r.normalized)}</td>
                                            <td className="px-3 py-2">{rowStatusBadge(r.status, r.action)}</td>
                                            <td className="px-3 py-2">
                                                {r.errors.map((e, i) => <p key={`e${i}`} className="text-red-600">{e}</p>)}
                                                {r.warnings.map((w, i) => <p key={`w${i}`} className="text-amber-600">{w}</p>)}
                                                {r.errors.length === 0 && r.warnings.length === 0 && <span className="text-slate-300">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-2 max-h-[300px] overflow-y-auto">
                        {preview.rows.map(r => (
                            <div key={r.rowNumber} className={`rounded-xl border px-3 py-2.5 ${r.status === "invalid" ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-white"}`}>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[11px] text-slate-400">#{r.rowNumber}</span>
                                    <span className="text-[13px] font-bold text-slate-800 truncate flex-1">{rowLabel(r.normalized)}</span>
                                    {rowStatusBadge(r.status, r.action)}
                                </div>
                                {(r.errors.length > 0 || r.warnings.length > 0) && (
                                    <div className="mt-1.5 space-y-0.5">
                                        {r.errors.map((e, i) => <p key={`e${i}`} className="text-[11px] text-red-600">{e}</p>)}
                                        {r.warnings.map((w, i) => <p key={`w${i}`} className="text-[11px] text-amber-600">{w}</p>)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 bg-white py-3">
                        <Button variant="outline" className="h-11 sm:h-10 rounded-xl" onClick={() => setStep(2)}>
                            <ChevronLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                        <Button
                            className="h-11 sm:h-10 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex-1"
                            disabled={loading || importableCount === 0}
                            onClick={handleCommit}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Import {importableCount} Row{importableCount === 1 ? "" : "s"}
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Step 4: Summary ── */}
            {step === 4 && result && (
                <div className="space-y-4">
                    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 ${result.failed > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                        {result.failed > 0
                            ? <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0" />
                            : <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />}
                        <div>
                            <p className="text-[14px] font-bold text-slate-900">
                                {result.failed > 0 ? "Import finished with some failures" : "Import complete"}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">Batch {result.batchId.slice(0, 8)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                            { label: "Created", value: result.created, tone: "text-emerald-700" },
                            { label: "Updated", value: result.updated, tone: "text-amber-700" },
                            { label: "Skipped", value: result.skipped, tone: "text-slate-600" },
                            { label: "Failed", value: result.failed, tone: result.failed > 0 ? "text-red-700" : "text-slate-400" },
                        ].map(s => (
                            <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center">
                                <p className={`text-lg font-extrabold ${s.tone}`}>{s.value}</p>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {result.errors.length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 space-y-1 max-h-[160px] overflow-y-auto">
                            {result.errors.map((e, i) => (
                                <p key={i} className="flex items-start gap-1.5 text-[12px] text-red-700">
                                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="sticky bottom-0 border-t border-slate-100 bg-white py-3">
                        <Button className="h-11 sm:h-10 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={resetWizard}>
                            Import Another File
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
