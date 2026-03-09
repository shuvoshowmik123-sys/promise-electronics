import * as React from "react";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Wrench, Phone, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import {
    Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { jobTicketsApi } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { VoiceTextInput } from "@/components/ui/VoiceTextInput";

interface JobTicket {
    id: string;
    device: string;
    issue: string;
    reportedDefect?: string;
    status: string;
    priority?: string;
    createdAt: string;
    notes?: string;
    customerName?: string;
    customerPhone?: string;
}

interface TechJobDrawerProps {
    job: JobTicket | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TechJobDrawer({ job, open, onOpenChange }: TechJobDrawerProps) {
    const [notes, setNotes] = useState("");
    const queryClient = useQueryClient();

    useEffect(() => {
        if (job) {
            setNotes(job.notes || "");
        }
    }, [job]);

    const updateJobMutation = useMutation({
        mutationFn: async (updates: any) => {
            if (!job) return;
            return jobTicketsApi.update(job.id, updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tech-active-jobs"] });
            toast.success("Job notes updated");
            onOpenChange(false);
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to update notes");
        }
    });

    const advanceStatusMutation = useMutation({
        mutationFn: async () => {
            if (!job) return;
            return jobTicketsApi.advanceStatus(job.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tech-active-jobs"] });
            toast.success("Job advanced to next step");
            onOpenChange(false);
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to advance job status");
        }
    });

    if (!job) return null;

    return (
        <Drawer open={open} onOpenChange={onOpenChange}>
            <DrawerContent className="max-h-[95vh] outline-none">
                <DrawerHeader className="text-left pb-2">
                    <div className="flex justify-between items-start">
                        <div>
                            <DrawerTitle className="text-2xl font-bold tracking-tight text-slate-900">{job.device}</DrawerTitle>
                            <DrawerDescription className="flex items-center mt-1.5 space-x-2">
                                <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">#{job.id.substring(0, 8)}</span>
                                {job.customerName && <span className="text-slate-600 font-medium text-sm">{job.customerName}</span>}
                            </DrawerDescription>
                        </div>
                        <Badge variant={job.priority === 'High' || job.priority === 'Urgent' ? 'destructive' : 'secondary'} className="px-2.5 py-1">
                            {job.priority || 'Normal'}
                        </Badge>
                    </div>
                </DrawerHeader>

                <div className="p-4 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div className="bg-slate-50 p-3 rounded-lg flex items-center">
                            <Clock className="w-4 h-4 text-slate-400 mr-2" />
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Logged On</p>
                                <p className="text-sm font-medium text-slate-800">{format(new Date(job.createdAt), "MMM d, h:mm a")}</p>
                            </div>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-lg flex items-center">
                            <AlertCircle className="w-4 h-4 text-slate-400 mr-2" />
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Current State</p>
                                <p className="text-sm font-medium text-slate-800">{job.status}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-5">
                        <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center">
                            <Wrench className="w-3.5 h-3.5 mr-1.5" />
                            Reported Issue
                        </h4>
                        <p className="text-slate-700 text-sm leading-relaxed">{job.reportedDefect || job.issue}</p>
                    </div>

                    <div className="space-y-2 mb-2">
                        <label className="text-sm font-semibold text-slate-800">Technician Notes</label>
                        <VoiceTextInput
                            value={notes}
                            onChange={(val) => setNotes(val)}
                        />
                    </div>
                </div>

                <DrawerFooter className="flex flex-row gap-2 border-t border-slate-100 pt-4 pb-6 px-4">
                    <Button
                        variant="outline"
                        onClick={() => updateJobMutation.mutate({ notes })}
                        className="flex-1 border-slate-200"
                        disabled={updateJobMutation.isPending || notes === (job.notes || "")}
                    >
                        Save Notes
                    </Button>
                    <Button
                        onClick={() => advanceStatusMutation.mutate()}
                        className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-500/20"
                        disabled={advanceStatusMutation.isPending}
                    >
                        {advanceStatusMutation.isPending ? "Processing..." : "Mark Checked & Advance"}
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
