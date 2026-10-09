/**
 * ID generation utility shared between client and server.
 */

/**
 * Generate a UUID v4 string.
 *
 * crypto.randomUUID() is only available in secure contexts (HTTPS or
 * localhost). When the app is served over plain HTTP (common in homelab
 * setups, e.g. http://192.168.x.x:3000), the function is undefined and any
 * direct call crashes the page (see issue #47: blank CSV importer).
 *
 * This helper falls back to crypto.getRandomValues() (available in insecure
 * contexts) and only uses Math.random as a last resort for exotic runtimes.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    // UUID v4: version bits and variant bits (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Last resort: Math.random-based UUID v4 shape (not cryptographically strong)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
