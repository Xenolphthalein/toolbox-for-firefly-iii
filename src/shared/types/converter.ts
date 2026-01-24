// Bank Export Converter Types

/**
 * Firefly III import column types that can be mapped to
 */
export type FireflyImportColumn =
  | 'type'
  | 'date'
  | 'amount'
  | 'description'
  | 'currency_code'
  | 'foreign_amount'
  | 'foreign_currency_code'
  | 'budget_name'
  | 'category_name'
  | 'source_name'
  | 'destination_name'
  | 'tags'
  | 'notes'
  | 'internal_reference'
  | 'external_id'
  | 'external_url'
  | 'sepa_cc'
  | 'sepa_ct_op'
  | 'sepa_ct_id'
  | 'sepa_db'
  | 'sepa_country'
  | 'sepa_ep'
  | 'sepa_ci'
  | 'sepa_batch_id'
  | 'interest_date'
  | 'book_date'
  | 'process_date'
  | 'due_date'
  | 'payment_date'
  | 'invoice_date';

/**
 * Configuration for the Firefly columns
 */
export const FIREFLY_COLUMNS: Array<{
  id: FireflyImportColumn;
  label: string;
  description: string;
  required: boolean;
}> = [
  {
    id: 'type',
    label: 'Type',
    description: 'Transaction type (withdrawal, deposit, transfer)',
    required: true,
  },
  { id: 'date', label: 'Date', description: 'Transaction date', required: true },
  {
    id: 'amount',
    label: 'Amount',
    description: 'Transaction amount (positive value)',
    required: true,
  },
  {
    id: 'description',
    label: 'Description',
    description: 'Transaction description',
    required: true,
  },
  {
    id: 'currency_code',
    label: 'Currency',
    description: 'Currency code (e.g., EUR, USD)',
    required: false,
  },
  {
    id: 'foreign_amount',
    label: 'Foreign Amount',
    description: 'Amount in foreign currency',
    required: false,
  },
  {
    id: 'foreign_currency_code',
    label: 'Foreign Currency',
    description: 'Foreign currency code',
    required: false,
  },
  { id: 'budget_name', label: 'Budget', description: 'Budget name', required: false },
  { id: 'category_name', label: 'Category', description: 'Category name', required: false },
  {
    id: 'source_name',
    label: 'Source Account',
    description: 'Source account name',
    required: false,
  },
  {
    id: 'destination_name',
    label: 'Destination Account',
    description: 'Destination account name',
    required: false,
  },
  { id: 'tags', label: 'Tags', description: 'Comma-separated tags', required: false },
  { id: 'notes', label: 'Notes', description: 'Additional notes', required: false },
  {
    id: 'internal_reference',
    label: 'Internal Reference',
    description: 'Internal reference ID',
    required: false,
  },
  {
    id: 'external_id',
    label: 'External ID',
    description: 'External ID from source',
    required: false,
  },
  { id: 'external_url', label: 'External URL', description: 'External URL link', required: false },
  { id: 'sepa_cc', label: 'SEPA CC', description: 'SEPA Clearing Code', required: false },
  {
    id: 'sepa_ct_op',
    label: 'SEPA CT OP',
    description: 'SEPA Credit Transfer Originator Party',
    required: false,
  },
  {
    id: 'sepa_ct_id',
    label: 'SEPA CT ID',
    description: 'SEPA Credit Transfer ID',
    required: false,
  },
  { id: 'sepa_db', label: 'SEPA DB', description: 'SEPA Direct Debit', required: false },
  { id: 'sepa_country', label: 'SEPA Country', description: 'SEPA Country Code', required: false },
  { id: 'sepa_ep', label: 'SEPA EP', description: 'SEPA End-to-End Reference', required: false },
  { id: 'sepa_ci', label: 'SEPA CI', description: 'SEPA Creditor Identifier', required: false },
  { id: 'sepa_batch_id', label: 'SEPA Batch ID', description: 'SEPA Batch ID', required: false },
  {
    id: 'interest_date',
    label: 'Interest Date',
    description: 'Interest calculation date',
    required: false,
  },
  { id: 'book_date', label: 'Book Date', description: 'Booking date', required: false },
  { id: 'process_date', label: 'Process Date', description: 'Processing date', required: false },
  { id: 'due_date', label: 'Due Date', description: 'Due date', required: false },
  { id: 'payment_date', label: 'Payment Date', description: 'Payment date', required: false },
  { id: 'invoice_date', label: 'Invoice Date', description: 'Invoice date', required: false },
];

