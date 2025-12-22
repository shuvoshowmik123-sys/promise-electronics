import React, { useEffect } from 'react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

interface NativeShellProps {
    children: React.ReactNode;
    header?: React.ReactNode;
    footer?: React.ReactNode;
    statusBarStyle?: 'light' | 'dark';
    backgroundColor?: string;
}

/**
 * NativeShell - A wrapper component that handles system UI (Status Bar, Safe Areas)
 * and provides a consistent native-like layout structure.
 */
export default function NativeShell({
    children,
    header,
    footer,
    statusBarStyle = 'dark',
    backgroundColor = '#ffffff'
}: NativeShellProps) {

    useEffect(() => {
        const initSystemUI = async () => {
            if (Capacitor.isNativePlatform()) {
                try {
                    // Set status bar style based on background
                    await StatusBar.setStyle({
                        style: statusBarStyle === 'dark' ? Style.Light : Style.Dark
                    });
                    await StatusBar.setBackgroundColor({ color: backgroundColor });
                    await StatusBar.setOverlaysWebView({ overlay: false });
                } catch (error) {
                    console.error('Failed to initialize system UI:', error);
                }
            }
        };
        initSystemUI();
    }, [statusBarStyle, backgroundColor]);

    return (
        <div className="flex flex-col h-full w-full bg-[var(--color-native-surface)]">
            {/* HEADER: Padded for the Notch */}
            {header && (
                <header className="flex-none bg-[var(--color-native-surface)] border-b border-[var(--color-native-border)] pt-[var(--safe-top)]">
                    <div className="h-14 flex items-center px-4">
                        {header}
                    </div>
                </header>
            )}

            {/* MAIN CONTENT: Scrollable independent of bars */}
            <main className="native-scroll-area bg-[var(--color-native-bg)]">
                {children}
            </main>

            {/* FOOTER: Padded for the Home Bar */}
            {footer && (
                <footer className="flex-none bg-[var(--color-native-surface)] border-t border-[var(--color-native-border)] pb-[var(--safe-bottom)]">
                    <div className="h-16 flex items-center">
                        {footer}
                    </div>
                </footer>
            )}
        </div>
    );
}
