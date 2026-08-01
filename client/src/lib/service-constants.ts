export const NOT_SURE_SERVICE = "__not_sure__";

/**
 * Resolves the payload serviceId from a desktop Select value.
 * NOT_SURE_SERVICE → null (explicit "not sure")
 * A catalogue ID → that exact ID
 * Anything else (unmatched/empty) → null, never substitutes first service
 */
export function resolveDesktopServiceId(
    services: { id: string }[],
    selectedValue: string,
): string | null {
    if (!selectedValue || selectedValue === NOT_SURE_SERVICE) return null;
    const match = services.find((s) => s.id === selectedValue);
    return match ? match.id : null;
}
