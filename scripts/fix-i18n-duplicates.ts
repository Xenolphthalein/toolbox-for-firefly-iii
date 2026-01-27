#!/usr/bin/env npx tsx
/**
 * i18n Duplicate Fixer
 *
 * This script consolidates duplicate translation values by:
 * 1. Identifying all duplicate values
 * 2. Selecting a canonical key (preferring common.* keys)
 * 3. Updating all source files to use the canonical key
 * 4. Removing duplicate keys from the translation file
 *
 * Usage:
 *   npx tsx scripts/fix-i18n-duplicates.ts [options]
 *
 * Options:
 *   --dry-run    Show what would be changed without making changes
 *   --verbose    Show detailed progress information
 */

import * as fs from 'fs';
import * as path from 'path';

interface DuplicateGroup {
  value: string;
  keys: string[];
}

interface KeyMapping {
  oldKey: string;
  newKey: string;
  isNew: boolean; // true if the newKey needs to be created in the translation file
  value?: string; // the value to set for new keys
}

interface Options {
  dryRun: boolean;
  verbose: boolean;
}

// Parse command line arguments
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false,
    verbose: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
i18n Duplicate Fixer

Usage: npx tsx scripts/fix-i18n-duplicates.ts [options]

Options:
  --dry-run    Show what would be changed without making changes
  --verbose    Show detailed progress information
  --help, -h   Show this help message
