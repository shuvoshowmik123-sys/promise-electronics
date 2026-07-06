/**
 * Settings Conflict Service
 *
 * Detects duplicate business information across settings keys and provides
 * resolution helpers. Business Identity is the single source of truth.
 */

import type { Setting } from '../../shared/schema.js';

export interface ConflictSource {
    key: string;
    source: string;
    value: string;
    isCanonical: boolean;
}

export interface ConflictGroup {
    group: string;
    groupLabel: string;
    canonicalKey: string;
    sources: ConflictSource[];
    hasConflict: boolean;
}

export interface ConflictReport {
    conflicts: ConflictGroup[];
    totalConflicts: number;
}

export interface ResolutionItem {
    group: string;
    canonicalKey: string;
    value: string;
}

interface HomepageContactInfo {
    phoneNumbers?: string[];
    emails?: string[];
    addressLines?: string[];
    workingHoursLines?: string[];
    whatsappNumber?: string;
}

function normalizePhone(v: string): string {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeText(v: string): string {
    return v.toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeEmail(v: string): string {
    return v.toLowerCase().trim();
}

function isEmpty(v: string | undefined | null): boolean {
    return !v || v.trim() === '';
}

function parseContactInfo(raw: string | undefined): HomepageContactInfo {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as HomepageContactInfo;
    } catch {}
    return {};
}

function getContactField(info: HomepageContactInfo, field: keyof HomepageContactInfo): string {
    const val = info[field];
    if (Array.isArray(val)) return (val as string[]).find(v => v.trim()) ?? '';
    if (typeof val === 'string') return val;
    return '';
}

export function detectConflicts(settings: Setting[]): ConflictReport {
    const map = new Map<string, string>();
    for (const s of settings) {
        map.set(s.key, s.value ?? '');
    }

    const contactInfo = parseContactInfo(map.get('homepage_contact_info'));
    const get = (k: string) => map.get(k) ?? '';
    const getCI = (f: keyof HomepageContactInfo) => getContactField(contactInfo, f);

    const groups: ConflictGroup[] = [];

    // Group A: Phone
    {
        const candidates: ConflictSource[] = [
            { key: 'support_phone', source: 'Business Identity', value: get('support_phone'), isCanonical: true },
            { key: 'homepage_contact_info.phoneNumbers', source: 'Homepage CMS', value: getCI('phoneNumbers'), isCanonical: false },
            { key: 'contact_phone', source: 'Contact Settings', value: get('contact_phone'), isCanonical: false },
            { key: 'mobile_contact_phone', source: 'Mobile App', value: get('mobile_contact_phone'), isCanonical: false },
        ];
        const sources = candidates.filter(s => !isEmpty(s.value));
        const normalized = new Set(sources.map(s => normalizePhone(s.value)).filter(Boolean));
        groups.push({ group: 'phone', groupLabel: 'Phone Number', canonicalKey: 'support_phone', sources, hasConflict: sources.length > 1 && normalized.size > 1 });
    }

    // Group B: Address
    {
        const candidates: ConflictSource[] = [
            { key: 'service_center_contact', source: 'Business Identity', value: get('service_center_contact'), isCanonical: true },
            { key: 'homepage_contact_info.addressLines', source: 'Homepage CMS', value: getCI('addressLines'), isCanonical: false },
            { key: 'about_address', source: 'About Us', value: get('about_address'), isCanonical: false },
            { key: 'contact_address', source: 'Contact Settings', value: get('contact_address'), isCanonical: false },
            { key: 'mobile_contact_address', source: 'Mobile App', value: get('mobile_contact_address'), isCanonical: false },
        ];
        const sources = candidates.filter(s => !isEmpty(s.value));
        const normalized = new Set(sources.map(s => normalizeText(s.value)));
        groups.push({ group: 'address', groupLabel: 'Business Address', canonicalKey: 'service_center_contact', sources, hasConflict: sources.length > 1 && normalized.size > 1 });
    }

    // Group C: Business Hours
    {
        const candidates: ConflictSource[] = [
            { key: 'business_hours', source: 'Business Identity', value: get('business_hours'), isCanonical: true },
            { key: 'homepage_contact_info.workingHoursLines', source: 'Homepage CMS', value: getCI('workingHoursLines'), isCanonical: false },
            { key: 'about_working_hours', source: 'About Us', value: get('about_working_hours'), isCanonical: false },
            { key: 'mobile_business_hours', source: 'Mobile App', value: get('mobile_business_hours'), isCanonical: false },
        ];
        const sources = candidates.filter(s => !isEmpty(s.value));
        const normalized = new Set(sources.map(s => normalizeText(s.value)));
        groups.push({ group: 'hours', groupLabel: 'Business Hours', canonicalKey: 'business_hours', sources, hasConflict: sources.length > 1 && normalized.size > 1 });
    }

    // Group D: Email
    {
        const candidates: ConflictSource[] = [
            { key: 'company_email', source: 'Business Identity', value: get('company_email'), isCanonical: true },
            { key: 'about_email', source: 'About Us', value: get('about_email'), isCanonical: false },
            { key: 'homepage_contact_info.emails', source: 'Homepage CMS', value: getCI('emails'), isCanonical: false },
        ];
        const sources = candidates.filter(s => !isEmpty(s.value));
        const normalized = new Set(sources.map(s => normalizeEmail(s.value)));
        groups.push({ group: 'email', groupLabel: 'Email Address', canonicalKey: 'company_email', sources, hasConflict: sources.length > 1 && normalized.size > 1 });
    }

    // Group E: WhatsApp
    {
        const candidates: ConflictSource[] = [
            { key: 'contact_whatsapp', source: 'Business Identity', value: get('contact_whatsapp'), isCanonical: true },
            { key: 'homepage_contact_info.whatsappNumber', source: 'Homepage CMS', value: getCI('whatsappNumber'), isCanonical: false },
            { key: 'mobile_contact_whatsapp', source: 'Mobile App', value: get('mobile_contact_whatsapp'), isCanonical: false },
        ];
        const sources = candidates.filter(s => !isEmpty(s.value));
        const normalized = new Set(sources.map(s => normalizePhone(s.value)).filter(Boolean));
        groups.push({ group: 'whatsapp', groupLabel: 'WhatsApp Number', canonicalKey: 'contact_whatsapp', sources, hasConflict: sources.length > 1 && normalized.size > 1 });
    }

    const conflicts = groups.filter(g => g.hasConflict);
    return { conflicts, totalConflicts: conflicts.length };
}

export async function applyResolutions(
    resolutions: ResolutionItem[],
    allSettings: Setting[],
    upsertFn: (key: string, value: string) => Promise<void>,
): Promise<void> {
    const map = new Map<string, string>();
    for (const s of allSettings) map.set(s.key, s.value ?? '');

    const contactInfo = parseContactInfo(map.get('homepage_contact_info'));
    let contactInfoDirty = false;

    for (const res of resolutions) {
        const { group, canonicalKey, value } = res;
        await upsertFn(canonicalKey, value);

        if (group === 'phone') {
            await upsertFn('contact_phone', value);
            await upsertFn('mobile_contact_phone', value);
            contactInfo.phoneNumbers = value ? [value] : [];
            contactInfoDirty = true;
        } else if (group === 'address') {
            await upsertFn('about_address', value);
            await upsertFn('contact_address', value);
            await upsertFn('mobile_contact_address', value);
            contactInfo.addressLines = value ? [value] : [];
            contactInfoDirty = true;
        } else if (group === 'hours') {
            await upsertFn('about_working_hours', value);
            await upsertFn('mobile_business_hours', value);
            contactInfo.workingHoursLines = value ? [value] : [];
            contactInfoDirty = true;
        } else if (group === 'email') {
            await upsertFn('about_email', value);
            contactInfo.emails = value ? [value] : [];
            contactInfoDirty = true;
        } else if (group === 'whatsapp') {
            await upsertFn('mobile_contact_whatsapp', value);
            contactInfo.whatsappNumber = value;
            contactInfoDirty = true;
        }
    }

    if (contactInfoDirty) {
        await upsertFn('homepage_contact_info', JSON.stringify(contactInfo));
    }
}
