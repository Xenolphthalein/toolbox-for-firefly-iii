/**
 * FinTS utility functions for logging, encoding, and formatting
 */

import { createLogger } from '../../utils/logger.js';

// Create logger for FinTS client
export const logger = createLogger('FinTS:Client');

/**
 * Scrub sensitive information from log messages
 * Removes user IDs, PINs, IBANs, account numbers, etc.
 */
export function scrubSensitiveData(text: string): string {
  let scrubbed = text;

  // Scrub PINs in HNSHA segments: HNSHA:..+<secRef>++<pin>'
  // The PIN appears after the security reference number and ++
  scrubbed = scrubbed.replace(/(HNSHA:\d+:\d+\+\d+\+\+)[^']+(')/g, '$1***$2');

  // Scrub user IDs in HKIDN segments: +<bankCode>+<userId>+
  scrubbed = scrubbed.replace(/(\+\d{8}\+)[^+]+(\+)/g, '$1***$2');

  // Scrub user IDs in HNSHK/HNVSK: :<bankCode>:<userId>:
  scrubbed = scrubbed.replace(/(:\d{8}:)[^:+]+(:)/g, '$1***$2');

  // Scrub IBANs (DE followed by 20 chars)
  scrubbed = scrubbed.replace(/\b(DE)\d{2}[A-Z0-9]{4}\d{14}\b/g, '$1********************');

  // Scrub account numbers (8-10 digit sequences that look like account numbers)
  // Be careful not to scrub bank codes or segment numbers
  scrubbed = scrubbed.replace(/(\+)(\d{8,10})(\+[^0-9])/g, '$1***$3');

  // Scrub device/TAN medium names that might contain user info (e.g., "DKB-App (Samsung SM-F...")
  scrubbed = scrubbed.replace(/(DKB-App|TAN-App|Banking-App)\s*\([^)]+\)/gi, '$1 (***)');

  return scrubbed;
}

/**
 * Log a FinTS message with sensitive data scrubbed
 */
export function logMessage(level: 'debug' | 'info', prefix: string, message: string): void {
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
