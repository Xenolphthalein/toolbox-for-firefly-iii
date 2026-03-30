/**
 * FinTS utility functions for logging, encoding, and formatting
 */

import { config } from '../../config/index.js';
import { createLogger, type Logger } from '../../utils/logger.js';

const REDACTION_CHAR = '█';
const GENERIC_REDACTION = REDACTION_CHAR.repeat(4);
const SENSITIVE_LOG_KEY_PATTERN =
  /(?:^|[_-])(pin|password|tan|user(?:name|id)?|login|system(?:id)?|account(?:number)?|iban|challenge|orderref|order_ref)(?:$|[_-])/i;
const WHOLE_SEGMENT_REDACTION = new Set([
  'HIKAZ',
  'HIUPA',
  'HIUPD',
  'HISPA',
  'HITAN',
  'HITANS',
  'HITAZ',
  'HISAL',
  'HIDAB',
]);

type ParsedSegment = {
  name: string;
  raw: string;
};

function extractSegments(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];

  for (const segment of text.split(/(?<!\?)'/)) {
    const headerMatch = segment.match(/^([A-Z]{5,6}):\d+:\d+(?::\d+)?/);
    if (headerMatch) {
      segments.push({
        name: headerMatch[1],
        raw: segment,
      });
    }
  }

  return segments;
}

function getSensitiveSegments(text: string): ParsedSegment[] {
  return extractSegments(text).filter((segment) => WHOLE_SEGMENT_REDACTION.has(segment.name));
}

function summarizeSensitiveSegment(segment: ParsedSegment): string {
  const headerMatch = segment.raw.match(/^([A-Z]{5,6}:\d+:\d+(?::\d+)?)/);
  const binaryLength = segment.raw.match(/@(\d+)@/)?.[1];
  const details = [
    `chars=${segment.raw.length}`,
    binaryLength ? `binary=${binaryLength}` : undefined,
  ].filter(Boolean);

  return `${headerMatch?.[1] || segment.name}+[redacted ${details.join(', ')}]`;
}

function summarizeSegmentCounts(segments: ParsedSegment[]): string {
  const counts = new Map<string, number>();

  for (const segment of segments) {
    counts.set(segment.name, (counts.get(segment.name) || 0) + 1);
  }

  return [...counts.entries()].map(([name, count]) => `${name}x${count}`).join(', ');
}

function summarizeSensitiveSegments(segments: ParsedSegment[]): string {
  return segments
    .map((segment) => {
      const binaryLength = segment.raw.match(/@(\d+)@/)?.[1];
      return binaryLength ? `${segment.name}@${binaryLength}` : segment.name;
    })
    .join(', ');
}

function extractReturnCodes(text: string): string[] {
  const codes = new Set<string>();

  for (const match of text.matchAll(/(\d{4})::/g)) {
    codes.add(match[1]);
  }

  return [...codes];
}

function buildRedactedMessageForLogging(message: string): string {
  const parts = message.split(/(?<!\?)'/);

  return parts
    .map((part) => {
      if (!part) {
        return part;
      }

      const headerMatch = part.match(/^([A-Z]{5,6}):\d+:\d+(?::\d+)?/);
      if (!headerMatch) {
        return scrubSensitiveData(part);
      }

      const segment: ParsedSegment = { name: headerMatch[1], raw: part };
      if (WHOLE_SEGMENT_REDACTION.has(segment.name)) {
        return summarizeSensitiveSegment(segment);
      }

      return scrubSensitiveData(part);
    })
    .join("'");
}

function redactSensitiveSegments(text: string): string {
  const segments = text.split(/(?<!\?)'/);

  return segments
    .map((segment) => {
      if (!segment) {
        return segment;
      }

      const headerMatch = segment.match(/^([A-Z]{5,6})(:\d+:\d+(?::\d+)?)(\+.*)?$/);
      if (!headerMatch) {
        return segment;
      }

      const [, segmentName, headerSuffix] = headerMatch;
      if (!WHOLE_SEGMENT_REDACTION.has(segmentName)) {
        return segment;
      }

      return `${segmentName}${headerSuffix}+${GENERIC_REDACTION}`;
    })
    .join("'");
}

function redactText(value: string, preservePrefix: number = 0): string {
  if (!value) {
    return value;
  }

  const prefix = value.slice(0, preservePrefix);
  const restLength = Array.from(value.slice(preservePrefix)).length;
  return prefix + REDACTION_CHAR.repeat(restLength);
}

function redactUnknownValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownValue(entry));
  }

  if (value && typeof value === 'object') {
    return GENERIC_REDACTION;
  }

  return GENERIC_REDACTION;
}

