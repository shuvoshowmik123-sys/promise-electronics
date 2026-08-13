/**
 * Setting a password on an account the shop already made for you.
 *
 * The situation this exists for: the shop books a repair at the counter and
 * creates a customer record to hang it on. The customer later comes to the
 * portal and finds three closed doors — register says the number is already on
 * a repair, login says the password is wrong when there is no password, and
 * recovery files a ticket somebody has to notice. All three are telling the
 * truth about different things and none of them helps.
 *
 * The code is issued by a staff member in the admin panel and read to the
 * customer they are already speaking to. It never leaves this system — no SMS,
 * no email — which is the same rule the custody handover code follows.
 *
 * So there is no "send me a code" button here. Asking for one would mean an
 * endpoint that answers "does this number have an account", and there is
 * nothing to gain from owning that question.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { customerAuthApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export function AccountSetupPanel({
    compact = false,
    initialPhone = "",
    onDone,
}: {
    compact?: boolean;
    /** Prefilled when they have just been turned away from registration. */
    initialPhone?: string;
    onDone?: () => void;
}) {
    const [phone, setPhone] = useState(initialPhone);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);

    const complete = useMutation({
        mutationFn: () => customerAuthApi.completeAccountSetup({
            phone: `+880${phone.replace(/\D/g, "")}`,
            code,
            password,
        }),
        onSuccess: () => {
            // Straight in. They have just proved the code and chosen a
            // password; sending them back to the login form to type it again
            // returns them to the screen they were stuck on.
            onDone ? onDone() : window.location.assign("/");
        },
        onError: (e: any) => setError(e?.message || "That code did not work."),
    });

    return (
        <div className={cn(
            "rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4",
            compact && "p-3",
        )}>
            <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 shrink-0 text-emerald-700" />
                <p className="text-sm font-black text-slate-950">Set up your account</p>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
                If we have repaired something for you, your account already exists — it just has no
                password yet. Call or visit the shop and we will give you a 6-digit setup code.
            </p>

            <form
                className="mt-3 space-y-2"
                onSubmit={(e) => { e.preventDefault(); setError(null); complete.mutate(); }}
            >
                <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">Your phone number</Label>
                <PhoneInput
                    value={phone}
                    onChange={(e: any) => setPhone(e.target.value)}
                    placeholder="1XXXXXXXXX"
                    className="h-12 rounded-2xl"
                />

                <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">Setup code from the shop</Label>
                <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    className="h-12 rounded-2xl text-center font-mono text-lg tracking-[0.4em]"
                />

                <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">Choose a password</Label>
                <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    className="h-12 rounded-2xl"
                />

                <Button
                    type="submit"
                    disabled={complete.isPending || phone.replace(/\D/g, "").length !== 10 || code.length !== 6 || password.length < 6}
                    className="h-11 w-full rounded-2xl"
                >
                    {complete.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Set password and sign in
                </Button>
            </form>

            {error && <p className="mt-2 text-[11px] font-semibold text-rose-600">{error}</p>}
        </div>
    );
}
