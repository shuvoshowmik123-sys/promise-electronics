import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
    X,
    Zap,
    ZapOff,
    MoreVertical,
    Image as ImageIcon,
    Camera,
    RotateCcw,
    ScanLine,
    Activity,
    QrCode,
    Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/camera-lens.css";
import { useCameraLens, CameraMode, AnalysisResult } from "@/hooks/useCameraLens";
import { compressImage, getCompressionPreset, formatFileSize } from "@/lib/imageCompression";

interface CameraLensProps {
    onCapture?: (result: AnalysisResult, image: string) => void;
    onClose?: () => void;
}

export default function CameraLens({ onCapture, onClose }: CameraLensProps) {
    const [, setLocation] = useLocation();
    const [mode, setMode] = useState<CameraMode>('identify');
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [isScanning, setIsScanning] = useState(true);
    const [isStreamReady, setIsStreamReady] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const { analyzeImage, isAnalyzing } = useCameraLens();

    useEffect(() => {
        let stream: MediaStream | null = null;
        // Request camera access
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            })
                .then(s => {
                    stream = s;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                })
                .catch(err => console.error("Camera error:", err));
        }

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            setLocation("/native/chat");
        }
    };

    const handleCapture = async () => {
        if (!videoRef.current || isAnalyzing) return;

        // Capture image from video at full resolution first
        const canvas = document.createElement("canvas");
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(videoRef.current, 0, 0);

        // Get full resolution image as blob
        const fullResBlob = await new Promise<Blob>((resolve) => {
            canvas.toBlob(
                (blob) => resolve(blob!),
                "image/jpeg",
                0.9
            );
        });

        console.log(`[Camera] Original capture: ${formatFileSize(fullResBlob.size)}`);

        // Compress for AI analysis (max 1024x1024, 85% quality)
        const compressionOptions = getCompressionPreset('ai-analysis');
        const compressed = await compressImage(fullResBlob, compressionOptions);

        console.log(`[Camera] Compressed to: ${formatFileSize(compressed.compressedSize)} (${compressed.compressionRatio.toFixed(1)}x smaller)`);

        // Analyze with compressed image
        const result = await analyzeImage(compressed.base64, mode);

        if (result && onCapture) {
            onCapture(result, compressed.base64);
        }
    };

    return (
        <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col font-sans z-50">
            {/* Camera Feed */}
            <div className="absolute inset-0 w-full h-full">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => setIsStreamReady(true)}
                    className={cn(
                        "w-full h-full object-cover transition-opacity duration-500",
                        isStreamReady ? "opacity-100" : "opacity-0"
                    )}
                />
                {/* Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/20 pointer-events-none"></div>
            </div>

            {/* Top Navigation */}
            <div className="absolute top-0 w-full z-20 pt-[calc(1rem+env(safe-area-inset-top))] px-4 flex justify-between items-start">
                <button
                    onClick={handleClose}
                    className="flex size-10 items-center justify-center rounded-full glass-panel text-white hover:bg-black/30 transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => setIsFlashOn(!isFlashOn)}
                        className="flex size-10 items-center justify-center rounded-full glass-panel text-white hover:bg-black/30 transition-colors"
                    >
                        {isFlashOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
                    </button>
                    <button className="flex size-10 items-center justify-center rounded-full glass-panel text-white hover:bg-black/30 transition-colors">
                        <MoreVertical className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* AI Overlay Layer */}
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col items-center justify-center pb-32">
                {/* Scanning Reticle */}
                <div className={cn(
                    "relative w-72 h-72 border border-[#36e27b]/30 rounded-[2rem] flex items-center justify-center transition-all duration-300",
                    isScanning && !isAnalyzing && "animate-scan-pulse",
                    isAnalyzing && "border-[#36e27b] shadow-[0_0_30px_rgba(54,226,123,0.3)]"
                )}>
                    {/* Corner Indicators */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-[#36e27b] rounded-tl-2xl -mt-[1px] -ml-[1px]"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-[#36e27b] rounded-tr-2xl -mt-[1px] -mr-[1px]"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-[#36e27b] rounded-bl-2xl -mb-[1px] -ml-[1px]"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-[#36e27b] rounded-br-2xl -mb-[1px] -mr-[1px]"></div>

                    {/* Center Crosshair */}
                    {!isAnalyzing && <div className="w-2 h-2 bg-[#36e27b] rounded-full opacity-80"></div>}

                    {/* Loading Spinner */}
                    {isAnalyzing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-[2rem]">
                            <Loader2 className="w-12 h-12 text-[#36e27b] animate-spin" />
                        </div>
                    )}

                    {/* Dynamic AI Label */}
                    <div className="absolute -top-12 left-0 bg-white/90 dark:bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#36e27b]/50 shadow-lg flex items-center gap-2 transform transition-all duration-300">
                        {mode === 'identify' && <ScanLine className="w-4 h-4 text-[#36e27b]" />}
                        {mode === 'assess' && <Activity className="w-4 h-4 text-[#36e27b]" />}
                        {mode === 'barcode' && <QrCode className="w-4 h-4 text-[#36e27b]" />}
                        <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                            {isAnalyzing ? 'Analyzing...' :
                                mode === 'identify' ? 'Scanning Component...' :
                                    mode === 'assess' ? 'Analyzing Damage...' : 'Scanning Barcode...'}
                        </span>
                    </div>
                </div>
                <p className="mt-4 text-white/90 text-sm font-medium tracking-wide drop-shadow-md">
                    {isAnalyzing ? 'Please wait...' : 'Hold steady to scan'}
                </p>
            </div>

            {/* Bottom Controls Sheet */}
            <div className="absolute bottom-0 w-full z-30 bg-white dark:bg-[#0f172a] rounded-t-[2rem] pt-6 pb-8 px-6 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] flex flex-col items-center gap-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
                {/* Drag Handle */}
                <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mb-1"></div>

                {/* Mode Selector */}
                <div className="flex w-full max-w-sm h-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 p-1 relative">
                    <button
                        onClick={() => setMode('identify')}
                        className={cn(
                            "flex-1 h-full rounded-full text-sm font-bold transition-all duration-200 z-10",
                            mode === 'identify'
                                ? "bg-white dark:bg-slate-700 text-[#36e27b] shadow-sm"
                                : "text-slate-500 dark:text-slate-400"
                        )}
                    >
                        Identify
                    </button>
                    <button
                        onClick={() => setMode('assess')}
                        className={cn(
                            "flex-1 h-full rounded-full text-sm font-bold transition-all duration-200 z-10",
                            mode === 'assess'
                                ? "bg-white dark:bg-slate-700 text-[#36e27b] shadow-sm"
                                : "text-slate-500 dark:text-slate-400"
                        )}
                    >
                        Assess
                    </button>
                    <button
                        onClick={() => setMode('barcode')}
                        className={cn(
                            "flex-1 h-full rounded-full text-sm font-bold transition-all duration-200 z-10",
                            mode === 'barcode'
                                ? "bg-white dark:bg-slate-700 text-[#36e27b] shadow-sm"
                                : "text-slate-500 dark:text-slate-400"
                        )}
                    >
                        Barcode
                    </button>
                </div>

                {/* Camera Controls */}
                <div className="flex items-center justify-between w-full max-w-sm mt-2">
                    {/* Gallery */}
                    <button className="relative size-14 rounded-full overflow-hidden border-2 border-white dark:border-slate-600 shadow-md group bg-slate-200">
                        <ImageIcon className="w-6 h-6 text-slate-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </button>

                    {/* Shutter Button */}
                    <button
                        onClick={handleCapture}
                        disabled={isAnalyzing}
                        className="relative size-20 rounded-full border-[4px] border-[#36e27b]/20 flex items-center justify-center bg-transparent active:scale-95 transition-transform duration-150 disabled:opacity-50 disabled:scale-100"
                    >
                        <div className={cn(
                            "size-16 rounded-full bg-[#36e27b] shadow-[0_0_20px_rgba(54,226,123,0.4)] hover:scale-105 transition-transform duration-200 flex items-center justify-center",
                            isAnalyzing && "animate-pulse"
                        )}>
                            <Camera className="w-8 h-8 text-white" />
                        </div>
                    </button>

                    {/* Switch Camera */}
                    <button className="size-14 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <RotateCcw className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    );
}
