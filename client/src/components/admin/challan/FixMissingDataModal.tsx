
import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Device, IncompleteRow, REQUIRED_FIELDS } from "./validation";
import { Badge } from "@/components/ui/badge";

interface FixMissingDataModalProps {
    open: boolean;
    onClose: () => void;
    incompleteRows: IncompleteRow[];
    onUpdateDevice: (index: number, updatedDevice: Device) => void;
}

export function FixMissingDataModal({
    open,
    onClose,
    incompleteRows,
    onUpdateDevice,
}: FixMissingDataModalProps) {
    // Current index within the incompleteRows array
    const [currentIndex, setCurrentIndex] = useState(0);
    // Local state for the form being edited
    const [editForm, setEditForm] = useState<Partial<Device>>({});

    // Reset when opening or changing rows
    useEffect(() => {
        if (open && incompleteRows.length > 0) {
            // Ensure index is valid
            const safeIndex = Math.min(currentIndex, incompleteRows.length - 1);
            if (safeIndex !== currentIndex) setCurrentIndex(safeIndex);

            // Load data
            const row = incompleteRows[safeIndex];
            if (row) {
                setEditForm({ ...row.device });
            }
        }
    }, [open, currentIndex, incompleteRows]);

    if (!open || incompleteRows.length === 0) return null;

    const currentRow = incompleteRows[currentIndex];

    // Safety check in case rows changed while modal was open
    if (!currentRow) {
        onClose();
        return null;
    }

    const totalRows = incompleteRows.length;
    const progress = ((currentIndex) / totalRows) * 100;

    // Check if current form is valid yet
    const isCurrentValid = REQUIRED_FIELDS.every(field => {
        const val = editForm[field.field];
        return val && typeof val === 'string' && val.trim() !== '';
    });

    const handleSave = () => {
        if (currentRow) {
            onUpdateDevice(currentRow.index, editForm as Device);
        }
    };

    const handleNext = () => {
        handleSave();
        if (currentIndex < totalRows - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // Last item
            onClose();
        }
    };

    const handlePrev = () => {
        // Find previous item? 
        // Logic: If we go back, we just change index. 
        // Note: Ideally we should save current progress too.
        handleSave();
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const renderField = (fieldKey: keyof Device, label: string) => {
        const isMissing = currentRow.missingFields.some(f => f.field === fieldKey);
        const value = editForm[fieldKey] || "";

        return (
            <div className="grid gap-2" key={fieldKey}>
                <Label className={isMissing ? "text-destructive font-semibold" : "text-muted-foreground"}>
                    {label} {isMissing && "*"}
                </Label>

                {fieldKey === 'deviceBrand' ? (
                    <Select
                        value={value as string}
                        onValueChange={(val) => setEditForm(prev => ({ ...prev, [fieldKey]: val }))}
                    >
                        <SelectTrigger className={isMissing ? "border-destructive ring-destructive/20" : ""}>
                            <SelectValue placeholder="Select Brand" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Samsung">Samsung</SelectItem>
                            <SelectItem value="LG">LG</SelectItem>
                            <SelectItem value="Sony">Sony</SelectItem>
                            <SelectItem value="Walton">Walton</SelectItem>
                            <SelectItem value="Singer">Singer</SelectItem>
                            <SelectItem value="Vision">Vision</SelectItem>
                            <SelectItem value="Panasonic">Panasonic</SelectItem>
                            <SelectItem value="Sharp">Sharp</SelectItem>
                            <SelectItem value="Haier">Haier</SelectItem>
                            <SelectItem value="Xiaomi">Xiaomi</SelectItem>
                            <SelectItem value="TCL">TCL</SelectItem>
                            <SelectItem value="Unknown">Other</SelectItem>
                        </SelectContent>
                    </Select>
                ) : (
                    <Input
                        value={value}
                        onChange={(e) => setEditForm(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                        className={isMissing ? "border-destructive focus-visible:ring-destructive" : "bg-muted/50"}
                        // Only auto-focus the first missing field
                        autoFocus={isMissing && currentRow.missingFields[0].field === fieldKey}
                    />
                )}
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                        Fix Missing Data
                    </DialogTitle>
                    <DialogDescription>
                        Please fill in the missing information for the following devices.
                    </DialogDescription>
                </DialogHeader>

                {/* Progress */}
                <div className="flex flex-col gap-2 py-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Fixing item {currentIndex + 1} of {totalRows}</span>
                        <span>{Math.round(progress)}% Complete</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                </div>

                {/* Main Edit Form */}
                <div className="grid gap-4 py-4 border rounded-md p-4 bg-card/50">
                    <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="font-mono">
                            Row #{currentRow.index + 1}
                        </Badge>
                        {isCurrentValid ? (
                            <Badge className="bg-green-500 hover:bg-green-600">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Ready
                            </Badge>
                        ) : (
                            <Badge variant="destructive">
                                Missing {currentRow.missingFields.length} fields
                            </Badge>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {renderField('corporateJobNumber', 'Job Reference')}
                        {renderField('deviceBrand', 'Brand')}
                        {renderField('model', 'Model')}
                        {renderField('serialNumber', 'Serial Number')}
                        <div className="col-span-2">
                            {renderField('reportedDefect', 'Reported Issue')}
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex justify-between sm:justify-between items-center w-full">
                    <Button
                        variant="outline"
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Previous
                    </Button>

                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleNext}
                            disabled={!isCurrentValid}
                            className={isCurrentValid ? "bg-green-600 hover:bg-green-700" : ""}
                        >
                            {currentIndex === totalRows - 1 ? "Finish" : "Save & Next"}
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
