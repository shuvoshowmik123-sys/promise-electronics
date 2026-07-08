/**
 * Catalog Import Service (Phase 35A)
 *
 * CSV bulk import for first-time setup data:
 *   service_categories, service_catalog, inventory_items,
 *   shop_products, product_variants, inventory_serials
 *
 * Flow: parse CSV → validate every row (no writes) → commit only valid rows.
 * Commit always re-validates server-side — client preview state is never trusted.
 */

import Papa from 'papaparse';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../../shared/schema.js';
import { storage } from '../storage.js';
import * as inventoryRepo from '../repositories/inventory.repository.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export const IMPORT_TYPES = [
    'service_categories',
    'service_catalog',
    'inventory_items',
    'shop_products',
    'product_variants',
    'inventory_serials',
] as const;
export type ImportType = typeof IMPORT_TYPES[number];

export type ImportMode = 'createOnly' | 'updateExisting' | 'createAndUpdate';

export interface ImportOptions {
    autoCreateCategories?: boolean;
}

export interface PreviewRow {
    rowNumber: number;
    status: 'valid' | 'invalid' | 'warning';
    action: 'create' | 'update' | 'skip';
    errors: string[];
    warnings: string[];
    normalized: Record<string, any>;
}

export interface PreviewResult {
    type: ImportType;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warnings: string[];
    rows: PreviewRow[];
}

export interface CommitResult {
    batchId: string;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: string[];
}

const MAX_CSV_BYTES = 1_048_576; // 1MB
const MAX_ROWS = 1000;

// Columns that must never be imported from CSV
const BLOCKED_COLUMNS = new Set(['id', 'createdat', 'updatedat', 'created_at', 'updated_at']);

// ─── Column specs per type ────────────────────────────────────────────────────

const COLUMN_SPECS: Record<ImportType, { required: string[]; optional: string[] }> = {
    service_categories: {
        required: ['name'],
        optional: ['displayOrder'],
    },
    service_catalog: {
        required: ['name', 'category', 'minPrice', 'maxPrice'],
        optional: ['description', 'estimatedDays', 'icon', 'isActive', 'displayOrder', 'features'],
    },
    inventory_items: {
        required: ['name', 'category', 'price'],
        optional: [
            'description', 'itemType', 'stock', 'minPrice', 'maxPrice', 'status',
            'lowStockThreshold', 'images', 'showOnWebsite', 'showOnAndroidApp',
            'showOnHotDeals', 'hotDealPrice', 'icon', 'estimatedDays', 'displayOrder',
            'features', 'isSparePart', 'isSerialized', 'reorderQuantity', 'preferredSupplier',
        ],
    },
    shop_products: {
        required: ['name', 'price', 'category'],
        optional: ['image', 'rating', 'reviews'],
    },
    product_variants: {
        required: ['variantName', 'price'],
        optional: ['productName', 'productId', 'stock', 'sku'],
    },
    inventory_serials: {
        required: ['serialNumber'],
        optional: ['inventoryItemName', 'inventoryItemId', 'status', 'notes', 'storeId'],
    },
};

// ─── CSV templates (headers + 2 safe sample rows) ─────────────────────────────

