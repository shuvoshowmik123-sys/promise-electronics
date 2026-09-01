/**
 * The push connection test bench.
 *
 * Temporary, super admin only, and off unless PUSH_TEST_CONSOLE is set on the
 * server. When the green signal comes this file, its route, the responder
 * component and server/routes/push-test.routes.ts all go together.
 *
 * The screen is ordered the way the diagnosis runs, not the way the feature
 * reads. Devices first: if nobody has registered, no ping can succeed and the
 * send button is a trap that will report a failure the phone never caused.
 * Only then the ping, then what came back.
 *
 * Desktop only by request — the person running the test is at a desk with the
 * phone in their other hand.
 */

import { useEffect, useState, useCallback } from "react";
import {
    Smartphone, Send, RefreshCw, CheckCircle2, XCircle, Clock, Eye,
    AlertTriangle, ShieldAlert, Loader2, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { fetchApi } from "@/lib/api/httpClient";
import { cn } from "@/lib/utils";

type Device = {
    tokenId: string;
    tokenTail: string;
    platform: string;
    registeredAt: string | null;
    lastUsedAt: string | null;
};

type RegistrationReport = {
    at: number;
    stage: "permission-denied" | "no-token" | "register-failed" | "registered";
    detail: string | null;
    explanation: string | null;
};

type Person = {
    userId: string;
    username: string;
    fullName: string;
    role: string;
    devices: Device[];
    /** Why the app failed to register, when it tried and failed. */
    lastRegistration: RegistrationReport | null;
};

type Ping = {
    id: string;
    userId: string;
    username: string;
    platform: string;
    tokenTail: string;
    sentAt: number;
    sentBy: string;
    state: "accepted" | "replied" | "opened" | "failed";
    messageId: string | null;
    errorCode: string | null;
    error: string | null;
    repliedAt: number | null;
    openedAt: number | null;
    roundTripMs: number | null;
    title: string;
    body: string;
    explanation: string | null;
};

function timeAgo(iso: string | null): string {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return "—";
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

/**
 * What each state means, said once, in the place someone reads it.
 *
 * "Accepted" is the one that misleads. It looks like success and is only the
 * absence of an immediate failure, so it is coloured as a waiting state rather
 * than a passing one.
 */
const STATE_META: Record<Ping["state"], { label: string; hint: string; className: string; icon: typeof Clock }> = {
    accepted: {
        label: "Waiting for the phone",
        hint: "Firebase took the message. The device has not answered yet — that proves the credential and the token, and nothing about delivery.",
        className: "bg-amber-50 text-amber-700 ring-amber-200",
        icon: Clock,
    },
    replied: {
        label: "Connected",
        hint: "The app answered by itself. Delivery to this device is proven.",
        className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        icon: CheckCircle2,
    },
    opened: {
        label: "Seen on the phone",
        hint: "Someone tapped the notification. It reached the screen — the strongest result there is.",
        className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        icon: Eye,
    },
    failed: {
        label: "Rejected",
        hint: "Firebase refused it outright. The reason is below.",
        className: "bg-rose-50 text-rose-700 ring-rose-200",
        icon: XCircle,
    },
};

export default function PushTestPage() {
    const { user } = useAdminAuth();
    const [people, setPeople] = useState<Person[]>([]);
    const [totals, setTotals] = useState({ people: 0, withDevice: 0, devices: 0 });
    const [firebaseReady, setFirebaseReady] = useState(true);
    const [pings, setPings] = useState<Ping[]>([]);
    const [loading, setLoading] = useState(true);
    const [unavailable, setUnavailable] = useState(false);
    const [sendingFor, setSendingFor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState("Connection test");
    const [body, setBody] = useState("Tap this to confirm your app is connected.");

    const loadDevices = useCallback(async () => {
        try {
            const data = await fetchApi<{ users: Person[]; totals: typeof totals; firebaseReady: boolean }>(
                "/admin/push-test/devices",
            );
            setPeople(data.users);
            setTotals(data.totals);
            setFirebaseReady(data.firebaseReady);
            setUnavailable(false);
        } catch (err) {
            // A 404 here is the switch being off, which is a normal state and
            // not an error worth alarming anyone with.
            if (/404|not found/i.test((err as Error)?.message || "")) setUnavailable(true);
            else setError((err as Error)?.message || "Could not load devices.");
        } finally {
            setLoading(false);
        }
    }, []);

    const loadResults = useCallback(async () => {
        try {
            const data = await fetchApi<{ pings: Ping[] }>("/admin/push-test/results");
            setPings(data.pings);
        } catch {
            /* the devices call already reports an outage */
        }
    }, []);

    useEffect(() => { loadDevices(); loadResults(); }, [loadDevices, loadResults]);

    /**
     * Poll while a ping is outstanding.
     *
     * The reply arrives at the server, not here, so this screen has no way to
     * learn about it except by asking. Three seconds is short enough that a
     * healthy round trip looks immediate and long enough not to hammer a small
     * instance; it stops entirely once nothing is waiting.
     */
    useEffect(() => {
        const waiting = pings.some((p) => p.state === "accepted");
        if (!waiting) return;
        const t = setInterval(loadResults, 3000);
        return () => clearInterval(t);
    }, [pings, loadResults]);

    const ping = async (person: Person) => {
        setSendingFor(person.userId);
        setError(null);
        try {
            await fetchApi("/admin/push-test/ping", {
                method: "POST",
                body: JSON.stringify({ userId: person.userId, title, body }),
            });
            await loadResults();
        } catch (err) {
            setError((err as Error)?.message || "The ping could not be sent.");
        } finally {
            setSendingFor(null);
        }
    };

    if (user?.role !== "Super Admin") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
                <div className="flex max-w-sm items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                    <p className="text-sm text-slate-600">This page is for super admins.</p>
                </div>
            </div>
        );
    }

    if (unavailable) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
                <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6">
                    <h1 className="text-base font-bold text-slate-900">The test bench is switched off</h1>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
                        Set <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">PUSH_TEST_CONSOLE=on</code>{" "}
                        in the server environment and restart it. It stays off by default so it cannot be
                        left running by accident.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 p-6 lg:p-10">
            <div className="mx-auto w-full max-w-6xl space-y-6">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                            <Radio size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold leading-tight text-slate-900">
                                Push connection test
                            </h1>
                            <p className="mt-0.5 text-[13px] text-slate-500">
                                Ping one person's phone and see whether it answers. Temporary — remove after sign-off.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { loadDevices(); loadResults(); }} className="gap-1.5">
                        <RefreshCw size={14} /> Refresh
                    </Button>
                </header>

                {!firebaseReady && (
                    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                        <div className="text-[13px] leading-relaxed text-rose-900">
                            <strong>Firebase is not initialised on this server.</strong> No push can be sent
                            from here at all. Nothing about the phones can be tested until the server's
                            Firebase credential is in place.
                        </div>
                    </div>
                )}

                {error && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-900">
                        {error}
                    </div>
                )}

                {/*
                  * Registration before sending, because this is where the answer
                  * usually is. Zero registered devices means every ping will fail
                  * for a reason that has nothing to do with notifications.
                  */}
                <section className="grid gap-3 sm:grid-cols-3">
                    {[
                        { label: "Staff accounts", value: totals.people },
                        { label: "With the app installed", value: totals.withDevice },
                        { label: "Registered devices", value: totals.devices },
                    ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
                            <p className="text-[12px] font-medium text-slate-500">{s.label}</p>
                            <p className={cn(
                                "mt-1 text-2xl font-bold tabular-nums",
                                s.label !== "Staff accounts" && s.value === 0 ? "text-rose-600" : "text-slate-900",
                            )}>
                                {s.value}
                            </p>
                        </div>
                    ))}
                </section>

                {totals.devices === 0 && !loading && (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        <div className="text-[13px] leading-relaxed text-amber-900">
                            <strong>No device has ever registered.</strong> A device registers the moment
                            someone signs into the installed Android app and allows notifications — not from
                            a browser. Until one appears here there is nothing to ping, and that is the
                            result, not a fault.
                        </div>
                    </div>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
                        <div className="min-w-[180px] flex-1">
                            <label className="mb-1 block text-[12px] font-semibold text-slate-600">Title</label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
                        </div>
                        <div className="min-w-[260px] flex-[2]">
                            <label className="mb-1 block text-[12px] font-semibold text-slate-600">Message</label>
                            <Input value={body} onChange={(e) => setBody(e.target.value)} className="h-9" />
                        </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {loading && (
                            <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" /> Loading staff…
                            </div>
                        )}
                        {!loading && people.map((p) => {
                            const has = p.devices.length > 0;
                            return (
                                <div key={p.userId} className="flex flex-wrap items-center gap-4 p-4">
                                    <div className="min-w-[200px] flex-1">
                                        <p className="text-[14px] font-semibold text-slate-900">{p.fullName}</p>
                                        <p className="text-[12px] text-slate-500">{p.username} · {p.role}</p>
                                    </div>

                                    <div className="min-w-[240px] flex-1">
                                        {has ? (
                                            <div className="space-y-1">
                                                {p.devices.map((d) => (
                                                    <div key={d.tokenId} className="flex items-center gap-2 text-[12px] text-slate-600">
                                                        <Smartphone size={13} className="shrink-0 text-slate-400" />
                                                        <span className="font-medium capitalize">{d.platform}</span>
                                                        <code className="text-[11px] text-slate-400">{d.tokenTail}</code>
                                                        <span className="text-slate-400">· seen {timeAgo(d.lastUsedAt)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : p.lastRegistration && p.lastRegistration.stage !== "registered" ? (
                                            /*
                                              * The app tried and failed, and said why.
                                              * This is the line that turns "no device
                                              * registered" from a dead end into a fix.
                                              */
                                            <div className="rounded-lg bg-rose-50 px-3 py-2">
                                                <p className="text-[12px] font-semibold text-rose-900">
                                                    Registration failed on the phone
                                                </p>
                                                <p className="mt-0.5 text-[12px] leading-relaxed text-rose-800">
                                                    {p.lastRegistration.explanation}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-[12px] text-slate-400">
                                                No device — has not signed into the app,
                                                or is running a build older than v1.0.3
                                            </p>
                                        )}
                                    </div>

                                    <Button
                                        size="sm"
                                        disabled={!has || sendingFor === p.userId || !firebaseReady}
                                        onClick={() => ping(p)}
                                        className="gap-1.5 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40"
                                    >
                                        {sendingFor === p.userId
                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            : <Send className="h-3.5 w-3.5" />}
                                        Ping
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <h2 className="text-[14px] font-bold text-slate-900">Results</h2>
                        <p className="text-[12px] text-slate-400">
                            Kept in memory — cleared when the server restarts
                        </p>
                    </div>

                    {pings.length === 0 ? (
                        <p className="p-8 text-center text-[13px] text-slate-400">
                            Nothing sent yet.
                        </p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {pings.map((p) => {
                                const meta = STATE_META[p.state];
                                const Icon = meta.icon;
                                return (
                                    <div key={p.id} className="p-4">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1",
                                                meta.className,
                                            )}>
                                                <Icon size={13} />
                                                {meta.label}
                                            </span>
                                            <span className="text-[13px] font-semibold text-slate-900">{p.username}</span>
                                            <code className="text-[11px] text-slate-400">{p.tokenTail}</code>
                                            {p.roundTripMs !== null && (
                                                <span className="text-[12px] font-semibold text-emerald-700 tabular-nums">
                                                    answered in {(p.roundTripMs / 1000).toFixed(1)}s
                                                </span>
                                            )}
                                            <span className="ml-auto text-[12px] text-slate-400">
                                                {new Date(p.sentAt).toLocaleTimeString()}
                                            </span>
                                        </div>

                                        <p className="mt-2 text-[12px] leading-relaxed text-slate-500">{meta.hint}</p>

                                        {p.explanation && (
                                            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] leading-relaxed text-rose-900">
                                                {p.explanation}
                                            </p>
                                        )}
                                        {p.error && !p.explanation && (
                                            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
                                                <code>{p.errorCode}</code> — {p.error}
                                            </p>
                                        )}
                                        {p.messageId && (
                                            <p className="mt-1.5 text-[11px] text-slate-400">
                                                Firebase id <code>{p.messageId}</code>
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
