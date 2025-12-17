import { useEffect } from "react";

const BASE_TITLE = "Promise Electronics";
const TAGLINE = "Expert TV Repair & Electronics Service in Dhaka";

export function usePageTitle(pageTitle?: string) {
  useEffect(() => {
    if (pageTitle) {
      document.title = `${pageTitle} | ${BASE_TITLE}`;
    } else {
      document.title = `${BASE_TITLE} | ${TAGLINE}`;
    }

    return () => {
      document.title = `${BASE_TITLE} | ${TAGLINE}`;
    };
  }, [pageTitle]);
}

export const pageTitles = {
  home: null,
  shop: "Shop Spare Parts & Electronics",
  repair: "Request TV Repair Service",
  about: "About Us",
  trackOrder: "Track Your Order",
  trackJob: "Job Status",
  cart: "Shopping Cart",
  checkout: "Checkout",
  login: "Sign In",
  myProfile: "My Profile",
};
