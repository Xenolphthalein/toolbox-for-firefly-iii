/**
 * FinTS message wrapper functions
 *
 * Handles wrapping segments into complete FinTS messages with proper headers and footers.
 */

import { buildHNHBK, buildHNHBS, buildHNVSK, buildHNVSD } from './segments.js';

/**
 * Wrap message content with encryption envelope (for PIN/TAN authenticated dialogs)
 */
export function wrapMessage(dialogId: string, msgNumber: number, segments: string[]): string {
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
export function wrapAuthenticatedMessage(
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
