import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, NotFoundException, Exception } from '@zxing/library';
import { X, Camera, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface ScannerWidgetProps {
    onScan: (result: string) => void;
    onClose: () => void;
}

export function ScannerWidget({ onScan, onClose }: ScannerWidgetProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [isScanning, setIsScanning] = useState(false);

    // Keep the reader instance stable across renders
    const readerRef = useRef<BrowserMultiFormatReader | null>(null);

    useEffect(() => {
        // Initialize standard ZXing multi-format reader capable of QR and 1D Barcodes
        readerRef.current = new BrowserMultiFormatReader();

        // Request permission and enumerate cameras
        navigator.mediaDevices.getUserMedia({ video: true })
            .then((stream) => {
                // Stop the temporary stream used for permission
                stream.getTracks().forEach(track => track.stop());

                return navigator.mediaDevices.enumerateDevices();
            })
            .then((deviceList) => {
                const videoDevices = deviceList.filter(d => d.kind === 'videoinput');
                setDevices(videoDevices);

                if (videoDevices.length > 0) {
                    // Prefer back camera if available
                    const backCamera = videoDevices.find(d =>
                        d.label.toLowerCase().includes('back') ||
                        d.label.toLowerCase().includes('rear')
                    );
                    setSelectedDeviceId(backCamera ? backCamera.deviceId : videoDevices[0].deviceId);
                } else {
                    setError("No cameras found on this device.");
                }
            })
            .catch((err) => {
                console.error("Camera access error:", err);
                setError("Camera permission denied. Please allow camera access in your browser settings.");
            });

        return () => {
            // Cleanup on unmount
            if (readerRef.current) {
                readerRef.current.reset();
            }
        };
    }, []);

    useEffect(() => {
        if (!selectedDeviceId || !videoRef.current || !readerRef.current) return;

        // Start decoding from the selected camera
        setIsScanning(true);
        setError(null);

        readerRef.current.decodeFromVideoDevice(
            selectedDeviceId,
            videoRef.current,
            (result, err) => {
                if (result) {
                    // Play a tiny beep or haptic notification conceptually
                    if ("vibrate" in navigator) navigator.vibrate(50);

                    setIsScanning(false);
                    readerRef.current?.reset();
                    onScan(result.getText());
                }

                if (err && !(err instanceof NotFoundException)) {
                    console.error("Scanning error:", err);
                    // Only show serious errors, not the frequent "not found in this frame" Exception
                }
            }
        ).catch(e => {
            console.error("Failed to start scanner:", e);
            setError("Failed to initialize scanner. Hardware may be busy.");
            setIsScanning(false);
        });

        return () => {
            readerRef.current?.reset();
        };
    }, [selectedDeviceId, onScan]);

    const toggleCamera = () => {
        if (devices.length < 2) return;
        const currentIndex = devices.findIndex(d => d.deviceId === selectedDeviceId);
        const nextIndex = (currentIndex + 1) % devices.length;
        setSelectedDeviceId(devices[nextIndex].deviceId);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center animate-in fade-in duration-200">

            {/* Header Bar */}
            <div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
                <h3 className="text-white font-medium flex items-center shadow-black">
                    <Camera className="w-5 h-5 mr-2 opacity-70" />
                    Scan Job Ticket
                </h3>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white">
                    <X className="w-5 h-5" />
                </Button>
            </div>

            {/* Main Viewfinder Area */}
            <div className="relative w-full max-w-md aspect-[3/4] md:aspect-square overflow-hidden bg-slate-900 shadow-2xl rounded-2xl md:rounded-3xl border border-white/10">

                {error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                            <Camera className="w-8 h-8 text-red-400" />
                        </div>
                        <p className="text-white font-medium mb-2">Camera Error</p>
                        <p className="text-slate-400 text-sm leading-relaxed">{error}</p>
                    </div>
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            className="absolute inset-0 w-full h-full object-cover"
                            playsInline
                            muted
                        />

                        {/* Viewfinder Reticle Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-[70%] aspect-square border-2 border-dashed border-white/50 rounded-xl relative">
                                <div className="absolute -inset-1 border-2 border-blue-500 rounded-xl opacity-0 animate-[pulse_2s_ease-in-out_infinite]" />
                                {/* Corner accents */}
                                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-xl" />
                                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-xl" />
                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-xl" />
                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-xl" />
                            </div>
                        </div>

                        {/* Scanning Laser Line */}
                        {isScanning && !error && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                                <div className="w-[70%] h-0.5 bg-red-500 shadow-[0_0_15px_3px_rgba(239,68,68,0.7)] animate-[scan_2s_ease-in-out_infinite]" />
                            </div>
                        )}

                        {/* Status Overlay */}
                        <div className="absolute bottom-6 w-full text-center">
                            <span className="bg-black/60 backdrop-blur text-white text-xs font-medium px-4 py-2 rounded-full tracking-wider uppercase">
                                {isScanning ? "Align Code within frame" : "Initializing..."}
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Footer Controls */}
            <div className="absolute bottom-10 w-full flex justify-center pb-safe">
                {devices.length > 1 && (
                    <Button
                        variant="outline"
                        onClick={toggleCamera}
                        className="rounded-full bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 hover:text-white h-14 px-6 shadow-xl"
                    >
                        <RefreshCcw className="w-5 h-5 mr-2" />
                        Switch Camera
                    </Button>
                )}
            </div>

        </div>
    );
}
