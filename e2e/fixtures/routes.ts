export const CUSTOMER_ROUTES = {
  home: '/home',
  shop: '/shop',
  cart: '/cart',
  checkout: '/checkout',
  repair: '/repair',
  getQuote: '/get-quote',
  trackOrder: '/track-order',
  track: '/track',
  support: '/support',
  login: '/login',
  services: '/services',
  about: '/about',
  privacyPolicy: '/privacy-policy',
  warrantyPolicy: '/warranty-policy',
  terms: '/terms-and-conditions',
} as const;

export const PROTECTED_CUSTOMER_ROUTES = {
  profile: '/my-profile',
  warranties: '/my-warranties',
} as const;

export const ADMIN_ROUTES = {
  login: '/admin/login',
  dashboard: '/admin',
} as const;

export const HIDE_DOCK_ROUTES = ['/repair', '/get-quote'];

export const CORE_CUSTOMER_ROUTES = [
  '/home', '/shop', '/cart', '/track-order', '/track',
  '/support', '/login', '/repair',
] as const;
