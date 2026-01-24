/**
 * Tests for MT940 parser
 */

import { describe, it, expect } from 'vitest';
import { parseMT940, parseDescription, extractStructuredData } from './mt940.js';

describe('extractStructuredData', () => {
  it('should extract SVWZ, EREF, MREF, CRED from structured lines', () => {
    const lines = [
      'SVWZ+Monthly subscription fee',
      'EREF+TEST-REF-001',
      'MREF+MANDATE-12345',
      'CRED+DE00ZZZ00000000001',
    ];

    const result = extractStructuredData(lines);

    expect(result.svwz).toBe('Monthly subscription fee');
    expect(result.eref).toBe('TEST-REF-001');
    expect(result.mref).toBe('MANDATE-12345');
    expect(result.cred).toBe('DE00ZZZ00000000001');
  });

  it('should handle multi-line continuation within structured fields', () => {
    const lines = [
      'SVWZ+Monthly subscription Invo',
      'ice Order-99 CustomerID:',
    ];

    const result = extractStructuredData(lines);

    // Second line doesn't have XXXX+ format at position 4, so it continues SVWZ
    expect(result.svwz).toBe('Monthly subscription Invoice Order-99 CustomerID:');
  });

  it('should return plain svwz for unstructured content', () => {
    const lines = ['Plain description without structure'];

    const result = extractStructuredData(lines);

    expect(result.svwz).toBe('Plain description without structure');
  });
});

describe('parseDescription', () => {
  it('should parse structured SEPA description with all fields', () => {
    const description =
      '105?00FOLGELASTSCHRIFT?109248?20SVWZ+Monthly subscription Invo' +
      'ice Order-99 CustomerID: 12345 ContractID: ABC-999 - PREMIUM PLAN' +
      '?24 XL (YEARLY)?25EREF+TEST-REF-001?26MREF+MANDATE-12345?27CRED+DE00ZZZ00000000001' +
      '?30TESTBANKXXX?31DE89370400440532013000?32Beispiel Shop Gm?33bH?34992';

    const result = parseDescription(description);

    expect(result.bookingText).toBe('FOLGELASTSCHRIFT');
    expect(result.bankCode).toBe('TESTBANKXXX');
    expect(result.accountNumber).toBe('DE89370400440532013000');
    expect(result.name).toBe('Beispiel Shop GmbH');
    expect(result.eref).toBe('TEST-REF-001');
    expect(result.mref).toBe('MANDATE-12345');
    expect(result.cred).toBe('DE00ZZZ00000000001');
    expect(result.svwz).toContain('Monthly subscription Invo');
  });

  it('should parse standard SEPA description', () => {
    const description =
      '166?00KARTENZAHLUNG?20EREF+CARD-0001?21CRED+DE00ZZZ00000099999' +
      '?22SVWZ+ONLINESHOP*ORDER123//?23TESTCITY/DE 2024-12-01T12?24:34:56' +
      '?30TESTBICXXXX?31DE12345678901234567890?32Fictional Store Ltd?34000';

    const result = parseDescription(description);

    expect(result.bookingText).toBe('KARTENZAHLUNG');
    expect(result.bankCode).toBe('TESTBICXXXX');
    expect(result.accountNumber).toBe('DE12345678901234567890');
    expect(result.name).toBe('Fictional Store Ltd');
    expect(result.eref).toBe('CARD-0001');
    expect(result.cred).toBe('DE00ZZZ00000099999');
    expect(result.svwz).toContain('ONLINESHOP*ORDER123');
  });
});

