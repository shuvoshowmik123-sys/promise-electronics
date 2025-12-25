import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Zap, RefreshCw, AlertCircle } from "lucide-react";
import { API_BASE_URL } from "@/lib/config";
import { CapacitorHttp } from '@capacitor/core';
import { getStoredAuthSession } from "@/lib/authStorage";

export default function Splash() {
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const [, navigate] = useLocation();

    const checkConnection = useCallback(async () => {
        try {
            setIsChecking(true);
            setError(null);
            setProgress(10); // Start progress

            // 1. Check if API URL is set
            if (!API_BASE_URL) {
                throw new Error("API URL is not configured");
            }

            // 2. Attempt to connect using Native HTTP (Bypasses CORS/WebView)
            const res = await CapacitorHttp.get({
                url: `${API_BASE_URL}/api/health`,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
                    'Content-Type': 'application/json'
                },
                connectTimeout: 10000,
                readTimeout: 10000
            });

            if (res.status !== 200) {
                throw new Error(`Server returned ${res.status}: ${JSON.stringify(res.data)}`);
            }

            // 3. Success - Start the "fake" loading progress
            setProgress(30);
            const timer = setInterval(() => {
                setProgress((oldProgress) => {
                    if (oldProgress >= 100) {
                        clearInterval(timer);
                        return 100;
                    }
                    const diff = Math.random() * 15;
                    return Math.min(oldProgress + diff, 100);
                });
            }, 100);

            return () => clearInterval(timer);

        } catch (err: any) {
            console.error("Connection failed:", err);
            // Capture full error details for debugging
            const errorDetails = JSON.stringify({
                name: err.name,
                message: err.message,
                stack: err.stack,
                cause: err.cause,
                type: err.constructor.name
            }, null, 2);
            setError(errorDetails);
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        checkConnection();
    }, [checkConnection]);

    // Redirect when done - check for existing session first
    useEffect(() => {
        if (progress >= 100) {
            const checkSessionAndRedirect = async () => {
                try {
                    // Try to restore session from stored auth
                    const storedAuth = await getStoredAuthSession();

                    if (storedAuth) {
                        // User has stored auth - go directly to home
                        console.log('[Splash] Found stored auth, navigating to home');
                        navigate('/native/home');
                    } else {
                        // No stored auth - go to login
                        console.log('[Splash] No stored auth, navigating to login');
                        navigate('/native/login');
                    }
                } catch (error) {
                    console.error('[Splash] Error checking session:', error);
                    navigate('/native/login');
                }
            };

            const redirectTimer = setTimeout(checkSessionAndRedirect, 300);
            return () => clearTimeout(redirectTimer);
        }
    }, [progress, navigate]);

    return (
        <div className="h-full w-full bg-slate-900 flex flex-col items-center justify-center p-8 fixed inset-0">
            {/* Background Glows */}
            <div className="absolute -top-[20%] -right-[20%] w-[80%] h-[80%] bg-sky-500/10 rounded-full blur-[120px]" />
            <div className="absolute top-[40%] -left-[20%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-[100px]" />

            {/* Logo */}
            <div className="relative z-10 flex flex-col items-center gap-8">
                <div className="relative flex items-center justify-center">
                    <div className={`absolute inset-0 bg-sky-500/20 blur-2xl rounded-full scale-110 ${error ? 'bg-red-500/20' : ''}`} />
                    <div className={`relative w-32 h-32 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center shadow-2xl ring-4 ring-slate-800 ${error ? 'border-red-500/50' : ''}`}>
                        {error ? (
                            <AlertCircle className="w-16 h-16 text-red-500" />
                        ) : (
                            <img src="/tv-daktar-logo.png" alt="Logo" className="w-24 h-24 object-contain" />
                        )}
                    </div>
                </div>

                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-bold tracking-tight text-white">
                        PROMISE
                    </h1>
                    <p className="text-slate-400 text-sm font-medium tracking-widest uppercase">
                        Electronics
                    </p>
                </div>
            </div>

            {/* Status / Error Area */}
            <div className="absolute bottom-16 w-full max-w-[280px] flex flex-col gap-3 px-8 z-20">
                {error ? (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center max-h-[300px] overflow-y-auto">
                            <p className="text-red-400 font-bold text-sm mb-1">Connection Failed</p>
                            <pre className="text-red-300/80 text-[10px] text-left whitespace-pre-wrap font-mono">{error}</pre>
                            <p className="text-slate-500 text-[10px] mt-2 break-all">{API_BASE_URL}</p>
                        </div>
                        <button
                            onClick={checkConnection}
                            className="bg-white text-slate-900 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Retry Connection
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(14,165,233,0.6)]"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-slate-500 text-xs text-center">
                            {progress < 30 ? 'Connecting to server...' :
                                progress < 60 ? 'Loading resources...' :
                                    progress < 90 ? 'Preparing your experience...' :
                                        'Almost ready...'}
                        </p>
                    </>
                )}

                <p className="text-center text-[10px] text-slate-600 mt-4">
                    v2.4.1 (Native Build)
                </p>
            </div>
        </div>
    );
}
