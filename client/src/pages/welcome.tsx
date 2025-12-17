import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

const taglines = [
    "Your trusted partner for electronics",
    "Expert repairs you can rely on",
    "Quality service, guaranteed",
    "Fast and professional solutions"
];

export default function WelcomePage() {
    const [index, setIndex] = useState(0);
    const [, setLocation] = useLocation();
    const [phase, setPhase] = useState<'intro' | 'content'>('intro');

    useEffect(() => {
        // Start content phase after 2.5 seconds
        const timer = setTimeout(() => {
            setPhase('content');
        }, 2500);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (phase === 'content') {
            const timer = setInterval(() => {
                setIndex((prev) => (prev + 1) % taglines.length);
            }, 3000);
            return () => clearInterval(timer);
        }
    }, [phase]);

    const handleGetStarted = () => {
        localStorage.setItem("welcome_shown", "true");
        setLocation("/home");
    };

    return (
        <div className="h-screen w-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Video Layer */}
            <div className="absolute inset-0 z-0">
                <video
                    src="/welcome-video.mp4"
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                />
            </div>

            {/* Blur & Darken Overlay */}
            <motion.div
                initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                animate={phase === 'content' ? {
                    opacity: 1,
                    backdropFilter: "blur(8px)",
                    backgroundColor: "rgba(0, 0, 0, 0.6)"
                } : {
                    opacity: 0,
                    backdropFilter: "blur(0px)",
                    backgroundColor: "rgba(0, 0, 0, 0)"
                }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="absolute inset-0 z-10"
            />

            {/* Main Content Layer */}
            <div className="relative z-20 flex flex-col items-center justify-center w-full max-w-md p-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">

                <AnimatePresence>
                    {phase === 'content' && (
                        <>
                            {/* Logo Animation */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                className="mb-8"
                            >
                                <motion.div
                                    animate={{ y: [0, -10, 0] }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 4,
                                        ease: "easeInOut"
                                    }}
                                    className="w-40 h-40 flex items-center justify-center"
                                >
                                    <img src="/logo.png" alt="Promise Electronics" className="w-full h-full object-contain drop-shadow-2xl" />
                                </motion.div>
                            </motion.div>

                            {/* Text Content */}
                            <div className="space-y-6 text-center w-full">
                                <motion.h1
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.3, duration: 0.8 }}
                                    className="text-4xl font-heading font-bold tracking-tight text-white drop-shadow-lg"
                                >
                                    PROMISE ELECTRONICS
                                </motion.h1>

                                <div className="h-16 relative flex items-center justify-center overflow-hidden">
                                    <AnimatePresence mode="wait">
                                        <motion.p
                                            key={index}
                                            initial={{ y: 20, opacity: 0 }}
                                            animate={{ y: 0, opacity: 1 }}
                                            exit={{ y: -20, opacity: 0 }}
                                            transition={{ duration: 0.5 }}
                                            className="text-gray-200 text-lg font-medium absolute w-full px-4 drop-shadow-md"
                                        >
                                            {taglines[index]}
                                        </motion.p>
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Action Button */}
                            <motion.div
                                initial={{ y: 40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.8, duration: 0.8 }}
                                className="w-full mt-12 px-4"
                            >
                                <Button
                                    size="lg"
                                    onClick={handleGetStarted}
                                    className="w-full text-lg h-14 rounded-xl shadow-xl hover:shadow-2xl transition-all duration-300 bg-primary hover:bg-primary/90 text-primary-foreground group border border-white/10 backdrop-blur-sm"
                                >
                                    Get Started
                                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer */}
            <AnimatePresence>
                {phase === 'content' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.5, duration: 1 }}
                        className="absolute bottom-6 text-xs text-white/50 font-medium z-20"
                    >
                        v1.0.0 • Promise Electronics
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

