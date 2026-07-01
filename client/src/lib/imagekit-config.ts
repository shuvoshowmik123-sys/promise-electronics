/**
 * ImageKit folder prefix utility (client-side).
 *
 * Reads VITE_IMAGEKIT_FOLDER_PREFIX at build time (default: /promise-electronics)
 * and builds a fully-qualified folder path so uploads on shared ImageKit accounts
 * never land at root or collide with other projects.
 *
 * Usage:
 *   getIKFolder('service-requests')   → /promise-electronics/service-requests
 *   getIKFolder('/corporate-chat')    → /promise-electronics/corporate-chat
 */
const RAW_PREFIX = (import.meta.env.VITE_IMAGEKIT_FOLDER_PREFIX as string | undefined) ?? '/promise-electronics';
const FOLDER_PREFIX = RAW_PREFIX.replace(/\/+$/, '');

export function getIKFolder(subfolder: string): string {
    const sub = subfolder.replace(/^\/+/, '').replace(/\/+$/, '');
    return sub ? `${FOLDER_PREFIX}/${sub}` : FOLDER_PREFIX;
}
