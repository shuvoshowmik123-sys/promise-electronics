# Agent Current Context

Last updated: 2026-06-23

## Product

Promise Electronics is a TV repair shop management system for Dhaka, Bangladesh.

Portals:

- Admin panel: operations, jobs, inventory, finance, users, service requests, POS, pickup, corporate, repair journeys.
- Customer portal: public/customer repair booking, quote, journey tracking, shop/cart, profile, support, bilingual UI.
- Corporate portal: B2B client jobs, support chat, intake verification, notifications, profile.

## Current UI Direction

- Light mode only.
- Admin mobile uses compact operational shell.
- Customer mobile uses premium emerald floating-dock app shell.
- Corporate mobile uses light blue business support shell.
- Mobile and desktop layouts should stay separate when their workflows differ.

## Current High-Risk Areas

- Admin mobile scroll/chrome behavior.
- Bottom dock clearance on mobile list pages.
- Mixed old/new customer mobile pages.
- Bangla/English fixed UI translation and text fit.
- Corporate/admin chat attachment flows.
- POS/job/bill/warranty journey sync.

## Current Working Rules

- Do not freely redesign frontend.
- Do not change backend during UI tasks.
- Do not change customer/corporate while fixing admin unless explicitly requested.
- Do not hide content under fixed bottom navigation.
- Do not add dark mode.
- Do not import full external UI templates.

## External UI References

Use as inspiration only:

- shadcn/ui: https://ui.shadcn.com/
- Qualiora Shadboard: https://github.com/Qualiora/shadboard
- shadcnstore dashboard template: https://github.com/shadcnstore/shadcn-dashboard-landing-template

Promise-specific design decisions override external references.
