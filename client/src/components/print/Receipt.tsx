import { forwardRef } from "react";

type ReceiptItem = {
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
};

type ReceiptData = {
  id: string;
  invoiceNumber: string | null;
  customer: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  items: ReceiptItem[];
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
};

interface ReceiptProps {
  data: ReceiptData;
  company: CompanyInfo;
}

export const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(({ data, company }, ref) => {
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-BD", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div 
      ref={ref}
      className="bg-white p-2 font-mono text-[10px] leading-tight"
      style={{ width: "57mm", minHeight: "40mm" }}
      data-testid="print-receipt"
    >
      <div className="text-center mb-2 pb-2 border-b border-dashed border-gray-400">
        {company.logo && (
          <img 
            src={company.logo} 
            alt={company.name} 
            className="h-8 w-8 object-contain mx-auto mb-1"
            data-testid="receipt-logo"
          />
        )}
        <p className="font-bold text-xs" data-testid="receipt-company-name">{company.name}</p>
        <p className="text-[8px] text-gray-600">{company.address}</p>
        <p className="text-[8px] text-gray-600">{company.phone}</p>
      </div>

      <div className="text-center mb-2">
        <p className="font-bold">SALES RECEIPT</p>
      </div>

      <div className="mb-2 pb-2 border-b border-dashed border-gray-400">
        <div className="flex justify-between">
          <span>Rcpt#:</span>
          <span className="font-bold" data-testid="receipt-number">{data.invoiceNumber || data.id}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span data-testid="receipt-date">{formatDateTime(data.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span data-testid="receipt-customer">{data.customer || "Walk-in"}</span>
        </div>
        {data.customerPhone && (
          <div className="flex justify-between">
            <span>Phone:</span>
            <span data-testid="receipt-customer-phone">{data.customerPhone}</span>
          </div>
        )}
        {data.customerAddress && (
          <div className="text-[8px] mt-1" data-testid="receipt-customer-address">
            Addr: {data.customerAddress}
          </div>
        )}
      </div>

      <div className="mb-2 pb-2 border-b border-dashed border-gray-400">
        <div className="flex justify-between font-bold mb-1">
          <span>Item</span>
          <span>Amount</span>
        </div>
        {data.items.map((item, index) => {
          const price = parseFloat(item.price.replace(/[^0-9.-]+/g, ""));
          const amount = price * item.quantity;
          return (
            <div key={item.id} className="mb-1" data-testid={`receipt-item-${index}`}>
              <div className="truncate pr-2">{item.name}</div>
              <div className="flex justify-between text-gray-600">
                <span>{item.quantity} x ৳{price.toFixed(0)}</span>
                <span>৳{amount.toFixed(0)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-2">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span data-testid="receipt-subtotal">৳{parseFloat(data.subtotal).toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span>VAT ({data.taxRate || "5"}%):</span>
          <span data-testid="receipt-tax">৳{parseFloat(data.tax).toFixed(0)}</span>
        </div>
        {parseFloat(data.discount) > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span data-testid="receipt-discount">-৳{parseFloat(data.discount).toFixed(0)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-gray-400 pt-1 mt-1">
          <span>TOTAL:</span>
          <span data-testid="receipt-total">৳{parseFloat(data.total).toFixed(0)}</span>
        </div>
      </div>

      <div className="mb-2 pb-2 border-b border-dashed border-gray-400">
        <div className="flex justify-between">
          <span>Payment:</span>
          <span data-testid="receipt-payment-method">{data.paymentMethod}</span>
        </div>
      </div>

      {data.linkedJobs.length > 0 && (
        <div className="mb-2 pb-2 border-b border-dashed border-gray-400 text-[8px]">
          <p className="font-bold mb-1">Service Jobs:</p>
          {data.linkedJobs.map((job) => (
            <div key={job.jobId}>
              <span>{job.jobId}</span>
              {job.serviceItemName && <span> - {job.serviceItemName}</span>}
              {job.billedAmount > 0 && <span className="float-right">৳{job.billedAmount.toFixed(0)}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="text-center text-[8px] text-gray-600">
        <p className="font-bold mb-1">Thank you!</p>
        <p>Please keep receipt for returns</p>
        <p>within 7 days with original receipt</p>
      </div>

      <div className="text-center mt-2 pt-2 border-t border-dashed border-gray-400">
        <p className="text-[8px]">*** END OF RECEIPT ***</p>
      </div>
    </div>
  );
});

Receipt.displayName = "Receipt";
