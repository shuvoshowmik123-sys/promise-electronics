/**
 * "A new version is ready — Install".
 *
 * Everything before that sentence has already happened by the time this
 * appears: the app noticed the server was offering a build it did not have and
 * fetched it in the background. The person holding the phone is asked for one
 * tap, at a moment when there is nothing left to wait for.
 *
 * Deliberately quiet while downloading. A progress bar on a repair counter is
 * an interruption offering nothing to act on — Android already shows the
 * transfer in the notification shade for anyone who wants to watch it. This
 * stays out of the way until the answer is "ready".
 */

import { useEffect, useState } from "react";
import { Download, X, ArrowUpCircle, ShieldQuestion } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { ApkUpdater, checkAndDownloadApk, type ApkState } from "@/lib/apk-updater";

const DISMISS_KEY = "apk-update-dismissed-version";

export function ApkUpdateBanner() {
    const { status } = useAdminAuth();
    const [state, setState] = useState<ApkState>({ kind: "idle" });

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        /**
         * After sign-in, not at launch.
         *
         * Start-up is already competing for the connection, and a ten-megabyte
         * download at the same moment is what makes an app feel slow to open.
         * By the time someone has signed in, the screen is drawn and the
         * transfer costs them nothing they can perceive.
         */
        if (status !== "authenticated") return;

        let live = true;
        checkAndDownloadApk((next) => { if (live) setState(next); });
        return () => { live = false; };
    }, [status]);

    const version = "version" in state ? state.version : "";

    /** Dismissal is per version: declining 1.0.9 should not hide 1.1.0. */
    const [dismissed, setDismissed] = useState<string | null>(() => {
        try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
    });

    if (!Capacitor.isNativePlatform()) return null;
    if (state.kind !== "ready" && state.kind !== "blocked") return null;
    if (dismissed === version) return null;

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, version); } catch { /* private mode */ }
        setDismissed(version);
    };

    const blocked = state.kind === "blocked";

    return (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[90] animate-in slide-in-from-top-4 duration-300 sm:inset-x-auto sm:right-4 sm:w-80">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center gap-3 bg-slate-900 p-3 text-white">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                        {blocked ? <ShieldQuestion className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">Version {version} is ready</p>
                        <p className="truncate text-xs text-slate-300">
                            {blocked ? "One permission is needed first" : "Already downloaded — nothing to wait for"}
                        </p>
                    </div>
                    <button onClick={dismiss} className="shrink-0 rounded-full p-1 hover:bg-white/15" aria-label="Not now">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-3 p-3">
                    {blocked ? (
                        <>
                            {/*
                              * Said plainly, because the Settings screen this
                              * opens is titled "Install unknown apps", which
                              * reads like a warning about us rather than a
                              * switch that has to be on.
                              */}
                            <p className="text-xs leading-relaxed text-slate-600">
                                Android needs your permission before this app can install an update. Tap below,
                                turn the switch on, then come back — it is asked once and remembered.
                            </p>
                            <Button
                                size="sm"
                                className="w-full bg-slate-900 text-white hover:bg-slate-800"
                                onClick={() => { ApkUpdater.openInstallSettings().catch(() => {}); }}
                            >
                                Open the setting
                            </Button>
                        </>
                    ) : (
                        <>
                            <p className="text-xs leading-relaxed text-slate-600">
                                Installs over the top and keeps you signed in. Android will ask you to confirm —
                                that step cannot be skipped.
                            </p>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="flex-1 text-slate-500" onClick={dismiss}>
                                    Later
                                </Button>
                                <Button
                                    size="sm"
                                    className="flex-1 bg-slate-900 text-white hover:bg-slate-800"
                                    onClick={() => { ApkUpdater.installUpdate().catch(() => {}); }}
                                >
                                    <Download className="mr-1.5 h-3.5 w-3.5" />
                                    Install
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
