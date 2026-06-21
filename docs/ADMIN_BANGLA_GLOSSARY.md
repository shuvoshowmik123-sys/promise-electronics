# Promise Electronics Admin Bangla Glossary

Purpose: this is the source of truth for admin-panel English/Bangla wording. Use this before translating Jobs, POS, Finance, Challans, Users, Settings, Guided Demo, invoices, or permission screens.

Core rule: the UI shows one language at a time. Do not show Bangla and English together except IDs, model names, product codes, payment brand names, and legal/business terms that must stay unchanged.

## Translation Rules

| Rule | Decision |
| --- | --- |
| Language mode | User selects English or Bangla. Show only that language. |
| Tone | Clear, operational, Dhaka shop-friendly. Avoid formal government-style Bangla. |
| "Job" meaning | Never translate as employment. It means service/repair work. |
| IDs | Keep English format: JOB-2026-0004, INV-001, CH-001. |
| Names | Do not translate customer, staff, company, brand, product, device model, or serial names. |
| Buttons | Prefer short action words. Avoid long phrases inside small buttons. |
| Bills/invoices | Keep amount rows compact. Use short labels where space is tight. |
| Dangerous actions | Use direct, serious wording. Do not soften delete/reset/approve actions. |
| Payment brands | Keep bKash, Nagad, Bank, Cash as business terms. |
| Layout safety | Bangla labels must wrap cleanly. Do not depend on fixed one-line labels. |

## Core Business Terms

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| Admin Panel | অ্যাডমিন প্যানেল | অ্যাডমিন | Keep "Admin" as common business word. |
| Dashboard | ড্যাশবোর্ড | ড্যাশবোর্ড | Do not translate literally. |
| Job | সার্ভিস জব | জব | Means repair/service work, not employment. |
| Job Ticket | সার্ভিস টিকিট | টিকিট | Use in repair workflow. |
| Ticket ID | টিকিট আইডি | আইডি | Keep actual ID unchanged. |
| Workbench | ওয়ার্কবেঞ্চ | ওয়ার্কবেঞ্চ | Repair bench/work area. |
| Repair | রিপেয়ার | রিপেয়ার | Better than formal "মেরামত" for staff UI. |
| Diagnosis | ডায়াগনোসিস | ডায়াগনোসিস | Staff workflow term. |
| Device | ডিভাইস | ডিভাইস | Fits TV/electronics context. |
| Parts | পার্টস | পার্টস | Business term. |
| Inventory | ইনভেন্টরি | স্টক | Use "স্টক" for compact cards. |
| Stock | স্টক | স্টক | Preferred for inventory quantities. |
| Customer | কাস্টমার | কাস্টমার | Shop-friendly. |
| Corporate Client | কর্পোরেট ক্লায়েন্ট | ক্লায়েন্ট | B2B context. |
| Supplier | সাপ্লায়ার | সাপ্লায়ার | Purchasing context. |
| Purchase Order | পারচেজ অর্ডার | PO | Use PO where already common. |
| Challan | চালান | চালান | Do not translate as invoice. |
| Corporate Challan | কর্পোরেট চালান | চালান | B2B device movement document. |
| Invoice | ইনভয়েস | ইনভয়েস | Billing document. |
| Bill | বিল | বিল | Customer-facing payment summary. |
| Statement | স্টেটমেন্ট | স্টেটমেন্ট | Corporate account summary. |
| Due | বকেয়া | বকেয়া | Money owed. |
| Refund | রিফান্ড | রিফান্ড | Keep business term. |
| Payment | পেমেন্ট | পেমেন্ট | Keep business term. |
| Manual Payment | ম্যানুয়াল পেমেন্ট | ম্যানুয়াল | Finance context. |
| Petty Cash | পেটি ক্যাশ | পেটি ক্যাশ | Finance term. |
| Drawer | ক্যাশ ড্রয়ার | ড্রয়ার | POS cash drawer. |
| Day-End | ডে-এন্ড | ডে-এন্ড | POS closing process. |
| Commission | কমিশন | কমিশন | Staff payment term. |
| Salary | বেতন | বেতন | HR/payroll. |
| Attendance | উপস্থিতি | উপস্থিতি | HR tab. |
| Leave | ছুটি | ছুটি | HR leave requests. |
| Advance | অ্যাডভান্স | অ্যাডভান্স | Salary advance. |

