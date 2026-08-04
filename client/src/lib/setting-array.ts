/**
 * Read a catalog list out of the public settings response.
 *
 * The subtle case is an empty stored array. Settings are persisted as JSON
 * strings, so an emptied catalog is stored as the string "[]" — which is
 * truthy. Code shaped like this:
 *
 *     if (setting?.value) return JSON.parse(setting.value);
 *     return defaultValue;
 *
 * therefore returned [] and never reached its fallback. On production
 * `service_categories` was [], so the desktop repair form's required
 * "Primary Issue" dropdown rendered with no options: it could not be answered,
 * and the required-field check made the form impossible to submit. The mobile
 * wizard was unaffected only because it reads a different, populated key.
 *
 * An empty catalog means "not configured" and must fall back. A control the
 * customer cannot use is worse than one showing sensible defaults.
 */
export interface SettingRow {
    key: string;
    value: string | null;
}

export function resolveSettingArray(
    settings: SettingRow[],
    key: string,
    fallback: string[],
): string[] {
    const setting = settings.find((s) => s.key === key);
    if (!setting?.value) return fallback;

    let parsed: unknown;
    try {
        parsed = JSON.parse(setting.value);
    } catch {
        return fallback;
    }

    if (!Array.isArray(parsed)) return fallback;

    // Blank entries would render as unselectable empty rows, and Radix Select
    // throws on an empty string value.
    const usable = parsed
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

    return usable.length > 0 ? usable : fallback;
}
