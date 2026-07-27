/**
 * Corporate Bill line-item display utilities. The authoritative bill line store is
 * `corporate_bills.line_items` (exposed as `lineItems`), never a legacy `items` field.
 */
export interface BillLineItemInput {
  jobId?: string | null;
  jobNo?: string | null;
  device?: string | null;
  defect?: string | null;
  serial?: string | null;
  amount?: number | null;
}

export interface BillLineItemDisplay {
  description: string;
  jobRef: string;
  serial: string;
  amount: number;
}

export function getBillLineItems(bill: { lineItems?: unknown } | null | undefined): BillLineItemInput[] {
  const items = bill?.lineItems;
  return Array.isArray(items) ? (items as BillLineItemInput[]) : [];
}

export function describeBillLineItem(item: BillLineItemInput): BillLineItemDisplay {
  const description = [item.device, item.defect].filter(Boolean).join(" - ") || "Repair Service";
  const jobRef = item.jobNo || item.jobId || "";
  const serial = item.serial || "";
  const amount = Number(item.amount) || 0;
  return { description, jobRef, serial, amount };
}