function scrubSensitiveLogData(data: unknown): unknown {
  if (!config.fints.logRedaction) {
    return data;
  }

  if (typeof data === 'string') {
    return scrubSensitiveData(data);
  }

  if (Array.isArray(data)) {
    return data.map((entry) => scrubSensitiveLogData(entry));
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: scrubSensitiveData(data.message),
      stack: data.stack ? scrubSensitiveData(data.stack) : undefined,
    };
  }

  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        SENSITIVE_LOG_KEY_PATTERN.test(key)
          ? redactUnknownValue(value)
          : scrubSensitiveLogData(value),
      ])
    );
  }

  return data;
}

function createRedactingLogger(context: string): Logger {
  const baseLogger = createLogger(context);

  return {
    error: (message: string, data?: unknown) =>
      baseLogger.error(
        config.fints.logRedaction ? scrubSensitiveData(message) : message,
        scrubSensitiveLogData(data)
      ),
    warn: (message: string, data?: unknown) =>
      baseLogger.warn(
        config.fints.logRedaction ? scrubSensitiveData(message) : message,
        scrubSensitiveLogData(data)
      ),
    info: (message: string, data?: unknown) =>
      baseLogger.info(
        config.fints.logRedaction ? scrubSensitiveData(message) : message,
        scrubSensitiveLogData(data)
      ),
    debug: (message: string, data?: unknown) =>
      baseLogger.debug(
        config.fints.logRedaction ? scrubSensitiveData(message) : message,
        scrubSensitiveLogData(data)
      ),
    child: (subContext: string) =>
      createRedactingLogger(context ? `${context}:${subContext}` : subContext),
  };
}

const rawLogger = createLogger('FinTS:Client');

// Create logger for FinTS client
export const logger = createRedactingLogger('FinTS:Client');

/**
 * Scrub sensitive information from log messages
 * Removes FinTS credential and account identifiers based on segment layout.
 *
 * The segment-specific patterns follow the FinTS 3.0 Formals examples for
 * HKIDN, HNSHK, HNVSK, and HNSHA.
 */
