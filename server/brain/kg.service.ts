/**
 * Knowledge Graph Service
 *
 * Lean Postgres-based KG for Promise Electronics.
 * - Uses raw neon client (Drizzle neon-http 0.39 has known issues with array columns)
 * - Deterministic entity extraction (regex, no AI calls)
 * - Tag-based retrieval (Postgres GIN index, ~10ms)
 * - Zero extra AI calls — KG ops are pure SQL
 */
import { neon } from '@neondatabase/serverless';

// Lazy init — env may not be loaded at module evaluation time
let _sql: ReturnType<typeof neon> | null = null;
function getSql() {
    if (_sql) return _sql;
    const url = process.env.BRAIN_DATABASE_URL;
    if (!url) return null;
    _sql = neon(url);
    return _sql;
}
function requireSql() {
    const s = getSql();
    if (!s) throw new Error('BRAIN_DATABASE_URL not configured');
    return s;
}

// -------------------------------------------------------------
// Entity extractor — deterministic, no AI cost
// -------------------------------------------------------------
const TV_BRANDS = [
    'samsung', 'lg', 'sony', 'tcl', 'hisense', 'panasonic', 'sharp',
    'vizio', 'philips', 'toshiba', 'walton', 'mi', 'xiaomi', 'realme',
];

const ISSUE_KEYWORDS: Record<string, string[]> = {
    'black_screen': ['black screen', 'no display', 'কালো', 'screen off', 'no picture'],
    'no_power':     ['not turning on', 'no power', 'won\'t start', 'চালু হচ্ছে না', 'dead'],
    'no_sound':     ['no sound', 'no audio', 'কোনো শব্দ', 'sound not working'],
    'lines':        ['lines', 'stripes', 'দাগ', 'horizontal line', 'vertical line'],
    'flicker':      ['flicker', 'flashing', 'blink', 'কাঁপছে'],
    'color_issue':  ['color', 'discolor', 'tint', 'রং'],
    'remote':       ['remote', 'রিমোট'],
    'hdmi':         ['hdmi', 'port', 'input'],
    'panel':        ['panel', 'screen', 'display', 'প্যানেল'],
    'motherboard':  ['motherboard', 'mainboard', 'main board', 'মাদারবোর্ড'],
    'backlight':    ['backlight', 'dim screen', 'dark display'],
};

