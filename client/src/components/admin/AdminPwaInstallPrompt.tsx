import { useEffect, useState } from "react";
import { X, Download, Monitor, Smartphone } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

/**
 * The signed staff app, from the repository's latest release.
 *
 * "releases/latest/download" is resolved by GitHub at request time, so this
 * link never has to be updated: publishing a new release with an asset of this
 * name is enough, and every phone that follows the link gets the new build.
 */
const STAFF_APK_URL =
  "https://github.com/shuvoshowmik123-sys/promise-electronics/releases/latest/download/PromiseStaff.apk";

/** Android in a browser — not the installed app, and not an iPhone. */
function isAndroidBrowser(): boolean {
  if (Capacitor.isNativePlatform()) return false;
  return /android/i.test(navigator.userAgent);
}

const ROLE_COPY: Record<string, { body: string }> = {
  Driver: { body: "Open pickup tasks, route plans, and delivery updates like a dedicated app." },
  Cashier: { body: "Access POS, payments, and inventory from a dedicated app." },
  Technician: { body: "Open workbench, job queue, and repair tools like a dedicated app." },
};

export function AdminPwaInstallPrompt() {
  const { canShow, isIOS, install, dismiss, hasNativePrompt } = usePwaInstallPrompt("admin");
  const { user } = useAdminAuth();

  /**
   * Step aside whenever a working surface is open.
   *
   * This banner is 320px wide and pinned bottom-right, which on a 393px phone
   * means it sits on top of whatever is at the bottom of the screen. On the POS
   * sourced-part form that is Cancel and "Add to sale" — the counter could not
   * add a part at all while it was showing, because every tap landed here.
   *
   * The admin shell already announces "a surface is open" to hide the dock for
   * exactly this reason. Listening to the same signal keeps one rule rather
   * than two: if the dock has stood down, so has this.
   */
  const [surfaceOpen, setSurfaceOpen] = useState(false);
  useEffect(() => {
    const onChrome = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      // Scroll-driven messages carry a scrollTop and no verdict; ignore those.
      if (!detail || typeof detail.hidden !== "boolean") return;
      setSurfaceOpen(detail.hidden);
    };
    window.addEventListener("admin:mobile-chrome", onChrome);
    return () => window.removeEventListener("admin:mobile-chrome", onChrome);
  }, []);

  /**
   * Inside the installed app there is nothing left to offer.
   *
   * Without this the staff app shows a banner inviting you to install the staff
   * app, which is the sort of thing that makes people distrust the rest of it.
   */
  if (Capacitor.isNativePlatform()) return null;
  if (!user) return null;
  if (surfaceOpen) return null;

  /**
   * On Android the real app wins over the web one.
   *
   * A PWA on Android cannot hold a push notification open when it is closed —
   * the battery optimiser decides, and a job alert an hour late is not an
   * alert. The signed APK does, so where both are possible we offer the APK and
   * do not mention the other. Everywhere else the PWA is still the best thing
   * available and the banner behaves exactly as it did.
   */
  const offerApk = isAndroidBrowser();
  if (!offerApk && (!canShow || (!isIOS && !hasNativePrompt))) return null;

  const copy = ROLE_COPY[user.role] || { body: "Open jobs, pickups, POS, and staff tools like a dedicated app." };

  const handleInstall = async () => {
    if (offerApk) {
      // Straight to the file. Android then asks its own install question, which
      // is the point at which "unknown sources" is granted, once, by the person
      // holding the phone.
      window.location.href = STAFF_APK_URL;
      dismiss();
      return;
    }
    if (isIOS) {
      dismiss();
      return;
    }
    await install();
  };

  return (
    /*
     * Top of the screen on a phone, bottom-right from sm up.
     *
     * The bottom of a phone screen is contested space — the tab dock lives
     * there, so does the POS cart bar, so does every sheet's action row. This
     * banner was moved from the corner to just above the dock and immediately
     * started intercepting taps on "View Cart", which is the same class of bug
     * it had caused on the sourced-part form. Chasing it upward one bar at a
     * time is a losing game; the top is the only part of a phone screen nothing
     * else claims.
     */
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 animate-in slide-in-from-top-4 duration-300 sm:inset-x-auto sm:top-auto sm:bottom-4 sm:right-4 sm:w-80">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 p-3 bg-slate-900 text-white">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
            {offerApk ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              {offerApk ? "Get the Promise Staff app" : "Install Promise Admin"}
            </p>
            <p className="text-xs text-slate-300 truncate">
              {offerApk ? "Real notifications, even when the app is closed." : copy.body}
            </p>
          </div>
          <button onClick={dismiss} className="p-1 hover:bg-white/10 rounded-full flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 p-3">
          <Button variant="ghost" size="sm" className="flex-1 text-slate-500" onClick={dismiss}>
            Later
          </Button>
          <Button size="sm" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white" onClick={handleInstall}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {offerApk ? "Download app" : "Install"}
          </Button>
        </div>
      </div>
    </div>
  );
}
