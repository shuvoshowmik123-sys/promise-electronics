export const guidedDemoProgressStorageKey = "promise-guided-demo-progress-v1";

export function makeGuidedDemoProgressKey(role: string, lessonKey: string) {
    return `${role}.${lessonKey}`;
}

export function parseGuidedDemoProgress(raw: string | null) {
    if (!raw) return new Set<string>();

    try {
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
    } catch {
        return new Set<string>();
    }
}

export function serializeGuidedDemoProgress(progress: Set<string>) {
    return JSON.stringify(Array.from(progress));
}

export function markGuidedDemoLessonComplete(progress: Set<string>, role: string, lessonKey: string) {
    const next = new Set(progress);
    next.add(makeGuidedDemoProgressKey(role, lessonKey));
    return next;
}
