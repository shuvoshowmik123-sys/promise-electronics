import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    jobId: string;
    aiPrediction: string;
    customerChatSummary: string;
}

export function TrainingFeedbackModal({ isOpen, onClose, jobId, aiPrediction, customerChatSummary }: Props) {
    const [step, setStep] = useState(1);
    const [wasAccurate, setWasAccurate] = useState<boolean | null>(null);
    const [actualIssue, setActualIssue] = useState('');
    const [feedbackNotes, setFeedbackNotes] = useState('');
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: async (data: any) => {
            await apiRequest('POST', '/api/ai/feedback', data);
        },
        onSuccess: () => {
            toast({ title: "Feedback saved", description: "Thank you for helping Daktar Vai learn!" });
            onClose();
        }
    });

    const handleSubmit = () => {
        if (wasAccurate === null) return;
        mutation.mutate({
            jobId,
            customerChatSummary,
            aiPrediction,
            wasAccurate,
            actualIssue: wasAccurate ? undefined : actualIssue,
            feedbackNotes: wasAccurate ? undefined : feedbackNotes,
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>AI Diagnosis Feedback</DialogTitle>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-4">
                        <div className="p-3 bg-blue-50 rounded-md text-sm">
                            <strong>AI Predicted:</strong> {aiPrediction}
                        </div>

                        <p className="font-medium">Was this diagnosis accurate?</p>

                        <div className="grid gap-3">
                            <Button variant="outline" className="h-auto p-4 justify-start gap-3 border-green-200 hover:bg-green-50" onClick={() => { setWasAccurate(true); setStep(2); }}>
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <div className="text-left">
                                    <div className="font-semibold">Yes, spot on!</div>
                                </div>
                            </Button>

                            <Button variant="outline" className="h-auto p-4 justify-start gap-3 border-red-200 hover:bg-red-50" onClick={() => { setWasAccurate(false); setStep(2); }}>
                                <XCircle className="w-5 h-5 text-red-600" />
                                <div className="text-left">
                                    <div className="font-semibold">No, it was wrong</div>
                                </div>
                            </Button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        {wasAccurate ? (
                            <div className="text-center py-4">
                                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                                <p>Great! Confirm to save.</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">What was the actual issue?</label>
                                    <Textarea
                                        value={actualIssue}
                                        onChange={e => setActualIssue(e.target.value)}
                                        placeholder="E.g. Backlight failure"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Why was AI wrong?</label>
                                    <Select value={feedbackNotes} onValueChange={setFeedbackNotes}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select reason" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="symptoms_poor">Customer described poorly</SelectItem>
                                            <SelectItem value="rare_issue">Rare issue</SelectItem>
                                            <SelectItem value="multiple_issues">Multiple issues</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}

                        <div className="flex gap-2 justify-end">
                            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                            <Button onClick={handleSubmit} disabled={mutation.isPending}>
                                {mutation.isPending ? "Saving..." : "Submit Feedback"}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
