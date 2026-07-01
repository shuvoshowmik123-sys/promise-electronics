/**
 * ImageKit folder prefix utility.
 *
 * Reads IMAGEKIT_FOLDER_PREFIX from env (default: /promise-electronics) and
 * builds a fully-qualified folder path so uploads on shared ImageKit accounts
 * never land at the root or collide with other projects.
 *
 * Usage:
 *   getIKFolder('service-requests')   → /promise-electronics/service-requests
 *   getIKFolder('/messenger_uploads') → /promise-electronics/messenger_uploads
 */
export function getIKFolder(subfolder: string): string {
    const raw = process.env.IMAGEKIT_FOLDER_PREFIX ?? '/promise-electronics';
    const prefix = raw.replace(/\/+$/, '');
    const sub = subfolder.replace(/^\/+/, '').replace(/\/+$/, '');
    return sub ? `${prefix}/${sub}` : prefix;
}
