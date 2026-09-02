/**
 * What a part is, in repair terms.
 *
 * Separate from inventory `category`, which groups stock for browsing — Spares,
 * Accessories, Consumables. This is the word a technician says to a supplier on
 * the phone, and the word a part request is raised under. They are different
 * vocabularies and collapsing them loses both.
 *
 * Settings-driven, like the television brands, for the reason that list was
 * made settings-driven: three hardcoded copies had drifted apart until the same
 * television was recorded differently depending on which screen took it in. A
 * shop that starts repairing soundbars should add "Soundbar board" in Settings
 * once, not wait for a release.
 */

/** Settings key. Matches the tv_brands / tv_sizes convention. */
export const PART_TYPES_KEY = "part_types";

/**
 * Used only when the shop has not set the list in Settings.
 *
 * "Android voice-control motherboard" is listed separately from "Motherboard"
 * on purpose: they are not substitutes, they do not cost the same, and a
 * technician holding one needs to know which the shelf has.
 */
export const DEFAULT_PART_TYPES = [
    "Panel",
    "Motherboard",
    "Android voice-control motherboard",
    "Power board",
    "Backlight",
    "T-CON board",
    "Speaker",
    "Remote",
    "Stand",
    "Cable",
    "Other",
] as const;

/**
 * The types where a model number identifies the part rather than describes it.
 *
 * A panel and a motherboard are not interchangeable by size — two sets on one
 * bench can want two boards sharing every word in their names. A cable is a
 * cable. Requiring a model for everything would only teach people to type
 * anything to get past the field.
 */
export const MODEL_CRITICAL_PART_TYPES = [
    "Panel",
    "Motherboard",
    "Android voice-control motherboard",
    "Power board",
    "T-CON board",
] as const;

type SettingRow = { key: string; value: string | null };

/** Read the list from Settings, falling back to the shipped default. */
export function readPartTypes(settings: SettingRow[]): string[] {
    const row = settings.find((s) => s.key === PART_TYPES_KEY);
    if (row?.value) {
        try {
            const parsed = JSON.parse(row.value);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
        } catch {
            // Stored value is not JSON — an empty picker is worse than a default one.
        }
    }
    return [...DEFAULT_PART_TYPES];
}

/**
 * Whether this part must carry a model number.
 *
 * Note what this does NOT do: it never asks whether the model number is
 * plausible. "n/a" is an accepted answer and means the part genuinely has no
 * model marking, or none legible on it — which is common on salvaged boards and
 * unbranded backlight strips.
 *
 * That is the same principle as "Nothing was used" on the parts declaration.
 * Forcing a real-looking value where none exists does not produce data; it
 * produces invented data, which is worse than an admitted gap because nobody
 * can tell it apart from the truth later.
 */
export function requiresModelNumber(
    partType: string | null | undefined,
    /**
     * The shop's own answer, when it has given one.
     *
     * Omitted, this falls back to the shipped list - which is right for callers
     * that genuinely have no Settings to read, and wrong as a permanent answer.
     * A shop that adds "Soundbar board" decides for itself whether a model
     * number identifies one; that judgement cannot live in this file.
     */
    modelCritical?: readonly string[],
): boolean {
    if (!partType) return false;
    const list = modelCritical ?? (MODEL_CRITICAL_PART_TYPES as readonly string[]);
    return list.includes(partType);
}

/** Settings key for the types a model number identifies rather than describes. */
export const MODEL_CRITICAL_KEY = "part_types_model_critical";

/**
 * Which types demand a model number, from Settings.
 *
 * Stored as its own list rather than as a flag on each type because the types
 * themselves are a plain string list, and keeping one shape avoids a migration
 * of a settings value that is edited by hand.
 *
 * An empty stored list is a real answer and is honoured - a shop may decide no
 * part needs a model number - which is why this checks for the row rather than
 * for a non-empty parse the way readPartTypes does.
 */
export function readModelCriticalPartTypes(settings: SettingRow[]): string[] {
    const row = settings.find((s) => s.key === MODEL_CRITICAL_KEY);
    if (row?.value) {
        try {
            const parsed = JSON.parse(row.value);
            if (Array.isArray(parsed)) return parsed as string[];
        } catch {
            // Not JSON - fall through to the shipped list rather than to none,
            // because "no part needs a model" is the more damaging default.
        }
    }
    return [...MODEL_CRITICAL_PART_TYPES];
}

/** The one accepted way to say a part has no model number. */
export const NO_MODEL_VALUE = "n/a";

/** True when the model field has been answered, including answered as "not available". */
export function hasModelAnswer(modelNumber: string | null | undefined): boolean {
    return Boolean(modelNumber && modelNumber.trim().length > 0);
}

/**
 * What to show for a model number, including when there is none.
 *
 * Both "never answered" and "answered: no marking" display as n/a. Stock that
 * predates these fields would otherwise show a dash that reads like something
 * failed to load, on shelves where nothing is wrong — the fields simply did not
 * exist when those rows were created.
 *
 * The distinction is kept in the data, not on the screen: hasModelAnswer() is
 * still false for an unanswered row and true for one written as n/a, so a
 * backlog of parts nobody has identified can still be listed and cleared. What
 * a technician needs at a shelf is "this part has no model to match on"; which
 * of the two reasons applies is an administrator's question, asked somewhere
 * else.
 */
export function formatModelNumber(modelNumber: string | null | undefined): string {
    if (!hasModelAnswer(modelNumber)) return NO_MODEL_VALUE;
    const trimmed = modelNumber!.trim();
    return trimmed.toLowerCase() === NO_MODEL_VALUE ? NO_MODEL_VALUE : trimmed;
}
