/**
 * PDF Invoice Service
 * 
 * Generates PDF invoices matching the Web Admin Panel design.
 * Uses pdfmake for server-side PDF generation.
 */

// @ts-ignore - pdfmake types
import PdfPrinter from 'pdfmake';
// @ts-ignore - pdfmake types  
import type { TDocumentDefinitions, Content, StyleDictionary } from 'pdfmake/interfaces';
import { posRepo, settingsRepo, jobRepo } from '../repositories/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory path for fonts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define fonts for pdfmake
const fonts = {
    Roboto: {
        normal: path.join(__dirname, '../fonts/Roboto-Regular.ttf'),
        bold: path.join(__dirname, '../fonts/Roboto-Bold.ttf'),
        italics: path.join(__dirname, '../fonts/Roboto-Italic.ttf'),
        bolditalics: path.join(__dirname, '../fonts/Roboto-BoldItalic.ttf'),
    }
};

// Fallback to default fonts if custom fonts not available
const printer = new PdfPrinter(fonts);

interface InvoiceItem {
    id?: string;
    name: string;
    price?: string;
    unitPrice?: number;
    quantity: number;
}

interface LinkedJobCharge {
    jobId: string;
    serviceItemId?: string | null;
    serviceItemName?: string | null;
    billedAmount: number;
    customerName?: string | null;
}

interface TransactionData {
    id: string;
    invoiceNumber?: string | null;
    customer?: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
    items?: string | InvoiceItem[];
    linkedJobs?: string | LinkedJobCharge[];
    subtotal: string;
    tax?: string;
    taxRate?: string;
    discount?: string;
    total: string;
    paymentMethod?: string;
    createdAt?: string;
}

interface CompanyInfo {
    name: string;
    logo?: string;
    address: string;
    phone: string;
    email: string;
    website: string;
}

