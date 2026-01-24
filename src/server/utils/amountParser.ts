import { config } from '../config/index.js';

export interface NumberFormatConfig {
  decimalSeparator: string;
  thousandsSeparator: string;
}

/**
 * Parse a monetary amount string into a number using the configured number format.
 * Handles EU (1.234,56) and US (1,234.56) formats based on config.numberFormat.
 *
 * @param value - The string or number to parse
 * @param formatConfig - Optional format config override (for testing)
 * @returns Parsed number, or 0 if parsing fails
 */
export function parseAmount(value: unknown, formatConfig?: NumberFormatConfig): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;

  const amountStr = value.trim();
  if (!amountStr) return 0;

  const format = formatConfig ?? {
    decimalSeparator: config.numberFormat.decimalSeparator,
    thousandsSeparator: config.numberFormat.thousandsSeparator,
  };

  // Remove currency symbols and whitespace
  let cleaned = amountStr.replace(/[€$£\s]/g, '').trim();

  // Remove thousands separators and normalize decimal separator to '.'
  if (format.thousandsSeparator) {
    // Escape special regex characters in the separator
    const escapedThousands = format.thousandsSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escapedThousands, 'g'), '');
  }

  if (format.decimalSeparator && format.decimalSeparator !== '.') {
    // Replace the configured decimal separator with standard '.'
    const escapedDecimal = format.decimalSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escapedDecimal, 'g'), '.');
  }

  const amount = parseFloat(cleaned);
  return isNaN(amount) ? 0 : amount;
}

/**
 * Format a number as a string using the configured number format.
 * Useful for display or comparison purposes.
 *
 * @param value - The number to format
 * @param formatConfig - Optional format config override (for testing)
 * @returns Formatted string
 */
export function formatAmount(value: number, formatConfig?: NumberFormatConfig): string {
  const format = formatConfig ?? {
    decimalSeparator: config.numberFormat.decimalSeparator,
    thousandsSeparator: config.numberFormat.thousandsSeparator,
  };

  const [intPart, decPart] = Math.abs(value).toFixed(2).split('.');

  // Add thousands separator
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, format.thousandsSeparator);

  const sign = value < 0 ? '-' : '';
  return `${sign}${formattedInt}${format.decimalSeparator}${decPart}`;
}
