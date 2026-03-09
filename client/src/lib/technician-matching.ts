import { JobTicket, User } from "@shared/schema";

export interface TechnicianMatch {
    technicianId: string;
    technicianName: string;
    matchScore: number; // 0-100
    skillsMatch: string[];
    currentWorkload: number;
    recommendation: 'excellent' | 'good' | 'fair' | 'low';
}

// Keywords mapping to skill tags
const PROBLEM_SKILL_MAP: Record<string, string[]> = {
    'backlight': ['Backlight', 'Panel', 'Hardware'],
    'no_power': ['Power Supply', 'Motherboard', 'Circuit'],
    'software': ['Software', 'Firmware', 'Android'],
    'panel_damage': ['Panel', 'Bonding'],
    'board_repair': ['Motherboard', 'Chip Level', 'Soldering'],
    'power_supply': ['Power Supply', 'High Voltage'],
    'mainboard': ['Motherboard', 'Logic Board'],
    'tcon': ['T-Con', 'Panel'],
    'sound': ['Audio', 'Speaker'],
    'wifi': ['Network', 'Module'],
    'remote': ['IR', 'Sensor'],
};

/**
 * Calculate a match score (0-100) between required skills and technician skills
 */
export function calculateMatchScore(requiredSkills: string[], technicianSkills: string[]): { score: number, matches: string[] } {
    if (!requiredSkills.length) return { score: 50, matches: [] }; // Neutral score if no specific requirements
    if (!technicianSkills.length) return { score: 10, matches: [] }; // Low score if technician has no logged skills

    const normalizedTechSkills = technicianSkills.map(s => s.toLowerCase().trim());

    let matchCount = 0;
    const matches: string[] = [];

    requiredSkills.forEach(req => {
        // Direct match or partial match
        const found = normalizedTechSkills.find(tech =>
            tech.includes(req.toLowerCase()) || req.toLowerCase().includes(tech)
        );

        if (found) {
            matchCount++;
            matches.push(req);
        }
    });

    const score = Math.round((matchCount / requiredSkills.length) * 100);
    return { score, matches };
}

/**
 * Extract required skills from a list of jobs based on their reported problems
 */
export function extractRequiredSkills(jobs: JobTicket[]): string[] {
    const problems = new Set<string>();

    jobs.forEach(job => {
        // Check initial reported defect
        if (job.reportedDefect) {
            problems.add(job.reportedDefect.toLowerCase());
        }
        // Check technician diagnosis
        if (job.problemFound) {
            job.problemFound.split(',').forEach(p => problems.add(p.trim().toLowerCase()));
        }
        // Check ticket issue description
        if (job.issue) {
            problems.add(job.issue.toLowerCase());
        }
    });

    const skills = new Set<string>();

    // Map problems to skills
    Array.from(problems).forEach(prob => {
        Object.entries(PROBLEM_SKILL_MAP).forEach(([keyword, mappedSkills]) => {
            if (prob.includes(keyword)) {
                mappedSkills.forEach(s => skills.add(s));
            }
        });
    });

    return Array.from(skills);
}

/**
 * Generate technician recommendations for a batch of jobs
 */
export function recommendTechnicians(jobs: JobTicket[], technicians: (User & { activeJobs?: number })[]): TechnicianMatch[] {
    const requiredSkills = extractRequiredSkills(jobs);

    return technicians.map(tech => {
        // Parse technician skills from string or array
        let techSkills: string[] = [];
        if (typeof tech.skills === 'string') {
            techSkills = tech.skills.split(',').map(s => s.trim());
        } else if (Array.isArray(tech.skills)) {
            techSkills = tech.skills;
        }

        const { score: skillScore, matches } = calculateMatchScore(requiredSkills, techSkills);

        // Adjust score based on seniority (bonus)
        let seniorityBonus = 0;
        if (tech.seniorityLevel === 'Expert') seniorityBonus = 20;
        if (tech.seniorityLevel === 'Senior') seniorityBonus = 10;
        if (tech.seniorityLevel === 'Mid') seniorityBonus = 5;

        // Adjust score based on workload (penalty)
        const workload = tech.activeJobs || 0;
        const workloadPenalty = Math.min(workload * 5, 30); // Max 30 point penalty for high workload

        // Final score calculation
        let finalScore = skillScore + seniorityBonus - workloadPenalty;
        finalScore = Math.max(0, Math.min(100, finalScore)); // Clamp between 0-100

        let recommendation: TechnicianMatch['recommendation'] = 'low';
        if (finalScore >= 80) recommendation = 'excellent';
        else if (finalScore >= 60) recommendation = 'good';
        else if (finalScore >= 40) recommendation = 'fair';

        return {
            technicianId: tech.id,
            technicianName: tech.name,
            matchScore: finalScore,
            skillsMatch: matches,
            currentWorkload: workload,
            recommendation
        };
    }).sort((a, b) => b.matchScore - a.matchScore);
}