/**
 * Valid transaction type values for Firefly III API
 */
export const VALID_TRANSACTION_TYPES = ['withdrawal', 'deposit', 'transfer'] as const;
export type TransactionType = (typeof VALID_TRANSACTION_TYPES)[number];

/**
 * Validation result for import readiness
 */
export interface ImportValidation {
  /** Whether the data is valid for import */
  valid: boolean;
  /** Critical errors that prevent import */
  errors: ValidationIssue[];
  /** Non-critical warnings */
  warnings: ValidationIssue[];
  /** Summary counts */
  summary: {
    totalRows: number;
    validRows: number;
    rowsWithErrors: number;
    rowsRemoved: number;
  };
}

/**
 * Single validation issue (error or warning)
 */
export interface ValidationIssue {
  /** Issue type */
  type:
    | 'missing_column'
    | 'invalid_type'
    | 'invalid_date'
    | 'invalid_amount'
    | 'comma_amount'
    | 'negative_amount'
    | 'missing_account'
    | 'missing_value'
    | 'general';
  /** Human-readable message */
  message: string;
  /** Row number (1-indexed) if applicable */
  row?: number;
  /** Column name if applicable */
  column?: string;
  /** Count of affected items if applicable */
  count?: number;
}

/**
 * Transformed data for import
 */
export interface TransformedTransaction {
  [key: string]: string;
}

/**
 * Block types available for transformation
 */
export type TransformBlockType =
  | 'column'
  | 'static'
  | 'truncate'
  | 'dateFormat'
  | 'numberFormat'
  | 'conditional'
  | 'switchCase'
  | 'removeRow'
  | 'prefix'
  | 'suffix'
  | 'replace'
  | 'customScript';

/**
 * Base block interface
 */
export interface TransformBlockBase {
  id: string;
  type: TransformBlockType;
}

/**
 * Column reference block - maps a source column directly
 */
export interface ColumnBlock extends TransformBlockBase {
  type: 'column';
  sourceColumn: string;
}

/**
 * Static value block - sets a fixed value
 */
export interface StaticBlock extends TransformBlockBase {
  type: 'static';
  value: string;
}

/**
 * Truncate block - truncates value to max length
 */
export interface TruncateBlock extends TransformBlockBase {
  type: 'truncate';
  maxLength: number;
  ellipsis: boolean;
}

/**
 * Date format block - converts date to specified format
 */
export interface DateFormatBlock extends TransformBlockBase {
  type: 'dateFormat';
  inputFormat: string;
  outputFormat: string;
}

/**
 * Number format block - parses numbers from various formats and outputs in a specified format
 */
export interface NumberFormatBlock extends TransformBlockBase {
  type: 'numberFormat';
  /** The decimal separator used in the INPUT data */
  inputDecimalSeparator: '.' | ',';
  /** The thousands separator used in the INPUT data (empty string means none) */
  inputThousandsSeparator: '' | '.' | ',' | ' ';
  /** The decimal separator to use in the OUTPUT */
  outputDecimalSeparator: '.' | ',';
  /** The thousands separator to use in the OUTPUT (empty string means none) */
  outputThousandsSeparator: '' | '.' | ',' | ' ';
  /** Number of decimal places in OUTPUT */
  decimals: number;
  /** Convert to absolute value (remove negative sign) */
  absolute: boolean;
}

/**
 * Condition configuration used by conditional and switch case blocks
 */
export interface BlockCondition {
  useCurrentValue: boolean;
  column: string;
  operator:
    | 'equals'
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'greaterThan'
    | 'lessThan'
    | 'isEmpty'
    | 'isNotEmpty'
    | 'matches';
  value: string;
}

/**
 * Conditional block - executes nested blocks based on condition
 * Note: TransformBlock is defined later, so we use a forward reference pattern
 */
export interface ConditionalBlock extends TransformBlockBase {
  type: 'conditional';
  condition: BlockCondition;
  thenBlocks: TransformBlock[];
  elseBlocks: TransformBlock[];
}

