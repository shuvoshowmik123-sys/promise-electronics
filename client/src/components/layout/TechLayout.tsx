import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LogOut, Wrench, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";

export function TechLayout({ children }: { children: ReactNode }) {
    const { user, logout } = useAdminAuth();
    const [location] = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Minimalist Header */}
            <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/tech" className="flex items-center gap-2 text-blue-600 font-bold text-xl hover:opacity-90 transition-opacity">
                            <div className="bg-blue-600 rounded-lg p-1.5 flex items-center justify-center">
                                <Wrench className="w-5 h-5 text-white" />
                            </div>
                            <span>TechPortal</span>
                        </Link>
                    </div>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex flex-1 items-center justify-end justify-between ml-8">
                        <nav className="flex items-center space-x-6">
                            <Link href="/tech" className={`text-sm font-medium transition-colors hover:text-blue-600 ${location === '/tech' ? 'text-blue-600' : 'text-slate-600'}`}>
                                Workspace
                            </Link>
                        </nav>
                        <div className="flex items-center gap-4">
                            <div className="text-right flex flex-col items-end mr-2">
                                <span className="text-sm font-semibold text-slate-900">{user?.username}</span>
                                <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">{user?.role}</span>
                            </div>
                            <div className="h-8 w-px bg-slate-200" />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-slate-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => logout()}
                            >
                                <LogOut className="w-4 h-4 mr-2" />
                                Sign Out
                            </Button>
                        </div>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <button
                        className="md:hidden p-2 text-slate-600"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div className="md:hidden fixed inset-0 top-16 z-40 bg-white border-b border-slate-200 p-4">
                    <nav className="flex flex-col space-y-4">
                        <Link href="/tech" className={`text-base font-medium px-4 py-3 rounded-lg ${location === '/tech' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setIsMobileMenuOpen(false)}>
                            Workspace
                        </Link>
                    </nav>
                    <div className="mt-8 pt-8 border-t border-slate-100 px-4">
                        <div className="mb-4">
                            <div className="text-sm text-slate-500">Logged in as</div>
                            <div className="font-semibold text-slate-900">{user?.username}</div>
                        </div>
                        <Button
                            variant="destructive"
                            className="w-full justify-start"
                            onClick={() => logout()}
                        >
                            <LogOut className="w-4 h-4 mr-2" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="flex-1 container mx-auto p-4 md:p-8">
                {children}
            </main>
        </div>
    );
}
