/**
 * Where the staff Android app is handed out.
 *
 * The banner that offers it only appears on an Android phone, and only until
 * somebody dismisses it. This is the place it can always be found afterwards —
 * for the manager setting up a new starter's phone, for anyone who tapped
 * "Later" months ago, and for reading the link out to someone standing
 * elsewhere.
 */
import { Smartphone, Download, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * GitHub resolves "releases/latest/download" when the request is made, so this
 * link never needs updating: publishing a release with an asset of this name is
 * enough and every phone that follows it gets the newest build.
 */
const STAFF_APK_URL =
  "https://github.com/shuvoshowmik123-sys/promise-electronics/releases/latest/download/PromiseStaff.apk";
const RELEASES_PAGE =
  "https://github.com/shuvoshowmik123-sys/promise-electronics/releases/latest";

export function StaffAppDownloadCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-900 p-4 text-white">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black">Promise Staff — Android app</p>
          <p className="text-xs text-slate-300">
            The admin panel as a real app, with notifications that arrive when it is closed.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="h-11 flex-1 bg-slate-900 hover:bg-slate-800 sm:h-10">
            <a href={STAFF_APK_URL}>
              <Download className="mr-2 h-4 w-4" />
              Download the app
            </a>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-1 sm:h-10 sm:flex-none">
            <a href={RELEASES_PAGE} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              All versions
            </a>
          </Button>
        </div>

        {/*
          * Said plainly, because the phone is about to say something alarming.
          *
          * An app installed from a file rather than from Play makes Android warn
          * about "unknown sources", and a member of staff who was not told to
          * expect that will reasonably stop. Naming it here turns a warning into
          * a step.
          */}
        <ol className="space-y-1.5 text-xs text-slate-600">
          <li><span className="font-bold text-slate-900">1.</span> Open this page on the phone and tap Download.</li>
          <li><span className="font-bold text-slate-900">2.</span> Open the downloaded file.</li>
          <li>
            <span className="font-bold text-slate-900">3.</span> Android will warn that it is not from the Play
            Store. Allow it — that warning is normal for a company app.
          </li>
          <li><span className="font-bold text-slate-900">4.</span> Sign in, and allow notifications when asked.</li>
        </ol>

        <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>
            Signed by Promise Electronics. Install over the top to update — never uninstall first, or the phone
            is signed out and set up again from scratch.
          </span>
        </p>
      </div>
    </div>
  );
}
