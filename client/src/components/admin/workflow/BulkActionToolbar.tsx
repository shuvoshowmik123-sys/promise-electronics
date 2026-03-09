import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jobTicketsApi } from "@/lib/api";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BulkActionToolbarProps {
    selectedJobIds: string[];
    onClearSelection: () => void;
}

export function BulkActionToolbar({ selectedJobIds, onClearSelection }: BulkActionToolbarProps) {
    const queryClient = useQueryClient();
    const [isUpdating, setIsUpdating] = useState(false);

    const bulkUpdateMutation = useMutation({
        mutationFn: (updates: any) => jobTicketsApi.bulkUpdate({ jobIds: selectedJobIds, updates }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            toast.success(`Successfully updated ${data.count} jobs`);
            onClearSelection();
        },
        onError: (error: any) => {
            toast.error("Failed to perform bulk update", { description: error.message });
        },
        onSettled: () => setIsUpdating(false),
    });

    const handleBulkStatus = (status: string) => {
        setIsUpdating(true);
        bulkUpdateMutation.mutate({ status });
    };

    const handleBulkPrint = () => {
        toast.info("Bulk printing functionality will be implemented in the next phase");
    };

    if (selectedJobIds.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-6 left-[calc(50%+120px)] -translate-x-1/2 z-50 flex items-center gap-4 bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-2xl font-medium"
            >
                <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="bg-primary-foreground text-primary w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold">
                        {selectedJobIds.length}
                    </span>
                    Selected
                </span>

                <div className="w-px h-6 bg-primary-foreground/20 mx-1" />

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="sm" className="h-8 gap-2" disabled={isUpdating}>
                            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Set Status
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Mass Update Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleBulkStatus("In Progress")}>
                            Mark as In Progress
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatus("Ready")}>
                            Mark as Ready
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleBulkStatus("Completed")}>
                            Mark as Completed
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-2 bg-secondary/80 hover:bg-secondary"
                    onClick={handleBulkPrint}
                >
                    <Printer className="w-4 h-4" />
                    Print Challans
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-primary-foreground/20 ml-2 shrink-0"
                    onClick={onClearSelection}
                >
                    <X className="w-4 h-4" />
                </Button>
            </motion.div>
        </AnimatePresence>
    );
}
