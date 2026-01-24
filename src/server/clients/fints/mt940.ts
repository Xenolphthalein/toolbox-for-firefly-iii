/**
 * MT940 transaction data parser
 *
 * Parses MT940/MT942 formatted bank transaction data as returned by HKKAZ.
 * Based on phpFinTS implementation.
 */

import type { FinTSTransaction } from '../../../shared/types/app.js';
import { logger } from './utils.js';

/**
 * Parse MT940 transaction data
 */
export function parseMT940(mt940Data: string): FinTSTransaction[] {
  const transactions: FinTSTransaction[] = [];

  // Detect divider - either \r\n, \n, or @@
  // Some banks use CRLF, some use LF only, some use @@
  const crlnCount = (mt940Data.match(/\r\n-/g) || []).length;
  const lfCount = (mt940Data.match(/(?<!\r)\n-/g) || []).length; // LF not preceded by CR
  const atCount = (mt940Data.match(/@@-/g) || []).length;

  let divider: string;
  if (crlnCount > 0 && crlnCount >= lfCount && crlnCount >= atCount) {
    divider = '\r\n';
  } else if (lfCount > 0 && lfCount >= atCount) {
    divider = '\n';
  } else if (atCount > 0) {
    divider = '@@';
  } else {
    // Fallback: detect based on line endings in the data
    if (mt940Data.includes('\r\n')) {
      divider = '\r\n';
    } else if (mt940Data.includes('\n')) {
      divider = '\n';
    } else {
      divider = '@@';
    }
  }

  logger.debug(
    `MT940 divider detection: CRLF=${crlnCount}, LF=${lfCount}, @@=${atCount}, using: ${JSON.stringify(divider)}`
  );

  // Join continuation lines (lines not starting with a valid MT940 field tag like :20:, :61:, :86:)
  // Valid field tags are :\d\d: or :\d\d[A-Z]: (e.g., :20:, :61:, :86:, :60F:, :62M:)
  // Lines starting with just ": " or other patterns should be joined as continuation
  const continuationRegex = new RegExp(divider + '(?!:\\d{2}[A-Z]?:)', 'gms');
  const cleanedData = mt940Data.replace(continuationRegex, '');

  // Split into statements/days by divider + '-'
  const days = cleanedData.split(new RegExp(divider + '-'));

  let booked = true;

  for (const day of days) {
    // Check if this is unbooked transactions section
    if (/\+@\d+@$/.test(day.trim())) {
      booked = false;
    }

    // Split by divider + ':' to get fields
    const fields = day.split(new RegExp(divider + ':'));

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      // Transaction line: 61:YYMMDD[MMDD]C/D/RC/RD[letter]amountNtypeREF
      if (field.startsWith('61:') && fields[i + 1]?.startsWith('86:')) {
        const transaction = field.slice(3);
        const description = fields[i + 1].slice(3);

        // Parse transaction line
        // Format: YYMMDD[MMDD](C|D|RC|RD)[letter]amountNtype[ref]
        const trxMatch = transaction.match(
          /^(\d{6})(\d{4})?(C|D|RC|RD)([A-Z])?([^N]+)N([A-Z]{3})(.*)$/
        );

        if (!trxMatch) {
          logger.debug(`Failed to parse transaction: ${transaction.slice(0, 50)}`);
          continue;
        }

        const [, valutaDatePart, bookingDatePart, cdMark, , amountStr, transactionCode, rest] =
          trxMatch;

        // Parse amount
        const amount = parseFloat(amountStr.replace(',', '.'));
        const isCredit = cdMark === 'C' || cdMark === 'RC';
        const isStorno = cdMark === 'RC' || cdMark === 'RD';
        const signedAmount = isCredit ? amount : -amount;

        // Parse dates
        const year = parseInt(valutaDatePart.slice(0, 2), 10);
        const fullYear = year < 50 ? 2000 + year : 1900 + year;
        const valutaDate = `${fullYear}-${valutaDatePart.slice(2, 4)}-${valutaDatePart.slice(4, 6)}`;

        let bookingDate = valutaDate;
        if (bookingDatePart && /^\d{4}$/.test(bookingDatePart)) {
          // Booking date only has MMDD, need to infer year from value date
          const bMonth = parseInt(bookingDatePart.slice(0, 2), 10);
          const vMonth = parseInt(valutaDatePart.slice(2, 4), 10);

          // Determine year for booking date based on month relationship
          // If value date is in December and booking is in January → booking is next year
          // If value date is in January and booking is in December → booking is previous year
          let bYear = fullYear;
          const monthDiff = bMonth - vMonth; // positive = booking month is later
          if (monthDiff < -6) {
            // e.g., value=Dec(12), booking=Jan(1): diff = 1-12 = -11 < -6 → booking is next year
            bYear++;
          } else if (monthDiff > 6) {
            // e.g., value=Jan(1), booking=Dec(12): diff = 12-1 = 11 > 6 → booking is previous year
            bYear--;
          }

          bookingDate = `${bYear}-${bookingDatePart.slice(0, 2)}-${bookingDatePart.slice(2, 4)}`;
        }

        // Parse description (field 86)
        const parsed = parseDescription(description);

        logger.debug(
          `Transaction ${valutaDate} ${signedAmount}: name="${parsed.name}", svwz="${parsed.svwz?.slice(0, 50)}..."`
        );

        transactions.push({
          reference: rest?.split('//')[0]?.trim() || 'NONREF',
          bookingDate,
          valueDate: valutaDate,
          amount: signedAmount,
          currency: 'EUR',
          counterpartyName: parsed.name,
          counterpartyIban: parsed.accountNumber,
          counterpartyBic: parsed.bankCode,
          purpose: parsed.svwz || parsed.description1,
          transactionType: transactionCode,
          endToEndReference: parsed.eref || '',
          mandateReference: parsed.mref || '',
          creditorId: parsed.cred || '',
          bookingText: parsed.bookingText,
          booked,
          isStorno,
        });
      }
    }
  }

  logger.debug(`Parsed ${transactions.length} transactions from MT940`);
  return transactions;
}

