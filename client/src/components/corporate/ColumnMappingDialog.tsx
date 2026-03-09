
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, ArrowRight, XCircle, Info } from "lucide-react";
import { FieldMapping, ALL_FIELDS, REQUIRED_FIELDS, OPTIONAL_FIELDS } from "@/lib/columnMapper";
import { BulkRow } from "@/lib/api";

interface ColumnMappingDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    uploadedHeaders: string[]; // Access to source headers
    initialMappings: FieldMapping[];
    onConfirm: (finalMappings: FieldMapping[]) => void;
}

export function ColumnMappingDialog({
    open,
    onOpenChange,
    uploadedHeaders,
    initialMappings,
    onConfirm
}: ColumnMappingDialogProps) {
    const [mappings, setMappings] = useState<FieldMapping[]>(initialMappings);

    // Sync state when props change
    useEffect(() => {
        if (open) {
            setMappings(initialMappings);
        }
    }, [open, initialMappings]);

    const handleMappingChange = (systemFieldKey: string, sourceHeader: string) => {
        setMappings(prev => {
            // Create a copy
            const newMappings = [...prev];

            // 1. Is the source header already mapped to something? Update that mapping.
            // 2. Or is the system field needing a source?
            // Our state structure is `FieldMapping[]` which maps Source -> Target.
            // But the UI is essentially "System Field -> Select Source".

            // We need to find if there IS a mapping pointing to this system field
            // If so, update its source? No, mapping is source-centric.

            // Let's rethink: We want to set System Field X to use Source Column Y.
            // If Source Column Y was already mapped to Z, we re-map it to X.
            // If System Field X was mapped from Column A, we unmap Column A (set its target to null).

            // ACTUALLY: The most intuitive way is:
            // We have a list of System Fields. For each, we select a source column.

            // So, let's look for the mapping entry for the chosen source header.
            // If specific source header "Serial #" is chosen for "Serial Number":
            // We find mapping where sourceColumn="Serial #" and set target="serialNumber".

            // But what if user selects "None"?
            if (sourceHeader === "__ignore__") {
                // Find mapping currently targeting this system field and clear it
                return newMappings.map(m =>
                    m.targetField === systemFieldKey
                        ? { ...m, targetField: null, confidence: 'manual' as const }
                        : m
                );
            }

            // If user selected valid source header:
            // 1. Clear any OTHER mapping that was targeting this system field (can't have two columns for one field)
            const clearedOldTarget = newMappings.map(m =>
                m.targetField === systemFieldKey
                    ? { ...m, targetField: null, confidence: 'manual' as const }
                    : m
            );

            // 2. Set the new source's target
            return clearedOldTarget.map(m =>
                m.sourceColumn === sourceHeader
                    ? { ...m, targetField: systemFieldKey as keyof BulkRow, confidence: 'manual' as const }
                    : m
            );
        });
    };

    // Helper to get source column for a system field
    const getSourceForField = (fieldKey: string) => {
        return mappings.find(m => m.targetField === fieldKey)?.sourceColumn;
    };

    // Validation
    const requiredFields = REQUIRED_FIELDS;
    const missingRequired = requiredFields.filter(f => !getSourceForField(f.key));
    const isValid = missingRequired.length === 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto w-full">
                <DialogHeader>
                    <DialogTitle className="text-xl">Map Columns</DialogTitle>
                    <DialogDescription>
                        Match your file's headers to the required system fields.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                    {/* Instructions / Summary */}
                    <div className="md:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div className="text-sm text-blue-800">
                            <p className="font-medium">Smart Mapping Active</p>
                            <p>We've automatically matched fields based on your file headers. Please review the yellow or red items.</p>
                        </div>
                    </div>

                    {/* Required Fields Section */}
                    <div className="md:col-span-2 space-y-4">
                        <h3 className="font-semibold text-lg flex items-center gap-2 border-b pb-2">
                            Required Fields
                            <Badge variant="secondary" className="text-xs">Must be mapped</Badge>
                        </h3>

                        <div className="grid gap-3">
                            {REQUIRED_FIELDS.map(field => {
                                const source = getSourceForField(field.key);
                                const mapping = mappings.find(m => m.sourceColumn === source);
                                const isMapped = !!source;
                                const isFuzzy = mapping?.confidence === 'fuzzy';

                                return (
                                    <div key={field.key} className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${isMapped
                                            ? isFuzzy ? 'bg-yellow-50/50 border-yellow-200' : 'bg-green-50/50 border-green-200'
                                            : 'bg-red-50/50 border-red-200'
                                        }`}>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor={`map-${field.key}`} className="font-medium text-base">
                                                    {field.label}
                                                </Label>
                                                {isMapped ? (
                                                    <CheckCircle className={`w-4 h-4 ${isFuzzy ? 'text-yellow-600' : 'text-green-600'}`} />
                                                ) : (
                                                    <Badge variant="destructive" className="h-5 px-1.5">Required</Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">Accepts: {field.aliases.slice(0, 3).join(", ")}...</p>
                                        </div>

                                        <ArrowRight className="hidden sm:block text-muted-foreground w-4 h-4" />

                                        <div className="w-full sm:w-[280px]">
                                            <Select
                                                value={source || "__ignore__"}
                                                onValueChange={(val) => handleMappingChange(field.key, val)}
                                            >
                                                <SelectTrigger id={`map-${field.key}`} className={
                                                    !isMapped ? "border-red-300 ring-red-200 focus:ring-red-200" : ""
                                                }>
                                                    <SelectValue placeholder="Select column..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__ignore__" className="text-muted-foreground italic">
                                                        -- Not Mapped --
                                                    </SelectItem>
                                                    {uploadedHeaders.map(header => (
                                                        <SelectItem key={header} value={header}>
                                                            {header}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {isFuzzy && isMapped && (
                                                <p className="text-[10px] text-yellow-700 mt-1 flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Low confidence match
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Optional Fields Section */}
                    <div className="md:col-span-2 space-y-4 pt-4">
                        <h3 className="font-semibold text-lg flex items-center gap-2 border-b pb-2">
                            Optional Fields
                            <Badge variant="outline" className="text-xs">Optional</Badge>
                        </h3>

                        <div className="grid gap-3">
                            {OPTIONAL_FIELDS.map(field => {
                                const source = getSourceForField(field.key);
                                // const mapping = mappings.find(m => m.sourceColumn === source);

                                return (
                                    <div key={field.key} className="p-3 rounded-lg border bg-slate-50/50 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex-1">
                                            <Label htmlFor={`map-${field.key}`} className="font-medium text-sm text-slate-700">
                                                {field.label}
                                            </Label>
                                        </div>

                                        <ArrowRight className="hidden sm:block text-muted-foreground w-4 h-4" />

                                        <div className="w-full sm:w-[280px]">
                                            <Select
                                                value={source || "__ignore__"}
                                                onValueChange={(val) => handleMappingChange(field.key, val)}
                                            >
                                                <SelectTrigger id={`map-${field.key}`} className="h-9">
                                                    <SelectValue placeholder="Select column (optional)..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__ignore__" className="text-muted-foreground italic">
                                                        -- Ignore --
                                                    </SelectItem>
                                                    {uploadedHeaders.map(header => (
                                                        <SelectItem key={header} value={header}>
                                                            {header}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>

                <DialogFooter className="gap-2 sm:gap-0 mt-6 sticky bottom-0 bg-background/95 backdrop-blur py-4 border-t z-10">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel Import
                    </Button>
                    <Button
                        onClick={() => onConfirm(mappings)}
                        disabled={!isValid}
                        className="w-full sm:w-auto"
                    >
                        {isValid ? "Apply Mapping & Review" : `Map ${missingRequired.length} Required Fields`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
