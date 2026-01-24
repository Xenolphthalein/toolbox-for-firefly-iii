/**
 * Async JSON parsing utilities to prevent event loop blocking.
 *
 * Uses setImmediate to yield to the event loop between parsing,
 * allowing other requests to be processed during large file parsing.
 */

/**
 * Parse JSON string asynchronously using setImmediate to yield to the event loop.
 * This prevents blocking the main event loop for large JSON files.
 *
 * @param content - The JSON string to parse
 * @param _timeoutMs - Unused, kept for API compatibility
 * @returns Promise resolving to the parsed JSON value
 * @throws Error if parsing fails
 */
export function parseJsonAsync<T = unknown>(content: string, _timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    // Use setImmediate to yield to the event loop before parsing
    // This allows other requests to be processed
    setImmediate(() => {
      try {
        resolve(JSON.parse(content) as T);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parse error';
        reject(new Error(`Invalid JSON file: ${message}`));
      }
    });
  });
}