const TEMPLATES: Record<ImportType, string> = {
    service_categories: [
        'name,displayOrder',
        'TV Repair,1',
        'AC Servicing,2',
    ].join('\n'),
    service_catalog: [
        'name,category,description,minPrice,maxPrice,estimatedDays,icon,isActive,displayOrder,features',
        'Panel Replacement,TV Repair,Full LED panel replacement,3000,12000,3-5 days,Wrench,true,1,Genuine parts|90-day warranty',
        'Gas Refill,AC Servicing,AC refrigerant gas refill,1500,3500,1-2 days,Wind,true,2,Same-day service|Free checkup',
    ].join('\n'),
    inventory_items: [
        'name,category,description,itemType,stock,price,minPrice,maxPrice,status,lowStockThreshold,images,showOnWebsite,showOnAndroidApp,showOnHotDeals,hotDealPrice,icon,estimatedDays,displayOrder,features,isSparePart,isSerialized,reorderQuantity,preferredSupplier',
        'LED Backlight Strip 32in,Spare Parts,32 inch universal backlight strip,product,25,450,,,In Stock,5,,false,true,false,,,,1,,true,false,10,Dhaka Electronics',
        'Universal Remote,Accessories,Universal TV remote,product,50,250,,,In Stock,10,,true,true,false,,,,2,,false,false,20,',
    ].join('\n'),
    shop_products: [
        'name,price,category,image,rating,reviews',
        'HDMI Cable 1.5m,350,Accessories,,4.5,12',
        'TV Wall Mount 32-55in,1200,Accessories,,4.8,30',
    ].join('\n'),
    product_variants: [
        'productName,variantName,price,stock,sku',
        'HDMI Cable 1.5m,Black,350,40,HDMI-15-BLK',
        'HDMI Cable 1.5m,White,370,20,HDMI-15-WHT',
    ].join('\n'),
    inventory_serials: [
        'inventoryItemName,serialNumber,status,notes,storeId',
        'LED Backlight Strip 32in,SN-2026-0001,In Stock,First batch,',
        'LED Backlight Strip 32in,SN-2026-0002,In Stock,,',
    ].join('\n'),
};

export function getTemplate(type: ImportType): string {
    return TEMPLATES[type];
}

export function isImportType(t: string): t is ImportType {
    return (IMPORT_TYPES as readonly string[]).includes(t);
}

// ─── Value parsers ────────────────────────────────────────────────────────────

function parseBool(v: string | undefined): boolean | undefined {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim().toLowerCase();
    if (s === '') return undefined;
    if (['true', '1', 'yes', 'y'].includes(s)) return true;
    if (['false', '0', 'no', 'n'].includes(s)) return false;
    return undefined;
}

function parseNum(v: string | undefined): number | undefined {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    if (s === '') return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
}

function parseIntSafe(v: string | undefined): number | undefined {
    const n = parseNum(v);
    if (n === undefined) return undefined;
    return Math.trunc(n);
}

function str(v: string | undefined): string | undefined {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === '' ? undefined : s;
}

/** Pipe- or comma-separated feature text → JSON string array (matches InventoryTab storage). */
function parseFeatures(v: string | undefined): string | undefined {
    const s = str(v);
    if (!s) return undefined;
    const sep = s.includes('|') ? '|' : ',';
    const items = s.split(sep).map(f => f.trim()).filter(f => f !== '');
    return items.length > 0 ? JSON.stringify(items) : undefined;
}

const SERIAL_STATUSES = ['In Stock', 'Reserved', 'Consumed', 'Defective', 'Wasted'];
const INVENTORY_STATUSES = ['In Stock', 'Low Stock', 'Out of Stock'];

// ─── Parsing + validation ─────────────────────────────────────────────────────

interface ParsedCsv {
    rows: Record<string, string>[];
    headers: string[];
    error?: string;
}

function parseCsv(csvText: string): ParsedCsv {
    if (!csvText || csvText.trim() === '') {
        return { rows: [], headers: [], error: 'CSV is empty' };
    }
    if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) {
        return { rows: [], headers: [], error: 'CSV exceeds 1MB size limit' };
    }
    const result = Papa.parse<Record<string, string>>(csvText.trim(), {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (h) => h.trim(),
    });
    if (result.errors.length > 0 && result.data.length === 0) {
        return { rows: [], headers: [], error: 'CSV could not be parsed' };
    }
    const headers = result.meta.fields ?? [];
    if (headers.length === 0) {
        return { rows: [], headers: [], error: 'CSV has no header row' };
    }
    if (result.data.length === 0) {
        return { rows: [], headers, error: 'CSV has no data rows' };
    }
    if (result.data.length > MAX_ROWS) {
        return { rows: [], headers, error: `CSV has ${result.data.length} rows — maximum is ${MAX_ROWS} per import` };
    }
    return { rows: result.data, headers };
}

