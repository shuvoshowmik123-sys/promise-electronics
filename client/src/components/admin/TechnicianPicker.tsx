import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Check, Plus } from 'lucide-react';

// Skill tag → ticket type mapping
const SKILL_REQUIRED_FOR: Record<string, string[]> = {
    "panel_only": ["panel", "all_rounder"],
    "motherboard_only": ["machine", "all_rounder"],
    "full_device": ["tv", "all_rounder"],
    "parts_only": [], // any tech
};

interface TechUser {
    id: string;
    name: string;
    role: string;
    skills?: string | null;
    _dimmed?: boolean;
}

interface TechnicianPickerProps {
    users: TechUser[];
    ticketType?: string;
    assignedTechnicianId?: string | null;
    assistedByIds?: string[];
    onAssignedChange: (id: string | null, name: string) => void;
    onAssistedChange: (ids: string[]) => void;
}

function hasSkill(tech: TechUser, requiredSkills: string[]): boolean {
    if (!requiredSkills.length) return true;
    if (!tech.skills) return false;
    const techSkills = tech.skills.toLowerCase().split(/[,\s]+/).map(s => s.trim());
    return requiredSkills.some(req => techSkills.includes(req.toLowerCase()));
}

export function TechnicianPicker({
    users,
    ticketType = "full_device",
    assignedTechnicianId,
    assistedByIds = [],
    onAssignedChange,
    onAssistedChange
}: TechnicianPickerProps) {
    // Filter eligible technical staff, then filter by skill
    const eligibleTechs = useMemo(() => {
        const allTechs = users.filter(u => ['Technician', 'Super Admin'].includes(u.role));
        const requiredSkills = SKILL_REQUIRED_FOR[ticketType] ?? [];
        if (!requiredSkills.length) return allTechs;
        // Show matching techs first, then all others greyed out
        const matched = allTechs.filter(t => hasSkill(t, requiredSkills));
        const others = allTechs.filter(t => !hasSkill(t, requiredSkills));
        return [...matched, ...others.map(t => ({ ...t, _dimmed: true }))];
    }, [users, ticketType]);

    // Assigned tech info
    const assignedTech = eligibleTechs.find(t => t.id === assignedTechnicianId);

    // Assist pool (everyone EXCEPT the assigned technician)
    const assistPool = useMemo(() => {
        return eligibleTechs.filter(t => t.id !== assignedTechnicianId);
    }, [eligibleTechs, assignedTechnicianId]);

    const handleAssignedClick = (techId: string, techName: string) => {
        if (assignedTechnicianId === techId) {
            // Deselect
            onAssignedChange(null, "Unassigned");
        } else {
            // Select new primary tech
            onAssignedChange(techId, techName);

            // Auto-exclusion: if this tech was in the assist list, remove them!
            if (assistedByIds.includes(techId)) {
                onAssistedChange(assistedByIds.filter(id => id !== techId));
            }
        }
    };

    const handleAssistClick = (techId: string) => {
        if (assistedByIds.includes(techId)) {
            // Remove
            onAssistedChange(assistedByIds.filter(id => id !== techId));
        } else {
            // Add
            onAssistedChange([...assistedByIds, techId]);
        }
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    };

    return (
        <div className="space-y-6">
            {/* --- PRIMARY ASSIGNMENT ROW --- */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> Assigned Technician
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${assignedTech ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-slate-500 bg-white border-slate-200"}`}>
                        {assignedTech ? assignedTech.name : "No one assigned"}
                    </span>
                </div>

                <div className="flex overflow-x-auto pb-2 -mx-1 px-1 gap-3 snap-x scrollbar-hide">
                    {eligibleTechs.length === 0 && (
                        <div className="text-sm text-slate-400 px-2 py-1 italic">No technicians available</div>
                    )}

                    {eligibleTechs.map(tech => {
                        const isSelected = assignedTechnicianId === tech.id;
                        const isDimmed = tech._dimmed === true;
                        return (
                            <motion.button
                                type="button"
                                key={tech.id}
                                onClick={() => handleAssignedClick(tech.id, tech.name)}
                                title={isDimmed ? "Skill mismatch for this ticket type" : undefined}
                                className={`
                                    relative flex flex-col items-center gap-2 min-w-[72px] shrink-0
                                    rounded-xl p-2 transition-all duration-200 snap-center outline-none
                                    ${isSelected ? 'bg-blue-50/50' : isDimmed ? 'opacity-40' : 'hover:bg-slate-50'}
                                `}
                            >
                                {/* Avatar Ring */}
                                <div className={`
                                    relative w-12 h-12 rounded-full flex items-center justify-center
                                    text-base font-bold transition-all duration-300 shadow-sm
                                    ${isSelected
                                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white ring-4 ring-blue-100 ring-offset-2'
                                        : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'}
                                `}>
                                    {getInitials(tech.name)}

                                    {/* Selected Badge */}
                                    <AnimatePresence>
                                        {isSelected && (
                                            <motion.div
                                                initial={{ scale: 0, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                exit={{ scale: 0, opacity: 0 }}
                                                className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm"
                                            >
                                                <div className="bg-emerald-500 rounded-full p-0.5 text-white">
                                                    <Check className="w-2.5 h-2.5" strokeWidth={4} />
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <span className={`text-[11px] font-semibold truncate w-full text-center transition-colors ${isSelected ? 'text-blue-700' : 'text-slate-600'}`}>
                                    {tech.name.split(' ')[0]}
                                </span>
                                {isDimmed && (
                                    <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 whitespace-nowrap">
                                        Skill
                                    </span>
                                )}
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* --- ASSIST TEAM ROW (OPTIONAL) --- */}
            <div className="space-y-3 bg-slate-50/50 rounded-2xl p-4 border border-slate-100/80">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" /> Assist Team <span className="text-slate-300 font-normal normal-case">(Optional)</span>
                    </span>
                    {assistedByIds.length > 0 && (
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                            +{assistedByIds.length}
                        </span>
                    )}
                </div>

                <div className="flex overflow-x-auto pb-2 -mx-1 px-1 gap-3 snap-x scrollbar-hide min-h-[90px]">
                    <AnimatePresence mode="popLayout">
                        {assistPool.length === 0 && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="text-sm text-slate-400 px-2 py-3 italic w-full text-center"
                            >
                                All eligible staff assigned
                            </motion.div>
                        )}

                        {assistPool.map(tech => {
                            const isAssisting = assistedByIds.includes(tech.id);
                            return (
                                <motion.button
                                    layout
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    type="button"
                                    key={tech.id}
                                    onClick={() => handleAssistClick(tech.id)}
                                    className={`
                                        relative flex flex-col items-center gap-2 min-w-[72px] shrink-0
                                        rounded-xl p-2 transition-all duration-200 snap-center outline-none
                                        ${isAssisting ? 'bg-indigo-50/30' : 'hover:bg-white'}
                                    `}
                                >
                                    {/* Avatar Ring */}
                                    <div className={`
                                        relative w-10 h-10 rounded-full flex items-center justify-center
                                        text-sm font-bold transition-all duration-300 shadow-sm
                                        ${isAssisting
                                            ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-200 ring-offset-2'
                                            : 'bg-white border-2 border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-500 hover:border-solid hover:bg-indigo-50'}
                                    `}>
                                        {getInitials(tech.name)}
                                    </div>
                                    <span className={`text-[10px] font-semibold truncate w-full text-center transition-colors ${isAssisting ? 'text-indigo-700' : 'text-slate-500'}`}>
                                        {tech.name.split(' ')[0]}
                                    </span>
                                </motion.button>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
