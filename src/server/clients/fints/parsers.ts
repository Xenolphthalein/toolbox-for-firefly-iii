/**
 * FinTS response parsing functions
 *
 * Handles parsing raw FinTS responses into structured data.
 */

/**
 * Parse FinTS response segments
 */
export function parseSegments(response: string): Map<string, string[]> {
  const segments = new Map<string, string[]>();

  // Split by segment terminator (unescaped single quote)
  const parts = response.split(/(?<!\?)'/);

  for (const part of parts) {
    if (!part.trim()) continue;

    // Parse segment header
    const headerMatch = part.match(/^([A-Z]{5,6}):(\d+):(\d+)/);
    if (!headerMatch) continue;

    const segmentName = headerMatch[1];
    const instances = segments.get(segmentName) || [];
    instances.push(part);
    segments.set(segmentName, instances);
  }

  return segments;
}

/**
 * Extract data elements from a segment
 */
export function extractElements(segment: string): string[] {
  // Remove segment header
  const content = segment.replace(/^[A-Z]{5,6}:\d+:\d+\+?/, '');

  // Split by + but not ?+
  const elements: string[] = [];
  let current = '';
  let escaped = false;

  for (const char of content) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '?') {
      escaped = true;
    } else if (char === '+') {
      elements.push(current);
      current = '';
    } else if (char === ':') {
      current += char;
    } else {
      current += char;
    }
  }
  if (current) elements.push(current);

  return elements;
}
