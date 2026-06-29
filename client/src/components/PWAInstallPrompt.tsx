import { X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { usePwaInstallPrompt } from "@/hooks/usePwaInstallPrompt";
import { useState } from "react";

export function PWAInstallPrompt() {
  const [location] = useLocation();
  const { canShow, isIOS, install, dismiss, hasNativePrompt } = usePwaInstallPrompt("customer");
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  const isCustomerPage = !location.startsWith("/admin") && !location.startsWith("/tech") && !location.startsWith("/corporate");
  const isHomepage = location === "/" || location === "" || location === "/home";

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }
    await install();
  };

  const handleDismiss = () => {
    setShowIOSInstructions(false);
    dismiss();
  };

  if (!canShow || !isCustomerPage || !isHomepage) return null;
  if (!isIOS && !hasNativePrompt) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-sky-500 to-teal-500 p-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Install Our App</h3>
                  <p className="text-sm text-white/80">Quick access anytime</p>
                </div>
              </div>
              <button onClick={handleDismiss} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-4">
              Install Promise Electronics on your phone for easy access to repair tracking, quotes, and shopping.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleDismiss}>
                Maybe Later
              </Button>
              <Button className="flex-1 bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600" onClick={handleInstall}>
                <Download className="w-4 h-4 mr-2" />
                Install
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showIOSInstructions && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md animate-in slide-in-from-bottom duration-300">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold">Install on iPhone/iPad</h3>
                <button onClick={handleDismiss} className="p-1 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                {["Tap the Share button at the bottom of Safari", 'Scroll down and tap "Add to Home Screen"', 'Tap "Add" to install the app'].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sky-600 font-bold">{i + 1}</span>
                    </div>
                    <p className="text-sm text-slate-600" dangerouslySetInnerHTML={{ __html: step.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                  </div>
                ))}
              </div>
              <Button className="w-full mt-6" onClick={handleDismiss}>Got it!</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
