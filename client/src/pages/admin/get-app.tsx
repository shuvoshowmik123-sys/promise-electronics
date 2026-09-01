/**
 * Where the staff Android app is handed out.
 *
 * The install banner is a nudge and nothing more. Whether it appears turns on
 * four things that differ from phone to phone — whether Chrome fires its install
 * event, whether that person dismissed it, whether they are signed in yet, and
 * whether the page is cached — which is why it kept being present on one device
 * and absent on the next. This page has none of those conditions. It is a URL.
 * It can be typed, bookmarked, printed on a card, or sent to someone standing in
 * a different shop.
 *
 * Reachable while signed out, deliberately. A new member of staff installs the
 * app before they have an account to sign in with, and a download page behind a
 * login is a door that only opens from inside. Nothing here is private: the
 * build is a public release, and the page names no customer, job or figure.
 */

import { useEffect, useState } from "react";
import { Download, Smartphone, ShieldCheck, Copy, Check, ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/config";

type Latest = {
    version: string;
    tag: string;
    filename: string;
    downloadUrl: string;
    size: number | null;
};

/** Bytes as a phone-sized number. A download with no stated size is the one people abandon. */
function formatSize(bytes: number | null): string | null {
    if (!bytes || bytes <= 0) return null;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GetAppPage() {
    const [latest, setLatest] = useState<Latest | null>(null);
    const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(getApiUrl("/admin/api/app/latest"), { headers: { Accept: "application/json" } });
                if (!res.ok) throw new Error(String(res.status));
                const data = (await res.json()) as Latest;
                if (cancelled) return;
                setLatest(data);
                setState("ready");
            } catch {
                if (!cancelled) setState("failed");
            }
        })();
        return () => { cancelled = true; };
    }, []);

    /**
     * The address people share.
     *
     * Built from this page's own origin rather than hard-coded, so the link
     * copied from a staging or local instance points back at that instance
     * instead of quietly sending a tester to production.
     */
    const shareUrl = `${window.location.origin}/admin/get-app`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard refused — the URL is on screen and can be read off it */
        }
    };

    const size = formatSize(latest?.size ?? null);

    return (
        <div className="min-h-screen bg-slate-100 px-4 py-8 sm:py-14">
            <div className="mx-auto w-full max-w-lg">
                <Link
                    href="/admin"
                    className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition-colors hover:text-slate-900"
                >
                    <ArrowLeft size={15} />
                    Back to the panel
                </Link>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center gap-4 border-b border-slate-100 p-5 sm:p-6">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                            <Smartphone size={26} />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold leading-tight text-slate-900">Promise Staff app</h1>
                            <p className="mt-0.5 text-[13px] text-slate-500">
                                The admin panel, built for Android. Real notifications, even when it is closed.
                            </p>
                        </div>
                    </div>

                    <div className="p-5 sm:p-6">
                        {state === "loading" && (
                            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Checking for the newest build…
                            </div>
                        )}

                        {state === "failed" && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900">
                                Could not reach the release just now. Try again in a minute — nothing is wrong
                                with your phone or your account.
                            </div>
                        )}

                        {state === "ready" && latest && (
                            <>
                                <dl className="mb-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-[13px]">
                                    <div className="flex items-center justify-between px-3.5 py-2.5">
                                        <dt className="text-slate-500">Version</dt>
                                        <dd className="font-semibold text-slate-900">{latest.version || latest.tag}</dd>
                                    </div>
                                    {size && (
                                        <div className="flex items-center justify-between px-3.5 py-2.5">
                                            <dt className="text-slate-500">Size</dt>
                                            <dd className="font-semibold text-slate-900">{size}</dd>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                        <dt className="shrink-0 text-slate-500">File</dt>
                                        <dd className="truncate font-medium text-slate-700">{latest.filename}</dd>
                                    </div>
                                </dl>

                                {/*
                                  * A plain link, not a fetch.
                                  *
                                  * The phone's own download manager should own this transfer: it survives
                                  * the screen locking, it resumes, and it offers to install the file when
                                  * it lands. Pulling ten megabytes through the page instead gives up all
                                  * three and puts the bytes somewhere Android will not install from.
                                  */}
                                <a href={latest.downloadUrl} className="block">
                                    <Button size="lg" className="h-12 w-full bg-slate-900 text-[15px] font-semibold text-white hover:bg-slate-800">
                                        <Download className="mr-2 h-4 w-4" />
                                        Download{size ? ` (${size})` : ""}
                                    </Button>
                                </a>

                                <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4">
                                    <p className="text-[13px] font-semibold text-slate-900">After it downloads</p>
                                    <ol className="space-y-2 text-[13px] leading-relaxed text-slate-600">
                                        <li>
                                            <span className="font-semibold text-slate-800">1.</span> Open the
                                            downloaded file. Nothing installs on its own — a finished download
                                            just sits in the tray until you tap it.
                                        </li>
                                        <li>
                                            <span className="font-semibold text-slate-800">2.</span> Android will
                                            ask whether to allow installing from your browser. Allow it once.
                                        </li>
                                        <li>
                                            <span className="font-semibold text-slate-800">3.</span> Sign in with
                                            the same username and password you use here.
                                        </li>
                                    </ol>
                                    {/*
                                      * Said plainly because the alternative costs someone their session and
                                      * reads to them as the update having broken the app.
                                      */}
                                    <p className="border-t border-slate-200 pt-3 text-[13px] leading-relaxed text-slate-600">
                                        <span className="font-semibold text-slate-800">Updating?</span> Install
                                        over the top. Do not uninstall the old one first, or you will be signed
                                        out.
                                    </p>
                                </div>

                                <div className="mt-5 flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-500">
                                    <ShieldCheck size={15} className="mt-px shrink-0 text-emerald-600" />
                                    <p>
                                        Signed, and served from promiseelectronics.com. Google Play is not
                                        involved, so Android will warn you the first time — that warning is
                                        about the source, not the app.
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/*
                      * Sharing this is the whole point on a computer, where the file itself is
                      * no use: the manager at the desk is the one sending it to everyone else.
                      */}
                    <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
                        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-slate-600 ring-1 ring-slate-200">
                            {shareUrl}
                        </code>
                        <Button variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1.5">
                            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            {copied ? "Copied" : "Copy"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
