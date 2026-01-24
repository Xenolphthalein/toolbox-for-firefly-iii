/**
 * Minimal read-only FinTS client for fetching bank transactions
 *
 * This is a simplified implementation focused on:
 * - Anonymous dialog initialization (HKIDN)
 * - Synchronization (HKSYN)
 * - Account listing (HKSPA, HKKIF)
 * - Transaction fetching (HKKAZ for MT940)
 *
 * Note: This is NOT a complete FinTS implementation. It covers only
 * the read-only operations needed for importing transactions.
 *
 * References:
 * - FinTS 3.0 specification: https://www.hbci-zka.de/spec/3_0.htm
 * - phpFinTS for reference: https://github.com/nemiah/phpFinTS
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import type {
  FinTSConfig,
  FinTSAccount,
  FinTSTransaction,
  FinTSFetchOptions,
  FinTSDialogState,
  FinTSTanRequest,
  FinTSTanMethod,
} from '../../shared/types/app.js';
import { createLogger } from '../utils/logger.js';

// Create logger for FinTS client
const logger = createLogger('FinTS:Client');

// FinTS message constants
const FINTS_VERSION = '300'; // FinTS 3.0
const PRODUCT_ID = '00000000000000000000000000'; // Anonymous product ID
const DIALOG_LANGUAGE = '0'; // German (default)

/**
 * Scrub sensitive information from log messages
 * Removes user IDs, PINs, IBANs, account numbers, etc.
 */
