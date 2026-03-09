import { useState } from "react";
import {
    Wrench, ShoppingBag, Tv, Ruler, AlertCircle, Filter,
    Plus, X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BentoCard } from "../../shared";
import { motion, AnimatePresence } from "framer-motion";

import { TagListCard } from "./TagListCard";

interface ServiceConfigSectionProps {
    serviceCategories: string[];
    setServiceCategories: (v: string[]) => void;
    shopCategories: string[];
    setShopCategories: (v: string[]) => void;
    tvBrands: string[];
    setTvBrands: (v: string[]) => void;
    tvInches: string[];
    setTvInches: (v: string[]) => void;
    commonSymptoms: string[];
    setCommonSymptoms: (v: string[]) => void;
    serviceFilterCategories: string[];
    setServiceFilterCategories: (v: string[]) => void;
}

export default function ServiceConfigSection(props: ServiceConfigSectionProps) {
    const categories = [
        { label: "Service Categories", count: props.serviceCategories.length, icon: Wrench, color: "text-blue-500", bg: "bg-blue-50", border: "border-blue-100" },
        { label: "Shop Categories", count: props.shopCategories.length, icon: ShoppingBag, color: "text-emerald-500", bg: "bg-emerald-50", border: "border-emerald-100" },
        { label: "TV Brands", count: props.tvBrands.length, icon: Tv, color: "text-purple-500", bg: "bg-purple-50", border: "border-purple-100" },
        { label: "TV Sizes", count: props.tvInches.length, icon: Ruler, color: "text-amber-500", bg: "bg-amber-50", border: "border-amber-100" },
        { label: "Common Symptoms", count: props.commonSymptoms.length, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50", border: "border-rose-100" },
        { label: "Service Filter", count: props.serviceFilterCategories.length, icon: Filter, color: "text-cyan-500", bg: "bg-cyan-50", border: "border-cyan-100" },
    ];

    const totalTags = categories.reduce((sum, cat) => sum + cat.count, 0);

    return (
        <BentoCard
            className="cursor-pointer group relative overflow-hidden"
            title="Service & Inventory Catalogs"
            icon={<Wrench className="w-5 h-5 text-indigo-500" />}
            variant="glass"
            onClick={() => document.dispatchEvent(new CustomEvent('open-sheet', { detail: 'catalog' }))}
            layoutId="card-catalog"
        >
            <div className="flex flex-col h-full justify-between pb-2 mt-2 relative z-10">
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Hero Stat */}
                    <div className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl border border-indigo-100/50 shrink-0 min-w-[160px] group-hover:shadow-lg group-hover:shadow-indigo-500/10 transition-all duration-300 group-hover:-translate-y-1">
                        <div className="text-4xl font-black text-indigo-600 mb-2">{totalTags}</div>
                        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest text-center">Active<br />Master Tags</div>
                    </div>

                    {/* Miniature Badges Grid */}
                    <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {categories.map((cat, i) => (
                            <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${cat.border} ${cat.bg} group-hover:bg-white group-hover:border-slate-200 transition-colors`}>
                                <div className="flex items-center gap-2 overflow-hidden pr-2">
                                    <cat.icon className={`w-4 h-4 shrink-0 ${cat.color}`} />
                                    <span className="text-xs font-semibold text-slate-700 truncate">{cat.label}</span>
                                </div>
                                <Badge variant="secondary" className="bg-white font-bold shrink-0">{cat.count}</Badge>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="text-indigo-600 font-semibold text-sm text-center pt-5 opacity-0 group-hover:opacity-100 transition-all">
                    Manage Catalogs &rarr;
                </div>
            </div>
        </BentoCard>
    );
}
