/**
 * FinTS Client Module
 *
 * Minimal read-only FinTS client for fetching bank transactions.
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

// Re-export main client class
export { FinTSClient } from './client.js';

// Re-export constants
export { FINTS_VERSION, PRODUCT_ID, DIALOG_LANGUAGE, KNOWN_BANKS } from './constants.js';

// Re-export types (from shared types)
export type {
  FinTSConfig,
  FinTSAccount,
  FinTSTransaction,
  FinTSFetchOptions,
  FinTSDialogState,
  FinTSTanMethod,
  FinTSTanRequest,
} from '../../../shared/types/app.js';
