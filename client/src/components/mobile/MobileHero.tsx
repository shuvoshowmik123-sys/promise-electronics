import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

interface MobileHeroProps {
    heroImage: string;
}

export function MobileHero({ heroImage }: MobileHeroProps) {

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



            {/* Glassmorphic Card Content */}
            <div className="absolute bottom-8 left-4 right-4 z-20">
                <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
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


        </div>
    );
}
