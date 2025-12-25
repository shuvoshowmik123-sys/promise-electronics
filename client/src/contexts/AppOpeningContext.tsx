import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';

interface ExpandingElement {
    rect: DOMRect;
    color: string;
    targetUrl: string;
    icon?: ReactNode;
}

interface AppOpeningContextType {
    triggerExpand: (element: HTMLElement, targetUrl: string, color: string, icon?: ReactNode) => void;
    isExpanding: boolean;
}

const AppOpeningContext = createContext<AppOpeningContextType | null>(null);

export function useAppOpening() {
    const context = useContext(AppOpeningContext);
    if (!context) {
        throw new Error('useAppOpening must be used within AppOpeningProvider');
    }
    return context;
}

interface AppOpeningProviderProps {
    children: ReactNode;
}

export function AppOpeningProvider({ children }: AppOpeningProviderProps) {
    const [expandingElement, setExpandingElement] = useState<ExpandingElement | null>(null);
    const [isExpanding, setIsExpanding] = useState(false);
    const [, setLocation] = useLocation();

    const triggerExpand = useCallback((element: HTMLElement, targetUrl: string, color: string, icon?: ReactNode) => {
        const rect = element.getBoundingClientRect();
        setExpandingElement({ rect, color, targetUrl, icon });
        setIsExpanding(true);

        // Navigate after animation starts
        setTimeout(() => {
            setLocation(targetUrl);
            // Clean up after navigation - Increase delay to ensure it stays expanded
            setTimeout(() => {
                setExpandingElement(null);
                setIsExpanding(false);
            }, 400);
        }, 350); // Slightly before animation ends
    }, [setLocation]);

    return (
        <AppOpeningContext.Provider value={{ triggerExpand, isExpanding }}>
            {children}

            {/* Expanding Overlay */}
            <AnimatePresence>
                {expandingElement && (
                    <motion.div
                        initial={{
                            position: 'fixed',
                            top: expandingElement.rect.top,
                            left: expandingElement.rect.left,
                            width: expandingElement.rect.width,
                            height: expandingElement.rect.height,
                            borderRadius: '50%',
                            background: expandingElement.color,
                            zIndex: 9999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        animate={{
                            top: 0,
                            left: 0,
                            width: '100vw',
                            height: '100vh',
                            borderRadius: '44px',
                        }}
                        exit={{
                            opacity: 0,
                            transition: { duration: 0.4 }
                        }}
                        transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 30,
                            mass: 1,
                        }}
                    >
                        {/* Icon that fades out */}
                        <motion.div
                            initial={{ opacity: 1, scale: 1 }}
                            animate={{ opacity: 0, scale: 2 }}
                            transition={{ duration: 0.2, delay: 0.1 }}
                            className="text-white"
                        >
                            {expandingElement.icon}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </AppOpeningContext.Provider>
    );
}

// Helper component for buttons that trigger the app opening animation
interface AppOpeningButtonProps {
    href: string;
    color: string;
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
    iconClassName?: string;
}

export function AppOpeningButton({ href, color, icon, children, className, iconClassName }: AppOpeningButtonProps) {
    const { triggerExpand } = useAppOpening();
    const buttonRef = useRef<HTMLButtonElement>(null);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        if (buttonRef.current) {
            // Find the icon element within the button
            const iconElement = buttonRef.current.querySelector('[data-expand-origin]') as HTMLElement;
            const element = iconElement || buttonRef.current;
            triggerExpand(element, href, color, icon);
        }
    };

    return (
        <button ref={buttonRef} onClick={handleClick} className={className}>
            {children}
        </button>
    );
}
