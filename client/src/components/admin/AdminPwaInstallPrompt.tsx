import { useEffect, useState } from "react";
import { X, Download, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

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

  if (!canShow || !user) return null;
  if (!isIOS && !hasNativePrompt) return null;
  if (surfaceOpen) return null;

  const copy = ROLE_COPY[user.role] || { body: "Open jobs, pickups, POS, and staff tools like a dedicated app." };

  const handleInstall = async () => {
    if (isIOS) {
      dismiss();
      return;
    }
    await install();
  };

  return (
    /* Above the dock and inset on a phone, where 320px pinned to a corner is
       most of the screen; the original corner card returns from sm up. */
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 animate-in slide-in-from-bottom-4 duration-300 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-80">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 p-3 bg-slate-900 text-white">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Monitor className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install Promise Admin</p>
            <p className="text-xs text-slate-300 truncate">{copy.body}</p>
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
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
