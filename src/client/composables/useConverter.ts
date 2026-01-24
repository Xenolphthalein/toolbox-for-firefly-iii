import { ref, type Ref } from 'vue';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type {
  ParsedCSV,
  ConverterConfig,
  SwimlaneConfig,
  TransformBlock,
  TransformPreview,
  FireflyImportColumn,
  ImportValidation,
  ValidationIssue,
  SwimlaneError,
  TransformedTransaction,
} from '@shared/types/converter';
import {
  createDefaultConfig,
  createSwimlane,
  VALID_TRANSACTION_TYPES,
} from '@shared/types/converter';
import { validateFileSize } from '../utils';

// Enable custom date parsing - extend modifies dayjs in place
dayjs.extend(customParseFormat);

/** CSRF token header name - must match server-side CSRF_TOKEN_HEADER */
const CSRF_TOKEN_HEADER = 'x-csrf-token';

/** Cookie name for CSRF token - must match server-side CSRF_COOKIE_NAME */
const CSRF_COOKIE_NAME = 'firefly_toolbox_csrf';

/**
 * Read CSRF token from cookie.
 * The server sets this cookie via csrfTokenCookie middleware.
 */
function getCsrfTokenFromCookie(): string | null {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * State returned by useConverter composable
 */
export interface ConverterState {
  /** Parsed CSV data */
  parsedCSV: Ref<ParsedCSV | null>;
  /** Converter configuration */
  config: Ref<ConverterConfig>;
  /** Preview of transformed data */
  preview: Ref<TransformPreview | null>;
  /** Whether the converter is currently processing */
  processing: Ref<boolean>;
  /** Current error message */
  error: Ref<string | null>;
  /** Currently loaded file (for re-parsing with new options) */
  currentFile: Ref<File | null>;
  /** Import progress */
  importProgress: Ref<{ current: number; total: number } | null>;
}

/**
 * Options for importing transactions to Firefly III
 */
export interface ImportOptions {
  /** Comma-separated tags to add to all transactions */
  tags?: string;
  /** Whether to apply Firefly III rules on import */
  applyRules?: boolean;
  /** Whether to error/skip on duplicate transactions */
  errorIfDuplicate?: boolean;
}

/**
 * Actions returned by useConverter composable
 */
export interface ConverterActions {
  /** Parse a CSV file */
  parseCSV: (
    file: File,
    options?: { delimiter?: string; hasHeader?: boolean; skipRows?: number }
  ) => Promise<void>;
  /** Update swimlane blocks */
  updateSwimlaneBlocks: (swimlaneId: string, blocks: TransformBlock[]) => void;
  /** Update swimlane enabled state */
  updateSwimlaneEnabled: (swimlaneId: string, enabled: boolean) => void;
  /** Add a new swimlane */
  addSwimlane: (column: FireflyImportColumn) => void;
  /** Remove a swimlane */
  removeSwimlane: (swimlaneId: string) => void;
  /** Reorder swimlanes */
  reorderSwimlanes: (swimlanes: SwimlaneConfig[]) => void;
  /** Generate preview of transformation */
  generatePreview: (maxRows?: number) => void;
  /** Get all transformed data as array of objects */
  getTransformedData: () => TransformedTransaction[];
  /** Validate transformed data for Firefly import */
  validateForImport: () => ImportValidation;
  /** Import transactions to Firefly III */
  importToFirefly: (
    options?: ImportOptions
  ) => Promise<{ successful: number; failed: number; errors: string[] }>;
  /** Export the transformed CSV */
  exportCSV: () => string;
  /** Download the transformed CSV */
  downloadCSV: (filename?: string) => void;
  /** Save configuration to JSON */
  saveConfig: () => string;
  /** Load configuration from JSON */
  loadConfig: (json: string) => void;
  /** Reset converter state */
  reset: () => void;
}

/**
 * Composable for CSV conversion logic
 */
export function useConverter(): ConverterState & ConverterActions {
  const parsedCSV = ref<ParsedCSV | null>(null);
  const config = ref<ConverterConfig>(createDefaultConfig());
  const preview = ref<TransformPreview | null>(null);
  const processing = ref(false);
  const error = ref<string | null>(null);
  const currentFile = ref<File | null>(null);
  const importProgress = ref<{ current: number; total: number } | null>(null);

  /**
   * Parse a CSV file into rows and columns
   */
  async function parseCSV(
    file: File,
    options?: { delimiter?: string; hasHeader?: boolean; skipRows?: number }
  ): Promise<void> {
    processing.value = true;
    error.value = null;
    currentFile.value = file;

    try {
      // Validate file size before processing (SEC-005)
      const sizeValidation = validateFileSize(file);
      if (!sizeValidation.valid) {
        throw new Error(sizeValidation.error);
      }

      const text = await file.text();
      const delimiter = options?.delimiter || config.value.csvOptions.delimiter || ',';
      const hasHeader = options?.hasHeader ?? config.value.csvOptions.hasHeader ?? true;
      const skipRows = options?.skipRows ?? config.value.csvOptions.skipRows ?? 0;

      let lines = text.split(/\r?\n/).filter((line) => line.trim());

      // Skip initial rows (bank metadata, etc.)
      if (skipRows > 0) {
        lines = lines.slice(skipRows);
      }
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      const rows = lines.map((line) => parseCSVLine(line, delimiter));

      let headers: string[];
      let dataRows: string[][];

      if (hasHeader) {
        headers = rows[0];
        dataRows = rows.slice(1);
      } else {
        // Generate column names: Column 1, Column 2, etc.
        headers = rows[0].map((_, i) => `Column ${i + 1}`);
        dataRows = rows;
      }

      parsedCSV.value = {
        headers,
        rows: dataRows,
        rawContent: text,
      };

      // Update config with detected settings
      config.value.csvOptions.delimiter = delimiter;
      config.value.csvOptions.hasHeader = hasHeader;
      config.value.csvOptions.skipRows = skipRows;

      // Auto-generate preview
      generatePreview(5);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to parse CSV';
      parsedCSV.value = null;
    } finally {
      processing.value = false;
    }
  }

  /**
   * Parse a single CSV line, handling quoted values
   */
  function parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    const quote = config.value.csvOptions.quoteChar || '"';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === quote && nextChar === quote) {
          // Escaped quote
          current += quote;
          i++;
        } else if (char === quote) {
          // End of quoted section
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === quote) {
          // Start of quoted section
          inQuotes = true;
        } else if (char === delimiter) {
          // End of field
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    // Add the last field
    result.push(current.trim());

    return result;
  }

  /**
   * Update blocks for a specific swimlane
   */
  function updateSwimlaneBlocks(swimlaneId: string, blocks: TransformBlock[]): void {
    const swimlane = config.value.swimlanes.find((s) => s.id === swimlaneId);
    if (swimlane) {
      swimlane.blocks = blocks;
      config.value.updatedAt = new Date().toISOString();
      generatePreview(5);
    }
  }

  /**
   * Update enabled state for a swimlane
   */
  function updateSwimlaneEnabled(swimlaneId: string, enabled: boolean): void {
    const swimlane = config.value.swimlanes.find((s) => s.id === swimlaneId);
    if (swimlane) {
      swimlane.enabled = enabled;
      config.value.updatedAt = new Date().toISOString();
      generatePreview(5);
    }
  }

  /**
   * Add a new swimlane for a column
   */
  function addSwimlane(column: FireflyImportColumn): void {
    // Check if already exists
    if (config.value.swimlanes.some((s) => s.targetColumn === column)) {
      error.value = `Column "${column}" already has a swimlane`;
      return;
    }
    config.value.swimlanes.push(createSwimlane(column));
    config.value.updatedAt = new Date().toISOString();
  }

  /**
   * Remove a swimlane
   */
  function removeSwimlane(swimlaneId: string): void {
    const index = config.value.swimlanes.findIndex((s) => s.id === swimlaneId);
    if (index !== -1) {
      config.value.swimlanes.splice(index, 1);
      config.value.updatedAt = new Date().toISOString();
      generatePreview(5);
    }
  }

  /**
   * Reorder swimlanes
   */
  function reorderSwimlanes(swimlanes: SwimlaneConfig[]): void {
    config.value.swimlanes = swimlanes;
    config.value.updatedAt = new Date().toISOString();
  }

  /**
   * Apply a single block transformation to a value
   */
  function applyBlock(
    block: TransformBlock,
    value: string,
    row: string[],
    headers: string[]
  ): { value: string; removeRow: boolean; error?: string } {
    let result = value;
    let removeRow = false;
    let error: string | undefined;

    switch (block.type) {
      case 'column': {
        const colIndex = headers.indexOf(block.sourceColumn);
        result = colIndex >= 0 ? row[colIndex] || '' : '';
        break;
      }

      case 'static':
        result = block.value;
        break;

      case 'truncate':
        if (result.length > block.maxLength) {
          result = result.substring(0, block.maxLength);
          if (block.ellipsis) {
            result = result.substring(0, Math.max(0, block.maxLength - 3)) + '...';
          }
        }
        break;

      case 'dateFormat': {
        const dateResult = convertDateFormat(result, block.inputFormat, block.outputFormat);
        if (dateResult.error) {
          error = dateResult.error;
        }
        result = dateResult.value;
        break;
      }

      case 'numberFormat': {
        // Parse the number from input format
        let cleanedValue = result.trim();

        // Remove thousands separator if specified
        if (block.inputThousandsSeparator) {
          // Escape special regex characters
          const escapedSep = block.inputThousandsSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          cleanedValue = cleanedValue.replace(new RegExp(escapedSep, 'g'), '');
        }

        // Replace input decimal separator with dot for parsing
        if (block.inputDecimalSeparator === ',') {
          cleanedValue = cleanedValue.replace(',', '.');
        }

        // Remove any remaining non-numeric characters except dot and minus
        cleanedValue = cleanedValue.replace(/[^\d.-]/g, '');

        let num = parseFloat(cleanedValue);

        if (block.absolute) {
          num = Math.abs(num);
        }

        if (!isNaN(num)) {
          // Format with specified decimal places
          result = num.toFixed(block.decimals);

          // Apply output thousands separator if specified
          if (block.outputThousandsSeparator) {
            const parts = result.split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, block.outputThousandsSeparator);
            result = parts.join('.');
          }

          // Apply output decimal separator
          if (block.outputDecimalSeparator === ',') {
            result = result.replace('.', ',');
          }
        } else if (result.trim()) {
          error = `Cannot parse "${result}" as a number`;
        }
        break;
      }

      case 'conditional': {
        let condValue: string;
        if (block.condition.useCurrentValue) {
          condValue = result;
        } else {
          const condCol = headers.indexOf(block.condition.column);
          condValue = condCol >= 0 ? row[condCol] || '' : '';
        }
        const matches = evaluateCondition(
          condValue,
          block.condition.operator,
          block.condition.value
        );
        const blocksToExecute = matches ? block.thenBlocks : block.elseBlocks;

        // Execute nested blocks if any
        if (blocksToExecute.length > 0) {
          for (const nestedBlock of blocksToExecute) {
            const nestedResult = applyBlock(nestedBlock, result, row, headers);
            result = nestedResult.value;
            if (nestedResult.removeRow) {
              removeRow = true;
            }
            if (nestedResult.error && !error) {
              error = nestedResult.error;
            }
          }
        }
        // If no blocks defined, keep current value
        break;
      }

      case 'switchCase': {
        let switchValue: string;
        if (block.useCurrentValue) {
          switchValue = result;
        } else {
          const switchCol = headers.indexOf(block.column);
          switchValue = switchCol >= 0 ? row[switchCol] || '' : '';
        }
        let blocksToExecute: TransformBlock[] = block.defaultBlocks;
        for (const caseItem of block.cases) {
          if (evaluateCondition(switchValue, caseItem.operator, caseItem.value)) {
            blocksToExecute = caseItem.blocks;
            break;
          }
        }

        // Execute nested blocks if any
        if (blocksToExecute.length > 0) {
          for (const nestedBlock of blocksToExecute) {
            const nestedResult = applyBlock(nestedBlock, result, row, headers);
            result = nestedResult.value;
            if (nestedResult.removeRow) {
              removeRow = true;
            }
            if (nestedResult.error && !error) {
              error = nestedResult.error;
            }
          }
        }
        // If no blocks defined, keep current value
        break;
      }

      case 'removeRow': {
        const removeCol = headers.indexOf(block.condition.column);
        const removeValue = removeCol >= 0 ? row[removeCol] || '' : '';
        removeRow = evaluateCondition(removeValue, block.condition.operator, block.condition.value);
        break;
      }

      case 'prefix':
        result = block.prefix + result;
        break;

      case 'suffix':
        result = result + block.suffix;
        break;

      case 'replace': {
        if (block.useRegex) {
          try {
            const flags = block.caseInsensitive ? 'gi' : 'g';
            const regex = new RegExp(block.find, flags);
            result = result.replace(regex, block.replace);
          } catch (e) {
            error = `Invalid regex: ${e instanceof Error ? e.message : 'Unknown error'}`;
          }
        } else {
          if (block.caseInsensitive) {
            const regex = new RegExp(escapeRegex(block.find), 'gi');
            result = result.replace(regex, block.replace);
          } else {
            result = result.split(block.find).join(block.replace);
          }
        }
        break;
      }

      case 'customScript': {
        try {
          // Create a safe function from the script
          const fn = new Function('value', 'row', 'columns', block.script);
          const scriptResult = fn(result, row, headers);
          result = String(scriptResult ?? '');
        } catch (e) {
          error = `Script error: ${e instanceof Error ? e.message : 'Unknown error'}`;
        }
        break;
      }
    }

    return { value: result, removeRow, error };
  }

  /**
   * Evaluate a condition
   */
  function evaluateCondition(value: string, operator: string, compareValue: string): boolean {
    switch (operator) {
      case 'equals':
        return value === compareValue;
      case 'contains':
        return value.includes(compareValue);
      case 'startsWith':
        return value.startsWith(compareValue);
      case 'endsWith':
        return value.endsWith(compareValue);
      case 'greaterThan':
        return parseFloat(value) > parseFloat(compareValue);
      case 'lessThan':
        return parseFloat(value) < parseFloat(compareValue);
      case 'isEmpty':
        return !value || value.trim() === '';
      case 'isNotEmpty':
        return !!value && value.trim() !== '';
      case 'matches':
        try {
          return new RegExp(compareValue).test(value);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Convert date format using dayjs
   * Supports standard format tokens: YYYY, YY, MM, DD, HH, mm, ss, etc.
   * See: https://day.js.org/docs/en/parse/string-format
   */
  function convertDateFormat(
    value: string,
    inputFormat: string,
    outputFormat: string
  ): { value: string; error?: string } {
    if (!value) return { value: '' };

    const parsed = dayjs(value, inputFormat, true); // strict parsing
    if (!parsed.isValid()) {
      // Try non-strict parsing as fallback
      const looseParsed = dayjs(value, inputFormat);
      if (looseParsed.isValid()) {
        return { value: looseParsed.format(outputFormat) };
      }
      return {
        value: value,
        error: `Date "${value}" does not match format "${inputFormat}"`,
      };
    }

    return { value: parsed.format(outputFormat) };
  }

  /**
   * Escape special regex characters
   */
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Transform a row through all enabled swimlanes
   */
  function transformRow(
    row: string[],
    headers: string[],
    swimlanes: SwimlaneConfig[]
  ): { values: Record<string, string>; removeRow: boolean; errors: Record<string, SwimlaneError> } {
    const values: Record<string, string> = {};
    const errors: Record<string, SwimlaneError> = {};
    let removeRow = false;

    for (const swimlane of swimlanes) {
      if (!swimlane.enabled) continue;

      let value = '';
      for (const block of swimlane.blocks) {
        const result = applyBlock(block, value, row, headers);
        value = result.value;
        if (result.removeRow) {
          removeRow = true;
        }
        if (result.error && !errors[swimlane.id]) {
          errors[swimlane.id] = {
            swimlaneId: swimlane.id,
            column: swimlane.targetColumn,
            message: result.error,
            blockType: block.type,
          };
        }
      }
      values[swimlane.targetColumn] = value;
    }

    return { values, removeRow, errors };
  }

  /**
   * Generate preview of the transformation
   */
  function generatePreview(maxRows = 10): void {
    if (!parsedCSV.value) {
      preview.value = null;
      return;
    }

    const enabledSwimlanes = config.value.swimlanes.filter((s) => s.enabled);
    const previewHeaders = enabledSwimlanes.map((s) => s.targetColumn);
    const previewRows: string[][] = [];
    const errors: TransformPreview['errors'] = [];
    const swimlaneErrors: Record<string, SwimlaneError> = {};
    const swimlanePreviewValues: Record<string, string> = {};
    let removedRows = 0;

    const rowsToProcess = parsedCSV.value.rows.slice(0, maxRows);

    // Process first row to get preview values and errors for swimlanes
    if (rowsToProcess.length > 0) {
      const firstRow = rowsToProcess[0];
      const firstResult = transformRow(firstRow, parsedCSV.value.headers, enabledSwimlanes);

      // Capture errors from first row for swimlane display
      Object.assign(swimlaneErrors, firstResult.errors);

      // Capture preview values per swimlane
      for (const swimlane of enabledSwimlanes) {
        swimlanePreviewValues[swimlane.id] = firstResult.values[swimlane.targetColumn] || '';
      }
    }

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      try {
        const { values, removeRow } = transformRow(row, parsedCSV.value.headers, enabledSwimlanes);

        if (removeRow) {
          removedRows++;
          continue;
        }

        const previewRow = enabledSwimlanes.map((s) => values[s.targetColumn] || '');
        previewRows.push(previewRow);
      } catch (e) {
        errors.push({
          row: i + 1,
          column: '',
          message: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    preview.value = {
      headers: previewHeaders,
      rows: previewRows,
      errors,
      swimlaneErrors,
      swimlanePreviewValues,
      removedRows,
    };
  }

  /**
   * Get all transformed data as array of objects
   */
  function getTransformedData(): TransformedTransaction[] {
    if (!parsedCSV.value) {
      return [];
    }

    const enabledSwimlanes = config.value.swimlanes.filter((s) => s.enabled);
    const transactions: TransformedTransaction[] = [];

    for (const row of parsedCSV.value.rows) {
      const { values, removeRow } = transformRow(row, parsedCSV.value.headers, enabledSwimlanes);
      if (!removeRow) {
        transactions.push(values);
      }
    }

    return transactions;
  }

  /**
   * Validate transformed data for Firefly import
   */
  function validateForImport(): ImportValidation {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    // Get current configuration's enabled columns
    const enabledColumns = config.value.swimlanes
      .filter((s) => s.enabled)
      .map((s) => s.targetColumn);

    // Check for required columns
    const requiredColumns: FireflyImportColumn[] = ['type', 'date', 'amount', 'description'];
    for (const col of requiredColumns) {
      if (!enabledColumns.includes(col)) {
        errors.push({
          type: 'missing_column',
          message: `Missing required column: ${col}`,
          column: col,
        });
      }
    }

    // Must have source_name or destination_name (or both)
    const hasSourceName = enabledColumns.includes('source_name');
    const hasDestinationName = enabledColumns.includes('destination_name');
    if (!hasSourceName && !hasDestinationName) {
      errors.push({
        type: 'missing_account',
        message: 'Must have either Source Account or Destination Account column',
      });
    }

    // If there are structural errors, return early
    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        warnings,
        summary: {
          totalRows: parsedCSV.value?.rows.length || 0,
          validRows: 0,
          rowsWithErrors: 0,
          rowsRemoved: 0,
        },
      };
    }

    // Now validate actual data
    const transactions = getTransformedData();
    let validRows = 0;
    let rowsWithErrors = 0;
    const rowsRemoved = (parsedCSV.value?.rows.length || 0) - transactions.length;

    // Track error types for summary
    const invalidTypes: number[] = [];
    const invalidDates: number[] = [];
    const invalidOptionalDates: number[] = [];
    const invalidAmounts: number[] = [];
    const commaAmounts: number[] = [];
    const negativeAmounts: number[] = [];
    const missingAccounts: number[] = [];

    // Optional date fields that need YYYY-MM-DD format if present
    const optionalDateFields = [
      'book_date',
      'interest_date',
      'process_date',
      'due_date',
      'payment_date',
      'invoice_date',
    ] as const;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const rowNum = i + 1;
      let rowValid = true;

      // Validate type
      const txType = tx.type?.toLowerCase().trim();
      if (
        !txType ||
        !VALID_TRANSACTION_TYPES.includes(txType as (typeof VALID_TRANSACTION_TYPES)[number])
      ) {
        invalidTypes.push(rowNum);
        rowValid = false;
      }

      // Validate date (should be YYYY-MM-DD)
      const dateValue = tx.date;
      if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        invalidDates.push(rowNum);
        rowValid = false;
      }

      // Validate amount (should be a valid positive number with dot notation)
      const amountValue = tx.amount?.trim() || '';

      // Check for comma decimal separator (e.g., "7,58" instead of "7.58")
      if (amountValue && /^-?\d+,\d+$/.test(amountValue)) {
        commaAmounts.push(rowNum);
        rowValid = false;
      } else {
        const parsedAmount = parseFloat(amountValue);
        if (!amountValue || isNaN(parsedAmount)) {
          invalidAmounts.push(rowNum);
          rowValid = false;
        } else if (parsedAmount <= 0) {
          negativeAmounts.push(rowNum);
          rowValid = false;
        }
      }

      // Validate account based on transaction type
      if (txType === 'withdrawal' || txType === 'transfer') {
        // Withdrawal needs source_name
        if (!tx.source_name?.trim()) {
          missingAccounts.push(rowNum);
          rowValid = false;
        }
      }
      if (txType === 'deposit' || txType === 'transfer') {
        // Deposit needs destination_name
        if (!tx.destination_name?.trim()) {
          missingAccounts.push(rowNum);
          rowValid = false;
        }
      }

      // Validate optional date fields (must be YYYY-MM-DD if present)
      for (const dateField of optionalDateFields) {
        const dateVal = tx[dateField]?.trim();
        if (dateVal && !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
          invalidOptionalDates.push(rowNum);
          rowValid = false;
          break; // Only count row once even if multiple date fields are invalid
        }
      }

      if (rowValid) {
        validRows++;
      } else {
        rowsWithErrors++;
      }
    }

    // Create summary errors
    if (invalidTypes.length > 0) {
      errors.push({
        type: 'invalid_type',
        message: `${invalidTypes.length} rows have invalid type (must be withdrawal, deposit, or transfer)`,
        count: invalidTypes.length,
      });
    }

    if (invalidDates.length > 0) {
      errors.push({
        type: 'invalid_date',
        message: `${invalidDates.length} rows have invalid date format (must be YYYY-MM-DD)`,
        count: invalidDates.length,
      });
    }

    if (invalidOptionalDates.length > 0) {
      errors.push({
        type: 'invalid_date',
        message: `${invalidOptionalDates.length} rows have invalid optional date format (book_date, interest_date, etc. must be YYYY-MM-DD)`,
        count: invalidOptionalDates.length,
      });
    }

    if (invalidAmounts.length > 0) {
      errors.push({
        type: 'invalid_amount',
        message: `${invalidAmounts.length} rows have invalid amount (must be a number)`,
        count: invalidAmounts.length,
      });
    }

    if (commaAmounts.length > 0) {
      errors.push({
        type: 'comma_amount',
        message: `${commaAmounts.length} rows use comma as decimal separator (e.g., "7,58"). Use a Replace block to convert commas to dots.`,
        count: commaAmounts.length,
      });
    }

    if (negativeAmounts.length > 0) {
      errors.push({
        type: 'negative_amount',
        message: `${negativeAmounts.length} rows have negative or zero amounts (Firefly III requires positive amounts)`,
        count: negativeAmounts.length,
      });
    }

    if (missingAccounts.length > 0) {
      errors.push({
        type: 'missing_account',
        message: `${missingAccounts.length} rows have missing account names`,
        count: missingAccounts.length,
      });
    }

    // Warnings for optional fields with foreign currency
    const hasForeignAmount = enabledColumns.includes('foreign_amount');
    const hasForeignCurrency = enabledColumns.includes('foreign_currency_code');
    if (hasForeignAmount && !hasForeignCurrency) {
      warnings.push({
        type: 'general',
        message: 'Foreign Amount is set but Foreign Currency Code is missing',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalRows: parsedCSV.value?.rows.length || 0,
        validRows,
        rowsWithErrors,
        rowsRemoved,
      },
    };
  }

  /**
   * Import transactions to Firefly III with streaming progress
   */
  async function importToFirefly(
    options?: ImportOptions
  ): Promise<{ successful: number; failed: number; errors: string[] }> {
    const transactions = getTransformedData();

    if (transactions.length === 0) {
      throw new Error('No transactions to import');
    }

    processing.value = true;
    importProgress.value = { current: 0, total: transactions.length };

    // Build headers with CSRF token
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) {
      headers[CSRF_TOKEN_HEADER] = csrfToken;
    }

    return new Promise((resolve, reject) => {
      fetch('/api/converter/stream-import', {
        method: 'POST',
        headers,
        credentials: 'include', // Send session cookie
        body: JSON.stringify({
          transactions,
          options: {
            tags: options?.tags || '',
            applyRules: options?.applyRules ?? true,
            errorIfDuplicate: options?.errorIfDuplicate ?? true,
          },
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to start import');
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body');
          }

          const decoder = new TextDecoder();
          let buffer = '';
          let result: { successful: number; failed: number; errors: string[] } | null = null;

          const processChunk = (chunk: string) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));

                  if (event.type === 'progress') {
                    importProgress.value = {
                      current: event.data.current,
                      total: event.data.total,
                    };
                  } else if (event.type === 'result') {
                    result = event.data;
                  } else if (event.type === 'error') {
                    reject(new Error(event.data.message));
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }
          };

          const read = (): Promise<void> => {
            return reader.read().then(({ done, value }) => {
              if (done) {
                processing.value = false;
                importProgress.value = null;
                if (result) {
                  resolve(result);
                } else {
                  reject(new Error('Import completed without result'));
                }
                return;
              }
              processChunk(decoder.decode(value, { stream: true }));
              return read();
            });
          };

          read().catch((err) => {
            processing.value = false;
            importProgress.value = null;
            reject(err);
          });
        })
        .catch((err) => {
          processing.value = false;
          importProgress.value = null;
          reject(err);
        });
    });
  }

  /**
   * Export all data as CSV
   */
  function exportCSV(): string {
    if (!parsedCSV.value) {
      throw new Error('No CSV data loaded');
    }

    const enabledSwimlanes = config.value.swimlanes.filter((s) => s.enabled);
    const headers = enabledSwimlanes.map((s) => s.targetColumn);
    const rows: string[][] = [];

    for (const row of parsedCSV.value.rows) {
      const { values, removeRow } = transformRow(row, parsedCSV.value.headers, enabledSwimlanes);

      if (removeRow) continue;

      const outputRow = enabledSwimlanes.map((s) => values[s.targetColumn] || '');
      rows.push(outputRow);
    }

    // Build CSV output using export options
    const delimiter = config.value.exportOptions?.delimiter || ',';
    const quote = config.value.exportOptions?.quoteChar || '"';
    const quoteMode = config.value.exportOptions?.quoteMode || 'needed';
    const lineEnding = config.value.exportOptions?.lineEnding === 'crlf' ? '\r\n' : '\n';

    const escapeValue = (val: string): string => {
      const needsQuoting =
        val.includes(delimiter) || val.includes(quote) || val.includes('\n') || val.includes('\r');

      if (quoteMode === 'never') {
        // Never quote - just escape the delimiter if present (not recommended)
        return val;
      } else if (quoteMode === 'always') {
        // Always quote all values
        return quote + val.replace(new RegExp(quote, 'g'), quote + quote) + quote;
      } else {
        // Quote only when needed (default)
        if (needsQuoting) {
          return quote + val.replace(new RegExp(quote, 'g'), quote + quote) + quote;
        }
        return val;
      }
    };

    const headerLine = headers.map(escapeValue).join(delimiter);
    const dataLines = rows.map((row) => row.map(escapeValue).join(delimiter));

    return [headerLine, ...dataLines].join(lineEnding) + lineEnding;
  }

  /**
   * Download the transformed CSV
   */
  function downloadCSV(filename = 'converted.csv'): void {
    const csv = exportCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /**
   * Save configuration to JSON string
   */
  function saveConfig(): string {
    return JSON.stringify(config.value, null, 2);
  }

  /**
   * Load configuration from JSON string
   */
  function loadConfig(json: string): void {
    try {
      const loaded = JSON.parse(json) as ConverterConfig;
      // Validate basic structure
      if (!loaded.swimlanes || !Array.isArray(loaded.swimlanes)) {
        throw new Error('Invalid configuration: missing swimlanes');
      }
      // Ensure exportOptions exists (for older configs)
      if (!loaded.exportOptions) {
        loaded.exportOptions = {
          delimiter: ',',
          quoteChar: '"',
          quoteMode: 'needed',
          lineEnding: 'lf',
        };
      } else if (!loaded.exportOptions.lineEnding) {
        loaded.exportOptions.lineEnding = 'lf';
      }
      config.value = loaded;
      if (parsedCSV.value) {
        generatePreview(5);
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load configuration';
    }
  }

  /**
   * Reset converter state
   */
  function reset(): void {
    parsedCSV.value = null;
    config.value = createDefaultConfig();
    preview.value = null;
    error.value = null;
    currentFile.value = null;
    importProgress.value = null;
  }

  return {
    // State
    parsedCSV,
    config,
    preview,
    processing,
    error,
    currentFile,
    importProgress,
    // Actions
    parseCSV,
    updateSwimlaneBlocks,
    updateSwimlaneEnabled,
    addSwimlane,
    removeSwimlane,
    reorderSwimlanes,
    generatePreview,
    getTransformedData,
    validateForImport,
    importToFirefly,
    exportCSV,
    downloadCSV,
    saveConfig,
    loadConfig,
    reset,
  };
}
