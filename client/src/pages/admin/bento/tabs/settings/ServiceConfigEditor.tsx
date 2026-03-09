import { Wrench, ShoppingBag, Tv, Ruler, AlertCircle, Filter } from "lucide-react";
import { TagListCard } from "./TagListCard";

export interface ServiceConfigEditorProps {
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

export function ServiceConfigEditor({
    serviceCategories, setServiceCategories,
    shopCategories, setShopCategories,
    tvBrands, setTvBrands,
    tvInches, setTvInches,
    commonSymptoms, setCommonSymptoms,
    serviceFilterCategories, setServiceFilterCategories
}: ServiceConfigEditorProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TagListCard
                title="Service Categories"
                icon={<Wrench className="w-5 h-5 text-blue-500" />}
                items={serviceCategories}
                setItems={setServiceCategories}
                placeholder="e.g. TV Repair, AC Servicing"
                accentColor="blue"
            />
            <TagListCard
                title="Shop Categories"
                icon={<ShoppingBag className="w-5 h-5 text-emerald-500" />}
                items={shopCategories}
                setItems={setShopCategories}
                placeholder="e.g. Spare Parts, Accessories"
                accentColor="emerald"
            />
            <TagListCard
                title="TV Brands"
                icon={<Tv className="w-5 h-5 text-purple-500" />}
                items={tvBrands}
                setItems={setTvBrands}
                placeholder="e.g. Samsung, LG, Sony"
                accentColor="purple"
            />
            <TagListCard
                title="TV Sizes (Inches)"
                icon={<Ruler className="w-5 h-5 text-amber-500" />}
                items={tvInches}
                setItems={setTvInches}
                placeholder="e.g. 32, 43, 55"
                accentColor="amber"
            />
            <TagListCard
                title="Common Symptoms"
                icon={<AlertCircle className="w-5 h-5 text-rose-500" />}
                items={commonSymptoms}
                setItems={setCommonSymptoms}
                placeholder="e.g. No Power, Display Broken"
                accentColor="rose"
            />
            <TagListCard
                title="Service Filter Tags"
                icon={<Filter className="w-5 h-5 text-cyan-500" />}
                items={serviceFilterCategories}
                setItems={setServiceFilterCategories}
                placeholder="e.g. Hardware, Software"
                accentColor="cyan"
            />
        </div>
    );
}
