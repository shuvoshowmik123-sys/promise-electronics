/**
 * About this app — what is installed, what is published, and what happens next.
 *
 * "Is it updating or not?" was a fair question with no way to answer it from
 * inside the app, which is the whole reason this screen exists. Everything an
 * automatic update does quietly, this shows plainly: the build running now, the
 * build available, whether anything has been downloaded and is waiting, and
 * when the app last looked.
 *
 * Two version numbers, not one, because they move independently. The **app
 * version** is the APK, which changes only when something native does and can
 * only be replaced by installing a file. The **panel version** is the web build
 * inside it, which updates itself. An app reporting 1.0.3 while running the
 * 1.0.5 panel is correct and normal, and impossible to explain without showing
 * both.
 *
 * Opening this screen changes nothing. Someone looking to see which version
 * they are on should not have that act start a four-megabyte download — so the
 * check is a button, and it says what it did.
 *
 * The installed app only; the router sends a browser away before this renders.
 * Every number here describes something a browser does not have — it fetches
 * the newest build on every page load, so there is no version to be behind on
 * and nothing to check.
 */

import { useCallback, useEffect, useState } from "react";
import {
    RefreshCw, CheckCircle2, Download, AlertTriangle, ArrowLeft,
    Smartphone, Loader2, ArrowUpCircle,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    getUpdateStatus,
    checkForWebBundleUpdate,
    applyStagedUpdateNow,
    isNewer,
    type UpdateStatus,
    type UpdateOutcome,
} from "@/lib/ota-self-hosted";

function whenText(ts: number | null): string {
    if (!ts) return "never";
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    return `${Math.round(hrs / 24)} day${Math.round(hrs / 24) === 1 ? "" : "s"} ago`;
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-700">{label}</p>
                {hint && <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{hint}</p>}
            </div>
            <p className="shrink-0 text-[13px] font-bold tabular-nums text-slate-900">{value}</p>
        </div>
    );
}

export default function AboutAppPage() {
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [outcome, setOutcome] = useState<UpdateOutcome | null>(null);
    const [checking, setChecking] = useState(false);
    const [applying, setApplying] = useState(false);

    const load = useCallback(async () => {
        setStatus(await getUpdateStatus());
    }, []);

    useEffect(() => { load(); }, [load]);

    const check = async () => {
        setChecking(true);
        setOutcome(null);
        try {
            const result = await checkForWebBundleUpdate();
            setOutcome(result);
            await load();
        } finally {
            setChecking(false);
        }
    };

    const applyNow = async () => {
        setApplying(true);
        try {
            // Reloads the app, so nothing after this line runs.
            await applyStagedUpdateNow();
        } catch {
            setApplying(false);
        }
    };

    const pending = status?.pending ?? null;
    const apkBehind =
        status?.latestApk && status.nativeVersion !== "—"
            ? isNewer(status.latestApk, status.nativeVersion)
            : false;

    return (
        <div className="min-h-screen bg-slate-100 px-4 py-8 sm:py-12">
            <div className="mx-auto w-full max-w-lg">
                <Link
                    href="/admin"
                    className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition-colors hover:text-slate-900"
                >
                    <ArrowLeft size={15} />
                    Back to the panel
                </Link>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center gap-4 border-b border-slate-100 p-5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                            <Smartphone size={22} />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold leading-tight text-slate-900">
                                Promise Staff app
                            </h1>
                            <p className="mt-0.5 text-[13px] text-slate-500">Installed on this device</p>
                        </div>
                    </div>

                    {!status ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Reading versions…
                        </div>
                    ) : (
                        <>
                            <div className="divide-y divide-slate-100">
                                <Row
                                    label="App version"
                                    hint="The installed file. Only a new install changes this."
                                    value={status.nativeVersion}
                                />
                                <Row
                                    label="Panel version"
                                    hint="The part that updates itself, quietly."
                                    value={
                                        status.isBuiltin
                                            ? `${status.nativeVersion} (built in)`
                                            : status.bundleVersion
                                    }
                                />
                                <Row
                                    label="Newest published"
                                    hint="What this server is offering right now."
                                    value={status.latestBundle ?? status.latestApk ?? "unknown"}
                                />
                                <Row label="Last checked" value={whenText(status.lastCheckedAt)} />
                            </div>

                            {/*
                              * The result of looking, said in the same words the
                              * person would use. Anything that needs them to act
                              * says so; anything that does not, reassures.
                              */}
                            <div className="border-t border-slate-100 p-4">
                                {pending ? (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                        <div className="flex items-start gap-2.5">
                                            <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                            <div className="min-w-0">
                                                <p className="text-[13px] font-bold text-emerald-900">
                                                    Version {pending} is downloaded and ready
                                                </p>
                                                <p className="mt-1 text-[12px] leading-relaxed text-emerald-800">
                                                    It becomes active the next time the app is opened. Nothing
                                                    to install and nothing to download again — or switch to it
                                                    now, which restarts the app.
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={applyNow}
                                            disabled={applying}
                                            className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                                        >
                                            {applying
                                                ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                : <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />}
                                            Use it now
                                        </Button>
                                    </div>
                                ) : outcome?.kind === "up-to-date" ? (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                        <p className="text-[13px] leading-relaxed text-emerald-900">
                                            <strong>Up to date.</strong> This is the newest build published.
                                        </p>
                                    </div>
                                ) : outcome?.kind === "staged" ? (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                        <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                                        <p className="text-[13px] leading-relaxed text-emerald-900">
                                            <strong>Version {outcome.version} downloaded.</strong> It will be
                                            live the next time you open the app.
                                        </p>
                                    </div>
                                ) : outcome?.kind === "unavailable" ? (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                        <p className="text-[13px] leading-relaxed text-amber-900">
                                            {outcome.reason} Nothing is wrong with the app — it will try
                                            again on its own.
                                        </p>
                                    </div>
                                ) : null}

                                {/*
                                  * A new APK is the one case that cannot fix
                                  * itself, so it gets a link rather than
                                  * reassurance.
                                  */}
                                {(apkBehind || outcome?.kind === "needs-apk") && (
                                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                                        <div className="flex items-start gap-2.5">
                                            <Download className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                                            <div>
                                                <p className="text-[13px] font-bold text-blue-900">
                                                    A new app version is available
                                                </p>
                                                <p className="mt-1 text-[12px] leading-relaxed text-blue-800">
                                                    This one changes something the app cannot replace by
                                                    itself, so it has to be installed. Install over the top —
                                                    do not uninstall first, or you will be signed out.
                                                </p>
                                            </div>
                                        </div>
                                        <a href="/admin/get-app" className="mt-3 block">
                                            <Button size="sm" className="w-full bg-blue-600 text-white hover:bg-blue-700">
                                                Get version {status.latestApk}
                                            </Button>
                                        </a>
                                    </div>
                                )}

                                <Button
                                    variant="outline"
                                    onClick={check}
                                    disabled={checking}
                                    className="mt-3 h-11 w-full gap-2"
                                >
                                    <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} />
                                    {checking ? "Checking…" : "Check for updates"}
                                </Button>

                                <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-400">
                                    The app checks by itself every time it opens. This button is only for
                                    when you would rather not wait.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
