/**
 * Checks if a search query matches across multiple fields.
 * 
 * Supports multi-keyword matching: "samsung 50" will match if ANY field 
 * contains "samsung" AND ANY field contains "50".
 * 
 * @param searchQuery The user's search query
 * @param fields The fields to search within (null/undefined are ignored)
 * @returns boolean true if all keywords found, false otherwise
 */
export function smartMatch(searchQuery: string, ...fields: (string | null | undefined | number)[]): boolean {
    if (!searchQuery || !searchQuery.trim()) return true;

    // Split the query into distinct keywords (e.g. "Samsung 50" -> ["samsung", "50"])
    const keywords = searchQuery.toLowerCase().trim().split(/\s+/);

    // Combine all fields into a single searchable lowercase string
    const combinedFields = fields
        .filter(f => f != null)
        .map(f => String(f).toLowerCase())
        .join(" ");

    // EVERY keyword must exist SOMEWHERE in the combined fields string
    return keywords.every(kw => combinedFields.includes(kw));
}
