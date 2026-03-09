
export interface Device {
    id?: string;
    corporateJobNumber: string;
    deviceBrand: string;
    model: string;
    serialNumber: string;
    reportedDefect: string;
    initialStatus: "OK" | "NG";
}

export interface ValidationResult {
    isComplete: boolean;
    missingFields: string[];
}

export interface IncompleteRow {
    index: number;
    device: Device;
    missingFields: {
        field: keyof Device;
        label: string;
    }[];
}

export const REQUIRED_FIELDS = [
    { field: 'corporateJobNumber', label: 'Job Reference' },
    { field: 'deviceBrand', label: 'Brand' },
    { field: 'model', label: 'Model' },
    // Serial number might be optional for some workflows, but keeping it required for now based on previous context
    { field: 'serialNumber', label: 'Serial Number' },
    { field: 'reportedDefect', label: 'Reported Issue' }
] as const;

export function validateDevice(device: Device): ValidationResult {
    // Check if device is null/undefined to avoid crash
    if (!device) return { isComplete: false, missingFields: ["Device is undefined"] };

    const missingFields = REQUIRED_FIELDS
        .filter(({ field }) => {
            const value = device[field];
            // Check for empty string or null/undefined
            return !value || (typeof value === 'string' && value.trim() === '');
        })
        .map(({ label }) => label);

    return {
        isComplete: missingFields.length === 0,
        missingFields
    };
}

export function getIncompleteRows(devices: Device[]): IncompleteRow[] {
    return devices
        .map((device, index) => {
            const validation = validateDevice(device);
            if (!validation.isComplete) {
                return {
                    index,
                    device,
                    missingFields: REQUIRED_FIELDS.filter(
                        ({ field }) => !device[field] || (typeof device[field] === 'string' && device[field].trim() === '')
                    ) as { field: keyof Device; label: string; }[]
                };
            }
            return null;
        })
        .filter((row): row is IncompleteRow => row !== null);
}
