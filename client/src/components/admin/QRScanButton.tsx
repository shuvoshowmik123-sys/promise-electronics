/**
 * QRScanButton — Phase 4
 * Floating button that opens camera to scan a job QR code.
 * Uses BarcodeDetector API (Chrome/Android). Falls back to file input.
 *
 * Job QR codes contain job IDs that match:
 *   /track/{uuid}  — customer receipt
 *   /tech/job/{uuid} — work order ticket
 * On scan, extracts UUID and fires onJobFound(jobId).
 */
import { AlertCircle, Camera, ImageUp, ScanLine, X } from "lucide-react";
import { useRef, useState, useEffect } from "react";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

interface Props {
    onJobFound: (jobId: string) => void;
}

export function QRScanButton({ onJobFound }: Props) {
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState("");
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number>(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasBarcodeDetector = typeof (window as any).BarcodeDetector !== "undefined";

    const extractJobId = (value: string): string | null => {
        const match = value.match(UUID_RE);
        return match ? match[0] : null;
    };

    const stopCamera = () => {
        cancelAnimationFrame(animFrameRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setScanning(false);
        setScanError("");
    };

    useEffect(() => {
        if (!scanning || !hasBarcodeDetector) return;

        let active = true;

        (async () => {
            try {
                setScanError("");
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment" },
                });
                if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }

                const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });

                const scan = async () => {
                    if (!active || !videoRef.current) return;
                    try {
                        const codes = await detector.detect(videoRef.current);
                        if (codes.length > 0) {
                            const jobId = extractJobId(codes[0].rawValue);
                            if (jobId) {
                                stopCamera();
                                onJobFound(jobId);
                                return;
                            }
                        }
                    } catch {}
                    animFrameRef.current = requestAnimationFrame(scan);
                };
                animFrameRef.current = requestAnimationFrame(scan);
            } catch {
                active = false;
                setScanError("Camera permission is needed to scan job QR codes.");
            }
        })();

        return () => { active = false; stopCamera(); };
    }, [scanning]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!hasBarcodeDetector) {
            setScanError("QR reading is not supported in this browser yet. Use Chrome/Android camera scanning.");
            e.target.value = "";
            return;
        }
        try {
            const bitmap = await createImageBitmap(file);
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const codes = await detector.detect(bitmap);
            if (codes.length > 0) {
                const jobId = extractJobId(codes[0].rawValue);
                if (jobId) { onJobFound(jobId); return; }
            }
            setScanError("No valid job QR code found in that image.");
        } catch {
            setScanError("Could not read QR code. Try the camera instead.");
        }
        e.target.value = "";
    };

    const handlePress = () => {
        if (hasBarcodeDetector) {
            setScanError("");
            setScanning(true);
        } else {
            setScanError("QR scanning needs a browser with BarcodeDetector support.");
            setScanning(true);
        }
    };

    return (
        <>
            {/* Trigger button — styled to match the existing floating tools */}
            <button
                onClick={handlePress}
                className="h-11 w-11 bg-white/70 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-full flex items-center justify-center text-slate-700 active:scale-95 transition-all"
                aria-label="Scan Job QR"
            >
                <ScanLine size={20} strokeWidth={2.5} />
            </button>

            {/* Hidden file input fallback */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Camera overlay */}
            {scanning && (
                <div className="fixed inset-0 z-[300] flex flex-col bg-slate-950 text-white">
                    <div className="flex items-center gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white active:scale-95"
                            aria-label="Close scanner"
                        >
                            <X size={20} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className="text-lg font-black">Scan Job QR</div>
                            <div className="text-xs font-semibold text-white/55">Point at a Promise job ticket or receipt QR.</div>
                        </div>
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200">
                            <Camera size={20} />
                        </div>
                    </div>
                    <div className="relative min-h-0 flex-1 px-4 pb-4">
                        <div className="relative h-full overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
                            {hasBarcodeDetector && (
                                <video
                                    ref={videoRef}
                                    className="h-full w-full object-cover"
                                    playsInline
                                    muted
                                />
                            )}
                            {!hasBarcodeDetector && (
                                <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
                                        <AlertCircle className="h-8 w-8 text-amber-300" />
                                    </div>
                                    <div className="text-base font-black">Scanner not supported</div>
                                    <p className="mt-2 text-sm font-medium text-white/55">Use a Chromium mobile browser for live QR scanning.</p>
                                </div>
                            )}
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_34%,rgba(2,6,23,0.55)_35%,rgba(2,6,23,0.72)_100%)]" />
                            <div className="pointer-events-none absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border-2 border-white/80 shadow-[0_0_0_1px_rgba(59,130,246,0.45),0_0_40px_rgba(59,130,246,0.35)]">
                                <div className="absolute left-4 right-4 top-1/2 h-0.5 rounded-full bg-blue-300 shadow-[0_0_18px_rgba(147,197,253,0.95)]" />
                            </div>
                            <div className="absolute inset-x-4 bottom-4 rounded-3xl border border-white/10 bg-slate-950/75 p-4 backdrop-blur-xl">
                                {scanError ? (
                                    <div className="flex items-start gap-3 text-amber-100">
                                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                                        <div className="text-sm font-semibold">{scanError}</div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <ScanLine className="h-5 w-5 shrink-0 text-blue-300" />
                                        <div>
                                            <div className="text-sm font-black">Scanning...</div>
                                            <div className="text-xs font-medium text-white/55">Hold steady until the job opens.</div>
                                        </div>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-slate-950 active:scale-[0.99]"
                                >
                                    <ImageUp className="h-4 w-4" />
                                    Import QR Image
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
