/**
 * Configurable Logger Utility
 *
 * Log levels (from least to most verbose):
 * - error: Only errors
 * - warn: Errors and warnings
 * - info: Errors, warnings, and info messages
 * - debug: All messages including debug
 *
 * Configure via LOG_LEVEL environment variable (default: 'info')
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Default log format
const DEFAULT_LOG_FORMAT = '{datetime} {levelname} {where} {message}';

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

// Level-specific styling
const LEVEL_STYLES: Record<LogLevel, { color: string; label: string; icon: string }> = {
  error: { color: COLORS.red, label: 'ERROR', icon: '✖' },
  warn: { color: COLORS.yellow, label: 'WARN', icon: '⚠' },
  info: { color: COLORS.blue, label: 'INFO', icon: '●' },
  debug: { color: COLORS.gray, label: 'DEBUG', icon: '○' },
};

/**
 * Get configured log level from environment
 */
function getConfiguredLevel(): LogLevel {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return 'info';
}

/**
 * Check if coloring is enabled
 */
function isColorEnabled(): boolean {
  // Disable colors if NO_COLOR is set or not a TTY
  if (process.env.NO_COLOR || !process.stdout.isTTY) {
    return false;
  }
  return process.env.LOG_COLOR !== 'false';
}

/**
 * Format a timestamp
 */
function formatTimestamp(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 23);
  return `${date} ${time}`;
}

/**
 * Format a log message
 */
function formatMessage(level: LogLevel, context: string, message: string, data?: unknown): string {
  const timestamp = formatTimestamp();
  const style = LEVEL_STYLES[level];
  const useColors = isColorEnabled();
  const format = process.env.LOG_FORMAT || DEFAULT_LOG_FORMAT;

  let formattedMessage = format;

  // Replace variables
  // {datetime}
  formattedMessage = formattedMessage.replace(
    '{datetime}',
    useColors ? `${COLORS.dim}${timestamp}${COLORS.reset}` : timestamp
  );

  // {levelname} and {level}
  const levelStr = useColors
    ? `${style.color}${style.icon} ${style.label}${COLORS.reset}`
    : style.label;
  formattedMessage = formattedMessage.replace('{levelname}', levelStr).replace('{level}', levelStr);

  // {context} - Raw context name
  const contextStr =
    useColors && context ? `${COLORS.cyan}${context}${COLORS.reset}` : context || '-';
  formattedMessage = formattedMessage.replace('{context}', contextStr);

  // {where} - Formatted context (e.g. [Context])
  let whereStr = context;
  if (!whereStr) whereStr = '-';
  if (useColors && context) {
    whereStr = `${COLORS.cyan}[${context}]${COLORS.reset}`;
  } else if (context) {
    whereStr = `[${context}]`;
  }
  formattedMessage = formattedMessage.replace('{where}', whereStr);

  // {message}
  formattedMessage = formattedMessage.replace('{message}', message);

  // Append data if present
  if (data !== undefined) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
    formattedMessage += useColors ? `\n${COLORS.dim}${dataStr}${COLORS.reset}` : `\n${dataStr}`;
  }

  return formattedMessage;
}

/**
 * Logger instance for a specific context/module
 */
export interface Logger {
  /** Log an error message */
  error(message: string, data?: unknown): void;
  /** Log a warning message */
  warn(message: string, data?: unknown): void;
  /** Log an info message */
  info(message: string, data?: unknown): void;
  /** Log a debug message */
  debug(message: string, data?: unknown): void;
  /** Create a child logger with an extended context */
  child(subContext: string): Logger;
}

/**
 * Create a logger for a specific context/module
 *
 * @param context - The module or context name (e.g., 'FinTS', 'Firefly', 'Routes')
 * @returns A logger instance
 *
 * @example
 * ```typescript
 * const logger = createLogger('FinTS');
 * logger.info('Connecting to bank...');
 * logger.debug('Request payload', { bankCode: '12345' });
 * logger.error('Connection failed', error);
 * ```
 */
export function createLogger(context: string = ''): Logger {
  const configuredLevel = LOG_LEVELS[getConfiguredLevel()];

  function log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVELS[level] > configuredLevel) {
      return;
    }

    const formattedMessage = formatMessage(level, context, message, data);

    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  return {
    error: (message: string, data?: unknown) => log('error', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    debug: (message: string, data?: unknown) => log('debug', message, data),
    child: (subContext: string) => createLogger(context ? `${context}:${subContext}` : subContext),
  };
}

/**
 * Default root logger (no context)
 */
export const logger = createLogger();

/**
 * Pre-configured loggers for common modules
 */
export const loggers = {
  fints: createLogger('FinTS'),
  firefly: createLogger('Firefly'),
  ai: createLogger('AI'),
  routes: createLogger('Routes'),
  server: createLogger('Server'),
};