function scrubSensitiveData(text: string): string {
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
function logMessage(level: 'debug' | 'info', prefix: string, message: string): void {
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
function encodeFinTS(text: string): string {
  // Escape special characters
  return text.replace(/\+/g, '?+').replace(/:/g, '?:').replace(/@/g, '?@').replace(/'/g, "?'");
}

/**
 * Generate a message reference number
 */
function generateMsgRef(): string {
  return Math.floor(Math.random() * 9999999)
    .toString()
    .padStart(7, '0');
}

/**
 * Format date for FinTS (YYYYMMDD)
 */
function formatFinTSDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Build a FinTS segment
 */
function buildSegment(
  name: string,
  segmentNumber: number,
  version: number,
  data: (string | number | null | undefined)[]
): string {
  const header = `${name}:${segmentNumber}:${version}`;
  const content = data.map((d) => (d === null || d === undefined ? '' : String(d))).join('+');
  return `${header}+${content}'`;
}

/**
 * Build HNHBK (Message Header)
 * @param msgLength - The TOTAL message length (will be calculated and replaced)
 */
function buildHNHBK(dialogId: string, msgNumber: number): string {
  // Use placeholder that will be replaced with actual length
  return `HNHBK:1:3+000000000000+${FINTS_VERSION}+${dialogId}+${msgNumber}'`;
}

/**
 * Build HNHBS (Message Footer)
 */
function buildHNHBS(segmentNumber: number, msgNumber: number): string {
  return `HNHBS:${segmentNumber}:1+${msgNumber}'`;
}

/**
 * Build HKIDN (Identification)
 * Format: HKIDN:<seg>:2+280:<bankCode>+<userId>+<systemId>+1'
 */
function buildHKIDN(
  segmentNumber: number,
  bankCode: string,
  userId: string,
  systemId: string = '0'
): string {
  return `HKIDN:${segmentNumber}:2+280:${bankCode}+${encodeFinTS(userId)}+${systemId}+1'`;
}

/**
 * Build HKVVB (Processing Preparation)
 * Format: HKVVB:<seg>:3+<bpdVersion>+<updVersion>+<lang>+<productId>+<productVersion>'
 */
function buildHKVVB(
  segmentNumber: number,
  bpdVersion: number = 0,
  updVersion: number = 0,
  productId: string = PRODUCT_ID
): string {
  return `HKVVB:${segmentNumber}:3+${bpdVersion}+${updVersion}+${DIALOG_LANGUAGE}+${productId}+1.0'`;
}

/**
 * Build HKEND (Dialog End)
 */
function buildHKEND(segmentNumber: number, dialogId: string): string {
  return `HKEND:${segmentNumber}:1+${dialogId}'`;
}

/**
 * Build HNSHA (Signature Footer) - for PIN/TAN
 * Format: HNSHA:<seg>:2+<secRef>++<pin>:<tan>' or just '<pin>'
 */
function buildHNSHA(segmentNumber: number, secRef: string, pin: string, tan?: string): string {
  const pinBlock = tan ? `${encodeFinTS(pin)}:${encodeFinTS(tan)}` : encodeFinTS(pin);
  return `HNSHA:${segmentNumber}:2+${secRef}++${pinBlock}'`;
}

/**
 * Build HNSHK (Signature Header) - for PIN/TAN
 * Format based on phpFinTS test cases
 */
function buildHNSHK(
  segmentNumber: number,
  secRef: string,
  bankCode: string,
  userId: string,
  systemId: string,
  tanProcess: string = '999' // 999 = single step (Einschritt), 4 = two step
): string {
  const date = new Date();
  const dateStr = formatFinTSDate(date);
  const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, '');

  // Based on phpFinTS format:
  // HNSHK:seg:4+PIN:1+<tanProcess>+<secRef>+1+1+1::<systemId>+1+1:<date>:<time>+1:999:1+6:10:16+280:<bankCode>:<userId>:S:0:0'
  const parts = [
    `HNSHK:${segmentNumber}:4`,
    'PIN:1', // Security profile
    tanProcess, // Security function (999=single step)
    secRef, // Security control reference
    '1', // Security area (1=SHM)
    '1', // Security role (1=ISS)
    `1::${systemId}`, // Security identification
    '1', // Security reference number
    `1:${dateStr}:${timeStr}`, // Security date/time
    '1:999:1', // Hash algorithm (1=owner, 999=mutually agreed, 1=none)
    '6:10:16', // Signature algorithm (6=owner, 10=RSA, 16=ISO9796-1)
    `280:${bankCode}:${encodeFinTS(userId)}:S:0:0`, // Key name
  ];

  return parts.join('+') + "'";
}

/**
 * Build HKSPA (SEPA Account Request)
 */
function buildHKSPA(segmentNumber: number): string {
  return `HKSPA:${segmentNumber}:1'`;
}

/**
 * Build HKTAN (TAN process segment)
 * @param segmentNumber - Segment number in message
 * @param version - HKTAN version (6 or 7)
 * @param tanProcess - TAN process: 4=init two-step, 2=submit TAN, S=poll decoupled
 * @param segmentId - Reference segment ID (e.g., 'HKSPA', 'HKKAZ') for process 4
 * @param orderRef - Order reference for process 2 or S
 */
function buildHKTAN(
  segmentNumber: number,
  version: number,
  tanProcess: '4' | '2' | 'S',
  segmentId?: string,
  orderRef?: string
): string {
  // HKTAN field order (v6/v7):
  // 1: tanProzess
  // 2: segmentkennung (M for process 4)
  // 3: kontoverbindungInternationalAuftraggeber (N)
  // 4: auftragsHashwert (N)
  // 5: auftragsreferenz (M for process 2, S)
  // 6: weitereTanFolgt (M for process 2, S)
  // 7+: other optional fields

  if (tanProcess === '4') {
    // Initiate TAN process for a business segment
    // HKTAN:seg:ver+4+<segmentRef>'
    return `HKTAN:${segmentNumber}:${version}+4+${segmentId || ''}'`;
  } else if (tanProcess === '2') {
    // Submit TAN - skip to auftragsreferenz (field 5), weitereTanFolgt=N (field 6)
    // HKTAN:seg:ver+2++++<orderRef>+N'
    return `HKTAN:${segmentNumber}:${version}+2++++${orderRef || ''}+N'`;
  } else if (tanProcess === 'S') {
    // Poll for decoupled TAN status (only supported in v7+)
    // HKTAN:seg:ver+S++++<orderRef>+N'
    return `HKTAN:${segmentNumber}:${version}+S++++${orderRef || ''}+N'`;
  }
  return `HKTAN:${segmentNumber}:${version}+${tanProcess}'`;
}

/**
 * Build HKKAZ (Account Transactions - MT940)
 */
function buildHKKAZ(
  segmentNumber: number,
  version: number,
  account: FinTSAccount,
  startDate: string,
  endDate: string,
  touchDown?: string
): string {
  // Account identification - HKKAZ v7 uses international format (IBAN:BIC only)
  // Format: IBAN:BIC for international, accountNumber::280:bankCode for national
  const ktv =
    version >= 7
      ? `${account.iban}:${account.bic}` // International format for v7
      : `${account.accountNumber}::280:${account.bankCode}`;

  const data = [
    ktv,
    'N', // alleKonten: J=all accounts, N=specific account (boolean, not empty!)
    formatFinTSDate(startDate),
    formatFinTSDate(endDate),
    '', // Max entries
    touchDown || '', // Touch-down point for pagination
  ];

  return buildSegment('HKKAZ', segmentNumber, version, data);
}

/**
 * Build HNVSK (Encryption Header) for PIN/TAN
 */
function buildHNVSK(bankCode: string, userId: string, systemId: string): string {
  const date = new Date();
  const dateStr = formatFinTSDate(date);
  const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, '');

  // Security profile: PIN:1
  // Security function: 998 (placeholder for encryption)
  // Role: 1 (ISS = Issuer)
  // Security identification: 1::<systemId>
  // Security date: 1:<date>:<time>
  // Encryption algorithm: 2:2:13:@8@00000000:5:1 (placeholder algorithm)
  // Key name: 280:<bankCode>:<userId>:V:0:0
  // Compression: 0

  return `HNVSK:998:3+PIN:1+998+1+1::${systemId}+1:${dateStr}:${timeStr}+2:2:13:@8@00000000:5:1+280:${bankCode}:${encodeFinTS(userId)}:V:0:0+0'`;
}

/**
 * Build HNVSD (Encrypted Data) wrapper
 */
function buildHNVSD(encryptedContent: string): string {
  return `HNVSD:999:1+@${encryptedContent.length}@${encryptedContent}'`;
}

/**
 * Wrap message content with encryption envelope (for PIN/TAN authenticated dialogs)
 */
function wrapMessage(dialogId: string, msgNumber: number, segments: string[]): string {
  const content = segments.join('');
  const segmentCount = segments.length;

  // Build header and footer (segment numbers: 1=HNHBK, last=HNHBS)
  const footerSegNum = segmentCount + 2;
  const header = buildHNHBK(dialogId, msgNumber);
  const footer = buildHNHBS(footerSegNum, msgNumber);

  // Assemble full message
  const fullMsg = header + content + footer;

  // Calculate actual length and replace placeholder
  const actualLength = fullMsg.length.toString().padStart(12, '0');
  return fullMsg.replace('000000000000', actualLength);
}

/**
 * Wrap message with HNVSK/HNVSD encryption envelope for authenticated dialogs
 */
function wrapAuthenticatedMessage(
  dialogId: string,
  msgNumber: number,
  bankCode: string,
  userId: string,
  systemId: string,
  signedSegments: string[]
): string {
  const signedContent = signedSegments.join('');

  // HNVSK at segment 998, HNVSD at 999
  const hnvsk = buildHNVSK(bankCode, userId, systemId);
  const hnvsd = buildHNVSD(signedContent);

  // Build header and footer
  // Segment order: HNHBK(1), HNVSK(998), HNVSD(999), HNHBS(last)
  const header = buildHNHBK(dialogId, msgNumber);
  const footer = buildHNHBS(signedSegments.length + 2, msgNumber);

  // Assemble full message
  const fullMsg = header + hnvsk + hnvsd + footer;

  // Calculate actual length and replace placeholder
  const actualLength = fullMsg.length.toString().padStart(12, '0');
  return fullMsg.replace('000000000000', actualLength);
}

/**
 * Parse FinTS response segments
 */
function parseSegments(response: string): Map<string, string[]> {
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
function extractElements(segment: string): string[] {
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

/**
 * Parse MT940 transaction data
 */
function parseMT940(mt940Data: string): FinTSTransaction[] {
  const transactions: FinTSTransaction[] = [];

  // Detect divider - either \r\n or @@
  const crlnCount = (mt940Data.match(/\r\n-/g) || []).length;
  const atCount = (mt940Data.match(/@@-/g) || []).length;
  const divider = crlnCount > atCount ? '\r\n' : '@@';

  // Join continuation lines (lines not starting with :)
  const dividerRegex = new RegExp(divider + '([^:])', 'gms');
  const cleanedData = mt940Data.replace(dividerRegex, '$1');

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
          // Try to guess the correct year for booking date
          const bMonth = parseInt(bookingDatePart.slice(0, 2), 10);
          const vMonth = parseInt(valutaDatePart.slice(2, 4), 10);

          // If dates are more than 6 months apart, adjust year
          let bYear = fullYear;
          const monthDiff = vMonth - bMonth;
          if (monthDiff > 6) bYear--;
          else if (monthDiff < -6) bYear++;

          bookingDate = `${bYear}-${bookingDatePart.slice(0, 2)}-${bookingDatePart.slice(2, 4)}`;
        }

        // Parse description (field 86)
        const parsed = parseDescription(description);

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
function parseDescription(descr: string): {
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
function extractStructuredData(lines: string[]): {
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

/**
 * Check response for errors
 */
function checkForErrors(segments: Map<string, string[]>): void {
  const returnSegments = segments.get('HIRMG') || [];
  returnSegments.push(...(segments.get('HIRMS') || []));

  for (const segment of returnSegments) {
    const elements = extractElements(segment);
    for (const element of elements) {
      // Parse return code
      const codeMatch = element.match(/^(\d{4})/);
      if (codeMatch) {
        const code = parseInt(codeMatch[1], 10);
        // Codes 9xxx are errors
        if (code >= 9000) {
          throw new Error(`FinTS Error ${code}: ${element.slice(5)}`);
        }
      }
    }
  }
}

/**
 * Extract dialog ID from response
 */
function extractDialogId(segments: Map<string, string[]>): string {
  const hnhbk = segments.get('HNHBK')?.[0];
  if (!hnhbk) {
    throw new Error('Invalid response: Missing HNHBK segment');
  }

  const elements = extractElements(hnhbk);
  return elements[2] || '0';
}

/**
 * Extract accounts from HISPA response
 */
function extractAccounts(segments: Map<string, string[]>): FinTSAccount[] {
  const accounts: FinTSAccount[] = [];

  const hispaSegments = segments.get('HISPA') || [];
  for (const segment of hispaSegments) {
    const elements = extractElements(segment);

    // Parse account data (format varies by version)
    for (const element of elements) {
      // Look for IBAN patterns
      const ibanMatch = element.match(/([A-Z]{2}\d{2}[A-Z0-9]{4,30})/);
      const bicMatch = element.match(/([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}[A-Z0-9]{3}?)/);

      if (ibanMatch) {
        const parts = element.split(':');
        accounts.push({
          accountNumber: parts[0] || ibanMatch[1],
          ownerName: '',
          accountType: 'Account',
          currency: 'EUR',
          bankCode: parts[3] || '',
          iban: ibanMatch[1],
          bic: bicMatch?.[1],
        });
      }
    }
  }

  // Also check UPD (User Parameter Data) for accounts
  const hiupd = segments.get('HIUPD') || [];
  for (const segment of hiupd) {
    const elements = extractElements(segment);
    if (elements.length >= 3) {
      const accountInfo = elements[0].split(':');
      const existingAccount = accounts.find((a) => a.accountNumber === accountInfo[0]);

      if (!existingAccount && accountInfo[0]) {
        accounts.push({
          accountNumber: accountInfo[0],
          ownerName: elements[5] || '',
          accountType: elements[3] || 'Account',
          currency: elements[2] || 'EUR',
          bankCode: accountInfo[3] || '',
          iban: elements[1]?.match(/([A-Z]{2}\d{2}[A-Z0-9]{4,30})/)?.[1],
        });
      } else if (existingAccount) {
        existingAccount.ownerName = elements[5] || existingAccount.ownerName;
        existingAccount.accountType = elements[3] || existingAccount.accountType;
      }
    }
  }

  return accounts;
}

/**
 * Check if TAN is required and parse TAN methods
 */
function extractTanMethods(segments: Map<string, string[]>): FinTSTanMethod[] {
  const methods: FinTSTanMethod[] = [];
  const hitansSegments = segments.get('HITANS') || [];

  for (const segment of hitansSegments) {
    // HITANS contains TAN method definitions embedded in colon-separated data
    // Format: HITANS:70:6:4+1+1+0+N:N:0:940:2:SealOne:Decoupled::DKB App:::DKB App:2048:...
    const elements = extractElements(segment);
    logger.debug(`HITANS elements: ${JSON.stringify(elements)}`);

    // The TAN methods are embedded within the last element(s) as colon-separated values
    // We need to find patterns like: <3-digit-id>:<1-digit-process>:<technical-name>:...
    for (const element of elements) {
      // Use regex to find all TAN method definitions within the element
      // Format: <id>:<process>:<technicalName>:<optional>:<optional>:<name>:...
      // Example: 940:2:SealOne:Decoupled::DKB App:::DKB App:2048:N:1:N:0:0:N:J:00:0:N
      const methodRegex = /(\d{3}):(\d):([^:]*):([^:]*):([^:]*):([^:]*)/g;
      let match;

      while ((match = methodRegex.exec(element)) !== null) {
        const [fullMatch, id, , technicalName, extra1, extra2, possibleName] = match;

        // Determine the name - it could be in different positions
        // For DKB: 940:2:SealOne:Decoupled::DKB App - name is after empty fields
        // For chipTAN: 910:2:HHD1.3.0:::chipTAN manuell - name is after empty fields
        let name = possibleName;
        if (!name || name.length < 2) {
          // Look further in the match for a proper name
          const afterMatch = element.substring(match.index + fullMatch.length);
          const nameParts = afterMatch.split(':');
          for (const part of nameParts) {
            if (part && part.length > 2 && !/^\d+$/.test(part) && !/^[NYJ]$/.test(part)) {
              name = part;
              break;
            }
          }
        }

        // Check if this is a decoupled (app-based) TAN method
        const isDecoupled =
          id === '940' || // DKB App is always method 940
          technicalName?.toLowerCase().includes('sealon') ||
          technicalName?.toLowerCase().includes('decoupled') ||
          technicalName?.toLowerCase().includes('pushtan') ||
          extra1?.toLowerCase().includes('decoupled') ||
          extra2?.toLowerCase().includes('decoupled') ||
          fullMatch.toLowerCase().includes('decoupled');

        // Avoid duplicates
        if (!methods.find((m) => m.id === id)) {
          logger.debug(
            `Parsed TAN method: id=${id}, name=${name}, technical=${technicalName}, isDecoupled=${isDecoupled}`
          );

          methods.push({
            id,
            name: name || technicalName || `TAN Method ${id}`,
            technicalName: technicalName || '',
            version: extra1 || '',
            isDecoupled,
          });
        }
      }
    }
  }

  return methods;
}

/**
 * Extract allowed TAN methods for the user from HIRMS 3920
 */
function extractAllowedTanMethods(segments: Map<string, string[]>): string[] {
  const hirmsSegments = segments.get('HIRMS') || [];

  for (const segment of hirmsSegments) {
    // Look for 3920 return code which lists allowed TAN methods
    const match = segment.match(/3920[^']*:([0-9:]+)/);
    if (match) {
      return match[1].split(':').filter((m) => m.length > 0);
    }
  }

  return [];
}

/**
 * Check if TAN is required
 */
function checkTanRequired(segments: Map<string, string[]>): FinTSTanRequest | null {
  const hitan = segments.get('HITAN')?.[0];
  if (!hitan) return null;

  const elements = extractElements(hitan);
  logger.debug(`HITAN elements: ${JSON.stringify(elements)}`);

  // HITAN segment structure (version 6):
  // HITAN:4:6:5+4++<orderRef>+<challengeText>+++<tanMediumName>
  // Elements after extractElements:
  // [0] = ":5" (reference to segment 5)
  // [1] = "4" (TAN process: 4=init decoupled)
  // [2] = "" (empty)
  // [3] = orderRef (e.g., "DKB_161NtvIjQs-jV6dApRjFg_6AGp")
  // [4] = challengeText (e.g., "Bitte mit der DKB-App bestätigen.")
  // [5-6] = "" (empty)
  // [7] = tanMediumName (e.g., "DKB-App (Samsung SM-F...")

  const tanProcess = elements[1] || '';
  const orderRef = elements[3] || elements[2] || '';
  const challengeText = elements[4] || elements[3] || '';

  logger.debug(
    `HITAN parsed: process=${tanProcess}, orderRef=${orderRef}, challenge=${challengeText}`
  );

  if (tanProcess || challengeText) {
    return {
      tanProcess: 'twoStep', // Will be overridden by isDecoupled check in initDialogWithTan
      challengeText: challengeText || 'Please confirm in your banking app',
      dialogId: extractDialogId(segments),
      orderRef,
    };
  }

  return null;
}

/**
 * Make HTTP request to FinTS server
 */
async function sendRequest(url: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    // FinTS requires base64 encoding of the message
    const encodedMessage = Buffer.from(message, 'latin1').toString('base64');

    logger.debug(`Sending request to ${parsedUrl.hostname}${parsedUrl.pathname}`);
    logger.debug(`Request size: ${encodedMessage.length} bytes (base64)`);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=ISO-8859-1',
        'Content-Length': Buffer.byteLength(encodedMessage, 'ascii'),
      },
    };

    const startTime = Date.now();

    const req = httpModule.request(options, (res) => {
      const chunks: Buffer[] = [];

      logger.debug(`HTTP Status: ${res.statusCode} ${res.statusMessage}`);

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const rawResponse = Buffer.concat(chunks).toString('ascii');
        const duration = Date.now() - startTime;
        logger.debug(`Response received in ${duration}ms, size: ${rawResponse.length} bytes`);

        // Check for HTTP errors
        if (res.statusCode && res.statusCode >= 400) {
          logger.error(`HTTP error ${res.statusCode}: ${rawResponse.substring(0, 500)}`);
          reject(new Error(`HTTP error ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        // FinTS responses are base64 encoded
        if (rawResponse.length === 0) {
          resolve('');
          return;
        }

        try {
          const decodedResponse = Buffer.from(rawResponse, 'base64').toString('latin1');
          resolve(decodedResponse);
        } catch {
          // If not valid base64, return as-is (might be an error page)
          logger.debug('Response is not base64 encoded, returning raw');
          resolve(rawResponse);
        }
      });
    });

    req.on('error', (error) => {
      logger.error(`Request failed: ${error.message}`);
      reject(new Error(`FinTS request failed: ${error.message}`));
    });

    req.write(encodedMessage, 'ascii');
    req.end();
  });
}

/**
 * FinTS Client for read-only operations
 */
export class FinTSClient {
  private config: FinTSConfig;
  private dialogId: string = '0';
  private msgNumber: number = 1;
  private systemId: string = '0';
  private secRef: string;
  private tanMethods: FinTSTanMethod[] = [];
  private allowedTanMethods: string[] = [];
  private selectedTanMethod: string = '999'; // Default to single-step
  private orderRef: string = '';

  constructor(config: FinTSConfig) {
    this.config = config;
    this.secRef = generateMsgRef();
    logger.info(`Client created for bank ${config.bankCode}`);
    logger.debug(`FinTS URL: ${config.url}`);
  }

  /**
   * Initialize dialog and get available accounts
   */
  async initDialog(): Promise<FinTSDialogState> {
    logger.info('Initializing dialog...');
    this.dialogId = '0';
    this.msgNumber = 1;
    this.secRef = generateMsgRef();

    // Step 1: Dialog initialization (only HKIDN + HKVVB) with single-step mode first
    // to discover available TAN methods
    const initSegments = [
      buildHNSHK(2, this.secRef, this.config.bankCode, this.config.userId, this.systemId, '999'),
      buildHKIDN(3, this.config.bankCode, this.config.userId, this.systemId),
      buildHKVVB(4, 0, 0, this.config.productId || PRODUCT_ID),
      buildHNSHA(5, this.secRef, this.config.pin),
    ];

    logger.debug(`Built ${initSegments.length} signed segments for init dialog`);

    // Wrap with HNVSK/HNVSD encryption envelope
    const initMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      initSegments
    );

    logMessage('debug', 'Init message to send', initMessage);

    const initResponse = await sendRequest(this.config.url, initMessage);

    logMessage('debug', 'Init response', initResponse);

    const initParsedSegments = parseSegments(initResponse);

    logger.debug(`Parsed ${initParsedSegments.size} segment types from init response`);

    checkForErrors(initParsedSegments);

    this.dialogId = extractDialogId(initParsedSegments);
    this.msgNumber++;

    logger.debug(`Dialog ID: ${this.dialogId}`);

    // Extract available TAN methods from BPD
    this.tanMethods = extractTanMethods(initParsedSegments);
    this.allowedTanMethods = extractAllowedTanMethods(initParsedSegments);

    logger.info(
      `Available TAN methods: ${this.tanMethods.map((m) => `${m.id}:${m.name}`).join(', ')}`
    );
    logger.info(`Allowed TAN methods for user: ${this.allowedTanMethods.join(', ')}`);

    // Select the first allowed TAN method
    if (this.allowedTanMethods.length > 0) {
      this.selectedTanMethod = this.allowedTanMethods[0];
      logger.info(`Selected TAN method: ${this.selectedTanMethod}`);
    }

    // If only two-step methods are allowed, we need to start a new dialog with TAN
    if (this.allowedTanMethods.length > 0 && !this.allowedTanMethods.includes('999')) {
      // End current dialog
      await this.endDialog();

      // Start new dialog with selected TAN method
      return this.initDialogWithTan();
    }

    // Single-step worked, try to get accounts
    return this.requestAccounts(initParsedSegments);
  }

  /**
   * Initialize dialog with two-step TAN authentication
   */
  private async initDialogWithTan(): Promise<FinTSDialogState> {
    logger.info(`Starting dialog with TAN method ${this.selectedTanMethod}...`);
    this.dialogId = '0';
    this.msgNumber = 1;
    this.secRef = generateMsgRef();

    const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
    const isDecoupled = selectedMethod?.isDecoupled || false;

    logger.info(`TAN method ${this.selectedTanMethod} is ${isDecoupled ? 'decoupled' : 'manual'}`);

    // Use HKTAN version 7 for decoupled TAN methods (required for process S polling)
    // The bank requires consistent HKTAN versions throughout the dialog
    const hktanVersion = isDecoupled ? 7 : 6;

    // Build init segments with the selected TAN method
    const initSegments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKIDN(3, this.config.bankCode, this.config.userId, this.systemId),
      buildHKVVB(4, 0, 0, this.config.productId || PRODUCT_ID),
      buildHKTAN(5, hktanVersion, '4', 'HKIDN'), // Initiate TAN process for HKIDN
      buildHNSHA(6, this.secRef, this.config.pin),
    ];

    const initMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      initSegments
    );

    logMessage('debug', 'TAN init message', initMessage);

    const initResponse = await sendRequest(this.config.url, initMessage);
    logMessage('debug', 'TAN init response', initResponse);

    const parsedSegments = parseSegments(initResponse);
    this.msgNumber++;

    // Don't check for errors yet - 0030 (TAN required) is expected
    this.dialogId = extractDialogId(parsedSegments);

    // Extract HITAN response for challenge/order reference
    const hitan = parsedSegments.get('HITAN')?.[0];
    if (hitan) {
      const elements = extractElements(hitan);
      logger.debug(`HITAN elements: ${JSON.stringify(elements)}`);

      // HITAN segment structure (version 6):
      // HITAN:4:6:5+4++<orderRef>+<challengeText>+++<tanMediumName>
      // Elements after extractElements:
      // [0] = ":5" (reference to segment 5)
      // [1] = "4" (TAN process: 4=init decoupled)
      // [2] = "" (empty)
      // [3] = orderRef (e.g., "DKB_161NtvIjQs-jV6dApRjFg_6AGp")
      // [4] = challengeText (e.g., "Bitte mit der DKB-App bestätigen.")
      this.orderRef = elements[3] || elements[2] || elements[1] || '';
      const challengeText = elements[4] || '';

      logger.info(`Order reference: ${this.orderRef}`);
      logger.info(`Challenge: ${challengeText}`);

      return {
        dialogId: this.dialogId,
        tanRequired: true,
        tanMethods: this.tanMethods,
        selectedTanMethod: this.selectedTanMethod,
        tanRequest: {
          tanProcess: isDecoupled ? 'decoupled' : 'twoStep',
          tanMethodId: this.selectedTanMethod,
          challengeText: challengeText || 'Please confirm in your banking app',
          dialogId: this.dialogId,
          orderRef: this.orderRef,
        },
        accounts: [],
        statusMessage: isDecoupled
          ? 'Please confirm the login in your banking app'
          : 'Please enter the TAN',
      };
    }

    // Check for actual errors
    checkForErrors(parsedSegments);

    // If we got here, TAN was somehow not required
    return this.requestAccounts(parsedSegments);
  }

  /**
   * Request SEPA accounts after successful authentication
   */
  private async requestAccounts(parsedSegments: Map<string, string[]>): Promise<FinTSDialogState> {
    // Check if TAN is required for the dialog
    const tanRequest = checkTanRequired(parsedSegments);

    if (tanRequest) {
      logger.info('TAN required for authentication');
      return {
        dialogId: this.dialogId,
        tanRequired: true,
        tanRequest: tanRequest,
        accounts: [],
        statusMessage: 'TAN required for authentication',
      };
    }

    // Step 2: Request SEPA accounts (HKSPA) in a separate message
    logger.info('Requesting SEPA accounts...');
    this.secRef = generateMsgRef();

    const accountSegments = [
      buildHNSHK(2, this.secRef, this.config.bankCode, this.config.userId, this.systemId),
      buildHKSPA(3),
      buildHNSHA(4, this.secRef, this.config.pin),
    ];

    const accountMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      accountSegments
    );

    logMessage('debug', 'Account request message', accountMessage);

    const accountResponse = await sendRequest(this.config.url, accountMessage);

    logMessage('debug', 'Account response', accountResponse);

    const accountParsedSegments = parseSegments(accountResponse);
    this.msgNumber++;

    checkForErrors(accountParsedSegments);

    const accounts = extractAccounts(accountParsedSegments);

    logger.info(`Dialog initialized. Found ${accounts.length} account(s).`);

    return {
      dialogId: this.dialogId,
      tanRequired: false,
      accounts,
      statusMessage: `Dialog initialized. Found ${accounts.length} account(s).`,
    };
  }

  /**
   * Poll for decoupled TAN completion (for app-based TAN like DKB App)
   */
  async pollDecoupledTan(orderRef: string): Promise<FinTSDialogState> {
    logger.info(`Polling for decoupled TAN completion (orderRef: ${orderRef})...`);
    this.orderRef = orderRef;
    this.secRef = generateMsgRef();

    const segments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKTAN(3, 7, 'S', undefined, orderRef), // Poll status (v7 required for process S)
      buildHNSHA(4, this.secRef, this.config.pin),
    ];

    const message = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      segments
    );

    logMessage('debug', 'Poll message', message);

    const response = await sendRequest(this.config.url, message);
    logMessage('debug', 'Poll response', response);

    const parsedSegments = parseSegments(response);
    this.msgNumber++;

    // Check for response code 0900 "TAN gültig" - authentication complete!
    // The bank may include this along with HIUPD (account data) in the same response
    const hirms = parsedSegments.get('HIRMS')?.[0];
    if (hirms && hirms.includes('0900')) {
      logger.info('TAN verified successfully (0900::TAN gültig)');

      // Parse accounts from HIUPD segments in this response
      const hiupdSegments = parsedSegments.get('HIUPD');
      logger.debug(`Found ${hiupdSegments?.length || 0} HIUPD segments in response`);

      const accounts = this.parseAccountsFromResponse(parsedSegments);
      logger.debug(`Parsed ${accounts.length} accounts from response`);

      if (accounts.length > 0) {
        logger.info(`Found ${accounts.length} account(s) in TAN verification response`);
        return {
          dialogId: this.dialogId,
          tanRequired: false,
          accounts,
          statusMessage: `Authentication complete. Found ${accounts.length} account(s).`,
        };
      }

      // If no accounts in response, request them separately
      return this.requestAccountsAfterTan();
    }

    // Check for HITAN response
    const hitan = parsedSegments.get('HITAN')?.[0];
    if (hitan) {
      const elements = extractElements(hitan);
      // HITAN elements: [0]=":segRef", [1]=tanProcess, [2]=empty, [3]=orderRef, [4]=challenge
      const tanProcess = elements[1] || '';

      logger.debug(`Poll HITAN tanProcess: ${tanProcess}`);

      // tanProcess 'S' means still waiting for decoupled confirmation
      if (tanProcess === 'S') {
        logger.info('Still waiting for TAN confirmation in app...');
        return {
          dialogId: this.dialogId,
          tanRequired: true,
          tanRequest: {
            tanProcess: 'decoupled',
            tanMethodId: this.selectedTanMethod,
            challengeText: elements[4] || 'Waiting for confirmation in your banking app...',
            dialogId: this.dialogId,
            orderRef: this.orderRef,
          },
          accounts: [],
          statusMessage: 'Waiting for confirmation in your banking app...',
        };
      }
    }

    // Check for response code 3956 "Starke Kundenauthentifizierung noch ausstehend" (authentication still pending)
    if (hirms && hirms.includes('3956')) {
      logger.info('Authentication still pending (3956), continuing to poll...');
      return {
        dialogId: this.dialogId,
        tanRequired: true,
        tanRequest: {
          tanProcess: 'decoupled',
          tanMethodId: this.selectedTanMethod,
          challengeText: 'Waiting for confirmation in your banking app...',
          dialogId: this.dialogId,
          orderRef: this.orderRef,
        },
        accounts: [],
        statusMessage: 'Waiting for confirmation in your banking app...',
      };
    }

    // Check for errors (but 0030 "TAN required" might still be present)
    try {
      checkForErrors(parsedSegments);
    } catch (error) {
      // Check if it's just "TAN required" which is expected during polling
      if (
        error instanceof Error &&
        (error.message.includes('3920') || error.message.includes('0030'))
      ) {
        logger.debug('TAN still required, continuing to poll...');
        return {
          dialogId: this.dialogId,
          tanRequired: true,
          tanRequest: {
            tanProcess: 'decoupled',
            tanMethodId: this.selectedTanMethod,
            challengeText: 'Waiting for confirmation in your banking app...',
            dialogId: this.dialogId,
            orderRef: this.orderRef,
          },
          accounts: [],
          statusMessage: 'Waiting for confirmation in your banking app...',
        };
      }
      throw error;
    }

    // TAN process completed, now get accounts
    logger.info('Decoupled TAN verified successfully');
    return this.requestAccountsAfterTan();
  }

  /**
   * Submit TAN for two-step authentication (manual TAN entry)
   */
  async submitTan(tan: string, orderRef: string): Promise<FinTSDialogState> {
    logger.info(`Submitting TAN (orderRef: ${orderRef})...`);
    this.orderRef = orderRef;
    this.secRef = generateMsgRef();

    const segments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKTAN(3, 6, '2', undefined, orderRef), // Submit TAN
      buildHNSHA(4, this.secRef, this.config.pin, tan),
    ];

    const message = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      segments
    );

    logMessage('debug', 'TAN submit message', message);

    const response = await sendRequest(this.config.url, message);
    logMessage('debug', 'TAN submit response', response);

    const parsedSegments = parseSegments(response);
    this.msgNumber++;

    checkForErrors(parsedSegments);

    logger.info('TAN verified successfully');
    return this.requestAccountsAfterTan();
  }

  /**
   * Request accounts after successful TAN authentication
   */
  private async requestAccountsAfterTan(): Promise<FinTSDialogState> {
    logger.info('Requesting SEPA accounts after TAN...');
    this.secRef = generateMsgRef();

    // Use HKTAN version 7 for decoupled TAN methods (must be consistent throughout dialog)
    const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
    const isDecoupled = selectedMethod?.isDecoupled || false;
    const hktanVersion = isDecoupled ? 7 : 6;

    const accountSegments = [
      buildHNSHK(
        2,
        this.secRef,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        this.selectedTanMethod
      ),
      buildHKSPA(3),
      buildHKTAN(4, hktanVersion, '4', 'HKSPA'), // Initiate TAN for HKSPA
      buildHNSHA(5, this.secRef, this.config.pin),
    ];

    const accountMessage = wrapAuthenticatedMessage(
      this.dialogId,
      this.msgNumber,
      this.config.bankCode,
      this.config.userId,
      this.systemId,
      accountSegments
    );

    logMessage('debug', 'Account request message', accountMessage);

    const accountResponse = await sendRequest(this.config.url, accountMessage);
    logMessage('debug', 'Account response', accountResponse);

    const accountParsedSegments = parseSegments(accountResponse);
    this.msgNumber++;
    logger.debug(`After account request, message number is now: ${this.msgNumber}`);

    // Check if another TAN is needed for HKSPA
    const hitan = accountParsedSegments.get('HITAN')?.[0];
    if (hitan) {
      const elements = extractElements(hitan);
      // HITAN elements: [0]=":segRef", [1]=tanProcess, [2]=empty, [3]=orderRef, [4]=challenge
      // Check for "noref" which means no TAN required
      const orderRef = elements[3] || '';
      const challenge = elements[4] || '';

      logger.debug(`HITAN in account response: orderRef=${orderRef}, challenge=${challenge}`);

      // "noref" or "nochallenge" means no TAN is actually required
      if (orderRef === 'noref' || challenge === 'nochallenge') {
        logger.info('No TAN required for account access (noref/nochallenge)');
        // Fall through to account extraction below
      } else if (orderRef && orderRef !== 'noref') {
        // Real TAN required
        this.orderRef = orderRef;
        const challengeText = challenge.length > 5 ? challenge : 'Please confirm account access';

        const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
        const isDecoupled = selectedMethod?.isDecoupled || false;

        logger.info('TAN required for account access');

        return {
          dialogId: this.dialogId,
          tanRequired: true,
          tanRequest: {
            tanProcess: isDecoupled ? 'decoupled' : 'twoStep',
            tanMethodId: this.selectedTanMethod,
            challengeText,
            dialogId: this.dialogId,
            orderRef: this.orderRef,
          },
          accounts: [],
          statusMessage: 'TAN required for account access',
        };
      }
    }

    try {
      checkForErrors(accountParsedSegments);
    } catch (error) {
      // 9040 means authentication missing - might need different approach
      logger.error(`Account request failed: ${error}`);
      throw error;
    }

    const accounts = extractAccounts(accountParsedSegments);

    logger.info(`Found ${accounts.length} account(s)`);

    return {
      dialogId: this.dialogId,
      tanRequired: false,
      tanMethods: this.tanMethods,
      selectedTanMethod: this.selectedTanMethod,
      accounts,
      statusMessage: `Found ${accounts.length} account(s).`,
    };
  }

  /**
   * Parse accounts from a response containing HIUPD segments
   */
  private parseAccountsFromResponse(segments: Map<string, string[]>): FinTSAccount[] {
    return extractAccounts(segments);
  }

  /**
   * Fetch transactions for an account
   */
  async fetchTransactions(options: FinTSFetchOptions): Promise<FinTSTransaction[]> {
    logger.info(
      `Fetching transactions for account ${options.account.iban || options.account.accountNumber}`
    );
    logger.debug(`Date range: ${options.startDate} to ${options.endDate}`);
    logger.debug(`Dialog ID: ${this.dialogId}, Message number: ${this.msgNumber}`);

    // Use HKTAN version 7 for decoupled TAN methods (must be consistent throughout dialog)
    const selectedMethod = this.tanMethods.find((m) => m.id === this.selectedTanMethod);
    const isDecoupled = selectedMethod?.isDecoupled || false;
    const hktanVersion = isDecoupled ? 7 : 6;

    const allTransactions: FinTSTransaction[] = [];
    let touchDown: string | undefined;
    let pageCount = 0;

    do {
      pageCount++;
      logger.debug(`Fetching page ${pageCount}${touchDown ? ' (continuation)' : ''}`);

      this.secRef = generateMsgRef();

      const segments = [
        buildHNSHK(
          2,
          this.secRef,
          this.config.bankCode,
          this.config.userId,
          this.systemId,
          this.selectedTanMethod
        ),
        buildHKKAZ(
          3,
          7, // Version 7 for SEPA
          options.account,
          options.startDate,
          options.endDate,
          touchDown
        ),
        buildHKTAN(4, hktanVersion, '4', 'HKKAZ'), // HKKAZ requires TAN authentication
        buildHNSHA(5, this.secRef, this.config.pin),
      ];

      const message = wrapAuthenticatedMessage(
        this.dialogId,
        this.msgNumber,
        this.config.bankCode,
        this.config.userId,
        this.systemId,
        segments
      );

      logMessage('debug', 'Transaction fetch message', message);

      const response = await sendRequest(this.config.url, message);
      logMessage('debug', 'Transaction fetch response', response);

      const parsedSegments = parseSegments(response);

      checkForErrors(parsedSegments);
      this.msgNumber++;

      // Extract MT940 data from HIKAZ
      const hikaz = parsedSegments.get('HIKAZ')?.[0];
      if (hikaz) {
        const elements = extractElements(hikaz);
        // MT940 data is typically in the first element after the header
        const mt940Data = elements.find((e) => e.includes(':20:') || e.includes(':61:'));
        if (mt940Data) {
          const transactions = parseMT940(mt940Data);
          logger.debug(`Parsed ${transactions.length} transactions from MT940 data`);
          allTransactions.push(...transactions);
        }
      }

      // Check for continuation (touch-down)
      const hirms = parsedSegments.get('HIRMS') || [];
      touchDown = undefined;
      for (const segment of hirms) {
        if (segment.includes('3040')) {
          // More data available
          const tdMatch = segment.match(/3040[^+]*\+([^+]+)/);
          touchDown = tdMatch?.[1];
          if (touchDown) {
            logger.debug('More data available, continuing...');
          }
        }
      }
    } while (touchDown);

    logger.info(`Fetched ${allTransactions.length} transactions in ${pageCount} page(s)`);
    return allTransactions;
  }

  /**
   * End the dialog
   */
  async endDialog(): Promise<void> {
    if (this.dialogId === '0') {
      logger.debug('No active dialog to end');
      return;
    }

    logger.info('Ending dialog...');

    try {
      const segments = [
        buildHNSHK(2, this.secRef, this.config.bankCode, this.config.userId, this.systemId),
        buildHKEND(3, this.dialogId),
        buildHNSHA(4, this.secRef, this.config.pin),
      ];

      const message = wrapMessage(this.dialogId, this.msgNumber, segments);
      await sendRequest(this.config.url, message);
      logger.info('Dialog ended successfully');
    } catch (error) {
      logger.warn(`Error ending dialog: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      this.dialogId = '0';
      this.msgNumber = 1;
    }
  }
}

/**
 * Known German banks with their FinTS URLs
 * This is a small subset - users can also enter custom URLs
 */
export const KNOWN_BANKS: Record<string, { name: string; url: string; blz: string }> = {
  '12030000': {
    name: 'Deutsche Kreditbank (DKB)',
    url: 'https://fints.dkb.de/fints',
    blz: '12030000',
  },
  '50010517': {
    name: 'ING-DiBa',
    url: 'https://fints.ing-diba.de/fints/',
    blz: '50010517',
  },
  '37050198': {
    name: 'Sparkasse KölnBonn',
    url: 'https://fints.sparkasse-koelnbonn.de/fints30',
    blz: '37050198',
  },
  '70150000': {
    name: 'Stadtsparkasse München',
    url: 'https://fints.sskm.de/fints30',
    blz: '70150000',
  },
  '50050201': {
    name: 'Frankfurter Sparkasse',
    url: 'https://banking-be3.s-fints-pt-be.de/fints30',
    blz: '50050201',
  },
};
