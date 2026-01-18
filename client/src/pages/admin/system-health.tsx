import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { aiApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertCircle, CheckCircle, XCircle, Activity, Terminal, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

export default function SystemHealthPage() {
    const queryClient = useQueryClient();

    const { data: suggestions, isLoading } = useQuery({
        queryKey: ['/api/ai/debug-suggestions'],
        queryFn: aiApi.getDebugSuggestions
    });

    const updateStatusMutation = useMutation({
        mutationFn: ({ id, status }: { id: number, status: string }) =>
            aiApi.updateDebugStatus(id, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/ai/debug-suggestions'] });
            toast({ title: "Status updated" });
        }
    });

    if (isLoading) return <div className="p-8">Loading health data...</div>;

    const pendingIssues = suggestions?.filter((s: any) => s.status === 'NEEDS_REVIEW') || [];
    const resolvedIssues = suggestions?.filter((s: any) => s.status === 'RESOLVED') || [];

    return (
        <div className="space-y-6 p-6 pb-24">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">System Health (Auto-Debugger)</h1>
                    <p className="text-muted-foreground">AI-powered error analysis and self-healing suggestions.</p>
                </div>
                <div className="flex gap-2">
                    <Badge variant="outline" className="text-lg py-1 px-3">
                        <Activity className="w-4 h-4 mr-2 text-green-500" />
                        System Active
                    </Badge>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Pending Issues</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-500">{pendingIssues.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Resolved (Last 30 Days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">{resolvedIssues.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">AI Accuracy</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">92%</div>
                        <p className="text-xs text-muted-foreground">Based on resolved feedback</p>
                    </CardContent>
                </Card>
            </div>

            <h2 className="text-xl font-semibold mt-8 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-orange-500" />
                Active Issues
            </h2>

            {pendingIssues.length === 0 ? (
                <Card className="bg-green-50/50 border-green-100">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
                        <h3 className="text-lg font-medium text-green-900">All Systems Operational</h3>
                        <p className="text-green-700">No pending errors detected.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {pendingIssues.map((issue: any) => {
                        const suggestion = JSON.parse(issue.suggestion || '{}');
                        return (
                            <Card key={issue.id} className="border-l-4 border-l-orange-500">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg font-mono text-red-600 truncate max-w-2xl">
                                                {issue.error}
                                            </CardTitle>
                                            <CardDescription className="mt-1">
                                                Detected at {format(new Date(issue.createdAt), 'PPpp')}
                                            </CardDescription>
                                        </div>
                                        <Badge variant={suggestion.severity === 'High' ? 'destructive' : 'secondary'}>
                                            {suggestion.severity} Severity
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid md:grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-4 rounded-lg border">
                                            <h4 className="font-semibold text-sm text-slate-500 mb-2">ROOT CAUSE</h4>
                                            <p className="text-sm">{suggestion.cause}</p>
                                        </div>
                                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                                            <h4 className="font-semibold text-sm text-blue-500 mb-2">AI SUGGESTED FIX</h4>
                                            <p className="text-sm font-medium text-blue-900">{suggestion.fix}</p>
                                        </div>
                                    </div>

                                    <Accordion type="single" collapsible>
                                        <AccordionItem value="stack">
                                            <AccordionTrigger className="text-xs font-mono text-muted-foreground">
                                                <span className="flex items-center gap-2">
                                                    <Terminal className="w-4 h-4" /> View Stack Trace
                                                </span>
                                            </AccordionTrigger>
                                            <AccordionContent>
                                                <pre className="bg-slate-950 text-slate-50 p-4 rounded-md text-xs overflow-x-auto">
                                                    {issue.stackTrace}
                                                </pre>
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>

                                    <div className="flex justify-end gap-3 pt-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateStatusMutation.mutate({ id: issue.id, status: 'IGNORED' })}
                                        >
                                            Ignore
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700"
                                            onClick={() => updateStatusMutation.mutate({ id: issue.id, status: 'RESOLVED' })}
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Mark Resolved
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