## User Roles

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| Super Admin | সুপার অ্যাডমিন | সুপার অ্যাডমিন | Full owner/admin. |
| Manager | ম্যানেজার | ম্যানেজার | Approvals and operations. |
| Cashier | ক্যাশিয়ার | ক্যাশিয়ার | POS, payment, invoice. |
| Technician | টেকনিশিয়ান | টেক | Repair worker. Short UI can use "টেক". |
| Driver | ড্রাইভার | ড্রাইভার | Pickup/delivery worker. |
| Delivery Boy | ডেলিভারি স্টাফ | ডেলিভারি | Prefer "ডেলিভারি স্টাফ" in formal UI. |
| Customer | কাস্টমার | কাস্টমার | Public/customer portal. |
| Corporate User | কর্পোরেট ইউজার | কর্পোরেট | B2B portal user. |
| Staff | স্টাফ | স্টাফ | General employee. |
| Newcomer | নতুন স্টাফ | নতুন | Guided onboarding. |

## Permission Terms

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| Permission | পারমিশন | পারমিশন | Avoid overly formal "অনুমতি" in admin UI. |
| Access | অ্যাক্সেস | অ্যাক্সেস | Standard software term. |
| Role | রোল | রোল | Standard admin term. |
| View | দেখা | দেখা | Read-only access. |
| Work | কাজ করা | কাজ | Can perform normal tasks. |
| Approve | অনুমোদন | অনুমোদন | Approval rights. |
| Admin | অ্যাডমিন | অ্যাডমিন | Configuration/control rights. |
| Hidden | লুকানো | লুকানো | Not visible to user. |
| Allowed | অনুমতি আছে | অনুমতি আছে | Use in summaries. |
| Restricted | সীমিত | সীমিত | Limited access. |
| Audit Trail | অডিট ট্রেইল | অডিট | Keep audit as business/security term. |

## Common Actions

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| Save | সংরক্ষণ | সংরক্ষণ | General save. |
| Save Changes | পরিবর্তন সংরক্ষণ | সংরক্ষণ | Buttons can use short form. |
| Cancel | বাতিল | বাতিল | General cancel. |
| Close | বন্ধ | বন্ধ | Close sheet/dialog. |
| Back | পেছনে | পেছনে | Navigation. |
| Next | পরবর্তী | পরবর্তী | Wizard. |
| Search | খুঁজুন | খুঁজুন | Search action. |
| Filter | ফিল্টার | ফিল্টার | Keep common UI term. |
| Create | তৈরি করুন | তৈরি | General create. |
| Add | যোগ করুন | যোগ | Add item/customer. |
| Edit | সম্পাদনা | এডিট | Use "এডিট" if space is tight. |
| Update | আপডেট করুন | আপডেট | Status/data update. |
| Delete | মুছুন | মুছুন | Destructive. |
| Reset | রিসেট | রিসেট | Destructive/restore state. |
| Send | পাঠান | পাঠান | Challan/device/document sent. |
| Receive | গ্রহণ করুন | গ্রহণ | Challan/device received. |
| Print | প্রিন্ট | প্রিন্ট | Desktop. |
| Save PDF | PDF সংরক্ষণ | PDF | Mobile replacement for print. |
| Download | ডাউনলোড | ডাউনলোড | Files/PDF. |
| Share | শেয়ার | শেয়ার | WhatsApp/share flow. |
| Retry | আবার চেষ্টা করুন | আবার চেষ্টা | Error states. |
| Confirm | নিশ্চিত করুন | নিশ্চিত | Confirmation. |
| Hold to Confirm | ধরে নিশ্চিত করুন | ধরে রাখুন | Touch confirmation. |
| Hold to Agree | সম্মত হতে ধরে রাখুন | ধরে রাখুন | POS payment safety. |

