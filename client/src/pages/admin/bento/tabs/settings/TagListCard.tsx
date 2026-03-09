import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BentoCard } from "../../shared";
import { motion, AnimatePresence } from "framer-motion";

export interface TagListCardProps {
    title: string;
    icon: React.ReactNode;
    items: string[];
    setItems: (items: string[]) => void;
    placeholder: string;
    accentColor: string; // tailwind color name (e.g. "blue", "emerald")
}

export function TagListCard({ title, icon, items, setItems, placeholder, accentColor }: TagListCardProps) {
    const [newItem, setNewItem] = useState("");

    const handleAdd = () => {
        const trimmed = newItem.trim();
        if (trimmed && !items.includes(trimmed)) {
            setItems([...items, trimmed]);
            setNewItem("");
        }
    };

    const handleDelete = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const colorMap: Record<string, { bg: string; border: string; badge: string; hover: string }> = {
        blue: { bg: "bg-blue-50/40", border: "border-blue-100/60", badge: "bg-blue-50 text-blue-700 border-blue-200/60 hover:border-blue-300", hover: "hover:bg-blue-50/60" },
        emerald: { bg: "bg-emerald-50/40", border: "border-emerald-100/60", badge: "bg-emerald-50 text-emerald-700 border-emerald-200/60 hover:border-emerald-300", hover: "hover:bg-emerald-50/60" },
        purple: { bg: "bg-purple-50/40", border: "border-purple-100/60", badge: "bg-purple-50 text-purple-700 border-purple-200/60 hover:border-purple-300", hover: "hover:bg-purple-50/60" },
        amber: { bg: "bg-amber-50/40", border: "border-amber-100/60", badge: "bg-amber-50 text-amber-700 border-amber-200/60 hover:border-amber-300", hover: "hover:bg-amber-50/60" },
        rose: { bg: "bg-rose-50/40", border: "border-rose-100/60", badge: "bg-rose-50 text-rose-700 border-rose-200/60 hover:border-rose-300", hover: "hover:bg-rose-50/60" },
        cyan: { bg: "bg-cyan-50/40", border: "border-cyan-100/60", badge: "bg-cyan-50 text-cyan-700 border-cyan-200/60 hover:border-cyan-300", hover: "hover:bg-cyan-50/60" },
    };

    const colors = colorMap[accentColor] || colorMap.blue;

    return (
        <BentoCard title={title} icon={icon} variant="glass" disableHover>
            <div className="space-y-4 pt-1">
                {/* Add Input */}
                <div className="flex gap-2">
                    <Input
                        value={newItem}
                        onChange={(e) => setNewItem(e.target.value)}
                        placeholder={placeholder}
                        className="bg-white/70 border-slate-200/80"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                    />
                    <Button
                        onClick={handleAdd}
                        size="icon"
                        disabled={!newItem.trim()}
                        className="shrink-0 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 shadow-md"
                    >
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                    <AnimatePresence mode="popLayout">
                        {items.map((item, idx) => (
                            <motion.div
                                key={item}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                layout
                                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            >
                                <Badge
                                    variant="outline"
                                    className={`px-3 py-1.5 text-sm font-medium border rounded-full flex items-center gap-2 group transition-all duration-200 cursor-default ${colors.badge}`}
                                >
                                    {item}
                                    <button
                                        onClick={() => handleDelete(idx)}
                                        className="text-current/40 hover:text-red-500 transition-colors ml-0.5"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </Badge>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {items.length === 0 && (
                        <p className="text-sm text-slate-400 italic">No items yet. Add one above.</p>
                    )}
                </div>

                {/* Count */}
                <div className="text-[11px] text-slate-400 font-medium">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                </div>
            </div>
        </BentoCard>
    );
}
