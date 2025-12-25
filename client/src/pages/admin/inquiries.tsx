import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, MessageSquare, Clock, Search } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Inquiry } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function InquiriesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState("");
    const [replyDialogOpen, setReplyDialogOpen] = useState(false);
    const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
    const [replyText, setReplyText] = useState("");

    const { data: inquiries = [], isLoading } = useQuery<Inquiry[]>({
        queryKey: ["inquiries"],
        queryFn: async () => {
            const res = await fetch("/api/inquiries");
            if (!res.ok) throw new Error("Failed to fetch inquiries");
            return res.json();
        },
    });

    const filteredInquiries = inquiries.filter(inquiry =>
        inquiry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inquiry.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inquiry.message.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, reply }: { id: string; status?: "Pending" | "Read" | "Replied", reply?: string }) => {
            const res = await fetch(`/api/inquiries/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, reply }),
            });
            if (!res.ok) throw new Error("Failed to update status");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["inquiries"] });
            toast({ title: "Updated successfully" });
            setReplyDialogOpen(false);
            setReplyText("");
            setSelectedInquiry(null);
        },
    });

    const handleReplyClick = (inquiry: Inquiry) => {
        setSelectedInquiry(inquiry);
        setReplyText(inquiry.reply || "");
        setReplyDialogOpen(true);
    };

    const submitReply = () => {
        if (!selectedInquiry) return;
        updateStatusMutation.mutate({
            id: selectedInquiry.id,
            status: "Replied",
            reply: replyText
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Pending": return "bg-yellow-100 text-yellow-800";
            case "Read": return "bg-blue-100 text-blue-800";
            case "Replied": return "bg-green-100 text-green-800";
            default: return "bg-gray-100 text-gray-800";
        }
    };

    if (isLoading) {
        return (
            <>
                <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            </>
        );
    }

    return (
        <>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Support Inquiries</h1>
                        <Badge variant="outline" className="text-sm mt-1">
                            Total: {filteredInquiries.length}
                        </Badge>
                    </div>
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search inquiries..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid gap-4">
                    {filteredInquiries.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-slate-500">
                                <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                                <p>No inquiries found matching your search</p>
                            </CardContent>
                        </Card>
                    ) : (
                        filteredInquiries.map((inquiry) => (
                            <Card key={inquiry.id}>
                                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base font-medium">
                                            {inquiry.name}
                                        </CardTitle>
                                        <p className="text-sm text-muted-foreground">
                                            {inquiry.phone}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge className={getStatusColor(inquiry.status)} variant="secondary">
                                            {inquiry.status}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {format(new Date(inquiry.createdAt), "PP p")}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="mt-2 text-sm text-slate-700 bg-slate-50 p-3 rounded-md">
                                        {inquiry.message}
                                    </div>

                                    {inquiry.reply && (
                                        <div className="mt-4 pl-4 border-l-2 border-primary/20">
                                            <p className="text-xs font-semibold text-primary mb-1">Reply:</p>
                                            <p className="text-sm text-slate-600">{inquiry.reply}</p>
                                        </div>
                                    )}

                                    <div className="mt-4 flex gap-2 justify-end">
                                        {inquiry.status === "Pending" && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => updateStatusMutation.mutate({ id: inquiry.id, status: "Read" })}
                                            >
                                                Mark as Read
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant={inquiry.status === "Replied" ? "outline" : "default"}
                                            onClick={() => handleReplyClick(inquiry)}
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            {inquiry.status === "Replied" ? "Edit Reply" : "Reply"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reply to Inquiry</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Message</Label>
                                <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-md max-h-32 overflow-y-auto">
                                    {selectedInquiry?.message}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Your Reply</Label>
                                <Textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type your reply here..."
                                    className="min-h-[100px]"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>Cancel</Button>
                            <Button onClick={submitReply} disabled={updateStatusMutation.isPending}>
                                {updateStatusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                Send Reply
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}