## Job And Service Status

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| Pending | অপেক্ষমাণ | অপেক্ষমাণ | Waiting state. |
| Assigned | অ্যাসাইন করা | অ্যাসাইন | Staff assigned. |
| Received | গ্রহণ করা হয়েছে | গ্রহণ করা | Device/check-in. |
| Diagnosing | ডায়াগনোসিস চলছে | ডায়াগনোসিস | Technician checking issue. |
| Diagnosis Complete | ডায়াগনোসিস সম্পন্ন | সম্পন্ন | Diagnosis done. |
| Pending Parts | পার্টসের অপেক্ষায় | পার্টস অপেক্ষা | Waiting parts. |
| Awaiting Parts | পার্টসের অপেক্ষায় | পার্টস অপেক্ষা | Same as pending parts. |
| In Progress | কাজ চলছে | চলছে | General active work. |
| Repairing | রিপেয়ার চলছে | রিপেয়ার | Repair work. |
| On Workbench | ওয়ার্কবেঞ্চে আছে | ওয়ার্কবেঞ্চ | Physical repair bench. |
| Ready | প্রস্তুত | প্রস্তুত | General ready. |
| Ready for Pickup | পিকআপের জন্য প্রস্তুত | পিকআপ প্রস্তুত | Customer pickup. |
| Ready for Delivery | ডেলিভারির জন্য প্রস্তুত | ডেলিভারি প্রস্তুত | Driver delivery. |
| Delivered | ডেলিভারি সম্পন্ন | ডেলিভারি হয়েছে | Completed delivery. |
| Collected | সংগ্রহ করা হয়েছে | সংগ্রহ হয়েছে | Customer collected. |
| Completed | সম্পন্ন | সম্পন্ন | Final completion. |
| Cancelled | বাতিল করা হয়েছে | বাতিল | Cancelled work. |
| Abandoned | পরিত্যক্ত | পরিত্যক্ত | Use carefully. |
| Forfeited | বাজেয়াপ্ত | বাজেয়াপ্ত | Legal/business risk; review before UI use. |
| Not OK | ঠিক হয়নি | ঠিক হয়নি | Repair not successful. |
| Unrepairable | রিপেয়ার করা যাবে না | রিপেয়ার হবে না | Technician outcome. |

## Challan Terms

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| Challan | চালান | চালান | Device/document movement. |
| Create Challan | নতুন চালান তৈরি | নতুন চালান | Action. |
| Challan Details | চালানের বিস্তারিত | বিস্তারিত | Sheet title. |
| Receiver | গ্রহণকারী | গ্রহণকারী | Person receiving items. |
| Sender | প্রেরক | প্রেরক | Person sending items. |
| Vehicle No. | গাড়ির নম্বর | গাড়ি নম্বর | Transport. |
| Driver Name | ড্রাইভারের নাম | ড্রাইভার | Transport. |
| Items | আইটেম | আইটেম | Listed devices/items. |
| Sent | পাঠানো হয়েছে | পাঠানো | Status. |
| Received | গ্রহণ করা হয়েছে | গ্রহণ | Status. |
| Reset Status | স্ট্যাটাস রিসেট | রিসেট | Risky action. |
| Preview PDF | PDF প্রিভিউ | প্রিভিউ | Before saving. |

## POS And Finance Terms

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| POS | POS | POS | Keep English. |
| Cart | কার্ট | কার্ট | POS cart. |
| Add Customer | কাস্টমার যোগ করুন | কাস্টমার যোগ | POS/customer. |
| Checkout | চেকআউট | চেকআউট | POS. |
| Payment Method | পেমেন্ট পদ্ধতি | পদ্ধতি | Payment selection. |
| Cash | ক্যাশ | ক্যাশ | Payment method. |
| Bank | ব্যাংক | ব্যাংক | Payment method. |
| bKash | bKash | bKash | Do not translate brand. |
| Nagad | Nagad | Nagad | Do not translate brand. |
| Paid | পরিশোধিত | পরিশোধিত | Invoice/payment status. |
| Unpaid | অপরিশোধিত | অপরিশোধিত | Due/payment status. |
| Partial Payment | আংশিক পেমেন্ট | আংশিক | Finance. |
| Written Off | মওকুফ করা হয়েছে | মওকুফ | Finance/legal; review in UI. |
| Outstanding Balance | বকেয়া ব্যালেন্স | বকেয়া | Corporate/finance. |
| Credit Limit | ক্রেডিট লিমিট | ক্রেডিট | Corporate. |
| Discount | ডিসকাউন্ট | ডিসকাউন্ট | POS. |
| VAT | ভ্যাট | ভ্যাট | Bangladesh tax. |
| Tax | ট্যাক্স | ট্যাক্স | Generic. |
| Total | মোট | মোট | Bills/invoices. |
| Subtotal | সাবটোটাল | সাবটোটাল | Bills/invoices. |
| Grand Total | সর্বমোট | সর্বমোট | Bills/invoices. |
| Refund Request | রিফান্ড রিকোয়েস্ট | রিফান্ড | Finance. |

