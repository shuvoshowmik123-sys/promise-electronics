import { X, Download, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";

export function CorporatePwaInstallPrompt() {
  const { canShow, isIOS, install, dismiss, hasNativePrompt } = usePwaInstallPrompt("corporate");
  const { user } = useCorporateAuth();

  if (!canShow || !user) return null;
  if (!isIOS && !hasNativePrompt) return null;

  const handleInstall = async () => {
    if (isIOS) {
      dismiss();
      return;
    }
    await install();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white rounded-xl shadow-lg border border-blue-100 overflow-hidden">
        <div className="flex items-center gap-3 p-3 bg-blue-800 text-white">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install Promise Corporate</p>
            <p className="text-xs text-blue-200 truncate">Track repairs, messages, and approvals from a dedicated app.</p>
          </div>
          <button onClick={dismiss} className="p-1 hover:bg-white/10 rounded-full flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 p-3">
          <Button variant="ghost" size="sm" className="flex-1 text-slate-500" onClick={dismiss}>
            Later
          </Button>
          <Button size="sm" className="flex-1 bg-blue-800 hover:bg-blue-700 text-white" onClick={handleInstall}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
