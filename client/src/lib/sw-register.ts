/**
 * Service Worker registration utility.
 *
 * Registers /sw.js for navigation-only offline fallback.
 * Should be called once from App.tsx on mount.
 */
export function registerServiceWorker(): void {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/sw.js')
                .then((reg) => {
                    console.log('[SW] Registered successfully. Scope:', reg.scope);
                })
                .catch((err) => {
                    console.warn('[SW] Registration failed:', err);
                });
        });
    }
}