/** Loads existing records once per validation for duplicate/update matching. */
async function loadExisting(type: ImportType): Promise<{
    categories?: Map<string, schema.ServiceCategory>;
    catalog?: Map<string, schema.ServiceCatalog>;
    inventory?: Map<string, schema.InventoryItem>;
    products?: Map<string, schema.Product>;
    productsByName?: Map<string, schema.Product>;
    inventoryByName?: Map<string, schema.InventoryItem>;
}> {
    const lk = (s: string) => s.trim().toLowerCase();

    if (type === 'service_categories') {
        const all = await storage.getAllServiceCategories();
        return { categories: new Map(all.map(c => [lk(c.name), c])) };
    }
    if (type === 'service_catalog') {
        const [cats, serviceItems] = await Promise.all([
            storage.getAllServiceCategories(),
            inventoryRepo.getServicesFromInventory(),
        ]);
        return {
            categories: new Map(cats.map(c => [lk(c.name), c])),
            inventory: new Map(serviceItems.map(i => [`${lk(i.name)}::${lk(i.category)}`, i])),
        };
    }
    if (type === 'inventory_items') {
        const all = await inventoryRepo.getAllInventoryItems();
        return { inventory: new Map(all.map(i => [`${lk(i.name)}::${lk(i.category)}`, i])) };
    }
    if (type === 'shop_products') {
        const all = await inventoryRepo.getAllProducts();
        return { products: new Map(all.map(p => [`${lk(p.name)}::${lk(p.category)}`, p])) };
    }
    if (type === 'product_variants') {
        const all = await inventoryRepo.getAllProducts();
        return {
            productsByName: new Map(all.map(p => [lk(p.name), p])),
            products: new Map(all.map(p => [p.id, p])),
        };
    }
    // inventory_serials
    const all = await inventoryRepo.getAllInventoryItems();
    return {
        inventoryByName: new Map(all.map(i => [lk(i.name), i])),
        inventory: new Map(all.map(i => [i.id, i])),
    };
}

/**
 * Validate a CSV against a type. Pure validation — never writes.
 * Returns preview rows carrying the normalized insert/update payloads.
 */