export async function generateInvoicePdf(transactionId: string): Promise<Buffer> {
    // Fetch transaction
    const transaction = await posRepo.getPosTransaction(transactionId);
    if (!transaction) {
        throw new Error('Transaction not found');
    }

    // Fetch company settings
    const settings = await settingsRepo.getAllSettings();
    const getSettingValue = (key: string, defaultValue: string): string => {
        const setting = settings.find(s => s.key === key);
        return setting?.value || defaultValue;
    };

    const companyInfo: CompanyInfo = {
        name: getSettingValue('site_name', 'PROMISE ELECTRONICS'),
        logo: getSettingValue('logo_url', ''),
        address: getSettingValue('company_address', 'Dhaka, Bangladesh'),
        phone: getSettingValue('support_phone', '+880 1700-000000'),
        email: getSettingValue('company_email', 'support@promise-electronics.com'),
        website: getSettingValue('company_website', 'www.promise-electronics.com'),
    };

    // Fetch logo image and convert to base64 using axios
    let logoBase64: string | null = null;
    if (companyInfo.logo) {
        try {
            const logoUrl = companyInfo.logo;
            console.log('Fetching logo from:', logoUrl);

            // Use dynamic import for axios
            const axios = (await import('axios')).default;
            const response = await axios.get(logoUrl, { responseType: 'arraybuffer' });

            if (response.status === 200) {
                const buffer = Buffer.from(response.data);
                const mimeType = response.headers['content-type'] || 'image/png';
                logoBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
                console.log('Logo fetched successfully');
            } else {
                console.log('Failed to fetch logo:', response.status);
            }
        } catch (e) {
            console.error('Error fetching logo:', e);
        }
    }

    // Parse items
    let items: InvoiceItem[] = [];
    if (transaction.items) {
        try {
            items = typeof transaction.items === 'string'
                ? JSON.parse(transaction.items)
                : transaction.items;
        } catch (e) {
            items = [];
        }
    }

    // Parse linked jobs
    let linkedJobs: LinkedJobCharge[] = [];
    if (transaction.linkedJobs) {
        try {
            linkedJobs = typeof transaction.linkedJobs === 'string'
                ? JSON.parse(transaction.linkedJobs)
                : transaction.linkedJobs;
        } catch (e) {
            linkedJobs = [];
        }
    }

    // Fetch warranty data from linked job tickets
    interface WarrantyInfo {
        jobId: string;
        warrantyDays: number; // Unified
        warrantyExpiryDate: Date | null;
    }

    const warrantyData: WarrantyInfo[] = [];
    for (const job of linkedJobs) {
        try {
            const jobTicket = await jobRepo.getJobTicket(job.jobId);
            if (jobTicket && (jobTicket.warrantyDays || 0) > 0) {
                warrantyData.push({
                    jobId: job.jobId,
                    warrantyDays: jobTicket.warrantyDays || 0,
                    warrantyExpiryDate: jobTicket.warrantyExpiryDate,
                });
            }
        } catch (e) {
            // Skip if job ticket not found
        }
    }

    // Format date
    const formatDate = (dateStr: string | Date): string => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const formatTime = (dateStr: string | Date): string => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    // Get customer info (may come from linked job)
    const jobWithCustomer = linkedJobs.find(j => j.customerName);
    const displayCustomer = jobWithCustomer?.customerName || transaction.customer || 'Walk-in Customer';
    const displayPhone = transaction.customerPhone;
    const displayAddress = transaction.customerAddress;

    // Build items table rows
    const tableBody: Content[][] = [
        [
            { text: '#', style: 'tableHeader' },
            { text: 'Item Description', style: 'tableHeader' },
            { text: 'Qty', style: 'tableHeader', alignment: 'center' },
            { text: 'Unit Price', style: 'tableHeader', alignment: 'right' },
            { text: 'Amount', style: 'tableHeader', alignment: 'right' },
        ]
    ];

    // Add regular items
    items.forEach((item, index) => {
        const priceStr = item.price || String(item.unitPrice || 0);
        const price = parseFloat(priceStr.replace(/[^0-9.-]+/g, '')) || 0;
        const amount = price * item.quantity;

        tableBody.push([
            { text: String(index + 1), style: 'tableCell' },
            {
                stack: [
                    { text: item.name, style: 'tableCell', bold: true },
                    item.id ? { text: `ID: ${item.id}`, style: 'smallText' } : ''
                ]
            },
            { text: String(item.quantity), style: 'tableCell', alignment: 'center' },
            { text: `৳${price.toFixed(2)}`, style: 'tableCell', alignment: 'right' },
            { text: `৳${amount.toFixed(2)}`, style: 'tableCell', alignment: 'right', bold: true },
        ]);
    });

    // Add linked jobs
    linkedJobs.forEach((job, index) => {
        tableBody.push([
            { text: String(items.length + index + 1), style: 'tableCell' },
            {
                stack: [
                    { text: job.serviceItemName || 'Repair Service', style: 'tableCell', bold: true },
                    { text: `Job: ${job.jobId}`, style: 'smallText' }
                ]
            },
            { text: '1', style: 'tableCell', alignment: 'center' },
            { text: `৳${job.billedAmount.toFixed(2)}`, style: 'tableCell', alignment: 'right' },
            { text: `৳${job.billedAmount.toFixed(2)}`, style: 'tableCell', alignment: 'right', bold: true },
        ]);
    });

    const subtotal = parseFloat(String(transaction.subtotal)) || 0;
    const tax = parseFloat(String(transaction.tax || '0'));
    const discount = parseFloat(String(transaction.discount || '0'));
    const total = parseFloat(String(transaction.total)) || 0;

    // Define document
    const docDefinition: TDocumentDefinitions = {
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        content: [
            // Header with Logo
            {
                columns: [
                    // Left: Logo + Company Info
                    {
                        width: '*',
                        columns: [
                            // Logo
                            logoBase64 ? {
                                image: logoBase64,
                                width: 60,
                                height: 60,
                            } : {
                                text: '',
                                width: 0,
                            },
                            // Company Info
                            {
                                stack: [
                                    { text: companyInfo.name, style: 'companyName' },
                                    { text: companyInfo.address, style: 'companyInfo' },
                                    { text: companyInfo.phone, style: 'companyInfo' },
                                    { text: companyInfo.email, style: 'companyInfo' },
                                ],
                                margin: [logoBase64 ? 10 : 0, 0, 0, 0],
                            },
                        ],
                    },
                    // Right: Invoice Title
                    {
                        width: 'auto',
                        stack: [
                            { text: 'INVOICE', style: 'invoiceTitle', alignment: 'right' },
                            { text: transaction.invoiceNumber || transaction.id, style: 'invoiceNumber', alignment: 'right' },
                        ]
                    }
                ]
            },
            { canvas: [{ type: 'line', x1: 0, y1: 10, x2: 515, y2: 10, lineWidth: 1, lineColor: '#cccccc' }] },
            { text: '', margin: [0, 20] },

            // Bill To & Invoice Info
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: 'BILL TO', style: 'sectionLabel' },
                            { text: displayCustomer, style: 'customerName' },
                            displayPhone ? { text: `Phone: ${displayPhone}`, style: 'customerInfo' } : '',
                            displayAddress ? { text: `Address: ${displayAddress}`, style: 'customerInfo' } : '',
                        ]
                    },
                    {
                        width: 'auto',
                        stack: [
                            { text: `Invoice Date: ${formatDate(transaction.createdAt || new Date())}`, style: 'invoiceInfo', alignment: 'right' },
                            { text: `Time: ${formatTime(transaction.createdAt || new Date())}`, style: 'invoiceInfo', alignment: 'right' },
                            { text: `Payment: ${transaction.paymentMethod || 'Cash'}`, style: 'invoiceInfo', alignment: 'right' },
                        ]
                    }
                ]
            },
            { text: '', margin: [0, 20] },

            // Items Table
            {
                table: {
                    headerRows: 1,
                    widths: [30, '*', 50, 80, 80],
                    body: tableBody
                },
                layout: {
                    hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
                    vLineWidth: () => 0,
                    hLineColor: (i: number) => i === 1 ? '#333333' : '#cccccc',
                    fillColor: (i: number) => i === 0 ? '#f5f5f5' : null,
                    paddingLeft: () => 8,
                    paddingRight: () => 8,
                    paddingTop: () => 6,
                    paddingBottom: () => 6,
                }
            },
            { text: '', margin: [0, 20] },

            // Totals
            {
                columns: [
                    { width: '*', text: '' },
                    {
                        width: 200,
                        stack: [
                            { columns: [{ text: 'Subtotal', style: 'totalLabel' }, { text: `৳${subtotal.toFixed(2)}`, style: 'totalValue', alignment: 'right' }] },
                            { columns: [{ text: `VAT (${transaction.taxRate || '5'}%)`, style: 'totalLabel' }, { text: `৳${tax.toFixed(2)}`, style: 'totalValue', alignment: 'right' }] },
                            discount > 0 ? { columns: [{ text: 'Discount', style: 'discountLabel' }, { text: `-৳${discount.toFixed(2)}`, style: 'discountValue', alignment: 'right' }] } : {},
                            { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 200, y2: 5, lineWidth: 2, lineColor: '#333333' }] },
                            { columns: [{ text: 'Total', style: 'grandTotalLabel' }, { text: `৳${total.toFixed(2)}`, style: 'grandTotalValue', alignment: 'right' }], margin: [0, 5, 0, 0] },
                        ]
                    }
                ]
            },
            { text: '', margin: [0, 40] },

            // Signatures
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: 'Authorized Signature', style: 'signatureLabel' },
                            { canvas: [{ type: 'line', x1: 0, y1: 40, x2: 150, y2: 40, lineWidth: 1, lineColor: '#999999' }] },
                            { text: companyInfo.name, style: 'signatureName', margin: [0, 5, 0, 0] },
                        ]
                    },
                    {
                        width: '*',
                        stack: [
                            { text: 'Customer Signature', style: 'signatureLabel' },
                            { canvas: [{ type: 'line', x1: 0, y1: 40, x2: 150, y2: 40, lineWidth: 1, lineColor: '#999999' }] },
                            { text: displayCustomer, style: 'signatureName', margin: [0, 5, 0, 0] },
                        ]
                    }
                ]
            },
            { text: '', margin: [0, 20] },

            // Warranty Terms Section (if any warranty exists)
            ...(warrantyData.length > 0 ? [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#1565C0' }] } as Content,
                { text: '🛡️ WARRANTY TERMS', style: 'warrantyTitle', margin: [0, 10, 0, 10] } as Content,
                {
                    stack: warrantyData.map((w, idx) => ({
                        stack: [
                            linkedJobs.length > 1 ? { text: `Job #${w.jobId}`, style: 'warrantyJobLabel', margin: [0, idx > 0 ? 10 : 0, 0, 5] } : {},
                            {
                                columns: [
                                    {
                                        width: '*',
                                        stack: [
                                            { text: 'Warranty Period', style: 'warrantyLabel' },
                                            { text: w.warrantyDays > 0 ? `${w.warrantyDays} Days` : 'Not Applicable', style: w.warrantyDays > 0 ? 'warrantyValue' : 'warrantyNA' },
                                            w.warrantyExpiryDate ? { text: `Expires: ${new Date(w.warrantyExpiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, style: 'warrantyExpiry' } : {},
                                        ]
                                    }
                                ]
                            }
                        ]
                    }))
                } as Content,
                { text: 'Terms: Warranty is void if device shows signs of physical damage, water damage, or unauthorized repair attempts.', style: 'warrantyDisclaimer', margin: [0, 10, 0, 0] } as Content,
                { text: '', margin: [0, 15] } as Content,
            ] : []),

            // Footer
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#cccccc' }] },
            { text: 'Thank you for your business!', style: 'footer', alignment: 'center', margin: [0, 10, 0, 0] },
            { text: companyInfo.website, style: 'footerUrl', alignment: 'center' },
        ],
        styles: {
            companyName: { fontSize: 18, bold: true, color: '#1565C0' },
            companyInfo: { fontSize: 10, color: '#666666', margin: [0, 2, 0, 0] },
            invoiceTitle: { fontSize: 24, bold: true, color: '#333333' },
            invoiceNumber: { fontSize: 10, color: '#666666', background: '#f0f0f0', margin: [5, 5, 5, 5] },
            sectionLabel: { fontSize: 10, bold: true, color: '#999999', margin: [0, 0, 0, 5] },
            customerName: { fontSize: 14, bold: true },
            customerInfo: { fontSize: 10, color: '#666666' },
            invoiceInfo: { fontSize: 10, color: '#666666', margin: [0, 2, 0, 0] },
            tableHeader: { fontSize: 10, bold: true, color: '#333333' },
            tableCell: { fontSize: 10 },
            smallText: { fontSize: 8, color: '#999999' },
            totalLabel: { fontSize: 10, color: '#666666' },
            totalValue: { fontSize: 10 },
            discountLabel: { fontSize: 10, color: '#4CAF50' },
            discountValue: { fontSize: 10, color: '#4CAF50' },
            grandTotalLabel: { fontSize: 14, bold: true },
            grandTotalValue: { fontSize: 14, bold: true },
            signatureLabel: { fontSize: 8, color: '#999999' },
            signatureName: { fontSize: 10, color: '#666666' },
            footer: { fontSize: 10, color: '#666666' },
            footerUrl: { fontSize: 10, color: '#999999' },
            // Warranty styles
            warrantyTitle: { fontSize: 12, bold: true, color: '#1565C0' },
            warrantyJobLabel: { fontSize: 10, bold: true, color: '#333333' },
            warrantyLabel: { fontSize: 9, color: '#666666', margin: [0, 0, 0, 2] },
            warrantyValue: { fontSize: 11, bold: true, color: '#2E7D32' },
            warrantyNA: { fontSize: 10, color: '#999999', italics: true },
            warrantyExpiry: { fontSize: 8, color: '#666666' },
            warrantyDisclaimer: { fontSize: 8, color: '#999999', italics: true },
        } as StyleDictionary,
        defaultStyle: {
            font: 'Roboto'
        }
    };

    // Generate PDF
    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
    });
}