`);
        process.exit(0);
    }
  }

  return options;
}

// Priority order for selecting canonical key (lower index = higher priority)
const KEY_PRIORITY = [
  /^common\.buttons\./,
  /^common\.labels\./,
  /^common\.messages\./,
  /^common\.status\./,
  /^common\.errors\./,
  /^common\.steps\./,
  /^common\./,
  /^settings\./,
  /^navigation\./,
  /^components\./,
  /^views\./,
  /^tools\./,
  /^app\./,
];

// Keys that should be promoted to common.* when duplicated across views
const COMMON_KEY_PROMOTIONS: Record<string, string> = {
  // Steps
  'Date Range': 'common.steps.dateRange',
  'Find & Review': 'common.steps.findReview',
  'Review & Apply': 'common.steps.reviewApply',
  'Match & Review': 'common.steps.matchReview',
  'Preview & Export': 'common.steps.previewExport',
  'Upload CSV': 'common.steps.uploadCSV',
  'Configure Mapping': 'common.steps.configureMapping',
  'Connect & Fetch': 'common.steps.connectFetch',
  'Transform': 'common.steps.transform',
  'Select transactions to analyze': 'common.steps.selectTransactionsToAnalyze',
  'Select transactions to match': 'common.steps.selectTransactionsToMatch',
  'Select your bank export file': 'common.steps.selectBankExport',
  'Review and apply changes': 'common.steps.reviewAndApplyChanges',
  'Review and download converted file': 'common.steps.reviewAndDownload',
  'Review and import': 'common.steps.reviewAndImport',
  'Load bank transactions': 'common.steps.loadBankTransactions',
  'Map columns and add transformations': 'common.steps.mapColumns',
  'Review and apply AI suggestions': 'common.steps.reviewAISuggestions',
  'Review and apply AI tag suggestions': 'common.steps.reviewAITagSuggestions',
  'Review and delete duplicates': 'common.steps.reviewDeleteDuplicates',
  'Review and create subscriptions': 'common.steps.reviewCreateSubscriptions',

  // Common messages
  'Ready to analyze': 'common.messages.readyToAnalyze',
  'Ready to match': 'common.messages.readyToMatch',
  'No transactions found': 'common.messages.noTransactionsFound',
  'No transactions loaded': 'common.messages.noTransactionsLoaded',
  'No preview available': 'common.messages.noPreviewAvailable',
  'No data to preview': 'common.messages.noDataToPreview',
  'An error occurred': 'common.errors.anErrorOccurred',
  'Failed to get suggestions': 'common.errors.failedToGetSuggestions',
  'Failed to match transactions': 'common.errors.failedToMatchTransactions',
  'Failed to apply descriptions': 'common.errors.failedToApplyDescriptions',
  'Analyzing transaction {current} of {total}...': 'common.messages.analyzingTransaction',
  'Matching transaction {current} of {total}...': 'common.messages.matchingTransaction',
  'Connecting to AI...': 'common.messages.connectingToAI',
  'Please acknowledge AI data sharing in Settings first': 'common.messages.acknowledgeAIFirst',
  'Processing...': 'common.messages.processing',
  'Import Complete': 'common.messages.importComplete',
  '{count} item(s) skipped due to data errors. Check console for details.': 'common.messages.itemsSkippedSimple',
  '{count, plural, one {# item skipped} other {# items skipped}} due to data errors. Check console for details.': 'common.messages.itemsSkipped',

  // Common labels  
  'Confidence Breakdown': 'common.labels.confidenceBreakdown',
  'Description Match': 'common.labels.descriptionMatch',
  'Amount Match': 'common.labels.amountMatch',
  'Exact Amount Bonus': 'common.labels.exactAmountBonus',
  'Date Proximity': 'common.labels.dateProximity',
  'Interval Consistency': 'common.labels.intervalConsistency',
  'Occurrence Count': 'common.labels.occurrenceCount',
  'Amount Consistency': 'common.labels.amountConsistency',
  'Payment Service': 'common.labels.paymentService',
  'Column Mapping': 'common.labels.columnMapping',
  'Data Preview': 'common.labels.dataPreview',
  'Output Filename': 'common.labels.outputFilename',
  'Transactions Preview': 'common.labels.transactionsPreview',
  'No match': 'common.labels.noMatch',
  '{count} matches': 'common.labels.countMatches',
  '{count} unmatched': 'common.labels.countUnmatched',
  '{count} transactions': 'common.labels.countTransactions',
  'total transactions': 'common.labels.totalTransactions',
  '{count} output columns': 'common.labels.countOutputColumns',
  '{count} rows removed': 'common.labels.countRowsRemoved',
  '{count} errors detected:': 'common.labels.countErrorsDetected',
  '{count} transactions loaded': 'common.labels.countTransactionsLoaded',
  'Row {row}: {message}': 'common.labels.rowError',
  '...and {count, plural, one {# more} other {# more}}': 'common.labels.andMore',
  'Showing first 10 of {total} transactions': 'common.labels.showingFirst10Transactions',
  'Select All Matches': 'common.labels.selectAllMatches',
  'Hide already processed transactions': 'common.labels.hideAlreadyProcessed',
  'Ready to import {count} transactions': 'common.labels.readyToImportCount',

  // Common buttons
  'Get AI Suggestions': 'common.buttons.getAISuggestions',
  'Match Transactions': 'common.buttons.matchTransactions',
  'Find Subscriptions': 'common.buttons.findSubscriptions',
  'Find Duplicates': 'common.buttons.findDuplicates',
  'Create Subscription': 'common.buttons.createSubscription',
  'How to use': 'common.buttons.howToUse',
  'Download CSV': 'common.buttons.downloadCSV',
  'Export CSV': 'common.buttons.exportCSV',
  'Confirm Import': 'common.buttons.confirmImport',
  'Re-match': 'common.buttons.rematch',

  // Status
  'Skip duplicates': 'common.labels.skipDuplicates',
  'Rules': 'common.labels.rules',

  // CSV Options
  'Comma (,)': 'common.csvOptions.comma',
  'Semicolon (;)': 'common.csvOptions.semicolon',
  'Tab': 'common.csvOptions.tab',
  'Pipe (|)': 'common.csvOptions.pipe',
  'Double Quote (")': 'common.csvOptions.doubleQuote',
  "Single Quote (')": 'common.csvOptions.singleQuote',
  'Always': 'common.csvOptions.always',
  'Never': 'common.csvOptions.never',
  'When needed': 'common.csvOptions.whenNeeded',
  'LF (\\n)': 'common.csvOptions.lf',
  'CRLF (\\r\\n)': 'common.csvOptions.crlf',
  'LF (Unix/Mac)': 'common.csvOptions.lfUnix',
  'CRLF (Windows)': 'common.csvOptions.crlfWindows',

  // AI acknowledgment
  'Data Sharing Acknowledgment Required': 'common.ai.acknowledgmentRequired',
  'This feature uses an external AI provider ({provider}) which requires sending your transaction data to third-party servers. Please review and acknowledge the data sharing policy before using AI features.': 'common.ai.acknowledgmentMessage',

  // Help steps for converter/fints
  'Configure each column': 'common.help.configureEachColumn',
  'Each card represents a Firefly III field. Add transformation blocks to map your CSV data.': 'common.help.configureEachColumnDesc',
  'Add transformation blocks': 'common.help.addTransformationBlocks',
  'Use blocks like "Source Column", "Static Value", "Replace", or "Conditional" to transform data.': 'common.help.addTransformationBlocksDesc',
  'Drag and drop to reorder': 'common.help.dragAndDrop',
  'Blocks are processed top to bottom. Drag to change the order.': 'common.help.dragAndDropDesc',
  'Save your configuration': 'common.help.saveConfiguration',
  'Use "Save Config" to export your mapping for reuse with similar bank exports.': 'common.help.saveConfigurationDesc',
  'How to Use Column Mapping': 'common.help.howToUseColumnMapping',
  'Configure your column mapping to see a preview': 'common.help.configureMappingToPreview',

  // Misc duplicates
  'Toolbox for Firefly III': 'app.title',
  'Connect to your bank and fetch transactions to see a preview': 'common.messages.connectToBankToPreview',
  "Click 'Match Transactions' to find matches between your PayPal activity and Firefly transactions": 'common.messages.clickToMatchPaypal',
  'Requires AI configuration (OpenAI or Ollama)': 'common.labels.requiresAI',
  'Please confirm in your banking app': 'common.messages.pleaseConfirmInBankingApp',
  'Waiting for confirmation': 'common.messages.waitingForConfirmation',
  'Enter TAN': 'common.labels.enterTan',
};

// Select the canonical key from a group of duplicates
function selectCanonicalKey(keys: string[], value: string): { key: string; isNew: boolean } {
  // First check if this value should be promoted to a common key
  if (COMMON_KEY_PROMOTIONS[value]) {
    const promotedKey = COMMON_KEY_PROMOTIONS[value];
    // Check if this key already exists in the keys list
    const alreadyExists = keys.includes(promotedKey);
    return { key: promotedKey, isNew: !alreadyExists };
  }

  // Sort keys by priority
  const sortedKeys = [...keys].sort((a, b) => {
    const aPriority = KEY_PRIORITY.findIndex((p) => p.test(a));
    const bPriority = KEY_PRIORITY.findIndex((p) => p.test(b));

    // -1 means not found, treat as lowest priority (high number)
    const aPriorityVal = aPriority === -1 ? 999 : aPriority;
    const bPriorityVal = bPriority === -1 ? 999 : bPriority;

    // First sort by priority
    if (aPriorityVal !== bPriorityVal) {
      return aPriorityVal - bPriorityVal;
    }

    // If same priority, prefer shorter keys (more generic)
    if (a.length !== b.length) {
      return a.length - b.length;
    }

    // Finally, alphabetical
    return a.localeCompare(b);
  });

  return { key: sortedKeys[0], isNew: false };
}

// Get all key-value pairs from nested object
function getAllKeyValues(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const keyValues = new Map<string, string>();

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = getAllKeyValues(value as Record<string, unknown>, fullKey);
      for (const [k, v] of nested) {
        keyValues.set(k, v);
      }
    } else if (typeof value === 'string') {
      keyValues.set(fullKey, value);
    }
  }

  return keyValues;
}

// Find duplicate values
function findDuplicates(keyValues: Map<string, string>): DuplicateGroup[] {
  const valueToKeys = new Map<string, string[]>();

  for (const [key, value] of keyValues) {
    const normalizedValue = value.trim();
    if (normalizedValue.length <= 1) continue;

    const existing = valueToKeys.get(normalizedValue);
    if (existing) {
      existing.push(key);
    } else {
      valueToKeys.set(normalizedValue, [key]);
    }
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [value, keys] of valueToKeys) {
    if (keys.length > 1) {
      duplicates.push({ value, keys: keys.sort() });
    }
  }

  return duplicates.sort((a, b) => b.keys.length - a.keys.length);
}

// Create key mappings from duplicates
function createKeyMappings(duplicates: DuplicateGroup[]): KeyMapping[] {
  const mappings: KeyMapping[] = [];

  for (const dup of duplicates) {
    const { key: canonicalKey, isNew } = selectCanonicalKey(dup.keys, dup.value);

    for (const key of dup.keys) {
      if (key !== canonicalKey) {
        mappings.push({
          oldKey: key,
          newKey: canonicalKey,
          isNew,
          value: isNew ? dup.value : undefined,
        });
      }
    }
  }

  return mappings;
}

// Find all source files
function findSourceFiles(baseDir: string): string[] {
  const files: string[] = [];
  const patterns = ['src/client'];

  function walkDir(dir: string): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'coverage', '.git', 'locales'].includes(entry.name)) {
          walkDir(fullPath);
        }
      } else if (entry.isFile() && /\.(vue|ts)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  for (const pattern of patterns) {
    walkDir(path.join(baseDir, pattern));
  }

  return files;
}

// Update source file with key mappings
function updateSourceFile(
  filePath: string,
  mappings: KeyMapping[],
  options: Options
): { changed: boolean; replacements: number } {
  let content = fs.readFileSync(filePath, 'utf-8');
  let replacements = 0;
  const originalContent = content;

  for (const { oldKey, newKey } of mappings) {
    // Match various patterns where keys are used
    const patterns = [
      // t('key') or t("key")
      new RegExp(`(\\bt\\s*\\(\\s*)(['"])${escapeRegex(oldKey)}\\2`, 'g'),
      // $t('key') or $t("key")
      new RegExp(`(\\$t\\s*\\(\\s*)(['"])${escapeRegex(oldKey)}\\2`, 'g'),
      // String literals in objects/arrays that look like i18n keys
      new RegExp(`(['"])${escapeRegex(oldKey)}\\1`, 'g'),
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        content = content.replace(pattern, (match, prefix, quote) => {
          replacements++;
          if (prefix) {
            return `${prefix}${quote}${newKey}${quote}`;
          }
          // For the third pattern (string literals), use the same quote style
          const q = match[0];
          return `${q}${newKey}${q}`;
        });
      }
    }
  }

  const changed = content !== originalContent;

  if (changed && !options.dryRun) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return { changed, replacements };
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Remove keys from translation object
function removeKeys(
  obj: Record<string, unknown>,
  keysToRemove: Set<string>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = removeKeys(value as Record<string, unknown>, keysToRemove, fullKey);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else if (!keysToRemove.has(fullKey)) {
      result[key] = value;
    }
  }

  return result;
}