export async function validateImport(
    type: ImportType,
    csvText: string,
    mode: ImportMode,
    options: ImportOptions = {},
): Promise<PreviewResult> {
    const globalWarnings: string[] = [];
    const parsed = parseCsv(csvText);
    if (parsed.error) {
        return { type, totalRows: 0, validRows: 0, invalidRows: 0, warnings: [parsed.error], rows: [] };
    }

    const spec = COLUMN_SPECS[type];
    const known = new Set([...spec.required, ...spec.optional].map(c => c.toLowerCase()));

    for (const h of parsed.headers) {
        const hl = h.toLowerCase();
        if (BLOCKED_COLUMNS.has(hl)) {
            globalWarnings.push(`Column "${h}" is not importable and will be ignored`);
        } else if (!known.has(hl)) {
            globalWarnings.push(`Unknown column "${h}" will be ignored`);
        }
    }

    // Case-insensitive header lookup: get('minprice') finds "minPrice" or "minprice"
    const headerMap = new Map<string, string>();
    for (const h of parsed.headers) headerMap.set(h.toLowerCase(), h);
    const get = (row: Record<string, string>, col: string): string | undefined => {
        const actual = headerMap.get(col.toLowerCase());
        return actual !== undefined ? row[actual] : undefined;
    };

    const missingRequired = spec.required.filter(c => {
        if (headerMap.has(c.toLowerCase())) return false;
        // product_variants / inventory_serials accept name OR id reference columns
        if (type === 'product_variants' && (headerMap.has('productname') || headerMap.has('productid'))) return false;
        if (type === 'inventory_serials' && (headerMap.has('inventoryitemname') || headerMap.has('inventoryitemid'))) return false;
        return true;
    });
    if (type === 'product_variants' && !headerMap.has('productname') && !headerMap.has('productid')) {
        missingRequired.push('productName or productId');
    }
    if (type === 'inventory_serials' && !headerMap.has('inventoryitemname') && !headerMap.has('inventoryitemid')) {
        missingRequired.push('inventoryItemName or inventoryItemId');
    }
    if (missingRequired.length > 0) {
        return {
            type, totalRows: parsed.rows.length, validRows: 0, invalidRows: parsed.rows.length,
            warnings: [...globalWarnings, `Missing required column(s): ${missingRequired.join(', ')}`],
            rows: [],
        };
    }

    const existing = await loadExisting(type);
    const lk = (s: string) => s.trim().toLowerCase();
    const seenKeys = new Set<string>();
    const rows: PreviewRow[] = [];

    for (let i = 0; i < parsed.rows.length; i++) {
        const raw = parsed.rows[i];
        const rowNumber = i + 2; // header is line 1
        const errors: string[] = [];
        const warnings: string[] = [];
        let normalized: Record<string, any> = {};
        let dupKey = '';
        let existsRecord: { id: string } | undefined;

        if (type === 'service_categories') {
            const name = str(get(raw, 'name'));
            if (!name) errors.push('name is required');
            const displayOrder = get(raw, 'displayOrder') !== undefined && str(get(raw, 'displayOrder'))
                ? parseIntSafe(get(raw, 'displayOrder')) : undefined;
            if (str(get(raw, 'displayOrder')) && displayOrder === undefined) errors.push('displayOrder must be a number');
            if (name) {
                dupKey = lk(name);
                existsRecord = existing.categories?.get(dupKey);
                normalized = { name, ...(displayOrder !== undefined ? { displayOrder } : {}) };
            }
        } else if (type === 'service_catalog') {
            const name = str(get(raw, 'name'));
            const category = str(get(raw, 'category'));
            const minPrice = parseNum(get(raw, 'minPrice'));
            const maxPrice = parseNum(get(raw, 'maxPrice'));
            if (!name) errors.push('name is required');
            if (!category) errors.push('category is required');
            if (minPrice === undefined) errors.push('minPrice is required and must be a number');
            if (maxPrice === undefined) errors.push('maxPrice is required and must be a number');
            if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
                errors.push('minPrice cannot be greater than maxPrice');
            }
            if (category) {
                const catExists = existing.categories?.has(lk(category));
                if (!catExists) {
                    if (options.autoCreateCategories) {
                        warnings.push(`Category "${category}" will be auto-created`);
                    } else {
                        warnings.push(`Category "${category}" is not in Service Categories; service will still import with this category text`);
                    }
                }
            }
            if (name && category) {
                dupKey = `${lk(name)}::${lk(category)}`;
                existsRecord = existing.inventory?.get(dupKey);
                const isActive = parseBool(get(raw, 'isActive')) ?? true;
                normalized = {
                    name, category,
                    itemType: 'service',
                    minPrice, maxPrice,
                    price: minPrice ?? maxPrice ?? 0,
                    stock: 0,
                    description: str(get(raw, 'description')),
                    estimatedDays: str(get(raw, 'estimatedDays')),
                    icon: str(get(raw, 'icon')),
                    showOnWebsite: isActive,
                    showOnAndroidApp: false,
                    showOnHotDeals: false,
                    isSparePart: false,
                    isSerialized: false,
                    displayOrder: parseIntSafe(get(raw, 'displayOrder')) ?? 0,
                    features: parseFeatures(get(raw, 'features')),
                };
            }
        } else if (type === 'inventory_items') {
            const name = str(get(raw, 'name'));
            const category = str(get(raw, 'category'));
            const price = parseNum(get(raw, 'price'));
            if (!name) errors.push('name is required');
            if (!category) errors.push('category is required');
            if (price === undefined) errors.push('price is required and must be a number');
            const status = str(get(raw, 'status'));
            if (status && !INVENTORY_STATUSES.includes(status)) {
                warnings.push(`Unrecognized status "${status}" — using it as-is`);
            }
            const itemType = str(get(raw, 'itemType')) ?? 'product';
            if (!['product', 'service'].includes(itemType)) {
                errors.push(`itemType must be "product" or "service" (got "${itemType}")`);
            }
            if (name && category) {
                dupKey = `${lk(name)}::${lk(category)}`;
                existsRecord = existing.inventory?.get(dupKey);
                normalized = {
                    name, category, price,
                    itemType,
                    description: str(get(raw, 'description')),
                    stock: parseIntSafe(get(raw, 'stock')) ?? 0,
                    minPrice: parseNum(get(raw, 'minPrice')),
                    maxPrice: parseNum(get(raw, 'maxPrice')),
                    status: status ?? 'In Stock',
                    lowStockThreshold: parseIntSafe(get(raw, 'lowStockThreshold')) ?? 5,
                    images: str(get(raw, 'images')),
                    showOnWebsite: parseBool(get(raw, 'showOnWebsite')) ?? false,
                    showOnAndroidApp: parseBool(get(raw, 'showOnAndroidApp')) ?? true,
                    showOnHotDeals: parseBool(get(raw, 'showOnHotDeals')) ?? false,
                    hotDealPrice: parseNum(get(raw, 'hotDealPrice')),
                    icon: str(get(raw, 'icon')),
                    estimatedDays: str(get(raw, 'estimatedDays')),
                    displayOrder: parseIntSafe(get(raw, 'displayOrder')) ?? 0,
                    features: parseFeatures(get(raw, 'features')),
                    isSparePart: parseBool(get(raw, 'isSparePart')) ?? false,
                    isSerialized: parseBool(get(raw, 'isSerialized')) ?? false,
                    reorderQuantity: parseIntSafe(get(raw, 'reorderQuantity')),
                    preferredSupplier: str(get(raw, 'preferredSupplier')),
                };
            }
        } else if (type === 'shop_products') {
            const name = str(get(raw, 'name'));
            const category = str(get(raw, 'category'));
            const priceRaw = str(get(raw, 'price'));
            if (!name) errors.push('name is required');
            if (!category) errors.push('category is required');
            if (!priceRaw) {
                errors.push('price is required');
            } else if (parseNum(priceRaw) === undefined) {
                errors.push('price must be a number');
            }
            const rating = parseNum(get(raw, 'rating'));
            const reviews = parseIntSafe(get(raw, 'reviews'));
            if (str(get(raw, 'rating')) && rating === undefined) errors.push('rating must be a number');
            if (str(get(raw, 'reviews')) && reviews === undefined) errors.push('reviews must be a number');
            if (name && category) {
                dupKey = `${lk(name)}::${lk(category)}`;
                existsRecord = existing.products?.get(dupKey);
                const image = str(get(raw, 'image'));
                if (!image) warnings.push('No image provided — an empty placeholder will be used');
                normalized = {
                    name, category,
                    price: String(parseNum(priceRaw) ?? priceRaw),
                    image: image ?? '',
                    rating: rating ?? 0,
                    reviews: reviews ?? 0,
                };
            }
        } else if (type === 'product_variants') {
            const variantName = str(get(raw, 'variantName'));
            const price = parseNum(get(raw, 'price'));
            const productId = str(get(raw, 'productId'));
            const productName = str(get(raw, 'productName'));
            if (!variantName) errors.push('variantName is required');
            if (price === undefined) errors.push('price is required and must be a number');
            let resolvedProductId: string | undefined;
            if (productId) {
                if (existing.products?.has(productId)) resolvedProductId = productId;
                else errors.push(`productId "${productId}" not found`);
            } else if (productName) {
                const p = existing.productsByName?.get(lk(productName));
                if (p) resolvedProductId = p.id;
                else errors.push(`Product "${productName}" not found`);
            } else {
                errors.push('productName or productId is required');
            }
            const sku = str(get(raw, 'sku'));
            if (resolvedProductId && variantName) {
                dupKey = sku ? `sku::${lk(sku)}` : `${resolvedProductId}::${lk(variantName)}`;
                normalized = {
                    productId: resolvedProductId,
                    variantName,
                    price,
                    stock: parseIntSafe(get(raw, 'stock')) ?? 0,
                    sku,
                };
            }
        } else {
            // inventory_serials
            const serialNumber = str(get(raw, 'serialNumber'));
            const itemId = str(get(raw, 'inventoryItemId'));
            const itemName = str(get(raw, 'inventoryItemName'));
            if (!serialNumber) errors.push('serialNumber is required');
            let resolvedItemId: string | undefined;
            if (itemId) {
                if (existing.inventory?.has(itemId)) resolvedItemId = itemId;
                else errors.push(`inventoryItemId "${itemId}" not found`);
            } else if (itemName) {
                const it = existing.inventoryByName?.get(lk(itemName));
                if (it) resolvedItemId = it.id;
                else errors.push(`Inventory item "${itemName}" not found`);
            } else {
                errors.push('inventoryItemName or inventoryItemId is required');
            }
            const status = str(get(raw, 'status')) ?? 'In Stock';
            if (!SERIAL_STATUSES.includes(status)) {
                errors.push(`status must be one of: ${SERIAL_STATUSES.join(', ')}`);
            }
            if (serialNumber && resolvedItemId) {
                dupKey = `serial::${lk(serialNumber)}`;
                normalized = {
                    inventoryItemId: resolvedItemId,
                    serialNumber,
                    status,
                    notes: str(get(raw, 'notes')),
                    storeId: str(get(raw, 'storeId')),
                };
            }
        }

        // In-CSV duplicate check
        if (dupKey && errors.length === 0) {
            if (seenKeys.has(dupKey)) {
                errors.push('Duplicate row — same key already appears earlier in this CSV');
            } else {
                seenKeys.add(dupKey);
            }
        }

        // Decide action from mode + existence
        let action: PreviewRow['action'] = 'skip';
        if (errors.length === 0) {
            if (type === 'product_variants' || type === 'inventory_serials') {
                // Child records: create-only semantics regardless of mode
                if (existsRecord) {
                    action = 'skip';
                    warnings.push('Already exists — will be skipped');
                } else {
                    action = 'create';
                    if (mode === 'updateExisting') {
                        action = 'skip';
                        warnings.push('New record but mode is "update existing" — will be skipped');
                    }
                }
            } else if (existsRecord) {
                if (mode === 'createOnly') {
                    action = 'skip';
                    warnings.push('Already exists — will be skipped (create-only mode)');
                } else {
                    action = 'update';
                    normalized._updateId = existsRecord.id;
                }
            } else {
                if (mode === 'updateExisting') {
                    action = 'skip';
                    warnings.push('No existing record to update — will be skipped');
                } else {
                    action = 'create';
                }
            }
        }

        rows.push({
            rowNumber,
            status: errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid',
            action: errors.length > 0 ? 'skip' : action,
            errors,
            warnings,
            normalized: errors.length > 0 ? {} : normalized,
        });
    }

    // Serial duplicate check against DB (batch, once)
    if (type === 'inventory_serials') {
        const serials = rows
            .filter(r => r.errors.length === 0 && r.normalized.serialNumber)
            .map(r => r.normalized.serialNumber as string);
        if (serials.length > 0) {
            const found = await db.select({ serialNumber: schema.inventorySerials.serialNumber })
                .from(schema.inventorySerials)
                .where(inArray(schema.inventorySerials.serialNumber, serials));
            const foundSet = new Set(found.map(f => f.serialNumber.toLowerCase()));
            for (const r of rows) {
                if (r.errors.length === 0 && foundSet.has(String(r.normalized.serialNumber).toLowerCase())) {
                    r.warnings.push('Serial number already exists in database — will be skipped');
                    r.action = 'skip';
                    r.status = 'warning';
                }
            }
        }
    }

    // Variant duplicate check against DB (per referenced product, batch)
    if (type === 'product_variants') {
        const productIds = Array.from(new Set(
            rows.filter(r => r.errors.length === 0 && r.normalized.productId).map(r => r.normalized.productId as string)
        ));
        if (productIds.length > 0) {
            const found = await db.select({
                productId: schema.productVariants.productId,
                variantName: schema.productVariants.variantName,
                sku: schema.productVariants.sku,
            }).from(schema.productVariants).where(inArray(schema.productVariants.productId, productIds));
            const byNameKey = new Set(found.map(f => `${f.productId}::${f.variantName.toLowerCase()}`));
            const bySku = new Set(found.filter(f => f.sku).map(f => String(f.sku).toLowerCase()));
            for (const r of rows) {
                if (r.errors.length > 0) continue;
                const n = r.normalized;
                const dupByName = byNameKey.has(`${n.productId}::${String(n.variantName).toLowerCase()}`);
                const dupBySku = n.sku && bySku.has(String(n.sku).toLowerCase());
                if (dupByName || dupBySku) {
                    r.warnings.push('Variant already exists — will be skipped');
                    r.action = 'skip';
                    r.status = 'warning';
                }
            }
        }
    }

    const validRows = rows.filter(r => r.status !== 'invalid').length;
    return {
        type,
        totalRows: rows.length,
        validRows,
        invalidRows: rows.length - validRows,
        warnings: globalWarnings,
        rows,
    };
}

