import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Zap } from "lucide-react";

export default function Splash() {
    const [progress, setProgress] = useState(0);
    const [, navigate] = useLocation();

    useEffect(() => {
        // Simulate real loading progress
        const timer = setInterval(() => {
            setProgress((oldProgress) => {
                if (oldProgress >= 100) {
                    clearInterval(timer);
                    return 100;
                }
                // Jump by random small amounts to look "real"
                const diff = Math.random() * 15;
                return Math.min(oldProgress + diff, 100);
            });
        }, 200);

        return () => clearInterval(timer);
    }, []);

    // Redirect when done
    useEffect(() => {
        if (progress >= 100) {
            const redirectTimer = setTimeout(() => navigate('/native/login'), 300);
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
                    <div className="absolute inset-0 bg-sky-500/20 blur-2xl rounded-full scale-110" />
                    <div className="relative w-32 h-32 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center shadow-2xl ring-4 ring-slate-800">
                        <Zap className="w-16 h-16 text-sky-500 fill-current" />
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

            {/* The Animated Progress Bar */}
            <div className="absolute bottom-16 w-full max-w-[280px] flex flex-col gap-3 px-8">
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(14,165,233,0.6)]"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                <p className="text-slate-500 text-xs text-center">
                    {progress < 30 ? 'Initializing...' :
                        progress < 60 ? 'Loading resources...' :
                            progress < 90 ? 'Preparing your experience...' :
                                'Almost ready...'}
                </p>
                <p className="text-center text-[10px] text-slate-600 mt-4">
                    v2.4.0 (Native Build)
                </p>
            </div>
        </div>
    );
}

