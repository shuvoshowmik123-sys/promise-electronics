import { useState } from "react";
import { motion } from "framer-motion";
import { Check, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const AVATAR_SEEDS = [
    "Felix", "Aneka", "Zoe", "Jack", "Bella",
    "Leo", "Mia", "Max", "Lily", "Sam",
    "Chloe", "Oscar", "Ruby", "Charlie", "Luna"
];

interface AvatarSelectorProps {
    currentAvatar?: string;
    onSelect: (avatar: string) => void;
}

export function AvatarSelector({ currentAvatar, onSelect }: AvatarSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState(currentAvatar || AVATAR_SEEDS[0]);

    const handleSave = () => {
        onSelect(selected);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <div className="relative group cursor-pointer">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-neumorph bg-slate-100 flex items-center justify-center">
                        {currentAvatar ? (
                            <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentAvatar}`}
                                alt="Avatar"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <User className="w-10 h-10 text-slate-400" />
                        )}
                    </div>
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xs font-bold">Change</span>
                    </div>
                </div>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Choose Your Avatar</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 py-4 max-h-[60vh] overflow-y-auto">
                    {AVATAR_SEEDS.map((seed) => (
                        <motion.div
                            key={seed}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setSelected(seed)}
                            className={`relative aspect-square rounded-full overflow-hidden border-2 cursor-pointer transition-all ${selected === seed ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-slate-200"
                                }`}
                        >
                            <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`}
                                alt={seed}
                                className="w-full h-full bg-slate-50"
                            />
                            {selected === seed && (
                                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <Check className="w-6 h-6 text-primary drop-shadow-md" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save Avatar</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
