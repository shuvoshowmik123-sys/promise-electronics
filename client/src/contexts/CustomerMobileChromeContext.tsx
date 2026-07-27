import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface CustomerMobileChromeContextValue {
  isBottomNavSuppressed: boolean;
  setBottomNavSuppressed: (suppressed: boolean) => void;
}

const CustomerMobileChromeContext = createContext<CustomerMobileChromeContextValue | null>(null);

export function CustomerMobileChromeProvider({ children }: { children: ReactNode }) {
  const [isBottomNavSuppressed, setBottomNavSuppressed] = useState(false);
  const value = useMemo(
    () => ({ isBottomNavSuppressed, setBottomNavSuppressed }),
    [isBottomNavSuppressed],
  );

  return <CustomerMobileChromeContext.Provider value={value}>{children}</CustomerMobileChromeContext.Provider>;
}

export function useCustomerMobileChrome() {
  const context = useContext(CustomerMobileChromeContext);
  if (!context) throw new Error("useCustomerMobileChrome must be used inside CustomerMobileChromeProvider");
  return context;
}