// ─── Commit ───────────────────────────────────────────────────────────────────

/**
 * Re-validates the CSV then imports valid rows. Rows are written one-by-one so a
 * single bad row fails only itself — counts and per-row errors are reported back.
 */
export async function commitImport(
    type: ImportType,
    csvText: string,
    mode: ImportMode,
    options: ImportOptions = {},
): Promise<CommitResult> {
    const preview = await validateImport(type, csvText, mode, options);
    const batchId = randomUUID();
    let created = 0, updated = 0, skipped = 0, failed = 0;
    const errors: string[] = [];

    // Auto-create missing service categories first (service_catalog only)
    if (type === 'service_catalog' && options.autoCreateCategories) {
        const existingCats = new Set(
            (await storage.getAllServiceCategories()).map(c => c.name.trim().toLowerCase())
        );
        const needed = new Map<string, string>();
        for (const r of preview.rows) {
            if (r.status === 'invalid' || r.action === 'skip') continue;
            const cat = String(r.normalized.category ?? '').trim();
            if (cat && !existingCats.has(cat.toLowerCase())) needed.set(cat.toLowerCase(), cat);
        }
        for (const catName of Array.from(needed.values())) {
            try {
                await storage.createServiceCategory({ name: catName, displayOrder: 0 });
            } catch (e: any) {
                errors.push(`Failed to auto-create category "${catName}"`);
            }
        }
    }

    for (const row of preview.rows) {
        if (row.status === 'invalid') { skipped++; continue; }
        if (row.action === 'skip') { skipped++; continue; }

        const { _updateId, ...payload } = row.normalized;
        try {
            if (type === 'service_categories') {
                if (row.action === 'update' && _updateId) {
                    await storage.updateServiceCategory(_updateId, payload as any);
                    updated++;
                } else {
                    await storage.createServiceCategory(payload as any);
                    created++;
                }
            } else if (type === 'service_catalog') {
                if (row.action === 'update' && _updateId) {
                    await inventoryRepo.updateInventoryItem(_updateId, payload as any);
                    updated++;
                } else {
                    await inventoryRepo.createInventoryItem(payload as any);
                    created++;
                }
            } else if (type === 'inventory_items') {
                if (row.action === 'update' && _updateId) {
                    await inventoryRepo.updateInventoryItem(_updateId, payload as any);
                    updated++;
                } else {
                    await inventoryRepo.createInventoryItem(payload as any);
                    created++;
                }
            } else if (type === 'shop_products') {
                if (row.action === 'update' && _updateId) {
                    await inventoryRepo.updateProduct(_updateId, payload as any);
                    updated++;
                } else {
                    await inventoryRepo.createProduct(payload as any);
                    created++;
                }
            } else if (type === 'product_variants') {
                await storage.createProductVariant(payload as any);
                created++;
            } else {
                // inventory_serials — single insert preserving status/notes/storeId
                await db.insert(schema.inventorySerials).values({
                    id: randomUUID(),
                    inventoryItemId: payload.inventoryItemId,
                    serialNumber: payload.serialNumber,
                    status: payload.status ?? 'In Stock',
                    notes: payload.notes ?? null,
                    storeId: payload.storeId ?? null,
                });
                created++;
            }
        } catch (e: any) {
            failed++;
            // Never expose raw SQL errors to the client
            errors.push(`Row ${row.rowNumber}: import failed`);
            console.warn(`[CatalogImport] Row ${row.rowNumber} (${type}) failed:`, e.message?.slice(0, 120));
        }
    }

    return { batchId, created, updated, skipped, failed, errors };
}
