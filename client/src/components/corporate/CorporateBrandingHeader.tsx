import React from "react";
import { motion } from "framer-motion";
import { Building2 } from "lucide-react";

interface CorporateBrandingHeaderProps {
    title?: string;
    tagline?: string;
    showPremiumBadge?: boolean;
    size?: "compact" | "small" | "medium" | "large";
    /**
     * If true, uses static rendering without framer-motion animations.
     * Useful for sidebar or frequently re-rendered components.
     */
    noAnimation?: boolean;
}

export const CorporateBrandingHeader = React.memo(function CorporateBrandingHeader({
    title = "PROMISE CORPORATE PORTAL",
    tagline = "We Assure Excellence",
    showPremiumBadge = false,
    size = "medium",
    noAnimation = false
}: CorporateBrandingHeaderProps) {
    const sizeClasses = {
        compact: {
            title: "text-xl",
            subtitle: "text-xs",
            tagline: "text-xs",
            badge: "text-xs",
            container: "p-6",
            icon: "w-6 h-6",
            iconWrapper: "w-10 h-10"
        },
        small: {
            title: "text-2xl md:text-3xl",
            tagline: "text-sm md:text-base",
            badge: "text-xs",
            container: "py-4"
        },
        medium: {
            title: "text-3xl md:text-4xl",
            tagline: "text-base md:text-lg",
            badge: "text-sm",
            container: "py-6"
        },
        large: {
            title: "text-4xl md:text-5xl",
            tagline: "text-lg md:text-xl",
            badge: "text-base",
            container: "py-8"
        }
    };

    // Compact variant for sidebar (no framer-motion)
    if (size === "compact") {
        return (
            <div className={sizeClasses.compact.container}>
                <div className="flex items-center gap-3 font-bold text-xl text-slate-800">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--corp-blue)] to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-200">
                        <Building2 className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <span className="block leading-none">Promise</span>
                        <span className="text-xs text-[var(--corp-blue)] font-medium uppercase tracking-wider">Corporate</span>
                    </div>
                </div>
            </div>
        );
    }

    const Wrapper = noAnimation ? 'div' : motion.div;
    const wrapperProps = noAnimation ? {} : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.5 }
    };

    return (
        <Wrapper
            {...wrapperProps}
            className={`branding-section flex flex-col items-center justify-center space-y-3 ${sizeClasses[size].container}`}
        >
            {/* Primary Brand */}
            <motion.div
                className="flex items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
            >
                <Building2 className="w-6 h-6 text-[var(--corp-blue)]" />
                <h1 className={`portal-brand-header font-black tracking-tight ${sizeClasses[size].title}`}>
                    <span className="brand-gradient bg-gradient-to-r from-[var(--corp-blue)] to-blue-600 bg-clip-text text-transparent">
                        {title}
                    </span>
                </h1>
            </motion.div>

            {/* Elite Tagline */}
            {tagline && (
                <motion.div
                    className="portal-tagline flex items-center gap-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                >
                    <span className="tagline-divider w-8 h-0.5 bg-gradient-to-r from-transparent via-[var(--corp-blue)] to-transparent" />
                    <span className={`tagline-text font-medium text-slate-600 ${sizeClasses[size].tagline}`}>
                        {tagline}
                    </span>
                    <span className="tagline-divider w-8 h-0.5 bg-gradient-to-r from-transparent via-[var(--corp-blue)] to-transparent" />
                </motion.div>
            )}

            {/* Premium Badge (Optional) */}
            {showPremiumBadge && (
                <motion.div
                    className="premium-badge mt-2"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 }}
                >
                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/10 to-amber-400/10 border border-amber-200/50 text-amber-700 font-bold ${sizeClasses[size].badge}`}>
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Elite Access Partner
                    </span>
                </motion.div>
            )}

            {/* Premium Subtext */}
            <motion.p
                className="portal-subtext text-slate-500 text-center max-w-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
            >
                Exclusive partner access to enterprise electronics ecosystem
            </motion.p>
        </Wrapper>
    );
});

export default CorporateBrandingHeader;
