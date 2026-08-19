/**
 * Where a staff member sets a new password from a link a Super Admin gave them.
 *
 * The link is checked before the form appears, so somebody who was handed an
 * expired one is told immediately rather than typing a password twice and then
 * being refused. An expired link is an ordinary event — thirty minutes is short
 * on purpose — so the screen says how to get another instead of treating it as
 * an error.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";

type State = "checking" | "invalid" | "ready" | "saving" | "done";

export default function AdminResetPasswordPage() {
    usePageTitle("Set a new password");
    const [, navigate] = useLocation();

    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    const [state, setState] = useState<State>("checking");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) { setState("invalid"); return; }
        // Checked before the form is shown: better to say "expired" now than
        // after somebody has typed a password twice.
        fetch("/api/admin/reset-link/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
        })
            .then((r) => r.json())
            .then((d) => setState(d?.valid ? "ready" : "invalid"))
            .catch(() => setState("invalid"));
    }, [token]);

    const submit = async () => {
        setError(null);
        if (password !== confirm) { setError("The two passwords do not match."); return; }
        if (password.length < 8) { setError("Use at least 8 characters."); return; }

        setState("saving");
        try {
            const res = await fetch("/api/admin/reset-link/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password, confirmPassword: confirm }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data?.error || "Could not set the password.");
                setState("ready");
                return;
            }
            setState("done");
        } catch {
            setError("Could not reach the server. Please try again.");
            setState("ready");
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900">
                    <KeyRound className="h-6 w-6 text-white" />
                </div>

                {state === "checking" && (
                    <p className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Checking the link…
                    </p>
                )}

                {state === "invalid" && (
                    /* An expired link is normal, not a failure. Say what to do. */
                    <div className="mt-6 text-center">
                        <XCircle className="mx-auto h-8 w-8 text-red-500" />
                        <h1 className="mt-3 text-lg font-black text-slate-900">This link no longer works</h1>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            Reset links last 30 minutes and can only be used once. Ask an
                            administrator to send you a new one.
                        </p>
                        <Button variant="outline" className="mt-5 h-11 w-full rounded-xl"
                            onClick={() => navigate("/admin/login")}>
                            Back to sign in
                        </Button>
                    </div>
                )}

                {state === "done" && (
                    <div className="mt-6 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                        <h1 className="mt-3 text-lg font-black text-slate-900">Password changed</h1>
                        <p className="mt-2 text-sm text-slate-600">
                            You can sign in with your new password now.
                        </p>
                        <Button className="mt-5 h-11 w-full rounded-xl"
                            onClick={() => navigate("/admin/login")}>
                            Sign in
                        </Button>
                    </div>
                )}

                {(state === "ready" || state === "saving") && (
                    <div className="mt-6">
                        <h1 className="text-center text-lg font-black text-slate-900">Set a new password</h1>
                        <p className="mt-1 text-center text-xs text-slate-500">
                            This link works once, and expires 30 minutes after it was made.
                        </p>

                        <div className="mt-5 space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-700">New password</Label>
                                <Input type="password" value={password} autoFocus
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-11 rounded-xl" />
                                <p className="text-[11px] text-slate-500">At least 8 characters.</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-bold text-slate-700">Type it again</Label>
                                <Input type="password" value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                                    className="h-11 rounded-xl" />
                            </div>
                        </div>

                        {error && (
                            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                                {error}
                            </p>
                        )}

                        <Button className="mt-5 h-11 w-full rounded-xl"
                            disabled={state === "saving" || !password || !confirm}
                            onClick={submit}>
                            {state === "saving"
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                                : "Set password"}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
