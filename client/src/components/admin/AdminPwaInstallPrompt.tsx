import { useEffect, useState } from "react";
import { X, Download, Monitor, Smartphone } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";
import { openStaffApkDownload } from "@/lib/staff-app-download";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

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
  const { canShow, isIOS, install, dismiss, dismissed, hasNativePrompt } = usePwaInstallPrompt("admin");
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

  /**
   * Dismissal applies to both paths.
   *
   * This check used to sit inside canShow, which the APK path skips — so the X
   * and Later buttons set the flag and the banner ignored it, reappearing on
   * every render with no way to close it. Asked separately now, before anything
   * else, because a person who has said no has said no regardless of which
   * thing was being offered.
   */
  if (dismissed) return null;
  if (!offerApk && (!canShow || (!isIOS && !hasNativePrompt))) return null;

  const copy = ROLE_COPY[user.role] || { body: "Open jobs, pickups, POS, and staff tools like a dedicated app." };

  const handleInstall = async () => {
    if (offerApk) {
      /*
       * Say what happens next, because nothing else will.
       *
       * Android downloads the file and then goes quiet — no install prompt
       * appears on its own. The first person through this watched the counter
       * reach the full size and reported the download as stuck, when it had in
       * fact finished and was simply sitting in Downloads waiting to be opened.
       *
       * The toast outlives the banner on purpose: dismiss() removes the thing
       * that was just tapped, so without it the screen gives no sign anything
       * happened at all.
       */
      toast.info("Downloading the app…", {
        description: "When it finishes, open the file from your notifications to install it.",
        duration: 10000,
      });
      const where = await openStaffApkDownload();
      if (where === "releases") {
        toast.message("Opening the releases page", {
          description: "Tap the .apk file there to download it.",
        });
      }
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
    /*
     * z-[90]: above the shell, below anything modal.
     *
     * This sat at z-50 while the admin chrome runs to z-[60] and its sheets to
     * z-[100], so the banner rendered underneath the floating header and looked
     * like it had failed to appear at all. Above the chrome now, and still
     * beneath the sheets — a dialog someone opened deliberately outranks a
     * suggestion they did not ask for.
     */
    <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[90] animate-in slide-in-from-top-4 duration-300 sm:inset-x-auto sm:top-auto sm:bottom-4 sm:right-4 sm:w-80">
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
