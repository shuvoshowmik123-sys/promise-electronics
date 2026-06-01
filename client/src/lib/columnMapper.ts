
import { BulkRow } from "./api";

// --- Types ---

export interface FieldDefinition {
    key: keyof BulkRow;
    label: string;
    required: boolean;
    aliases: string[];
}

export interface FieldMapping {
    sourceColumn: string;
    targetField: keyof BulkRow | null;
    sourceType?: 'column' | 'default' | 'auto' | 'review';
    defaultValue?: string;
    confidence: 'exact' | 'alias' | 'fuzzy' | 'manual' | 'unmapped';
}

export interface MappingResult {
    mappings: FieldMapping[];
    allRequiredMapped: boolean;
    missingRequired: string[]; // list of required field keys that are unmapped
}

// --- Configuration ---

export const REQUIRED_FIELDS: FieldDefinition[] = [
    {
        key: 'corporateJobNumber',
        label: 'Job Number',
        required: true,
        aliases: ['job no', 'job number', 'job #', 'job id', 'corporate job', 'ref', 'reference', 'ref no', 'ticket id', 'ticket no']
    },
    {
        key: 'deviceBrand',
        label: 'Brand',
        required: true,
        aliases: ['brand', 'make', 'manufacturer', 'device brand', 'brand name', 'oem']
    },
    {
        key: 'model',
        label: 'Model',
        required: true,
        aliases: ['model name', 'model number', 'model no', 'device model', 'product', 'device', 'unit type', 'item']
    },
    {
        key: 'serialNumber',
        label: 'Serial Number',
        required: true,
        aliases: ['serial', 'serial no', 'serial #', 's/n', 'sn', 'serial number', 'imei', 'service tag', 'tag', 'mn', 'machine no']
    },
    {
        key: 'reportedDefect',
        label: 'Reported Defect',
        required: true,
        aliases: ['defect', 'issue', 'problem', 'fault', 'reported issue', 'complaint', 'description', 'defect description', 'symptom', 'error']
    },
    {
        key: 'initialStatus',
        label: 'Initial Status',
        required: false, // Changed to false generally, but effectively required for meaningful data. Let's keep strictness low for mapping.
        aliases: ['status', 'initial status', 'condition', 'ok/ng', 'ok ng', 'check status', 'state']
    }
];

export const OPTIONAL_FIELDS: FieldDefinition[] = [
    {
        key: 'status',
        label: 'Work Status',
        required: false,
        aliases: ['work status', 'job status', 'stage', 'workflow status']
    },
    {
        key: 'customerName',
        label: 'Customer Name',
        required: false,
        aliases: ['customer', 'customer name', 'end customer', 'client customer', 'party', 'consumer']
    },
    {
        key: 'externalJobRef',
        label: 'External Job Ref',
        required: false,
        aliases: ['external ref', 'external job', 'ref no', 'reference no', 'client ref', 'client job', 'tracking no']
    },
    {
        key: 'challanNumber',
        label: 'Challan Number',
        required: false,
        aliases: ['challan', 'challan no', 'challan number', 'chalan', 'dc no', 'delivery challan']
    },
    {
        key: 'itemType',
        label: 'Item Type',
        required: false,
        aliases: ['item type', 'type', 'goods type', 'work type', 'product type', 'service type']
    },
    {
        key: 'batchNumber',
        label: 'Batch Number',
        required: false,
        aliases: ['batch', 'batch no', 'batch number', 'lot', 'lot no']
    },
    {
        key: 'receivedDate',
        label: 'Received Date',
        required: false,
        aliases: ['date', 'receive date', 'received date', 'intake date', 'entry date']
    },
    {
        key: 'physicalCondition',
        label: 'Physical Condition',
        required: false,
        aliases: ['physical', 'physical state', 'body condition', 'cosmetic', 'appearance', 'damage']
    },
    {
        key: 'accessories',
        label: 'Accessories',
        required: false,
        aliases: ['accessory', 'included accessories', 'items', 'included items', 'parts', 'cable', 'remotes', 'box']
    },
    {
        key: 'notes',
        label: 'Notes',
        required: false,
        aliases: ['note', 'remarks', 'comment', 'comments', 'additional info', 'memo']
    }
];

