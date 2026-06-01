import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Info, Link2, XCircle } from "lucide-react";
import { type FieldMapping, REQUIRED_FIELDS, OPTIONAL_FIELDS } from "@/lib/columnMapper";
import { type BulkRow } from "@/lib/api";

type FieldSourceType = "column" | "default" | "auto" | "review";

interface ColumnMappingDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    uploadedHeaders: string[];
    initialMappings: FieldMapping[];
    sampleRows?: Record<string, unknown>[];
    title?: string;
    description?: string;
    onConfirm: (finalMappings: FieldMapping[]) => void;
}

const confidenceLabels: Record<FieldMapping["confidence"], string> = {
    exact: "Confirmed",
    alias: "Auto suggested",
    fuzzy: "Needs review",
    manual: "Manual",
    unmapped: "Not mapped",
};

const confidenceClasses: Record<FieldMapping["confidence"], string> = {
    exact: "border-emerald-200 bg-emerald-50 text-emerald-700",
    alias: "border-blue-200 bg-blue-50 text-blue-700",
    fuzzy: "border-amber-200 bg-amber-50 text-amber-700",
    manual: "border-slate-200 bg-slate-50 text-slate-700",
    unmapped: "border-slate-200 bg-slate-50 text-slate-500",
};

export function ColumnMappingDialog({
    open,
    onOpenChange,
    uploadedHeaders,
    initialMappings,
    sampleRows = [],
    title = "Client Import Mapping",
    description = "Connect the client's file columns to Promise system fields.",
    onConfirm
}: ColumnMappingDialogProps) {
    const [mappings, setMappings] = useState<FieldMapping[]>(initialMappings);

    useEffect(() => {
        if (open) setMappings(initialMappings);
    }, [open, initialMappings]);

    const requiredFields = useMemo(() => REQUIRED_FIELDS.filter(field => field.required), []);
    const optionalFields = useMemo(() => [
        ...REQUIRED_FIELDS.filter(field => !field.required),
        ...OPTIONAL_FIELDS,
    ], []);

    const getSourceForField = (fieldKey: string) => mappings.find(mapping => mapping.targetField === fieldKey)?.sourceColumn;
    const getMappingForField = (fieldKey: string) => mappings.find(mapping => mapping.targetField === fieldKey);
    const getMappingForHeader = (header: string) => mappings.find(mapping => mapping.sourceColumn === header);

    const hasSourceForField = (fieldKey: string) => {
        const mapping = getMappingForField(fieldKey);
        if (!mapping) return false;
        const sourceType = mapping.sourceType || (mapping.sourceColumn ? "column" : undefined);
        if (sourceType === "default") return Boolean(mapping.defaultValue?.trim());
        return Boolean(sourceType);
    };

    const mappedRequiredCount = requiredFields.filter(field => hasSourceForField(field.key)).length;
    const mappedOptionalCount = optionalFields.filter(field => hasSourceForField(field.key)).length;
    const ignoredCount = mappings.filter(mapping => !mapping.targetField).length;
    const missingRequired = requiredFields.filter(field => !hasSourceForField(field.key));
    const isValid = missingRequired.length === 0;

    const sampleValueForHeader = (header: string) => {
        const values = sampleRows
            .slice(0, 4)
            .map(row => String(row[header] ?? "").trim())
            .filter(Boolean);

        return values.length > 0 ? values.join(" | ") : "No sample value found";
    };

    const handleMappingChange = (systemFieldKey: string, sourceHeader: string) => {
        setMappings(prev => {
            if (sourceHeader === "__ignore__") {
                return prev.map(mapping =>
                    mapping.targetField === systemFieldKey
                        ? { ...mapping, targetField: null, confidence: "manual" as const }
                        : mapping
                );
            }

            return prev
                .map(mapping =>
                    mapping.targetField === systemFieldKey
                        ? { ...mapping, targetField: null, confidence: "manual" as const }
                        : mapping
                )
                .map(mapping =>
                    mapping.sourceColumn === sourceHeader
                        ? { ...mapping, targetField: systemFieldKey as keyof BulkRow, sourceType: "column" as const, defaultValue: "", confidence: "manual" as const }
                        : mapping
                );
        });
    };

    const updateFieldSource = (systemFieldKey: string, sourceType: FieldSourceType) => {
        setMappings(prev => {
            const cleared = prev.map(mapping =>
                mapping.targetField === systemFieldKey
                    ? { ...mapping, targetField: null, confidence: "manual" as const }
                    : mapping
            );

            if (sourceType === "column") return cleared;

            return [
                ...cleared,
                {
                    sourceColumn: "",
                    targetField: systemFieldKey as keyof BulkRow,
                    sourceType,
                    defaultValue: "",
                    confidence: "manual" as const,
                },
            ];
        });
    };

    const updateDefaultValue = (systemFieldKey: string, defaultValue: string) => {
        setMappings(prev => prev.map(mapping =>
            mapping.targetField === systemFieldKey
                ? { ...mapping, sourceType: "default" as const, defaultValue, confidence: "manual" as const }
                : mapping
        ));
    };

    const renderStatusBadge = (mapping?: FieldMapping) => {
        const confidence = mapping?.confidence || "unmapped";

        return (
            <Badge variant="outline" className={confidenceClasses[confidence]}>
                {confidenceLabels[confidence]}
            </Badge>
        );
    };

    const renderFieldRow = (field: typeof REQUIRED_FIELDS[number], required: boolean) => {
        const source = getSourceForField(field.key);
        const mapping = getMappingForField(field.key);
        const sourceType = (mapping?.sourceType || (source ? "column" : undefined)) as FieldSourceType | undefined;
        const isMapped = hasSourceForField(field.key);
        const isFuzzy = mapping?.confidence === "fuzzy";

        return (
            <div
                key={field.key}
                className={`rounded-2xl border p-4 transition-all ${isMapped
                    ? isFuzzy
                        ? "border-amber-200 bg-amber-50/70"
                        : "border-emerald-200 bg-emerald-50/60"
                    : required
                        ? "border-rose-200 bg-rose-50/70"
                        : "border-slate-200 bg-white"
                    }`}
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_42px_minmax(260px,360px)] lg:items-center">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Label htmlFor={`map-${field.key}`} className="text-sm font-black text-slate-900">
                                Promise: {field.label}
                            </Label>
                            {required && <Badge className="bg-slate-900 text-white">Required</Badge>}
                            {!required && <Badge variant="outline">Optional</Badge>}
                            {isMapped ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                        </div>
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                            Example names: {field.aliases.slice(0, 4).join(", ")}
                        </div>
                    </div>

                    <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm lg:flex">
                        <ArrowRight className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 rounded-xl border border-white/80 bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">How Promise gets this</span>
                            {renderStatusBadge(mapping)}
                        </div>
                        <div className="grid gap-2">
                            <Select value={sourceType || "__ignore__"} onValueChange={(val) => {
                                if (val === "__ignore__") {
                                    handleMappingChange(field.key, "__ignore__");
                                    return;
                                }
                                updateFieldSource(field.key, val as FieldSourceType);
                            }}>
                                <SelectTrigger className={!isMapped && required ? "border-rose-300 bg-rose-50" : ""}>
                                    <SelectValue placeholder="Choose source" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__ignore__">{required ? "Not decided yet" : "Ignore this field"}</SelectItem>
                                    <SelectItem value="column">From client file column</SelectItem>
                                    <SelectItem value="default">Use one fixed value</SelectItem>
                                    <SelectItem value="auto">Auto-detect from row</SelectItem>
                                    <SelectItem value="review">Ask during row review</SelectItem>
                                </SelectContent>
                            </Select>

                            {sourceType === "column" && (
                                <Select value={source || "__ignore__"} onValueChange={(val) => handleMappingChange(field.key, val)}>
                                    <SelectTrigger id={`map-${field.key}`} className={!isMapped && required ? "border-rose-300 bg-rose-50" : ""}>
                                        <SelectValue placeholder="Choose client column" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__ignore__">{required ? "Not mapped yet" : "Ignore this field"}</SelectItem>
                                        {uploadedHeaders.map(header => (
                                            <SelectItem key={header} value={header}>{header}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                            {sourceType === "default" && (
                                <Input
                                    value={mapping?.defaultValue || ""}
                                    onChange={(event) => updateDefaultValue(field.key, event.target.value)}
                                    placeholder={`Example: ${field.key === "deviceBrand" ? "Samsung" : field.label}`}
                                    className={!isMapped && required ? "border-rose-300 bg-rose-50" : ""}
                                />
                            )}
                        </div>
                        <div className="mt-2 min-h-9 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                            {sourceType === "column" && source ? (
                                <>
                                    <span className="font-semibold text-slate-700">Sample:</span> {sampleValueForHeader(source)}
                                </>
                            ) : sourceType === "default" ? (
                                mapping?.defaultValue?.trim()
                                    ? <>Promise will fill <span className="font-semibold text-slate-700">{mapping.defaultValue}</span> for every row.</>
                                    : "Write the fixed value Promise should use for every row."
                            ) : sourceType === "auto" ? (
                                field.key === "deviceBrand" ? "Promise will try to detect brand from model and row text." : "Promise will try to detect this value from row text where supported."
                            ) : sourceType === "review" ? (
                                "Rows can import now. The missing value must be completed during row review before saving."
                            ) : (
                                required ? "Choose a source: file column, fixed value, auto-detect, or row review." : "Optional. Leave ignored if the client file does not provide it."
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[96vh] w-[96vw] max-w-none flex-col overflow-hidden bg-slate-50 p-0">
                <DialogHeader className="shrink-0 border-b bg-white px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <DialogTitle className="text-2xl font-black text-slate-950">{title}</DialogTitle>
                            <DialogDescription className="mt-1 text-sm text-slate-500">{description}</DialogDescription>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-2xl border bg-emerald-50 px-4 py-2">
                                <div className="text-lg font-black text-emerald-700">{mappedRequiredCount}/{requiredFields.length}</div>
                                <div className="text-[10px] font-bold uppercase text-emerald-700">Required</div>
                            </div>
                            <div className="rounded-2xl border bg-blue-50 px-4 py-2">
                                <div className="text-lg font-black text-blue-700">{mappedOptionalCount}</div>
                                <div className="text-[10px] font-bold uppercase text-blue-700">Optional</div>
                            </div>
                            <div className="rounded-2xl border bg-slate-50 px-4 py-2">
                                <div className="text-lg font-black text-slate-700">{ignoredCount}</div>
                                <div className="text-[10px] font-bold uppercase text-slate-500">Ignored</div>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    <div className="mb-5 rounded-3xl border border-blue-100 bg-blue-50 p-4">
                        <div className="flex gap-3">
                            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                            <div>
                                <div className="font-black text-blue-950">Map client language to Promise language</div>
                                <p className="mt-1 text-sm text-blue-800">
                                    Left side is what the client sent. Right side is what Promise needs. Confirm the auto suggestions, fix only the unclear ones, then continue.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                        <section className="rounded-3xl border bg-white p-4 shadow-sm">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-black text-slate-950">Client File Columns</h3>
                                    <p className="text-xs text-slate-500">These came from the uploaded sample file.</p>
                                </div>
                                <Badge variant="outline">{uploadedHeaders.length} columns</Badge>
                            </div>
                            <div className="space-y-2">
                                {uploadedHeaders.map(header => {
                                    const mapping = getMappingForHeader(header);
                                    const targetField = [...requiredFields, ...optionalFields].find(field => field.key === mapping?.targetField);

                                    return (
                                        <div key={header} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-black text-slate-900">{header}</div>
                                                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{sampleValueForHeader(header)}</div>
                                                </div>
                                                {targetField ? (
                                                    <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">
                                                        Mapped
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="shrink-0 text-slate-500">Ignored</Badge>
                                                )}
                                            </div>
                                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                                <Link2 className="h-3.5 w-3.5" />
                                                {targetField ? `Promise: ${targetField.label}` : "Not connected to a Promise field"}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="space-y-5">
                            {!isValid && (
                                <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4">
                                    <div className="flex gap-3">
                                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                                        <div>
                                            <div className="font-black text-rose-900">Required fields still need mapping</div>
                                            <p className="mt-1 text-sm text-rose-700">
                                                Missing: {missingRequired.map(field => field.label).join(", ")}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-black text-slate-950">Promise System Fields</h3>
                                        <p className="text-xs text-slate-500">These are the fields Promise will save and reuse later.</p>
                                    </div>
                                    <Badge className="bg-slate-900 text-white">
                                        <CircleDot className="mr-1 h-3.5 w-3.5" />
                                        Required first
                                    </Badge>
                                </div>
                                <div className="space-y-3">
                                    {requiredFields.map(field => renderFieldRow(field, true))}
                                </div>
                            </div>

                            <div>
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-black text-slate-950">Optional Fields</h3>
                                        <p className="text-xs text-slate-500">Useful when the client file provides extra tracking information.</p>
                                    </div>
                                    <Badge variant="outline">Can stay ignored</Badge>
                                </div>
                                <div className="space-y-3">
                                    {optionalFields.map(field => renderFieldRow(field, false))}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <DialogFooter className="shrink-0 border-t bg-white px-6 py-4">
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs text-slate-500">
                            {isValid ? "Mapping is ready. The manager can review imported rows next." : `Map ${missingRequired.length} required field${missingRequired.length === 1 ? "" : "s"} to continue.`}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel Import</Button>
                            <Button onClick={() => onConfirm(mappings)} disabled={!isValid}>
                                {isValid ? "Apply Mapping & Review" : "Finish Required Mapping"}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
