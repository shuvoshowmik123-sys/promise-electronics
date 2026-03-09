import { motion } from "framer-motion";
import { Construction } from "lucide-react";
import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants } from "../shared/animations";

interface PlaceholderTabProps {
    tabName: string;
}

export default function PlaceholderTab({ tabName }: PlaceholderTabProps) {
    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col items-center justify-center min-h-[600px]"
        >
            <motion.div variants={itemVariants} className="max-w-md w-full">
                <BentoCard
                    className="p-12 flex flex-col items-center text-center h-full"
                    variant="glass"
                >
                    <div className="h-20 w-20 rounded-3xl bg-amber-100 flex items-center justify-center text-amber-600 mb-6">
                        <Construction size={40} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2 uppercase tracking-tight">
                        {tabName} Concept
                    </h2>
                    <p className="text-slate-500 mb-8">
                        This module is currently being redesigned as part of the 2026 Modern Bento Redesign project.
                    </p>
                    <div className="px-4 py-2 bg-slate-100 rounded-full text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Under Development
                    </div>
                </BentoCard>
            </motion.div>
        </motion.div>
    );
}
