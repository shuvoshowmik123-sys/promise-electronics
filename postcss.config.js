/**
 * Tailwind, then an rgb() fallback for every oklch() colour.
 *
 * Tailwind v4 writes its palette in oklch — 206 colours in the built sheet —
 * and oklch() needs Chrome or Android WebView 111. Below that the declaration
 * is invalid and the browser drops it, so `background-color: var(--color-blue-600)`
 * resolves to nothing at all rather than to a wrong colour.
 *
 * That is why the staff app's Sign In button was an invisible white rectangle
 * on a white card: it kept its size, its rounding and its shadow, and lost only
 * the fill and the white-on-white label. It still worked when tapped, which is
 * exactly what made it look like a rendering fault rather than a CSS one. The
 * emulator that found it runs WebView 110.0.5481 — one version short.
 *
 * Real phones update WebView through Play, so most are far past 111. Staff
 * handsets are not most phones: budget devices, devices with Play services
 * stripped, and devices where updates were turned off all sit below it, and the
 * failure is silent everywhere it happens.
 *
 * `preserve: true` keeps the oklch declaration after the fallback, so modern
 * browsers still get the wider gamut and only old ones fall back.
 */
export default {
  plugins: {
    tailwindcss: {},
    '@csstools/postcss-oklab-function': { preserve: true },
    autoprefixer: {},
  },
}
