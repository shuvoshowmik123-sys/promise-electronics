import { Building2, X, ArrowRight } from "lucide-react";

interface PortalEntryScreenProps {
    onViewClients: () => void;
    onExit: () => void;
}

export default function PortalEntryScreen({ onViewClients, onExit }: PortalEntryScreenProps) {
    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-[#0a0f1a] text-white">
            {/* Subtle grid pattern */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                style={{
                    backgroundImage:
                        "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                }}
            />

            <button
                onClick={onExit}
                aria-label="Exit B2B mode"
                className="absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition active:scale-95"
            >
                <X size={20} />
            </button>

            <div className="relative flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 shadow-[0_0_50px_rgba(16,185,129,0.18)]">
                    <Building2 size={36} className="text-emerald-400" />
                </div>

                <h1 className="mt-6 text-5xl font-black tracking-tight">B2B</h1>
                <p className="mt-2 text-xs font-bold uppercase tracking-[0.35em] text-slate-400">
                    Corporate Workspace
                </p>

                <div className="mt-7 h-px w-16 bg-emerald-500/40" />

                <p className="mt-7 text-sm text-slate-400">Select a client to begin</p>

                <button
                    onClick={onViewClients}
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition active:scale-95"
                >
                    View Clients
                    <ArrowRight size={16} />
                </button>
            </div>
        </div>
    );
}
