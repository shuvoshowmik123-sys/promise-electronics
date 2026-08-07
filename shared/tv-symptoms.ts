/**
 * How a customer describes what is wrong with their television.
 *
 * Reused verbatim from the intake calculator on the homepage, deliberately.
 * Someone claiming warranty already chose from this list when they first
 * booked the repair, and offering the same words twice means their claim can
 * be compared against their original complaint without anyone translating
 * between two vocabularies.
 *
 * These are SYMPTOMS, not causes. The technician's list speaks in components —
 * T-Con, mainboard, power supply — and asking a customer to pick from that is
 * asking them to do the diagnosis. They know the screen has lines on it; they
 * do not know which board produced them, and they should not have to guess to
 * get help.
 *
 * Kept in shared/ so the customer portal and the admin claim view label the
 * same stored value identically. A claim that reads "no_display" in one place
 * and "No Display" in another is the kind of drift that quietly breaks
 * reporting.
 */

export const TV_SYMPTOMS = [
    { value: "no_power", en: "No Power", bn: "পাওয়ার নেই" },
    { value: "no_display", en: "No Display", bn: "ছবি নেই" },
    { value: "lines_on_screen", en: "Lines on Screen", bn: "স্ক্রিনে লাইন" },
    { value: "dim_backlight", en: "Dim / No Backlight", bn: "স্ক্রিন অন্ধকার" },
    { value: "broken_screen", en: "Broken Screen", bn: "স্ক্রিন ভাঙা" },
    { value: "sound_issue", en: "Sound Issue", bn: "সাউন্ড সমস্যা" },
    { value: "software_issue", en: "Software / Smart TV", bn: "সফটওয়্যার সমস্যা" },
    /**
     * Always last, and always present. A customer whose fault is not on the
     * list must still be able to claim — refusing them because their symptom
     * is unusual would be the opposite of the point.
     */
    { value: "other", en: "Something else", bn: "অন্য কিছু" },
] as const;

export type TvSymptom = (typeof TV_SYMPTOMS)[number]["value"];

export function isTvSymptom(value: unknown): value is TvSymptom {
    return typeof value === "string" && TV_SYMPTOMS.some((s) => s.value === value);
}

/** Label in the customer's language; falls back to the raw value for old rows. */
export function labelTvSymptom(value: string | null | undefined, lang: "en" | "bn" = "en"): string {
    if (!value) return "";
    const match = TV_SYMPTOMS.find((s) => s.value === value);
    return match ? match[lang] : value;
}
