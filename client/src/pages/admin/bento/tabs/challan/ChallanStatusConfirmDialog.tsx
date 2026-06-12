import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export type ChallanStatusConfirmAction = {
    id: string;
    status: "Delivered" | "Received" | "Pending";
    receiver?: string;
};

interface ChallanStatusConfirmDialogProps {
    action: ChallanStatusConfirmAction | null;
    isPending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function ChallanStatusConfirmDialog({ action, isPending, onCancel, onConfirm }: ChallanStatusConfirmDialogProps) {
    return (
        <Dialog open={!!action} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="max-w-[calc(100vw-2rem)] rounded-3xl border-orange-200 bg-orange-50 p-5 shadow-2xl sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-lg font-black text-orange-950">Confirm challan status</DialogTitle>
                    <DialogDescription className="text-sm font-semibold leading-relaxed text-orange-900">
                        {action?.status === "Delivered"
                            ? `Send this challan to ${action.receiver || "the receiver"} and mark it Delivered?`
                            : action?.status === "Received"
                                ? `Receive this challan back from ${action.receiver || "the receiver"} and mark it Received?`
                                : `Reset this challan back to Pending?`}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                    <Button variant="outline" className="mt-0 h-11 rounded-2xl border-orange-200 bg-white font-black text-orange-900 hover:bg-orange-100" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirm} disabled={isPending} className="h-11 rounded-2xl bg-orange-600 font-black text-white hover:bg-orange-700 disabled:opacity-60">
                        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Okay
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