/**
 * Parse MT940 description field (:86:)
 */
export function parseDescription(descr: string): {
  bookingText: string;
  description1: string;
  bankCode: string;
  accountNumber: string;
  name: string;
  svwz?: string;
  eref?: string;
  mref?: string;
  cred?: string;
} {
  // First 3 chars are the GVC (Geschäftsvorfall-Code) - not used currently
  // const gvc = descr.slice(0, 3);

  // Parse ?XX fields
  const prepared: Record<number, string> = {};
  const cleanedDescr = descr.replace(/\? /g, '?'); // Remove space after ?

  const matches = cleanedDescr.matchAll(/\?(\d{2})([^?]*)/g);
  const descriptionLines: string[] = [];
  let description1 = '';

  for (const m of matches) {
    const index = parseInt(m[1], 10);
    const value = m[2];
    prepared[index] = value;

    // Fields 20-29 and 60-63 contain the description/purpose
    if ((index >= 20 && index <= 29) || (index >= 60 && index <= 63)) {
      if (index >= 20 && index <= 29) {
        description1 += value;
      }
      descriptionLines.push(value);
    }
  }

  // Extract structured SEPA fields from description lines
  const structured = extractStructuredData(descriptionLines);

  return {
    bookingText: (prepared[0] || '').trim(),
    description1: description1.trim(),
    bankCode: (prepared[30] || '').trim(),
    accountNumber: (prepared[31] || '').trim(),
    name: ((prepared[32] || '') + (prepared[33] || '')).trim(),
    ...structured,
  };
}

/**
 * Extract structured SEPA data from description lines (SVWZ+, EREF+, etc.)
 */
export function extractStructuredData(lines: string[]): {
  svwz?: string;
  eref?: string;
  mref?: string;
  cred?: string;
} {
  if (lines.length === 0) return {};

  // Check if first line has structured format (XXXX+ at position 4)
  if (lines[0].length < 5 || lines[0][4] !== '+') {
    return { svwz: lines.join('') };
  }

  const result: Record<string, string> = {};
  let lastType: string | null = null;

  for (const line of lines) {
    if (line.length >= 5 && line[4] === '+') {
      if (lastType !== null) {
        result[lastType] = result[lastType]?.trim() || '';
      }
      lastType = line.slice(0, 4);
      result[lastType] = line.slice(5);
    } else if (lastType !== null) {
      result[lastType] += line;
    }
  }

  if (lastType !== null) {
    result[lastType] = result[lastType]?.trim() || '';
  }

  return {
    svwz: result['SVWZ'],
    eref: result['EREF'],
    mref: result['MREF'],
    cred: result['CRED'],
  };
}