describe('parseMT940', () => {
  it('should parse transaction with multi-line :86: field using CRLF', () => {
    const mt940Data = [
      ':20:STARTUMS',
      ':25:12345678/1234567890',
      ':28C:00000',
      ':60F:C260123EUR1000,00',
      ':61:2601230123DR6,99NDDTNONREF//2026-01-23-00.06',
      ':86:105?00FOLGELASTSCHRIFT?109248?20SVWZ+Monthly subscription Invo?21ice',
      ' Order-99 CustomerID: ?2212345 ContractID: ABC-?23999 - PREMIUM',
      ' PLAN?24 XL (YEARLY)?25EREF+TEST-REF-001?26MREF+MAN',
      'DATE-12345?27CRED+DE00ZZZ00000000001?30TESTBANKXXX?31DE893704004405320130',
      '00?32Beispiel Shop Gm?33bH?34992',
      ':62F:C260123EUR993,01',
      '-',
    ].join('\r\n');

    const transactions = parseMT940(mt940Data);

    expect(transactions).toHaveLength(1);
    const tx = transactions[0];

    expect(tx.amount).toBe(-6.99);
    expect(tx.valueDate).toBe('2026-01-23');
    expect(tx.bookingDate).toBe('2026-01-23');
    expect(tx.transactionType).toBe('DDT');
    expect(tx.bookingText).toBe('FOLGELASTSCHRIFT');
    expect(tx.counterpartyBic).toBe('TESTBANKXXX');
    expect(tx.counterpartyIban).toBe('DE89370400440532013000');
    expect(tx.counterpartyName).toBe('Beispiel Shop GmbH');
    expect(tx.endToEndReference).toBe('TEST-REF-001');
    expect(tx.mandateReference).toBe('MANDATE-12345');
    expect(tx.creditorId).toBe('DE00ZZZ00000000001');
    expect(tx.purpose).toContain('Monthly subscription Invo');
  });

  it('should parse transaction with single-line :86: field', () => {
    const mt940Data = [
      ':20:STARTUMS',
      ':25:12345678/1234567890',
      ':28C:00000',
      ':60F:C260123EUR1000,00',
      ':61:2601150115CR50,00NTRFNONREF//2026-01-15-12.00',
      ':86:166?00GUTSCHRIFT?20SVWZ+Salary January?30TESTBICXXX?31DE98765432109876543210?32Erika Musterfrau',
      ':62F:C260123EUR1050,00',
      '-',
    ].join('\r\n');

    const transactions = parseMT940(mt940Data);

    expect(transactions).toHaveLength(1);
    const tx = transactions[0];

    expect(tx.amount).toBe(50.0);
    expect(tx.counterpartyName).toBe('Erika Musterfrau');
    expect(tx.counterpartyBic).toBe('TESTBICXXX');
    expect(tx.counterpartyIban).toBe('DE98765432109876543210');
    expect(tx.bookingText).toBe('GUTSCHRIFT');
  });

  it('should handle LF line endings', () => {
    const mt940Data = [
      ':20:STARTUMS',
      ':25:12345678/1234567890',
      ':28C:00000',
      ':60F:C260123EUR100,00',
      ':61:2601200120DR10,00NDDTNONREF',
      ':86:105?00LASTSCHRIFT?20SVWZ+Utility bill?30BANKCODEX?31DE11111111111111111111?32Stadtwerke Musterstadt',
      ':62F:C260123EUR90,00',
      '-',
    ].join('\n');

    const transactions = parseMT940(mt940Data);

    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(-10.0);
    expect(transactions[0].counterpartyName).toBe('Stadtwerke Musterstadt');
  });

  it('should handle multiple transactions in one statement', () => {
    const mt940Data = [
      ':20:STARTUMS',
      ':25:12345678/1234567890',
      ':28C:00000',
      ':60F:C260101EUR1000,00',
      ':61:2601050105DR50,00NDDTNONREF',
      ':86:105?00LASTSCHRIFT?20SVWZ+Insurance premium?30INSURBIC1?31DE11111111111111111111?32Versicherung AG',
      ':61:2601100110CR100,00NTRFNONREF',
      ':86:166?00GUTSCHRIFT?20SVWZ+Refund?30SHOPBIC22?31DE22222222222222222222?32Online Shop GmbH',
      ':62F:C260110EUR1050,00',
      '-',
    ].join('\r\n');

    const transactions = parseMT940(mt940Data);

    expect(transactions).toHaveLength(2);
    expect(transactions[0].amount).toBe(-50.0);
    expect(transactions[0].counterpartyName).toBe('Versicherung AG');
    expect(transactions[1].amount).toBe(100.0);
    expect(transactions[1].counterpartyName).toBe('Online Shop GmbH');
  });
});