const SIZE_REGEX = /(\d{2})\s*(inch|"|″|ইঞ্চি)/i;
const MODEL_REGEX = /\b([A-Z0-9]{2,4}[-_]?[A-Z0-9]{3,8})\b/g;

export function extractEntities(text: string): string[] {
    const t = text.toLowerCase();
    const tags = new Set<string>();

    for (const b of TV_BRANDS) if (t.includes(b)) tags.add(b);

    for (const [issue, kws] of Object.entries(ISSUE_KEYWORDS)) {
        if (kws.some(kw => t.includes(kw.toLowerCase()))) tags.add(issue);
    }

    const sizeMatch = text.match(SIZE_REGEX);
    if (sizeMatch) tags.add(`${sizeMatch[1]}in`);

    const modelMatches = text.match(MODEL_REGEX);
    if (modelMatches) for (const m of modelMatches) tags.add(m.toLowerCase());

    return Array.from(tags);
}

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------
export interface RetrievedFact {
    subject: string;
    predicate: string;
    value: string;
    confidence: number;
}

export interface AddFactInput {
    subject: string;
    predicate: string;
    value: string;
    tags?: string[];
    confidence?: number;
    source?: string;
    createdBy?: string;
    expiresAt?: Date;
}

// -------------------------------------------------------------
// Fact retrieval — pure SQL, no AI
// -------------------------------------------------------------
export async function getRelevantFacts(tags: string[], limit = 5): Promise<RetrievedFact[]> {
    const sql = getSql();
    if (tags.length === 0 || !sql) return [];

    try {
        const rows = await sql`
            SELECT subject, predicate, value, confidence
            FROM kg_facts
            WHERE tags && ${tags}::text[]
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY confidence DESC
            LIMIT ${limit}
        ` as any[];

        return rows.map(r => ({
            subject: r.subject,
            predicate: r.predicate,
            value: r.value,
            confidence: Number(r.confidence ?? 1.0),
        }));
    } catch (e: any) {
        console.warn('[KG] getRelevantFacts failed:', e.message?.slice(0, 80));
        return [];
    }
}

export function formatFactsForPrompt(facts: RetrievedFact[]): string {
    if (facts.length === 0) return '';
    const lines = facts.map(f => `- ${f.subject} → ${f.predicate}: ${f.value}`);
    return `KNOWN FACTS (from shop knowledge base):\n${lines.join('\n')}\n`;
}

// -------------------------------------------------------------
// Session messages — full history, never compressed
// -------------------------------------------------------------
export async function logBrainMessage(
    sessionId: string,
    role: 'user' | 'ai',
    content: string,
    imageUrl?: string
) {
    const sql = getSql();
    if (!sql) return;
    try {
        await sql`
            INSERT INTO brain_messages (session_id, role, content, has_image, image_url)
            VALUES (${sessionId}, ${role}, ${content}, ${!!imageUrl}, ${imageUrl ?? null})
        `;
    } catch (e: any) {
        console.warn('[KG] logBrainMessage failed:', e.message?.slice(0, 80));
    }
}

export async function getRecentMessages(sessionId: string, limit = 6) {
    const sql = getSql();
    if (!sql) return [];
    try {
        const rows = await sql`
            SELECT role, content
            FROM brain_messages
            WHERE session_id = ${sessionId}
            ORDER BY created_at DESC
            LIMIT ${limit}
        ` as any[];
        // reverse → chronological order for AI context
        return rows.reverse().map(r => ({ role: r.role as string, content: r.content as string }));
    } catch (e: any) {
        console.warn('[KG] getRecentMessages failed:', e.message?.slice(0, 80));
        return [];
    }
}

// -------------------------------------------------------------
// Fact CRUD
// -------------------------------------------------------------
export async function addFact(input: AddFactInput) {
    const s = requireSql();
    const derivedTags = input.tags && input.tags.length
        ? input.tags.map(t => t.toLowerCase())
        : extractEntities(`${input.subject} ${input.value}`);

    const rows = await s`
        INSERT INTO kg_facts (subject, predicate, value, tags, confidence, source, created_by, expires_at)
        VALUES (
            ${input.subject.trim()},
            ${input.predicate.trim().toUpperCase()},
            ${input.value.trim()},
            ${derivedTags}::text[],
            ${input.confidence ?? 1.0},
            ${input.source ?? 'admin'},
            ${input.createdBy ?? null},
            ${input.expiresAt ?? null}
        )
        RETURNING *
    ` as any[];
    return rows[0];
}

// -------------------------------------------------------------
// Model Case System — auto-learn from completed job tickets
// Each completed job → one kg_fact so AI knows common issues
// for that specific TV model from our real repair history.
// -------------------------------------------------------------
export interface JobCaseInput {
    device?: string | null;       // e.g. "Samsung UA43CU7700"
    issue?: string | null;        // e.g. "Display Issue"
    problemFound?: string | null; // technician's diagnosis
    notes?: string | null;
    screenSize?: string | null;
    charges?: any;                // jsonb array [{description, amount}]
    status?: string | null;
    jobId?: string | null;        // used for deduplication
}

export async function logModelCase(job: JobCaseInput): Promise<boolean> {
    const sql = getSql();
    if (!sql) return false;

    const device = job.device?.trim();
    if (!device || device.length < 3) return false; // no model info — skip

    // Skip if this job was already logged (idempotent)
    if (job.jobId) {
        try {
            const existing = await sql`
                SELECT id FROM kg_facts
                WHERE source = 'job_ticket' AND created_by = ${job.jobId}
                LIMIT 1
            ` as any[];
            if (existing.length > 0) return false;
        } catch {}
    }

    // Build a concise case summary
    const parts: string[] = [];
    if (job.issue)        parts.push(`Issue: ${job.issue}`);
    if (job.problemFound) parts.push(`Diagnosis: ${job.problemFound}`);
    if (job.notes)        parts.push(`Notes: ${job.notes.slice(0, 120)}`);
    const outcome = (job.status === 'Completed') ? 'Repaired successfully.' : `Outcome: ${job.status}`;
    parts.push(outcome);
    const value = parts.join('. ');

    // Derive tags from device name + issue
    const tagSource = `${device} ${job.issue ?? ''} ${job.problemFound ?? ''}`;
    const tags = extractEntities(tagSource);
    // Also tokenize device name: "Samsung UA43CU7700" → ["samsung", "ua43cu7700", "43in"]
    device.toLowerCase().split(/\s+/).forEach(t => { if (t.length > 1) tags.push(t); });
    if (job.screenSize) tags.push(`${job.screenSize.replace(/\D/g, '')}in`);
    const uniqueTags = Array.from(new Set(tags)).filter(t => t.length > 0);

    try {
        await sql`
            INSERT INTO kg_facts (subject, predicate, value, tags, confidence, source, created_by)
            VALUES (
                ${device},
                'REPAIR_CASE',
                ${value},
                ${uniqueTags}::text[],
                0.9,
                'job_ticket',
                ${job.jobId ?? null}
            )
        `;
        console.log(`[KG] Model case logged: "${device}" — ${job.issue ?? 'unknown issue'}`);
        return true;
    } catch (e: any) {
        console.warn('[KG] logModelCase failed:', e.message?.slice(0, 80));
        return false;
    }
}

export async function listFacts(opts: { limit?: number; offset?: number; search?: string } = {}) {
    const sql = getSql();
    if (!sql) return [];
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    try {
        if (opts.search) {
            const pattern = `%${opts.search}%`;
            return await sql`
                SELECT * FROM kg_facts
                WHERE subject ILIKE ${pattern} OR value ILIKE ${pattern}
                ORDER BY created_at DESC
                LIMIT ${limit} OFFSET ${offset}
            ` as any[];
        }
        return await sql`
            SELECT * FROM kg_facts
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        ` as any[];
    } catch (e: any) {
        console.warn('[KG] listFacts failed:', e.message?.slice(0, 80));
        return [];
    }
}

export async function deleteFact(id: string) {
    const sql = getSql();
    if (!sql) return;
    await sql`DELETE FROM kg_facts WHERE id = ${id}`;
}

export async function countFacts(): Promise<number> {
    const sql = getSql();
    if (!sql) return 0;
    try {
        const rows = await sql`SELECT count(*)::int as c FROM kg_facts` as any[];
        return Number(rows[0]?.c ?? 0);
    } catch {
        return 0;
    }
}

// -------------------------------------------------------------
// CSV bulk import
// Format: subject,predicate,value,tags(pipe-separated),confidence
// -------------------------------------------------------------
export async function bulkImportFacts(csvText: string, createdBy: string): Promise<{ inserted: number; errors: string[] }> {
    const errors: string[] = [];
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    if (lines.length === 0) return { inserted: 0, errors: ['Empty CSV'] };

    const startIdx = lines[0].toLowerCase().includes('subject') ? 1 : 0;
    let inserted = 0;

    for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < 3) {
            errors.push(`Line ${i + 1}: needs at least 3 columns (subject, predicate, value)`);
            continue;
        }
        const [subject, predicate, value, tagsCol, confCol] = cols;
        try {
            await addFact({
                subject,
                predicate,
                value,
                tags: tagsCol ? tagsCol.split('|').map(t => t.trim().toLowerCase()).filter(Boolean) : undefined,
                confidence: confCol ? parseFloat(confCol) : 1.0,
                source: 'csv',
                createdBy,
            });
            inserted++;
        } catch (e: any) {
            errors.push(`Line ${i + 1}: ${e.message?.slice(0, 80)}`);
        }
    }
    return { inserted, errors };
}
