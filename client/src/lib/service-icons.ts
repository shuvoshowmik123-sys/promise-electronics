/**
 * CUSTOMER-SERVICE-INTENT-01A — safe service-icon registry.
 *
 * The ONLY icon names allowed for a catalogue service. These are exactly the
 * nine values offered by Admin → Inventory → Add/Edit Service → Service Icon
 * (InventoryTab.tsx `serviceIcons`), so a service saved there always renders here.
 *
 * Deliberately a closed, statically-imported map — never a dynamic lookup of an
 * arbitrary component name from database text. `service.icon` is admin-editable
 * content, so resolving it dynamically would let stored text decide which
 * component mounts. Unknown or empty values fall back to Wrench.
 *
 * No external logo URLs and no trademarked brand marks: lucide glyphs only.
 */
import {
  Cpu,
  Gamepad2,
  LayoutGrid,
  Monitor,
  Smartphone,
  Tv,
  Volume2,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Closed registry. Keys mirror the admin Service Icon values exactly.
 *
 * Null-prototype on purpose: with a normal object literal,
 * `REGISTRY["constructor"]` (or "__proto__"/"toString") resolves through the
 * prototype chain and returns a function, so admin-editable `service.icon` text
 * could yield a non-icon value that React then tries to render. Caught by the
 * prototype-key test in tests/service-intent-quote-schema.test.ts.
 */
export const SERVICE_ICON_REGISTRY: Record<string, LucideIcon> = Object.assign(
  Object.create(null) as Record<string, LucideIcon>,
  {
    Tv,
    Monitor,
    Smartphone,
    LayoutGrid,
    Cpu,
    Zap,
    Volume2,
    Gamepad2,
    Wrench,
  },
);

/** Fallback for null, empty, or unrecognised icon names. */
export const SERVICE_ICON_FALLBACK: LucideIcon = Wrench;

/**
 * Resolves an admin-stored icon name to a component from the closed registry.
 * Always returns a renderable component; never throws.
 */
export function resolveServiceIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return SERVICE_ICON_FALLBACK;
  // Own-property check as well as the null prototype: belt-and-braces so this
  // stays safe even if the registry is ever rebuilt as a plain object literal.
  if (!Object.prototype.hasOwnProperty.call(SERVICE_ICON_REGISTRY, iconName)) {
    return SERVICE_ICON_FALLBACK;
  }
  return SERVICE_ICON_REGISTRY[iconName] ?? SERVICE_ICON_FALLBACK;
}
