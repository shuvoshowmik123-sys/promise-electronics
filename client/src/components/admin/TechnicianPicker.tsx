import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Check, Plus } from 'lucide-react';

// Skill tag → ticket type mapping
const SKILL_ALIASES: Record<string, string> = {
    tv: "full_tv_handling",
    fulltv: "full_tv_handling",
    full_tv: "full_tv_handling",
    full_tv_handling: "full_tv_handling",
    panel: "panel_repair",
    panel_gpr: "panel_repair",
    panel_repair: "panel_repair",
    panel_diagnosis: "panel_diagnosis",
    laser: "laser_machine_operation",
    laser_machine: "laser_machine_operation",
    laser_machine_operation: "laser_machine_operation",
    backlight: "backlight_repair",
    backlight_repair: "backlight_repair",
    panel_opening: "panel_opening",
    tcon: "tcon_repair",
    t_con: "tcon_repair",
    tcon_repair: "tcon_repair",
    motherboard: "motherboard_repair",
    mainboard: "motherboard_repair",
    motherboard_repair: "motherboard_repair",
    machine: "motherboard_repair",
    power: "power_board_repair",
    power_board: "power_board_repair",
    power_board_repair: "power_board_repair",
    firmware: "software_firmware",
    software: "software_firmware",
    software_firmware: "software_firmware",
    audio: "audio_speaker",
    speaker: "audio_speaker",
    audio_speaker: "audio_speaker",
    ir: "remote_ir_wifi",
    wifi: "remote_ir_wifi",
    remote: "remote_ir_wifi",
    remote_ir_wifi: "remote_ir_wifi",
    allrounder: "all_rounder",
    all_rounder: "all_rounder",
};

export interface TechUser {
    id: string;
    name: string;
    role: string;
    skills?: string | null;
    _dimmed?: boolean;
}

interface TechnicianPickerProps {
    users: TechUser[];
    ticketType?: string;
    issue?: string | null;
    assignedTechnicianId?: string | null;
    assistedByIds?: string[];
    onAssignedChange: (id: string | null, name: string) => void;
    onAssistedChange: (ids: string[]) => void;
}

function normalizeSkill(value: string) {
    const key = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return SKILL_ALIASES[key] || key;
}

export function parseSkills(skills?: string | null) {
    if (!skills) return [];
    try {
        const parsed = JSON.parse(skills);
        if (Array.isArray(parsed)) return parsed.map(item => normalizeSkill(String(item)));
    } catch {
        // legacy comma-separated values
    }
    return skills.split(/[,|]/).map(normalizeSkill).filter(Boolean);
}

export function hasAnySkill(tech: TechUser, requiredSkills: string[]) {
    if (!requiredSkills.length) return true;
    const techSkills = parseSkills(tech.skills);
    return techSkills.includes("all_rounder") || requiredSkills.some(skill => techSkills.includes(skill));
}

export function getJobSkillRules(ticketType: string, issue?: string | null) {
    const text = (issue || "").toLowerCase();
    const isPanelIssue = /panel|display|line|lines|cof|bond|laser|flick|flicker|screen/.test(text);
    const isBacklightIssue = /backlight|black screen|no picture/.test(text);
    const isTconIssue = /t[\s-]?con|half display|white screen/.test(text);
    const isPowerIssue = /power|dead|standby|restart/.test(text);
    const isMotherboardIssue = /mother|main.?board|hdmi|boot|logo/.test(text);

    if (ticketType === "panel_only") {
        return {
            primary: ["panel_repair", "laser_machine_operation"],
            assist: ["panel_repair", "laser_machine_operation", "panel_diagnosis"],
            strictPrimary: true,
            strictAssist: true,
            label: "Panel repair only",
        };
    }

    if (ticketType === "motherboard_only") {
        return {
            primary: ["motherboard_repair"],
            assist: ["motherboard_repair", "power_board_repair", "tcon_repair"],
            strictPrimary: false,
            strictAssist: false,
            label: "Board repair preferred",
        };
    }

    if (ticketType === "full_device") {
        const assist = new Set<string>();
        if (isPanelIssue) ["panel_repair", "laser_machine_operation", "panel_diagnosis"].forEach(skill => assist.add(skill));
        if (isBacklightIssue) ["backlight_repair", "panel_opening"].forEach(skill => assist.add(skill));
        if (isTconIssue) assist.add("tcon_repair");
        if (isPowerIssue) assist.add("power_board_repair");
        if (isMotherboardIssue) assist.add("motherboard_repair");

        return {
            primary: ["full_tv_handling", "tv_general_diagnosis"],
            assist: Array.from(assist),
            strictPrimary: false,
            strictAssist: false,
            label: assist.size > 0 ? "Full TV plus specialist assist" : "Full TV handling",
        };
    }

    return {
        primary: [],
        assist: [],
        strictPrimary: false,
        strictAssist: false,
        label: "Any available technician",
    };
}

