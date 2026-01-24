import { describe, it, expect } from 'vitest';
import { parseAmount, formatAmount, type NumberFormatConfig } from './amountParser';

describe('parseAmount', () => {
  // US format: 1,234.56 (comma = thousands, dot = decimal)
  const usFormat: NumberFormatConfig = {
    decimalSeparator: '.',
    thousandsSeparator: ',',
  };

  // EU format: 1.234,56 (dot = thousands, comma = decimal)
  const euFormat: NumberFormatConfig = {
    decimalSeparator: ',',
    thousandsSeparator: '.',
  };

  describe('with US format (comma thousands, dot decimal)', () => {
    it('should parse simple amounts', () => {
      expect(parseAmount('123.45', usFormat)).toBe(123.45);
      expect(parseAmount('0.99', usFormat)).toBe(0.99);
    });

    it('should parse amounts with thousands separator', () => {
      expect(parseAmount('1,234.56', usFormat)).toBe(1234.56);
      expect(parseAmount('12,345.67', usFormat)).toBe(12345.67);
      expect(parseAmount('1,234,567.89', usFormat)).toBe(1234567.89);
    });

    it('should parse amounts with currency symbols', () => {
      expect(parseAmount('$1,234.56', usFormat)).toBe(1234.56);
      expect(parseAmount('€99.99', usFormat)).toBe(99.99);
      expect(parseAmount('£1,000.00', usFormat)).toBe(1000);
    });

    it('should handle negative amounts', () => {
      expect(parseAmount('-123.45', usFormat)).toBe(-123.45);
      expect(parseAmount('-1,234.56', usFormat)).toBe(-1234.56);
    });

    it('should handle whole numbers', () => {
      expect(parseAmount('100', usFormat)).toBe(100);
      expect(parseAmount('1,000', usFormat)).toBe(1000);
    });
  });

  describe('with EU format (dot thousands, comma decimal)', () => {
    it('should parse simple amounts', () => {
      expect(parseAmount('123,45', euFormat)).toBe(123.45);
      expect(parseAmount('0,99', euFormat)).toBe(0.99);
    });

    it('should parse amounts with thousands separator', () => {
      expect(parseAmount('1.234,56', euFormat)).toBe(1234.56);
      expect(parseAmount('12.345,67', euFormat)).toBe(12345.67);
      expect(parseAmount('1.234.567,89', euFormat)).toBe(1234567.89);
    });

    it('should parse amounts with currency symbols', () => {
      expect(parseAmount('€1.234,56', euFormat)).toBe(1234.56);
      expect(parseAmount('$99,99', euFormat)).toBe(99.99);
      expect(parseAmount('£1.000,00', euFormat)).toBe(1000);
    });

    it('should handle negative amounts', () => {
      expect(parseAmount('-123,45', euFormat)).toBe(-123.45);
      expect(parseAmount('-1.234,56', euFormat)).toBe(-1234.56);
    });

    it('should handle whole numbers', () => {
      expect(parseAmount('100', euFormat)).toBe(100);
      expect(parseAmount('1.000', euFormat)).toBe(1000);
    });
  });

  describe('edge cases', () => {
    it('should return number as-is if already a number', () => {
      expect(parseAmount(123.45, usFormat)).toBe(123.45);
      expect(parseAmount(0, euFormat)).toBe(0);
      expect(parseAmount(-50, usFormat)).toBe(-50);
    });

    it('should return 0 for empty strings', () => {
      expect(parseAmount('', usFormat)).toBe(0);
      expect(parseAmount('   ', euFormat)).toBe(0);
    });

    it('should return 0 for non-string, non-number values', () => {
      expect(parseAmount(null, usFormat)).toBe(0);
      expect(parseAmount(undefined, euFormat)).toBe(0);
      expect(parseAmount({}, usFormat)).toBe(0);
      expect(parseAmount([], euFormat)).toBe(0);
    });

    it('should return 0 for invalid strings', () => {
      expect(parseAmount('abc', usFormat)).toBe(0);
      expect(parseAmount('not a number', euFormat)).toBe(0);
    });

    it('should handle whitespace', () => {
      expect(parseAmount('  123.45  ', usFormat)).toBe(123.45);
      expect(parseAmount('  1.234,56  ', euFormat)).toBe(1234.56);
    });
  });

  describe('PayPal CSV examples (German format)', () => {
    it('should parse typical PayPal amounts', () => {
      expect(parseAmount('-9,99', euFormat)).toBe(-9.99);
      expect(parseAmount('49,00', euFormat)).toBe(49);
      expect(parseAmount('-1.234,56', euFormat)).toBe(-1234.56);
      expect(parseAmount('0,00', euFormat)).toBe(0);
    });
  });

  describe('Amazon order examples', () => {
    it('should parse typical Amazon amounts (US format)', () => {
      expect(parseAmount('$29.99', usFormat)).toBe(29.99);
      expect(parseAmount('$1,234.00', usFormat)).toBe(1234);
    });

    it('should parse typical Amazon amounts (EU format)', () => {
      expect(parseAmount('€29,99', euFormat)).toBe(29.99);
      expect(parseAmount('€1.234,00', euFormat)).toBe(1234);
    });
  });
});

describe('formatAmount', () => {
  const usFormat: NumberFormatConfig = {
    decimalSeparator: '.',
    thousandsSeparator: ',',
  };

  const euFormat: NumberFormatConfig = {
    decimalSeparator: ',',
    thousandsSeparator: '.',
  };

  describe('with US format', () => {
    it('should format simple amounts', () => {
      expect(formatAmount(123.45, usFormat)).toBe('123.45');
      expect(formatAmount(0.99, usFormat)).toBe('0.99');
    });

    it('should format amounts with thousands separator', () => {
      expect(formatAmount(1234.56, usFormat)).toBe('1,234.56');
      expect(formatAmount(1234567.89, usFormat)).toBe('1,234,567.89');
    });

    it('should format negative amounts', () => {
      expect(formatAmount(-123.45, usFormat)).toBe('-123.45');
      expect(formatAmount(-1234.56, usFormat)).toBe('-1,234.56');
    });
  });

  describe('with EU format', () => {
    it('should format simple amounts', () => {
      expect(formatAmount(123.45, euFormat)).toBe('123,45');
      expect(formatAmount(0.99, euFormat)).toBe('0,99');
    });

    it('should format amounts with thousands separator', () => {
      expect(formatAmount(1234.56, euFormat)).toBe('1.234,56');
      expect(formatAmount(1234567.89, euFormat)).toBe('1.234.567,89');
    });

    it('should format negative amounts', () => {
      expect(formatAmount(-123.45, euFormat)).toBe('-123,45');
      expect(formatAmount(-1234.56, euFormat)).toBe('-1.234,56');
    });
  });
});
