export type GuidedJobDemoState = {
    active: boolean;
    role: string;
    lesson: string;
};

export function parseGuidedJobDemoHash(hash: string): GuidedJobDemoState {
    const [tab, query = ""] = hash.replace(/^#/, "").split("?");
    const params = new URLSearchParams(query);

    return {
        active: tab === "jobs" && params.get("demo") === "guided",
        role: params.get("role") || "technician",
        lesson: params.get("lesson") || "first_job",
    };
}
