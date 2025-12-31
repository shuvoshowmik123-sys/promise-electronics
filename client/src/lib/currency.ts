/**
 * Currency Utilities for Bangladesh Taka (BDT)
 * 
 * Provides formatting, parsing, and calculation utilities for 
 * handling Bangladeshi Taka in the application.
 * 
 * Note: Current implementation uses float storage in database.
 * For future versions, consider migrating to integer (poisha) storage
 * for perfect accuracy.
 */

/**
 * Format amount as Bangladeshi Taka
 * 
 * @param amount - Amount in Taka (e.g., 1250.50)
 * @param options - Formatting options
 * @returns Formatted string with Taka symbol
 * 
 * @example
 * formatTaka(1250.50) // "৳১,২৫০.৫০"
 * formatTaka(1250.50, { locale: 'en' }) // "৳1,250.50"
 * formatTaka(1250.50, { showSymbol: false }) // "1,250.50"
 */
export function formatTaka(
    amount: number | string | null | undefined,
    options: {
        locale?: 'bn' | 'en';
        showSymbol?: boolean;
        minimumFractionDigits?: number;
        maximumFractionDigits?: number;
    } = {}
): string {
    const {
        locale = 'en',
        showSymbol = true,
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
    } = options;

    // Handle null/undefined/empty
    if (amount === null || amount === undefined || amount === '') {
        return showSymbol ? '৳0.00' : '0.00';
    }

    // Parse to number if string
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

    // Handle NaN
    if (isNaN(numAmount)) {
        return showSymbol ? '৳0.00' : '0.00';
    }

    // Format based on locale
    const formatted = numAmount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD', {
        minimumFractionDigits,
        maximumFractionDigits,
    });

    return showSymbol ? `৳${formatted}` : formatted;
}

/**
 * Format amount as compact currency (for large numbers)
 * 
 * @example
 * formatTakaCompact(1250000) // "৳12.5L"
 * formatTakaCompact(15000000) // "৳1.5Cr"
 */
export function formatTakaCompact(amount: number): string {
    if (amount >= 10000000) {
        // Crore (কোটি)
        return `৳${(amount / 10000000).toFixed(1)}Cr`;
    } else if (amount >= 100000) {
        // Lakh (লক্ষ)
        return `৳${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
        // Thousand
        return `৳${(amount / 1000).toFixed(1)}K`;
    }
    return formatTaka(amount);
}

/**
 * Parse a currency string to number
 * Handles various formats: "৳1,250.50", "1250.50", "1,250"
 * 
 * @param value - String to parse
 * @returns Parsed number (NaN if invalid)
 */
export function parseTaka(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;

    // Remove Taka symbol, commas, spaces
    const cleaned = value.replace(/[৳,\s]/g, '');
    const parsed = parseFloat(cleaned);

    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Round to 2 decimal places (for Taka)
 * Uses banker's rounding to avoid accumulated errors
 */
export function roundTaka(amount: number): number {
    return Math.round(amount * 100) / 100;
}

/**
 * Calculate percentage
 * 
 * @example
 * calculatePercentage(1000, 15) // 150 (15% of 1000)
 */
export function calculatePercentage(amount: number, percentage: number): number {
    return roundTaka((amount * percentage) / 100);
}

/**
 * Calculate total with discount
 */
export function calculateDiscount(
    subtotal: number,
    discountPercent: number
): { discount: number; total: number } {
    const discount = calculatePercentage(subtotal, discountPercent);
    return {
        discount,
        total: roundTaka(subtotal - discount),
    };
}

/**
 * Calculate total with tax
 */
export function calculateWithTax(
    subtotal: number,
    taxPercent: number
): { tax: number; total: number } {
    const tax = calculatePercentage(subtotal, taxPercent);
    return {
        tax,
        total: roundTaka(subtotal + tax),
    };
}

/**
 * Format price range for display
 * 
 * @example
 * formatPriceRange(500, 1500) // "৳500 - ৳1,500"
 * formatPriceRange(500, 500) // "৳500"
 */
export function formatPriceRange(min: number, max: number): string {
    if (min === max) {
        return formatTaka(min, { minimumFractionDigits: 0 });
    }
    return `${formatTaka(min, { minimumFractionDigits: 0 })} - ${formatTaka(max, { minimumFractionDigits: 0 })}`;
}

/**
 * Convert Poisha to Taka (for future migration)
 * 100 Poisha = 1 Taka
 */
export function poishaToTaka(poisha: number): number {
    return poisha / 100;
}

/**
 * Convert Taka to Poisha (for future migration)
 * 100 Poisha = 1 Taka
 */
export function takaToPishaInt(taka: number): number {
    return Math.round(taka * 100);
}

/**
 * Format relative price difference
 * 
 * @example
 * formatPriceDifference(100, 120) // "+৳20 (+20%)"
 * formatPriceDifference(120, 100) // "-৳20 (-17%)"
 */
export function formatPriceDifference(oldPrice: number, newPrice: number): string {
    const diff = newPrice - oldPrice;
    const percentDiff = oldPrice !== 0 ? ((diff / oldPrice) * 100) : 0;

    const sign = diff >= 0 ? '+' : '';
    return `${sign}${formatTaka(diff)} (${sign}${percentDiff.toFixed(0)}%)`;
}