## Guided Demo Terms

| English | Bangla | Short UI | Notes |
| --- | --- | --- | --- |
| Guided Demo | গাইডেড ডেমো | ডেমো | Replayable learning area. |
| Demo Mode | ডেমো মোড | ডেমো | Safe training mode. |
| Start Demo | ডেমো শুরু করুন | শুরু | Button. |
| Replay | আবার দেখুন | আবার | More tab lessons. |
| Lesson | লেসন | লেসন | Training item. |
| Step | ধাপ | ধাপ | Wizard step. |
| Try Demo | ডেমোতে চেষ্টা করুন | চেষ্টা করুন | Interactive lesson action. |
| Safe Demo Data | নিরাপদ ডেমো ডেটা | ডেমো ডেটা | Not production data. |
| This will not affect real data | এতে আসল ডেটা বদলাবে না | আসল ডেটা বদলাবে না | Safety line. |

## Copy Patterns

| Use Case | English | Bangla |
| --- | --- | --- |
| Demo safety | This is demo data. No real data will change. | এটি ডেমো ডেটা। আসল কোনো ডেটা পরিবর্তন হবে না। |
| DB/admin-only status | Database connecting. Try again in a moment. | ডেটাবেস সংযোগ হচ্ছে। একটু পরে আবার চেষ্টা করুন। |
| Customer-safe status | We are getting things ready. Please wait a moment. | আমরা সব প্রস্তুত করছি। অনুগ্রহ করে একটু অপেক্ষা করুন। |
| Risk confirmation | This action cannot be undone. | এই কাজটি পরে ফিরিয়ে নেওয়া যাবে না। |
| Hold action | Hold to confirm this action. | কাজটি নিশ্চিত করতে ধরে রাখুন। |
| Missing permission | You do not have permission for this action. | এই কাজের জন্য আপনার পারমিশন নেই। |
| Empty state | No records found. | কোনো রেকর্ড পাওয়া যায়নি। |
| Loading | Loading latest data... | সর্বশেষ ডেটা লোড হচ্ছে... |
| Stale data | Showing previous data while syncing. | সিঙ্ক চলাকালীন আগের ডেটা দেখানো হচ্ছে। |

## Terms To Review Before Use

| English | Proposed Bangla | Why Review |
| --- | --- | --- |
| Forfeited | বাজেয়াপ্ত | Legal/commercial meaning can feel harsh. |
| Written Off | মওকুফ করা হয়েছে | Finance/legal implication. |
| Abandoned | পরিত্যক্ত | Customer-sensitive wording. |
| Blacklist | ব্ল্যাকলিস্ট | Sensitive; consider "সীমাবদ্ধ তালিকা". |
| Fraud | প্রতারণা | Use only in audit/security context. |
| Override | ওভাররাইড | Needs context-specific wording. |

## Implementation Checklist

Before translating a tab:

1. Add keys to both `client/src/locales/en.json` and `client/src/locales/bn.json`.
2. Use glossary terms exactly unless a screen needs a shorter variant.
3. Do not translate dynamic IDs, names, model numbers, brands, phone numbers, or amounts.
4. Check mobile layout with Bangla selected.
5. Check desktop layout with Bangla selected.
6. Check buttons, tabs, cards, and invoices for wrapping/overflow.
7. Run `npx tsc --noEmit --pretty false`.
8. Run `npx vite build --mode development`.
