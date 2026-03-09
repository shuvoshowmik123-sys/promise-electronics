
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { warrantyClaimsApi } from "@/lib/api";
import { format } from "date-fns";
import { Loader2, MoreVertical, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

export function WarrantyClaimsTable() {
    const queryClient = useQueryClient();
    const { user } = useAdminAuth();

    const { data, isLoading } = useQuery<any>({
        queryKey: ["warranty-claims"],
        queryFn: () => warrantyClaimsApi.getAll(),
    });
    const claimsArray = Array.isArray(data) ? data : (data?.items || []);

    const approveMutation = useMutation({
        mutationFn: async (id: string) => {
            // 1. Approve
            await warrantyClaimsApi.approve(id, {
                approvedBy: user?.id || "admin",
                approvedByName: user?.name || "Admin",
                approvedByRole: user?.role || "Admin",
            });
            // 2. Create Job
            const res = await warrantyClaimsApi.createJob(id, { createdBy: user?.id || "admin" });
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["warranty-claims"] });
            queryClient.invalidateQueries({ queryKey: ["job-tickets"] });
            toast.success("Claim approved and warranty job created");
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to approve claim");
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async (id: string) => {
            await warrantyClaimsApi.reject(id, {
                approvedBy: user?.id || "admin",
                approvedByName: user?.name || "Admin",
                approvedByRole: user?.role || "Admin",
                rejectionReason: "Rejected by admin", // Simple reject for now
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["warranty-claims"] });
            toast.success("Claim rejected");
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to reject claim");
        },
    });

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Claim ID</TableHead>
                        <TableHead>Original Job</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {claimsArray.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                No warranty claims found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        claimsArray.map((claim: any) => (
                            <TableRow key={claim.id}>
                                <TableCell className="font-mono text-xs">{claim.id.slice(0, 8)}</TableCell>
                                <TableCell>#{claim.originalJobId}</TableCell>
                                <TableCell className="capitalize">{claim.claimType}</TableCell>
                                <TableCell className="max-w-[200px] truncate">{claim.claimReason}</TableCell>
                                <TableCell>
                                    <Badge variant={
                                        claim.status === 'approved' ? 'default' :
                                            claim.status === 'rejected' ? 'destructive' :
                                                'secondary'
                                    }>
                                        {claim.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>{claim.claimedAt ? format(new Date(claim.claimedAt), "PP") : "N/A"}</TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {claim.status === 'pending' && (
                                                <>
                                                    <DropdownMenuItem onClick={() => approveMutation.mutate(claim.id)}>
                                                        <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                                        Approve & Create Job
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => rejectMutation.mutate(claim.id)}>
                                                        <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                                        Reject
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                            {claim.status === 'approved' && claim.newJobId && (
                                                <DropdownMenuItem disabled>
                                                    <ArrowRight className="mr-2 h-4 w-4" />
                                                    Job: #{claim.newJobId}
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
