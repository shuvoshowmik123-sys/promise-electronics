/**
 * "We already have this" — shown at the top of the service request form.
 *
 * Autofill the customer cannot see is indistinguishable from a form that lost
 * their answers, so everything carried over from the fault simulator is listed
 * here with a tick before they are asked for anything else.
 *
 * It doubles as the confirmation. If a value came across wrong — the model
 * number said Samsung and they had picked LG — they see it here, before it
 * becomes a ticket, rather than after a van has been sent.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTaka, type CarriedAnswers } from "@/lib/carried-answers";

export interface CarriedAnswersStripProps {
    carried: CarriedAnswers;
    /** Jumps to the first thing we could not fill in for them. */
    onContinue: () => void;
    bn?: boolean;
    className?: string;
}

export function CarriedAnswersStrip({ carried, onContinue, bn, className }: CarriedAnswersStripProps) {
    const L = (en: string, bnText: string) => (bn ? bnText : en);

    const facts = [
        carried.detail ?? carried.issue,
        carried.brand,
        carried.size,
        carried.model,
    ].filter(Boolean) as string[];

    if (facts.length === 0) return null;

    return (
        <div className={cn("rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4", className)}>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                {L("From your estimate", "আপনার হিসাব থেকে")}
            </p>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
                {facts.map((f) => (
                    <span key={f}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[12px] font-bold text-emerald-900">
                        <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                        {f}
                    </span>
                ))}
            </div>

            {carried.estimate && (
                <p className="mt-2.5 text-[12px] font-semibold text-emerald-900">
                    {L("Estimate shown: ", "দেখানো হিসাব: ")}
                    <b>{formatTaka(carried.estimate[0])} – {formatTaka(carried.estimate[1])}</b>
                    <span className="font-medium text-emerald-700/80">
                        {L(" — before inspection", " — পরীক্ষার আগে")}
                    </span>
                </p>
            )}

            <button
                type="button" onClick={onContinue}
                className="mt-3 w-full rounded-xl bg-emerald-700 py-3 text-[13.5px] font-bold text-white shadow-sm transition hover:bg-emerald-800"
            >
                {L("Looks right — continue →", "ঠিক আছে — এগিয়ে যান →")}
            </button>
            <p className="mt-2 text-center text-[10.5px] leading-snug text-emerald-800/70">
                {/* Nothing is locked. If we carried something across wrongly, the
                    customer has to be able to correct it where it sits. */}
                {L("Anything wrong? Change it on the step below.",
                   "কিছু ভুল থাকলে নিচের ধাপে বদলে নিন।")}
            </p>
        </div>
    );
}
