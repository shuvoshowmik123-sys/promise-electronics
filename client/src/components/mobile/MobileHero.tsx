import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, ArrowRight, X } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface MobileHeroProps {
    heroImage: string;
    onPlayVideo?: () => void;
}

export function MobileHero({ heroImage, onPlayVideo }: MobileHeroProps) {
    const [showVideo, setShowVideo] = useState(false);

    return (
        <div className="relative w-full h-[85vh] overflow-hidden bg-slate-900">
            {/* Background Image */}
            <div className="absolute inset-0">
                <img
                    src={heroImage}
                    alt="Technician working"
                    className="w-full h-full object-cover opacity-90"
                />
                {/* Dark Overlay Gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
            </div>

            {/* Top Right Video Button */}
            <div className="absolute top-4 right-4 z-20">
                <button
                    onClick={() => setShowVideo(true)}
                    className="group flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-full pl-3 pr-4 py-1.5 text-white text-sm font-medium transition-all active:scale-95"
                >
                    <div className="w-6 h-6 rounded-full bg-white text-primary flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                    </div>
                    Play Video
                </button>
            </div>

            {/* Glassmorphic Card Content */}
            <div className="absolute bottom-8 left-4 right-4 z-20">
                <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <h1 className="text-4xl font-heading font-bold text-white leading-tight mb-2">
                            Expert Repair, <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                                Delivered.
                            </span>
                        </h1>
                        <p className="text-slate-200 text-sm mb-6 leading-relaxed">
                            Professional electronics repair service at your doorstep. Fast, reliable, and trusted by thousands.
                        </p>

                        <Link href="/repair">
                            <Button
                                size="lg"
                                className="w-full h-14 text-lg font-bold bg-gradient-to-r from-primary to-cyan-600 hover:from-primary/90 hover:to-cyan-600/90 border-0 shadow-lg shadow-primary/25 rounded-xl"
                            >
                                Book Now <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                        </Link>
                    </motion.div>
                </div>
            </div>

            {/* Video Modal */}
            <Dialog open={showVideo} onOpenChange={setShowVideo}>
                <DialogContent className="sm:max-w-[800px] p-0 bg-black border-slate-800 overflow-hidden">
                    <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
                        {/* Placeholder for Video - You can replace src with actual video URL */}
                        <iframe
                            width="100%"
                            height="100%"
                            src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
                            title="Promise Electronics Intro"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                        <button
                            onClick={() => setShowVideo(false)}
                            className="absolute top-4 right-4 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
