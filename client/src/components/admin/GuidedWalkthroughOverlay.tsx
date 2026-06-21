import { useEffect } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GuidedWalkthroughStep = {
    title: string;
    body: string;
    targetLabel: string;
    targetMeta?: string;
    placement?: "top" | "middle" | "bottom";
};

interface GuidedWalkthroughOverlayProps {
    open: boolean;
    title: string;
    safeLabel: string;
    steps: GuidedWalkthroughStep[];
    activeStep: number;
    onStepChange: (step: number) => void;
    onClose: () => void;
    onFinish?: () => void;
    nextLabel: string;
    backLabel: string;
    closeLabel: string;
    finishLabel: string;
    stepLabel: string;
    ofLabel: string;
}

export function GuidedWalkthroughOverlay({
    open,
    title,
    safeLabel,
    steps,
    activeStep,
    onStepChange,
    onClose,
    onFinish,
    nextLabel,
    backLabel,
    closeLabel,
    finishLabel,
    stepLabel,
    ofLabel,
}: GuidedWalkthroughOverlayProps) {
    const step = steps[activeStep] ?? steps[0];
    const isLast = activeStep >= steps.length - 1;

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowRight" && !isLast) onStepChange(activeStep + 1);
            if (event.key === "ArrowLeft" && activeStep > 0) onStepChange(activeStep - 1);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeStep, isLast, onClose, onStepChange, open]);

    if (!open || !step) return null;

    return (
        <div className="fixed inset-0 z-[120] bg-slate-950/70 px-3 py-[calc(1rem+env(safe-area-inset-top))] backdrop-blur-sm md:px-6">
            <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/20 bg-[#f8fafc] shadow-2xl md:grid md:grid-cols-[1fr_380px]">
                <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-900">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />
                    <div className="relative flex h-full items-center justify-center p-4 md:p-8">
                        <div className="relative h-full max-h-[620px] w-full max-w-[390px] rounded-[2rem] border border-white/15 bg-white/95 p-4 shadow-2xl md:max-w-[520px]">
                            <div className="mb-4 flex items-center justify-between">
                                <div className="h-3 w-20 rounded-full bg-slate-200" />
                                <div className="h-8 w-8 rounded-full bg-emerald-100" />
                            </div>
                            <div className="space-y-3">
                                <div className="h-16 rounded-2xl bg-slate-100" />
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="h-20 rounded-2xl bg-blue-50" />
                                    <div className="h-20 rounded-2xl bg-emerald-50" />
                                </div>
                                <MockTarget step={step} index={activeStep} />
                                <div className="h-20 rounded-2xl bg-slate-100" />
                                <div className="h-24 rounded-2xl bg-slate-100" />
                            </div>
                        </div>
                    </div>
                </div>

                <aside className="flex max-h-[54dvh] flex-col border-t border-slate-200 bg-white md:max-h-none md:border-l md:border-t-0">
                    <div className="flex-none border-b border-slate-100 px-4 py-3 md:px-5 md:py-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-700">
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    {safeLabel}
                                </div>
                                <h2 className="mt-2 text-lg font-black leading-tight text-slate-950">{title}</h2>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 active:scale-95"
                                aria-label={closeLabel}
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <span className="text-xs font-black uppercase text-slate-400">
                                {stepLabel} {activeStep + 1} {ofLabel} {steps.length}
                            </span>
                            <div className="flex gap-1">
                                {steps.map((item, index) => (
                                    <button
                                        key={`${item.title}-${index}`}
                                        type="button"
                                        onClick={() => onStepChange(index)}
                                        className={cn(
                                            "h-2 rounded-full transition-all",
                                            index === activeStep ? "w-7 bg-emerald-600" : "w-2 bg-slate-200",
                                        )}
                                        aria-label={`${stepLabel} ${index + 1}`}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-600 shadow-sm">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <h3 className="text-xl font-black leading-tight text-slate-950">{step.title}</h3>
                            <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{step.body}</p>
                            <div className="mt-4 rounded-2xl border border-emerald-100 bg-white px-3 py-2">
                                <p className="text-xs font-black uppercase text-emerald-700">{step.targetLabel}</p>
                                {step.targetMeta && <p className="mt-1 text-xs font-medium text-slate-500">{step.targetMeta}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="flex-none border-t border-slate-100 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:px-5 md:pb-5">
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onStepChange(Math.max(0, activeStep - 1))}
                                disabled={activeStep === 0}
                                className="h-11 rounded-2xl border-slate-200 bg-white"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                {backLabel}
                            </Button>
                            <Button
                                type="button"
                                onClick={() => isLast ? (onFinish ? onFinish() : onClose()) : onStepChange(activeStep + 1)}
                                className="h-11 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                                {isLast ? finishLabel : nextLabel}
                                {!isLast && <ArrowRight className="ml-2 h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function MockTarget({ step, index }: { step: GuidedWalkthroughStep; index: number }) {
    return (
        <div className={cn(
            "relative rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-3 shadow-[0_0_0_999px_rgba(15,23,42,0.08)]",
            step.placement === "top" && "mt-0",
            step.placement === "middle" && "mt-8",
            step.placement === "bottom" && "mt-16",
        )}>
            <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white shadow-lg">
                {index + 1}
            </span>
            <div className="h-3 w-28 rounded-full bg-emerald-200" />
            <div className="mt-3 h-2 w-full rounded-full bg-white" />
            <div className="mt-2 h-2 w-2/3 rounded-full bg-white" />
            <p className="mt-3 text-xs font-black text-emerald-800">{step.targetLabel}</p>
        </div>
    );
}
