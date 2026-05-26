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
import { ScanLine, X } from "lucide-react";
import { useRef, useState, useEffect } from "react";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

interface Props {
    onJobFound: (jobId: string) => void;
}

export function QRScanButton({ onJobFound }: Props) {
    const [scanning, setScanning] = useState(false);
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
    };

    useEffect(() => {
        if (!scanning || !hasBarcodeDetector) return;

        let active = true;

        (async () => {
            try {
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
                setScanning(false);
            }
        })();

        return () => { active = false; stopCamera(); };
    }, [scanning]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const bitmap = await createImageBitmap(file);
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const codes = await detector.detect(bitmap);
            if (codes.length > 0) {
                const jobId = extractJobId(codes[0].rawValue);
                if (jobId) { onJobFound(jobId); return; }
            }
            alert("No valid job QR code found in that image.");
        } catch {
            alert("Could not read QR code. Try the camera instead.");
        }
        e.target.value = "";
    };

    const handlePress = () => {
        if (hasBarcodeDetector) {
            setScanning(true);
        } else {
            fileInputRef.current?.click();
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
                <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center">
                    <div className="relative w-full max-w-sm">
                        <video
                            ref={videoRef}
                            className="w-full rounded-2xl object-cover"
                            playsInline
                            muted
                        />
                        {/* Scan frame overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-48 h-48 border-2 border-white rounded-2xl opacity-60" />
                        </div>
                    </div>
                    <p className="text-white/70 text-sm mt-6">Point camera at a job QR code</p>
                    <button
                        onClick={stopCamera}
                        className="mt-8 h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-white"
                    >
                        <X size={22} />
                    </button>
                </div>
            )}
        </>
    );
}