export function TechnicianPicker({
    users,
    ticketType = "full_device",
    issue,
    assignedTechnicianId,
    assistedByIds = [],
    onAssignedChange,
    onAssistedChange
}: TechnicianPickerProps) {
    const skillRules = useMemo(() => getJobSkillRules(ticketType, issue), [issue, ticketType]);

    const eligibleTechs = useMemo(() => {
        const allTechs = users.filter(u => ['Technician', 'Super Admin', 'Admin'].includes(u.role));
        const matched = allTechs.filter(t => hasAnySkill(t, skillRules.primary));
        const others = allTechs.filter(t => !hasAnySkill(t, skillRules.primary));
        if (skillRules.strictPrimary) return matched;
        return [...matched, ...others.map(t => ({ ...t, _dimmed: skillRules.primary.length > 0 }))];
    }, [skillRules.primary, skillRules.strictPrimary, users]);

    // Assigned tech info
    const assignedTech = eligibleTechs.find(t => t.id === assignedTechnicianId);

    // Assist pool (everyone EXCEPT the assigned technician)
    const assistPool = useMemo(() => {
        const allTechs = users.filter(u => ['Technician', 'Super Admin', 'Admin'].includes(u.role) && u.id !== assignedTechnicianId);
        if (!skillRules.assist.length) return allTechs;
        const matched = allTechs.filter(t => hasAnySkill(t, skillRules.assist));
        const others = allTechs.filter(t => !hasAnySkill(t, skillRules.assist));
        if (skillRules.strictAssist) return matched;
        return [...matched, ...others.map(t => ({ ...t, _dimmed: true }))];
    }, [assignedTechnicianId, skillRules.assist, skillRules.strictAssist, users]);

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
                <div className="text-[11px] font-medium text-slate-400">{skillRules.label}</div>

                <div className="flex overflow-x-auto pb-2 -mx-1 px-1 gap-3 snap-x scrollbar-hide">
                    {eligibleTechs.length === 0 && (
                        <div className="text-sm text-slate-400 px-2 py-1 italic">No matching technicians available</div>
                    )}

                    {eligibleTechs.map(tech => {
                        const isSelected = assignedTechnicianId === tech.id;
                        const isDimmed = tech._dimmed === true;
                        return (
                            <motion.button
                                type="button"
                                key={tech.id}
                                onClick={() => handleAssignedClick(tech.id, tech.name)}
                                title={isDimmed ? "Skill mismatch for this job" : undefined}
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
                                        Mismatch
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
                                No matching assist available
                            </motion.div>
                        )}

                        {assistPool.map(tech => {
                            const isAssisting = assistedByIds.includes(tech.id);
                            const isDimmed = tech._dimmed === true;
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
                                        ${isAssisting ? 'bg-indigo-50/30' : isDimmed ? 'opacity-40' : 'hover:bg-white'}
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
                                    {isDimmed && (
                                        <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 whitespace-nowrap">
                                            Mismatch
                                        </span>
                                    )}
                                </motion.button>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
