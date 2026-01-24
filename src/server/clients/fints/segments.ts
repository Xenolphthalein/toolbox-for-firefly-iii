/**
 * FinTS segment builder functions
 *
 * Each function builds a specific FinTS segment according to the specification.
 */

import type { FinTSAccount } from '../../../shared/types/app.js';
import { FINTS_VERSION, PRODUCT_ID, DIALOG_LANGUAGE } from './constants.js';
import { encodeFinTS, formatFinTSDate } from './utils.js';

/**
 * Build a FinTS segment
 */
export function buildSegment(
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
export function buildHNHBK(dialogId: string, msgNumber: number): string {
  // Use placeholder that will be replaced with actual length
  return `HNHBK:1:3+000000000000+${FINTS_VERSION}+${dialogId}+${msgNumber}'`;
}

/**
 * Build HNHBS (Message Footer)
 */
export function buildHNHBS(segmentNumber: number, msgNumber: number): string {
  return `HNHBS:${segmentNumber}:1+${msgNumber}'`;
}

/**
 * Build HKIDN (Identification)
 * Format: HKIDN:<seg>:2+280:<bankCode>+<userId>+<systemId>+1'
 */
export function buildHKIDN(
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
export function buildHKVVB(
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
export function buildHKEND(segmentNumber: number, dialogId: string): string {
  return `HKEND:${segmentNumber}:1+${dialogId}'`;
}

/**
 * Build HNSHA (Signature Footer) - for PIN/TAN
 * Format: HNSHA:<seg>:2+<secRef>++<pin>:<tan>' or just '<pin>'
 */
export function buildHNSHA(
  segmentNumber: number,
  secRef: string,
  pin: string,
  tan?: string
): string {
  const pinBlock = tan ? `${encodeFinTS(pin)}:${encodeFinTS(tan)}` : encodeFinTS(pin);
  return `HNSHA:${segmentNumber}:2+${secRef}++${pinBlock}'`;
}

/**
 * Build HNSHK (Signature Header) - for PIN/TAN
 * Format based on phpFinTS test cases
 */
export function buildHNSHK(
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
export function buildHKSPA(segmentNumber: number): string {
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
export function buildHKTAN(
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
export function buildHKKAZ(
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
export function buildHNVSK(bankCode: string, userId: string, systemId: string): string {
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
export function buildHNVSD(encryptedContent: string): string {
  return `HNVSD:999:1+@${encryptedContent.length}@${encryptedContent}'`;
}
