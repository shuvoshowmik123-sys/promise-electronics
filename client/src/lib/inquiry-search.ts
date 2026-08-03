/**
 * Client-side inquiry list filter (fields that exist on the inquiries row).
 * Schema: name, phone, message, status, reply — no email column.
 */

export type InquirySearchRow = {
  name?: string | null;
  phone?: string | null;
  message?: string | null;
  status?: string | null;
  reply?: string | null;
};

export function inquiryMatchesSearch(inq: InquirySearchRow, searchTerm: string): boolean {
  const q = searchTerm.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    inq.name,
    inq.phone,
    inq.message,
    inq.reply,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());
  return hay.some((field) => field.includes(q));
}
