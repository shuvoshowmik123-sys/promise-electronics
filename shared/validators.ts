/**
 * Bangladesh Phone Number Validation & Utilities
 * 
 * Handles normalization and validation of Bangladeshi mobile numbers.
 * 
 * Supported formats:
 * - 01712345678
 * - +8801712345678
 * - 8801712345678
 * - 017-1234-5678
 * - +880 171 234 5678
 * 
 * Valid operators: 013, 014, 015, 016, 017, 018, 019
 */

import { z } from "zod";

/**
 * Normalize a phone number to standard 11-digit format (01XXXXXXXXX)
 */
export function normalizePhoneNumber(phone: string): string {
    // Remove all whitespace, dashes, and parentheses
    let normalized = phone.replace(/[\s\-\(\)]/g, '');

    // Remove +88 or 88 prefix
    if (normalized.startsWith('+88')) {
        normalized = normalized.slice(3);
    } else if (normalized.startsWith('88') && normalized.length > 11) {
        normalized = normalized.slice(2);
    }

    return normalized;
}

/**
 * Check if a phone number is a valid Bangladeshi mobile number
 * 
 * Valid patterns:
 * - Starts with 01
 * - Third digit is 3-9 (valid operators)
 * - Total 11 digits
 */
export function isValidBDPhone(phone: string): boolean {
    const normalized = normalizePhoneNumber(phone);
    return /^01[3-9]\d{8}$/.test(normalized);
}

/**
 * Format phone number for display
 * Converts to: 017-1234-5678 format
 */
export function formatPhoneDisplay(phone: string): string {
    const normalized = normalizePhoneNumber(phone);
    if (normalized.length !== 11) return phone;

    return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
}

/**
 * Format phone number for international format
 * Converts to: +880 171 234 5678
 */
export function formatPhoneInternational(phone: string): string {
    const normalized = normalizePhoneNumber(phone);
    if (normalized.length !== 11) return phone;

    return `+880 ${normalized.slice(1, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7)}`;
}

/**
 * Zod schema for Bangladesh phone number validation
 * 
 * Transforms input to normalized 11-digit format before validation.
 * Stores consistent 01XXXXXXXXX format in database.
 * 
 * @example
 * bdPhoneSchema.parse("+8801712345678") // Returns: "01712345678"
 * bdPhoneSchema.parse("01712345678") // Returns: "01712345678"
 * bdPhoneSchema.parse("01212345678") // Throws error (invalid operator 012)
 */
export const bdPhoneSchema = z
    .string()
    .min(10, "Phone number is too short")
    .max(15, "Phone number is too long")
    .transform((val) => normalizePhoneNumber(val))
    .refine((val) => /^01[3-9]\d{8}$/.test(val), {
        message: "সঠিক বাংলাদেশী মোবাইল নম্বর দিন (01XXXXXXXXX)",
    });

/**
 * Optional BD phone schema (allows empty string or null)
 */
export const bdPhoneSchemaOptional = z
    .string()
    .optional()
    .nullable()
    .transform((val) => {
        if (!val || val.trim() === '') return null;
        return normalizePhoneNumber(val);
    })
    .refine((val) => {
        if (val === null) return true;
        return /^01[3-9]\d{8}$/.test(val);
    }, {
        message: "সঠিক বাংলাদেশী মোবাইল নম্বর দিন (01XXXXXXXXX)",
    });

/**
 * Get operator name from phone number
 */
export function getOperatorName(phone: string): string | null {
    const normalized = normalizePhoneNumber(phone);
    if (!isValidBDPhone(normalized)) return null;

    const prefix = normalized.slice(0, 3);
    const operators: Record<string, string> = {
        '013': 'Grameenphone',
        '017': 'Grameenphone',
        '014': 'Banglalink',
        '019': 'Banglalink',
        '015': 'Teletalk',
        '016': 'Robi',
        '018': 'Robi',
    };

    return operators[prefix] || null;
}
