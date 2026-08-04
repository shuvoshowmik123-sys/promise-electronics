import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Lock } from "lucide-react";

import { fetchApi } from "@/lib/api/httpClient";

/**
 * The place the handover code lives on the customer's tracking screen.
 *
 * It is deliberately present before any code exists. A blank space that appears
 * out of nowhere the moment a driver arrives is confusing; a space that explains
 * itself in advance means the customer already knows what will happen and why,
 * and is not being asked to trust an unexplained number from a stranger at their
 * door.
 *
 * There is no "generate" action here on purpose. The customer cannot ask for a
 * code — one exists only after a staff member or driver has issued it while
 * standing in front of them. That is what the code proves. Letting either side
 * conjure one on demand would remove the control entirely.
 */

type HandoverCode =
    | { active: false }
    | { active: true; code: string; action: "receive" | "delivery"; expiresAt: string };

function useCountdown(expiresAt?: string) {
    const [remaining, setRemaining] = useState<number>(0);
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return { remaining, label: `${mins}:${String(secs).padStart(2, "0")}` };
}

export function HandoverCodeCard({ serviceRequestId }: { serviceRequestId: string }) {
    const { data } = useQuery<HandoverCode>({
        queryKey: ["handover-code", serviceRequestId],
        queryFn: () => fetchApi<HandoverCode>(`/customer/service-requests/${serviceRequestId}/handover-code`),
        // A code appears without warning when a driver arrives, and lives for
        // five minutes. Polling is what makes it show up without the customer
        // needing to reload while someone waits at the door.
        refetchInterval: 15_000,
        enabled: !!serviceRequestId,
    });

    const active = data?.active === true ? data : null;
    const { remaining, label } = useCountdown(active?.expiresAt);

    if (active && remaining > 0) {
        const isDelivery = active.action === "delivery";
        return (
            <div
                className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-5"
                data-testid="handover-code-active"
            >
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                    <p className="text-sm font-bold text-emerald-800">
                        {isDelivery ? "Confirm your delivery" : "Confirm the collection"}
                    </p>
                </div>

                <p className="mt-3 text-center font-mono text-4xl font-black tracking-[0.3em] text-slate-950">
                    {active.code}
                </p>

                <p className="mt-3 text-center text-sm leading-6 text-slate-700">
                    Read this code to our staff member now. It confirms that{" "}
                    {isDelivery ? "you received your TV" : "you handed over your TV"}.
                </p>
                <p className="mt-2 text-center text-xs font-semibold text-emerald-700">
                    Expires in {label}
                </p>
                <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">
                    Only share it with the person physically in front of you. Never read it out
                    over the phone.
                </p>
            </div>
        );
    }

    // The explained empty state — the reason this card exists before a code does.
    return (
        <div
            className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5"
            data-testid="handover-code-waiting"
        >
            <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-sm font-bold text-slate-700">Handover code</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
                When our staff member arrives to collect or return your TV, a 6-digit code will
                appear here.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
                Read it to them to confirm the handover. It is how we make sure your TV is only
                given to — or collected by — the right person.
            </p>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
                You do not need to do anything now. There is nothing to request; the code appears
                by itself at the right moment.
            </p>
        </div>
    );
}

export default HandoverCodeCard;
