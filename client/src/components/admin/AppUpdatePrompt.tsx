/**
 * Offers the newer build when one has been published.
 *
 * Shown only inside the installed app, and only when the version on the phone
 * is genuinely behind. A browser is never out of date.
 *
 * Sits at the top for the same reason the install banner does: the bottom of a
 * phone screen belongs to the dock, the POS cart bar and every sheet's action
 * row, and a notice parked there swallows taps meant for them.
 */
import { Download, X, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppUpdate } from "@/hooks/useAppUpdate";

export function AppUpdatePrompt() {
    const { update, skip, download } = useAppUpdate();
    if (!update) return null;

    return (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[90] animate-in slide-in-from-top-4 duration-300 sm:inset-x-auto sm:right-4 sm:w-80">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center gap-3 bg-emerald-600 p-3 text-white">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                        <ArrowUpCircle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">Update available</p>
                        <p className="truncate text-xs text-emerald-50">
                            Version {update.latest} — you have {update.current}
                        </p>
                    </div>
                    <button onClick={skip} className="shrink-0 rounded-full p-1 hover:bg-white/15" aria-label="Not now">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/*
                  * The install step is spelled out because the phone will not
                  * volunteer it: the download finishes and nothing happens until
                  * the file is opened. Left unsaid, a completed download reads as
                  * a stalled one.
                  */}
                <div className="space-y-3 p-3">
                    <p className="text-xs leading-relaxed text-slate-600">
                        Tap update, then open the downloaded file to install it. Install over the top — do not
                        uninstall first, or you will be signed out.
                    </p>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="flex-1 text-slate-500" onClick={skip}>
                            Later
                        </Button>
                        <Button
                            size="sm"
                            className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => { download(); skip(); }}
                        >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Update
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
