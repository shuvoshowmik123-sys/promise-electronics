import { forwardRef } from "react";

type InvoiceItem = {
  id: string;
  name: string;
  price: string;
  quantity: number;
};

type LinkedJobCharge = {
  jobId: string;
  serviceItemId: string | null;
  serviceItemName: string | null;
  billedAmount: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
};

type InvoiceData = {
  id: string;
  invoiceNumber: string | null;
  customer: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  items: InvoiceItem[];
  linkedJobs: LinkedJobCharge[];
  subtotal: string;
  tax: string;
  taxRate: string;
  discount: string;
  total: string;
  paymentMethod: string;
  createdAt: string;
};

type CompanyInfo = {
  name: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  website: string;
};

interface InvoiceProps {
  data: InvoiceData;
  company: CompanyInfo;
}

export const Invoice = forwardRef<HTMLDivElement, InvoiceProps>(({ data, company }, ref) => {
  const defaultCompany: CompanyInfo = {
    name: "PROMISE ELECTRONICS",
    logo: "",
    address: "Dhaka, Bangladesh",
    phone: "+880 1700-000000",
    email: "support@promise-electronics.com",
    website: "www.promise-electronics.com",
  };

  const companyInfo = company || defaultCompany;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-BD", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-BD", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div 
      ref={ref}
      className="bg-white p-8 max-w-[210mm] mx-auto font-sans print:p-6"
      data-testid="print-invoice"
    >
      <div className="flex justify-between items-start mb-8 border-b pb-6">
        <div className="flex items-center gap-4">
          {companyInfo.logo && (
            <img 
              src={companyInfo.logo} 
              alt={companyInfo.name} 
              className="h-16 w-16 object-contain"
              data-testid="invoice-logo"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-primary" data-testid="invoice-company-name">
              {companyInfo.name}
            </h1>
            <p className="text-sm text-gray-600">{companyInfo.address}</p>
            <p className="text-sm text-gray-600">{companyInfo.phone}</p>
            <p className="text-sm text-gray-600">{companyInfo.email}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">INVOICE</h2>
          <p className="text-sm font-mono bg-gray-100 px-3 py-1 rounded" data-testid="invoice-number">
            {data.invoiceNumber || data.id}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Bill To</h3>
          {(() => {
            const jobWithCustomer = data.linkedJobs.find(j => j.customerName);
            const displayCustomer = jobWithCustomer?.customerName || data.customer || "Walk-in Customer";
            const displayPhone = jobWithCustomer?.customerPhone || data.customerPhone;
            const displayAddress = jobWithCustomer?.customerAddress || data.customerAddress;
            return (
              <>
                <p className="font-semibold text-lg" data-testid="invoice-customer">
                  {displayCustomer}
                </p>
                {displayPhone && (
                  <p className="text-sm text-gray-600" data-testid="invoice-customer-phone">
                    Phone: {displayPhone}
                  </p>
                )}
                {displayAddress && (
                  <p className="text-sm text-gray-600" data-testid="invoice-customer-address">
                    Address: {displayAddress}
                  </p>
                )}
              </>
            );
          })()}
        </div>
        <div className="text-right">
          <div className="mb-2">
            <span className="text-sm text-gray-500">Invoice Date: </span>
            <span className="font-medium" data-testid="invoice-date">{formatDate(data.createdAt)}</span>
          </div>
          <div className="mb-2">
            <span className="text-sm text-gray-500">Time: </span>
            <span className="font-medium">{formatTime(data.createdAt)}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Payment: </span>
            <span className="font-medium" data-testid="invoice-payment-method">{data.paymentMethod}</span>
          </div>
        </div>
      </div>

      <table className="w-full mb-8">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left py-3 px-4 font-semibold text-sm">#</th>
            <th className="text-left py-3 px-4 font-semibold text-sm">Item Description</th>
            <th className="text-center py-3 px-4 font-semibold text-sm">Qty</th>
            <th className="text-right py-3 px-4 font-semibold text-sm">Unit Price</th>
            <th className="text-right py-3 px-4 font-semibold text-sm">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => {
            const price = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
            const amount = price * item.quantity;
            return (
              <tr key={item.id} className="border-b" data-testid={`invoice-item-${index}`}>
                <td className="py-3 px-4 text-sm">{index + 1}</td>
                <td className="py-3 px-4">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-gray-500">ID: {item.id}</p>
                </td>
                <td className="py-3 px-4 text-center">{item.quantity}</td>
                <td className="py-3 px-4 text-right">৳{price.toFixed(2)}</td>
                <td className="py-3 px-4 text-right font-medium">৳{amount.toFixed(2)}</td>
              </tr>
            );
          })}
          {data.linkedJobs.map((job, index) => (
            <tr key={job.jobId} className="border-b" data-testid={`invoice-job-${index}`}>
              <td className="py-3 px-4 text-sm">{data.items.length + index + 1}</td>
              <td className="py-3 px-4">
                <p className="font-medium">{job.serviceItemName || "Repair Service"}</p>
                <p className="text-xs text-gray-500">Job: {job.jobId}</p>
              </td>
              <td className="py-3 px-4 text-center">1 pcs</td>
              <td className="py-3 px-4 text-right">৳{job.billedAmount.toFixed(2)}</td>
              <td className="py-3 px-4 text-right font-medium">৳{job.billedAmount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mb-8">
        <div className="w-72">
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span data-testid="invoice-subtotal">৳{parseFloat(data.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-600">VAT ({data.taxRate || "5"}%)</span>
            <span data-testid="invoice-tax">৳{parseFloat(data.tax).toFixed(2)}</span>
          </div>
          {parseFloat(data.discount) > 0 && (
            <div className="flex justify-between py-2 text-sm text-green-600">
              <span>Discount</span>
              <span data-testid="invoice-discount">-৳{parseFloat(data.discount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between py-3 text-lg font-bold border-t-2 border-gray-800 mt-2">
            <span>Total</span>
            <span data-testid="invoice-total">৳{parseFloat(data.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="border-t pt-6 mt-auto">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-gray-500 mb-8">Authorized Signature</p>
            <div className="border-t border-gray-400 pt-2 w-48">
              <p className="text-sm text-gray-600">{company.name}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-8">Customer Signature</p>
            <div className="border-t border-gray-400 pt-2 w-48">
              <p className="text-sm text-gray-600">{data.linkedJobs.find(j => j.customerName)?.customerName || data.customer || "Walk-in Customer"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center mt-8 pt-4 border-t text-xs text-gray-500">
        <p>Thank you for your business!</p>
        <p className="mt-1">{company.website}</p>
      </div>
    </div>
  );
});

Invoice.displayName = "Invoice";
