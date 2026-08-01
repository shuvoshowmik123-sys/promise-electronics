// Row-level authority for customer-facing service selectability.
// The SQL equivalent lives in getActiveServicesFromInventory (inventory.repository.ts).
export function isSelectableCustomerService<T extends { itemType?: string | null; showOnWebsite?: boolean | null }>(
    item: T | null | undefined,
): item is T & { itemType: string; showOnWebsite: boolean } {
    if (!item) return false;
    return item.itemType === "service" && item.showOnWebsite === true;
}