/**
 * Switch case block - multiple conditions with nested block outputs
 */
export interface SwitchCaseBlock extends TransformBlockBase {
  type: 'switchCase';
  useCurrentValue: boolean;
  column: string;
  cases: Array<{
    operator:
      | 'equals'
      | 'contains'
      | 'startsWith'
      | 'endsWith'
      | 'greaterThan'
      | 'lessThan'
      | 'isEmpty'
      | 'isNotEmpty'
      | 'matches';
    value: string;
    blocks: TransformBlock[];
  }>;
  defaultBlocks: TransformBlock[];
}

/**
 * Remove row block - removes row if condition is met
 */
export interface RemoveRowBlock extends TransformBlockBase {
  type: 'removeRow';
  condition: {
    column: string;
    operator:
      | 'equals'
      | 'contains'
      | 'startsWith'
      | 'endsWith'
      | 'greaterThan'
      | 'lessThan'
      | 'isEmpty'
      | 'isNotEmpty'
      | 'matches';
    value: string;
  };
}

/**
 * Prefix block - adds prefix to value
 */
export interface PrefixBlock extends TransformBlockBase {
  type: 'prefix';
  prefix: string;
}

/**
 * Suffix block - adds suffix to value
 */
export interface SuffixBlock extends TransformBlockBase {
  type: 'suffix';
  suffix: string;
}

/**
 * Replace block - find and replace text
 */
export interface ReplaceBlock extends TransformBlockBase {
  type: 'replace';
  find: string;
  replace: string;
  useRegex: boolean;
  caseInsensitive: boolean;
}

/**
 * Custom script block - JavaScript function for transformation
 */
export interface CustomScriptBlock extends TransformBlockBase {
  type: 'customScript';
  script: string; // JavaScript function body: (value, row, columnIndex) => newValue
}

/**
 * Union of all block types
 */
export type TransformBlock =
  | ColumnBlock
  | StaticBlock
  | TruncateBlock
  | DateFormatBlock
  | NumberFormatBlock
  | ConditionalBlock
  | SwitchCaseBlock
  | RemoveRowBlock
  | PrefixBlock
  | SuffixBlock
  | ReplaceBlock
  | CustomScriptBlock;

/**
 * Configuration for a single swimlane (output column)
 */
export interface SwimlaneConfig {
  id: string;
  targetColumn: FireflyImportColumn;
  blocks: TransformBlock[];
  enabled: boolean;
}

/**
 * Complete converter configuration that can be saved/loaded
 */
export interface ConverterConfig {
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  csvOptions: {
    delimiter: string;
    quoteChar: string;
    hasHeader: boolean;
    skipRows: number;
    encoding: string;
  };
  exportOptions: {
    delimiter: string;
    quoteChar: string;
    quoteMode: 'always' | 'needed' | 'never';
    lineEnding: 'lf' | 'crlf';
  };
  swimlanes: SwimlaneConfig[];
}

/**
 * Parsed CSV data from uploaded file
 */
export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  rawContent: string;
}

/**
 * Error from a swimlane transformation
 */
export interface SwimlaneError {
  swimlaneId: string;
  column: string;
  message: string;
  blockType?: string;
}

/**
 * Preview data for transformation result
 */
export interface TransformPreview {
  headers: string[];
  rows: string[][];
  /** Per-row errors (legacy) */
  errors: Array<{
    row: number;
    column: string;
    message: string;
  }>;
  /** Errors per swimlane (for preview display) */
  swimlaneErrors: Record<string, SwimlaneError>;
  /** Preview values per swimlane */
  swimlanePreviewValues: Record<string, string>;
  removedRows: number;
}

/**
 * Block type metadata for UI
 */
export interface BlockTypeInfo {
  type: TransformBlockType;
  label: string;
  description: string;
  icon: string;
  color: string;
}

/**
 * Available block types with UI metadata
 */
