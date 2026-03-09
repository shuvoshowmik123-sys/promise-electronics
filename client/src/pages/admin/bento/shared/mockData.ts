export const revenueData = [
    { name: 'Jan', value: 4000 },
    { name: 'Feb', value: 3000 },
    { name: 'Mar', value: 2000 },
    { name: 'Apr', value: 2780 },
    { name: 'May', value: 1890 },
    { name: 'Jun', value: 2390 },
    { name: 'Jul', value: 3490 },
];

export const techData = [
    { name: 'Masud', jobs: 12 },
    { name: 'Rahim', jobs: 8 },
    { name: 'Karim', jobs: 15 },
    { name: 'Jamal', jobs: 6 },
];

export const jobStatusData = [
    { name: 'Active', value: 42, color: '#3b82f6' },
    { name: 'Pending', value: 12, color: '#f59e0b' },
    { name: 'Completed', value: 85, color: '#10b981' },
];

export const jobs = Array.from({ length: 20 }).map((_, i) => ({
    id: `JOB-2026-${1000 + i}`,
    device: i % 2 === 0 ? "Samsung 55\" QLED 4K" : "Sony Bravia 65\" OLED",
    status: i % 3 === 0 ? "Completed" : i % 3 === 1 ? "In Progress" : "Pending",
    date: "Feb 12, 2026",
    technician: i % 2 === 0 ? "Masud Rana" : "Unassigned"
}));

export const lowStockItems = [
    { name: "Samsung 55\" LED Panel", stock: 2, threshold: 5, sku: "PNL-SAM-55" },
    { name: "Sony Mainboard MB-X1", stock: 1, threshold: 3, sku: "MB-SNY-X1" },
    { name: "Universal Power Supply", stock: 0, threshold: 10, sku: "PSU-UNI-00" },
];