// Set a nested key in an object (creates intermediate objects as needed)
function setNestedKey(obj: Record<string, unknown>, keyPath: string, value: string): void {
  const parts = keyPath.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

// Main function
async function main(): Promise<void> {
  const options = parseArgs();
  const baseDir = process.cwd();
  const localeFile = path.join(baseDir, 'src/client/locales/en.json');

  console.log('🔍 Analyzing translation file for duplicates...\n');

  // Load translations
  const translations = JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
  const keyValues = getAllKeyValues(translations);
  const duplicates = findDuplicates(keyValues);

  console.log(`Found ${duplicates.length} duplicate value groups\n`);

  if (duplicates.length === 0) {
    console.log('✅ No duplicates to fix!');
    return;
  }

  // Create mappings
  const mappings = createKeyMappings(duplicates);
  console.log(`Created ${mappings.length} key mappings\n`);

  // Count new keys that need to be created
  const newKeys = mappings.filter((m) => m.isNew);
  const uniqueNewKeys = [...new Set(newKeys.map((m) => m.newKey))];

  if (uniqueNewKeys.length > 0) {
    console.log(`📝 ${uniqueNewKeys.length} new common keys will be created\n`);
    if (options.verbose) {
      console.log('New keys to create:');
      for (const key of uniqueNewKeys.slice(0, 20)) {
        const mapping = newKeys.find((m) => m.newKey === key);
        console.log(`  ${key} = "${mapping?.value?.substring(0, 50)}${(mapping?.value?.length || 0) > 50 ? '...' : ''}"`);
      }
      if (uniqueNewKeys.length > 20) {
        console.log(`  ... and ${uniqueNewKeys.length - 20} more\n`);
      }
      console.log('');
    }
  }

  if (options.verbose) {
    console.log('Key mappings (old → new):');
    for (const { oldKey, newKey, isNew } of mappings.slice(0, 20)) {
      const marker = isNew ? ' [NEW]' : '';
      console.log(`  ${oldKey} → ${newKey}${marker}`);
    }
    if (mappings.length > 20) {
      console.log(`  ... and ${mappings.length - 20} more\n`);
    }
    console.log('');
  }

  // Find and update source files
  const sourceFiles = findSourceFiles(baseDir);
  console.log(`Found ${sourceFiles.length} source files to update\n`);

  let totalReplacements = 0;
  let filesChanged = 0;

  for (const file of sourceFiles) {
    const { changed, replacements } = updateSourceFile(file, mappings, options);
    if (changed) {
      filesChanged++;
      totalReplacements += replacements;
      if (options.verbose) {
        console.log(`  ✏️  ${path.relative(baseDir, file)}: ${replacements} replacements`);
      }
    }
  }

  console.log(`\n📝 Updated ${filesChanged} files with ${totalReplacements} replacements`);

  // Create new keys in the translation object
  let newKeysCreated = 0;
  for (const key of uniqueNewKeys) {
    const mapping = newKeys.find((m) => m.newKey === key);
    if (mapping?.value) {
      setNestedKey(translations, key, mapping.value);
      newKeysCreated++;
    }
  }

  if (newKeysCreated > 0) {
    console.log(`\n✨ Created ${newKeysCreated} new common keys`);
  }

  // Remove duplicate keys from translation file
  const keysToRemove = new Set(mappings.map((m) => m.oldKey));
  const cleanedTranslations = removeKeys(translations, keysToRemove);

  const originalKeyCount = keyValues.size;
  const newKeyValues = getAllKeyValues(cleanedTranslations);
  const newKeyCount = newKeyValues.size;

  console.log(`\n🗑️  Removed ${keysToRemove.size} duplicate keys from translation file`);
  console.log(`   Final key count: ${newKeyCount} (was ${originalKeyCount})`);

  if (!options.dryRun) {
    fs.writeFileSync(localeFile, JSON.stringify(cleanedTranslations, null, 2) + '\n', 'utf-8');
    console.log('\n✅ Changes saved!');
  } else {
    console.log('\n⚠️  Dry run - no changes were saved. Run without --dry-run to apply changes.');
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Duplicate groups found: ${duplicates.length}`);
  console.log(`   Keys consolidated: ${mappings.length}`);
  console.log(`   New common keys created: ${newKeysCreated}`);
  console.log(`   Source files updated: ${filesChanged}`);
  console.log(`   Total replacements: ${totalReplacements}`);
  console.log(`   Keys removed from translations: ${keysToRemove.size}`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