export const BLOCK_TYPES: BlockTypeInfo[] = [
  {
    type: 'column',
    label: 'Source Column',
    description: 'Map a column from the source CSV',
    icon: 'mdi-table-column',
    color: 'blue',
  },
  {
    type: 'static',
    label: 'Static Value',
    description: 'Set a fixed value',
    icon: 'mdi-text-box',
    color: 'grey',
  },
  {
    type: 'truncate',
    label: 'Truncate',
    description: 'Limit text to max length',
    icon: 'mdi-content-cut',
    color: 'orange',
  },
  {
    type: 'dateFormat',
    label: 'Date Format',
    description: 'Convert date format',
    icon: 'mdi-calendar',
    color: 'purple',
  },
  {
    type: 'numberFormat',
    label: 'Number Format',
    description: 'Format numbers',
    icon: 'mdi-numeric',
    color: 'teal',
  },
  {
    type: 'conditional',
    label: 'Conditional',
    description: 'Set value based on condition',
    icon: 'mdi-help-rhombus',
    color: 'amber',
  },
  {
    type: 'switchCase',
    label: 'Switch Case',
    description: 'Multiple conditions with different outputs',
    icon: 'mdi-source-branch',
    color: 'lime',
  },
  {
    type: 'removeRow',
    label: 'Remove Row',
    description: 'Remove row if condition is met',
    icon: 'mdi-table-row-remove',
    color: 'red',
  },
  {
    type: 'prefix',
    label: 'Prefix',
    description: 'Add text before value',
    icon: 'mdi-format-horizontal-align-left',
    color: 'indigo',
  },
  {
    type: 'suffix',
    label: 'Suffix',
    description: 'Add text after value',
    icon: 'mdi-format-horizontal-align-right',
    color: 'indigo',
  },
  {
    type: 'replace',
    label: 'Replace',
    description: 'Find and replace text',
    icon: 'mdi-find-replace',
    color: 'cyan',
  },
  {
    type: 'customScript',
    label: 'Custom Script',
    description: 'JavaScript transformation',
    icon: 'mdi-code-braces',
    color: 'deep-purple',
  },
];

/**
 * Create a new block with default values
 */
export function createBlock(type: TransformBlockType): TransformBlock {
  const id = crypto.randomUUID();

  switch (type) {
    case 'column':
      return { id, type, sourceColumn: '' };
    case 'static':
      return { id, type, value: '' };
    case 'truncate':
      return { id, type, maxLength: 100, ellipsis: true };
    case 'dateFormat':
      return { id, type, inputFormat: 'DD.MM.YYYY', outputFormat: 'YYYY-MM-DD' };
    case 'numberFormat':
      return {
        id,
        type,
        inputDecimalSeparator: ',',
        inputThousandsSeparator: '',
        outputDecimalSeparator: '.',
        outputThousandsSeparator: '',
        decimals: 2,
        absolute: false,
      };
    case 'conditional':
      return {
        id,
        type,
        condition: { useCurrentValue: false, column: '', operator: 'equals', value: '' },
        thenBlocks: [],
        elseBlocks: [],
      };
    case 'switchCase':
      return {
        id,
        type,
        useCurrentValue: false,
        column: '',
        cases: [{ operator: 'equals', value: '', blocks: [] }],
        defaultBlocks: [],
      };
    case 'removeRow':
      return { id, type, condition: { column: '', operator: 'equals', value: '' } };
    case 'prefix':
      return { id, type, prefix: '' };
    case 'suffix':
      return { id, type, suffix: '' };
    case 'replace':
      return { id, type, find: '', replace: '', useRegex: false, caseInsensitive: false };
    case 'customScript':
      return {
        id,
        type,
        script:
          '// value: current value\n// row: full row data as array\n// columns: header names\nreturn value;',
      };
  }
}

/**
 * Create a new swimlane with default config
 */
export function createSwimlane(targetColumn: FireflyImportColumn): SwimlaneConfig {
  return {
    id: crypto.randomUUID(),
    targetColumn,
    blocks: [createBlock('column')],
    enabled: true,
  };
}

/**
 * Create a default converter config
 */
export function createDefaultConfig(): ConverterConfig {
  return {
    name: 'New Configuration',
    description: '',
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    csvOptions: {
      delimiter: ',',
      quoteChar: '"',
      hasHeader: true,
      skipRows: 0,
      encoding: 'UTF-8',
    },
    exportOptions: {
      delimiter: ',',
      quoteChar: '"',
      quoteMode: 'needed',
      lineEnding: 'lf',
    },
    swimlanes: [
      createSwimlane('date'),
      createSwimlane('description'),
      createSwimlane('amount'),
      createSwimlane('type'),
    ],
  };
}