export const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

// --- Logic ---

/**
 * Simple Levenshtein implementation
 */
function levenshtein(a: string, b: string): number {
    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix = new Array(bn + 1);
    for (let i = 0; i <= bn; ++i) {
        let row = matrix[i] = new Array(an + 1);
        row[0] = i;
    }
    const firstRow = matrix[0];
    for (let j = 1; j <= an; ++j) {
        firstRow[j] = j;
    }
    for (let i = 1; i <= bn; ++i) {
        for (let j = 1; j <= an; ++j) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1, // insertion
                    matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    return matrix[bn][an];
}

/**
 * Calculates similarity score between 0 and 1.
 * 1 = exact match, 0 = no match.
 */
function getSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - levenshtein(longer, shorter)) / parseFloat(longerLength.toString());
}

export function autoMapColumns(uploadedHeaders: string[]): MappingResult {
    const mappings: FieldMapping[] = [];

    // Track best match for each system field to resolve conflicts
    const bestMatchForField = new Map<string, { header: string, score: number, confidence: FieldMapping['confidence'] }>();

    // First pass: Find potential matches for each header
    uploadedHeaders.forEach(header => {
        const normalizedHeader = header.toLowerCase().trim().replace(/[\s\-_]+/g, ' ');

        let bestTarget: keyof BulkRow | null = null;
        let bestScore = 0;
        let bestConfidence: FieldMapping['confidence'] = 'unmapped';

        // 1. Exact Key Match
        const exactMatch = ALL_FIELDS.find(f => f.key.toLowerCase() === normalizedHeader.replace(/ /g, '')); // remove spaces for key match
        if (exactMatch) {
            bestTarget = exactMatch.key;
            bestScore = 1.0;
            bestConfidence = 'exact';
        }

        // 2. Alias Exact Match
        if (!bestTarget) {
            const aliasMatch = ALL_FIELDS.find(f => f.aliases.some(a => a === normalizedHeader));
            if (aliasMatch) {
                bestTarget = aliasMatch.key;
                bestScore = 0.95; // Slightly less than direct key match
                bestConfidence = 'alias';
            }
        }

        // 3. Fuzzy Match
        if (!bestTarget) {
            for (const field of ALL_FIELDS) {
                // Check key similarity
                let score = getSimilarity(normalizedHeader, field.key.toLowerCase());
                let currentStatus: FieldMapping['confidence'] = 'fuzzy';

                // Check label similarity
                const labelScore = getSimilarity(normalizedHeader, field.label.toLowerCase());
                if (labelScore > score) {
                    score = labelScore;
                }

                // Check aliases similarity
                for (const alias of field.aliases) {
                    const aliasScore = getSimilarity(normalizedHeader, alias);
                    if (aliasScore > score) {
                        score = aliasScore;
                    }
                }

                if (score > 0.65 && score > bestScore) {
                    bestScore = score;
                    bestTarget = field.key;
                    bestConfidence = 'fuzzy';
                }
            }
        }

        // If we found a target, check for conflicts
        if (bestTarget) {
            const existingBest = bestMatchForField.get(bestTarget);
            if (!existingBest || bestScore > existingBest.score) {
                // Use this header for this field
                bestMatchForField.set(bestTarget, { header: header, score: bestScore, confidence: bestConfidence });

                // If we displaced an existing match, we need to unmap the old header later?
                // Actually, let's keep it simple: mapped later based on this map.
            } else {
                // This header is a worse match for the target than what we already have.
                // Leave it unmapped for now (or try 2nd best? - complex).
                // We'll mark it unmapped in the final loop.
                bestTarget = null;
                bestConfidence = 'unmapped';
            }
        }

        // Register initial thought (might be overwritten by conflict resolution logic conceptually, 
        // but here we just store direct mapping. We need to be careful.)

        // BETTER APPROACH: Just store potential mappings and filter at end?
        // Let's stick to simple: If this header thinks it fits 'serialNumber', record it.
        // But we need to handle "Col A -> Serial" and "Col B -> Serial".
    });

    // Re-build mappings based on "best header for each field"
    uploadedHeaders.forEach(header => {
        // Find if this header was the winner for any field
        let assignedField: keyof BulkRow | null = null;
        let confidence: FieldMapping['confidence'] = 'unmapped';

        // Fix iteration for older TS targets
        Array.from(bestMatchForField.entries()).forEach(([fieldKey, match]) => {
            if (match.header === header) {
                assignedField = fieldKey as keyof BulkRow;
                confidence = match.confidence;
            }
        });

        mappings.push({
            sourceColumn: header,
            targetField: assignedField,
            sourceType: assignedField ? 'column' : undefined,
            confidence
        });
    });

    // Check required
    const mappedTargets = new Set(mappings.map(m => m.targetField).filter(Boolean) as string[]);
    const missingRequired = REQUIRED_FIELDS
        .filter(f => f.required && !mappedTargets.has(f.key))
        .map(f => f.key);

    return {
        mappings,
        allRequiredMapped: missingRequired.length === 0,
        missingRequired
    };
}

