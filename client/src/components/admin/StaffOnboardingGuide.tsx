import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, ChevronRight, ChevronLeft, Check, Truck, Wrench, Receipt, ClipboardList, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { accountApi } from "@/lib/api/adminApi";

interface GuideStep {
    title: string;
    description: string;
}

const ROLE_GUIDES: Record<string, { Icon: LucideIcon; color: string; steps: GuideStep[] }> = {
    Driver: {
        Icon: Truck,
        color: "bg-blue-600",
        steps: [
            { title: "Check In", description: "Start your day by tapping Shift in the bottom dock and pressing Check In. Start your day from Shift so attendance and duty records stay correct." },
            { title: "Today's Tasks", description: "Your Pickup tab shows today's pickup and delivery tasks. Each card shows customer name, address, zone, and time window." },
            { title: "Navigate & Call", description: "Tap a task to see the full address. Use the call button to contact the customer before arrival." },
            { title: "OTP & Failed Attempts", description: "Enter the customer's one-time code to confirm handover. If no one is home, mark the task as Failed with a reason." },
        ],
    },
    Technician: {
        Icon: Wrench,
        color: "bg-indigo-600",
        steps: [
            { title: "Check In", description: "Start your day by tapping Shift in the bottom dock and pressing Check In. Start your day from Shift so attendance and duty records stay correct." },
            { title: "Your Job Queue", description: "The Quick Workbench shows jobs assigned to you. Active repairs are sorted by priority — work top-down." },
            { title: "Device Details", description: "Each job shows the device type, model, serial number, and the customer's reported issue. Read them before starting." },
            { title: "Report Your Result", description: "After diagnosis, tap the outcome: Repair OK, Needs Parts, Not Repairable, or Customer Declined. Add clear notes." },
        ],
    },
    Cashier: {
        Icon: Receipt,
        color: "bg-emerald-600",
        steps: [
            { title: "Check In", description: "Start your day by tapping Shift in the bottom dock and pressing Check In. Start your day from Shift so attendance and duty records stay correct." },
            { title: "Point of Sale", description: "The POS screen is your workspace. Search products or scan barcodes to add items to the cart." },
            { title: "Link to Job", description: "Before billing a repair, tap Link Job to attach the sale to a job ticket. This keeps the repair history accurate." },
            { title: "Receipt & History", description: "After payment, the receipt is generated. Payment details sync to the repair journey so the customer can see them." },
        ],
    },
    Manager: {
        Icon: ClipboardList,
        color: "bg-violet-600",
        steps: [
            { title: "Check In", description: "Start your day by tapping Shift in the bottom dock and pressing Check In. Start your day from Shift so attendance and duty records stay correct." },
            { title: "Dashboard Overview", description: "Your dashboard shows active service requests, job counts, and pending actions. Check it at the start of each day." },
            { title: "Assign & Monitor", description: "Open Jobs to assign technicians, set priorities, and track progress. Filter by status to find blocked work." },
            { title: "Attendance Review", description: "Check Staff Attendance under People & Staff for full team logs. Follow up with Customer Repair Journeys for any pending customer queries." },
        ],
    },
};

function needsOnboarding(user: any): boolean {
    if (!user) return false;
    if (user.role === "Super Admin") return false;
    if (!ROLE_GUIDES[user.role]) return false;
    try {
        const prefs = typeof user.preferences === "string" ? JSON.parse(user.preferences || "{}") : (user.preferences || {});
        if (prefs.staffOnboarding?.completed === true) return false;
    } catch { /* show guide if prefs are broken */ }
    return true;
}

export function StaffOnboardingGuide() {
    const { user, refreshUser } = useAdminAuth();
    const [step, setStep] = useState(0);
    const [dismissed, setDismissed] = useState(false);

    const completeMutation = useMutation({
        mutationFn: accountApi.completeOnboarding,
        onSuccess: () => refreshUser(),
    });

    if (dismissed || !needsOnboarding(user)) return null;

    const guide = ROLE_GUIDES[user!.role];
    if (!guide) return null;

    const { Icon, color, steps } = guide;
    const current = steps[step];
    const isLast = step === steps.length - 1;

    const finish = () => {
        setDismissed(true);
        completeMutation.mutate();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className={`${color} px-5 py-4 text-white flex items-center justify-between`}>
                    <div className="flex items-center gap-2.5">
                        <Icon className="h-5 w-5" />
                        <span className="text-sm font-black uppercase tracking-wider">{user!.role} Guide</span>
                    </div>
                    <button onClick={finish} className="rounded-full p-1 hover:bg-white/20 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Progress */}
                <div className="flex gap-1 px-5 pt-4">
                    {steps.map((_, i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-blue-500" : "bg-slate-200"}`} />
                    ))}
                </div>

                {/* Content */}
                <div className="px-5 py-5 min-h-[140px]">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Step {step + 1} of {steps.length}</p>
                    <h3 className="text-lg font-black text-slate-900">{current.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{current.description}</p>
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={finish} className="text-xs text-slate-400 hover:text-slate-600">
                        Skip Guide
                    </Button>
                    <div className="flex gap-2">
                        {step > 0 && (
                            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="rounded-lg h-9 px-3">
                                <ChevronLeft className="h-4 w-4 mr-1" /> Back
                            </Button>
                        )}
                        {isLast ? (
                            <Button size="sm" onClick={finish} className="rounded-lg h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                <Check className="h-4 w-4 mr-1" /> Got It
                            </Button>
                        ) : (
                            <Button size="sm" onClick={() => setStep(step + 1)} className="rounded-lg h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                Next <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
