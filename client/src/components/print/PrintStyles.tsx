export function PrintStyles() {
  return (
    <style>
      {`
        @media print {
          /* Hide everything except print content */
          body * {
            visibility: hidden;
          }
          
          .print-content, .print-content * {
            visibility: visible;
          }
          
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          
          /* Invoice A4 styles */
          .print-invoice {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 15mm !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          
          /* Receipt thermal printer styles (57mm width) */
          .print-receipt {
            width: 57mm !important;
            min-height: auto !important;
            padding: 2mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            font-size: 10px !important;
          }
          
          /* Remove backgrounds for better printing */
          .print-content {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* Page breaks */
          .page-break {
            page-break-before: always;
          }
          
          /* Hide buttons and interactive elements */
          .no-print {
            display: none !important;
          }
        }
        
        @page {
          margin: 0;
          size: auto;
        }
        
        @page invoice {
          size: A4;
          margin: 10mm;
        }
        
        @page receipt {
          size: 57mm auto;
          margin: 0;
        }
      `}
    </style>
  );
}