/**
 * Apply the mapping to raw rows to produce system-compliant objects.
 */
export function applyMapping(rawRows: Record<string, string>[], mappings: FieldMapping[]): BulkRow[] {
    return rawRows.map(row => {
        const newRow: any = {};

        mappings.forEach(mapping => {
            if (!mapping.targetField) return;

            const sourceType = mapping.sourceType || (mapping.sourceColumn ? 'column' : undefined);

            if (sourceType === 'default' && mapping.defaultValue !== undefined) {
                newRow[mapping.targetField] = normalizeMappedValue(mapping.targetField, mapping.defaultValue);
                return;
            }

            if (sourceType === 'auto') {
                const detectedValue = autoDetectMappedValue(mapping.targetField, newRow, row);
                if (detectedValue) newRow[mapping.targetField] = normalizeMappedValue(mapping.targetField, detectedValue);
                return;
            }

            if (sourceType === 'review') return;

            if (mapping.sourceColumn) {
                let value = row[mapping.sourceColumn];
                if (value === undefined) {
                    const key = Object.keys(row).find(k => k.toLowerCase() === mapping.sourceColumn.toLowerCase());
                    if (key) value = row[key];
                }

                if (value !== undefined) {
                    newRow[mapping.targetField] = normalizeMappedValue(mapping.targetField, value);
                }
            }
        });

        return newRow as BulkRow;
    });
}

function normalizeMappedValue(targetField: keyof BulkRow, value: unknown) {
    let strValue = String(value ?? '').trim();

    if (targetField === 'initialStatus') {
        const lower = strValue.toLowerCase();
        if (['ok', 'good', 'working', 'functional', 'pass', '1', 'true', 'yes'].includes(lower)) return 'OK';
        if (['ng', 'bad', 'broken', 'defect', 'fail', '0', 'false', 'no'].includes(lower)) return 'NG';
        return strValue.toUpperCase() === 'OK' ? 'OK' : 'NG';
    }

    if (targetField === 'status') {
        const lower = strValue.toLowerCase();
        if (['ok', 'okay', 'declared ok', 'done', 'ready'].includes(lower)) return 'Declared OK';
        if (['ng', 'not good', 'not ok', 'declared ng', 'declared not ok', 'bad'].includes(lower)) return 'Declared NG';
        if (['pending', 'hold', 'waiting'].includes(lower)) return 'Pending';
        return 'Received';
    }

    return strValue;
}

function autoDetectMappedValue(targetField: keyof BulkRow, mappedRow: Partial<BulkRow>, rawRow: Record<string, string>) {
    if (targetField !== 'deviceBrand') return "";

    const text = [
        mappedRow.model,
        mappedRow.reportedDefect,
        ...Object.values(rawRow),
    ].filter(Boolean).join(" ").toLowerCase();

    const brands = [
        'Samsung',
        'Sony',
        'LG',
        'Walton',
        'Panasonic',
        'Sharp',
        'TCL',
        'Hisense',
        'Vision',
        'Xiaomi',
        'Mi',
        'Singer',
        'Minister',
        'Konka',
        'Haier',
        'Philips',
        'Toshiba',
    ];

    return brands.find(brand => text.includes(brand.toLowerCase())) || "";
}
