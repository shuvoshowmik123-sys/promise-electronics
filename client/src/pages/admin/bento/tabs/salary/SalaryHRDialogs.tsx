import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export function RejectLeaveDialog({
    open,
    onOpenChange,
    onConfirm,
    isPending,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (reason: string) => void;
    isPending: boolean;
}) {
    const [reason, setReason] = useState("");

    const handleConfirm = () => {
        if (reason.trim()) {
            onConfirm(reason.trim());
            setReason("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Reject Leave Application</DialogTitle>
                    <DialogDescription>
                        Provide a reason — it will be shown to the staff member.
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    placeholder="e.g. Insufficient leave balance, peak season staffing..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="min-h-[100px]"
                />
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={!reason.trim() || isPending}
                    >
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Confirm Rejection
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DismissHolidayDialog({
    open,
    onOpenChange,
    onConfirm,
    isPending,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (reason: string) => void;
    isPending: boolean;
}) {
    const [reason, setReason] = useState("");

    const handleConfirm = () => {
        if (reason.trim()) {
            onConfirm(reason.trim());
            setReason("");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Dismiss Holiday</DialogTitle>
                    <DialogDescription>
                        This day will be counted as a working day in salary calculations. Please provide a reason.
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    placeholder="e.g. Emergency workload, client deadline..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="min-h-[80px]"
                />
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={!reason.trim() || isPending}
                    >
                        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Dismiss Holiday
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function AddHolidayDialog({
    open,
    onOpenChange,
    onConfirm,
    isPending,
    selectedYear,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (data: any) => void;
    isPending: boolean;
    selectedYear: number;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Holiday</DialogTitle>
                    <DialogDescription>
                        Add a custom or forced holiday to the {selectedYear} calendar.
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        onConfirm({
                            year: selectedYear,
                            date: fd.get("date"),
                            name: fd.get("name"),
                            type: fd.get("type"),
                            status: fd.get("status") || "active",
                            forcedReason: fd.get("forcedReason") || undefined,
                        });
                        e.currentTarget.reset();
                    }}
                    className="space-y-4"
                >
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Date</label>
                            <Input type="date" name="date" required className="h-9" />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Type</label>
                            <select
                                name="type"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                required
                            >
                                <option value="government">Government</option>
                                <option value="religious">Religious</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">Holiday Name</label>
                        <Input
                            name="name"
                            placeholder="e.g. Hartal / National Day"
                            required
                            className="h-9"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">Status</label>
                        <select
                            name="status"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="active">Active (Normal Holiday)</option>
                            <option value="forced">Forced (Emergency / Hartal)</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">
                            Reason <span className="text-muted-foreground text-xs">(if forced)</span>
                        </label>
                        <Input name="forcedReason" placeholder="Optional" className="h-9" />
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Add Holiday
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