export function scrubSensitiveData(text: string): string {
  if (!config.fints.logRedaction) {
    return text;
  }

  let scrubbed = redactSensitiveSegments(text);

  // HNSHA carries the PIN or PIN:TAN block directly after ++.
  scrubbed = scrubbed.replace(
    /(HNSHA:\d+:\d+\+\d+\+\+)((?:\?.|[^'])*)(')/g,
    (_match, prefix: string, credentials: string, suffix: string) =>
      `${prefix}${redactText(credentials)}${suffix}`
  );

  // HKIDN contains user ID and system ID as dedicated fields.
  scrubbed = scrubbed.replace(
    /(HKIDN:\d+:\d+\+280:(?:\?.|[^+'])*\+)((?:\?.|[^+'])*)(\+)((?:\?.|[^+'])*)(\+1')/g,
    (_match, prefix: string, userId: string, separator: string, systemId: string, suffix: string) =>
      `${prefix}${redactText(userId)}${separator}${redactText(systemId)}${suffix}`
  );

  // HNSHK stores the system ID in field 6 and the user ID in the key name.
  scrubbed = scrubbed.replace(
    /(HNSHK:\d+:\d+(?:\+(?:\?.|[^+'])*){5}\+1::)((?:\?.|[^+'])*)(\+)/g,
    (_match, prefix: string, systemId: string, suffix: string) =>
      `${prefix}${redactText(systemId)}${suffix}`
  );
  scrubbed = scrubbed.replace(
    /(HNSHK:\d+:\d+(?:\+(?:\?.|[^+'])*){10}\+280:(?:\?.|[^:+'])*:)((?:\?.|[^:+'])*)(:[A-Z]:(?:\?.|[^'])*')/g,
    (_match, prefix: string, userId: string, suffix: string) =>
      `${prefix}${redactText(userId)}${suffix}`
  );

  // HNVSK stores the system ID in field 4 and the user ID in the key name.
  scrubbed = scrubbed.replace(
    /(HNVSK:\d+:\d+(?:\+(?:\?.|[^+'])*){3}\+1::)((?:\?.|[^+'])*)(\+)/g,
    (_match, prefix: string, systemId: string, suffix: string) =>
      `${prefix}${redactText(systemId)}${suffix}`
  );
  scrubbed = scrubbed.replace(
    /(HNVSK:\d+:\d+(?:\+(?:\?.|[^+'])*){6}\+280:(?:\?.|[^:+'])*:)((?:\?.|[^:+'])*)(:[A-Z]:(?:\?.|[^'])*')/g,
    (_match, prefix: string, userId: string, suffix: string) =>
      `${prefix}${redactText(userId)}${suffix}`
  );

  // National account identifiers use <accountNumber>::280:<bankCode>.
  scrubbed = scrubbed.replace(
    /([+:])(\d{4,20})(::280:\d{5,8})/g,
    (_match, prefix: string, accountNumber: string, suffix: string) =>
      `${prefix}${redactText(accountNumber)}${suffix}`
  );

  // Keep the IBAN country prefix visible and redact the rest.
  scrubbed = scrubbed.replace(
    /\b([A-Z]{2})(\d{2}[A-Z0-9]{10,30})\b/g,
    (_match, country: string, rest: string) => `${country}${redactText(rest)}`
  );

  // TAN medium names often include device details in parentheses.
  scrubbed = scrubbed.replace(
    /(\b[\w-]*App)\s*\(([^)]*)\)/g,
    (_match, appName: string, deviceInfo: string) => `${appName} (${redactText(deviceInfo)})`
  );

  return scrubbed;
}

/**
 * Log a FinTS message with sensitive data scrubbed
 */
export function logMessage(level: 'debug' | 'info', prefix: string, message: string): void {
  if (config.fints.logRedaction) {
    const sensitiveSegments = getSensitiveSegments(message);
    if (sensitiveSegments.length > 0) {
      const redactedMessage = buildRedactedMessageForLogging(message);
      const segments = extractSegments(message);
      const returnCodes = extractReturnCodes(message);
      const summaryParts = [
        `chars=${message.length}`,
        `segments=${segments.length}`,
        `segmentTypes=${summarizeSegmentCounts(segments) || 'none'}`,
        `sensitive=${summarizeSensitiveSegments(sensitiveSegments)}`,
      ];
      if (returnCodes.length > 0) {
        summaryParts.push(`returnCodes=${returnCodes.join(', ')}`);
      }
      const summary = `${prefix}: [redacted raw FinTS message; ${summaryParts.join('; ')}]\n${redactedMessage}`;
      if (level === 'debug') {
        rawLogger.debug(summary);
      } else {
        rawLogger.info(summary);
      }
      return;
    }
  }

  const scrubbed = scrubSensitiveData(message);
  if (level === 'debug') {
    logger.debug(`${prefix}:\n${scrubbed}`);
  } else {
    logger.info(`${prefix}:\n${scrubbed}`);
  }
}

/**
 * Encode text for FinTS (ISO-8859-1)
 */
export function encodeFinTS(text: string): string {
  // Escape special characters
  return text.replace(/\+/g, '?+').replace(/:/g, '?:').replace(/@/g, '?@').replace(/'/g, "?'");
}

/**
 * Generate a message reference number
 */
export function generateMsgRef(): string {
  return Math.floor(Math.random() * 9999999)
    .toString()
    .padStart(7, '0');
}

/**
 * Format date for FinTS (YYYYMMDD)
 */
export function formatFinTSDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
