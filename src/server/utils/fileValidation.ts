/**
 * File content validation utilities for upload security.
 *
 * Provides early rejection of binary files and non-text content
 * before expensive parsing operations. This prevents loading
 * malicious or corrupted binary data into memory buffers.
 */

/**
 * Common binary file signatures (magic bytes) that should be rejected.
 * These represent file types that cannot be valid JSON or CSV.
 */
const BINARY_SIGNATURES: Array<{ signature: number[]; name: string }> = [
  // Executables
  { signature: [0x4d, 0x5a], name: 'Windows executable (MZ)' },
  { signature: [0x7f, 0x45, 0x4c, 0x46], name: 'ELF executable' },
  { signature: [0xca, 0xfe, 0xba, 0xbe], name: 'Mach-O executable' },
  { signature: [0xfe, 0xed, 0xfa, 0xce], name: 'Mach-O executable (32-bit)' },
  { signature: [0xfe, 0xed, 0xfa, 0xcf], name: 'Mach-O executable (64-bit)' },

  // Archives
  { signature: [0x50, 0x4b, 0x03, 0x04], name: 'ZIP archive' },
  { signature: [0x50, 0x4b, 0x05, 0x06], name: 'ZIP archive (empty)' },
  { signature: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], name: 'RAR archive' },
  { signature: [0x1f, 0x8b], name: 'GZIP archive' },
  { signature: [0x42, 0x5a, 0x68], name: 'BZIP2 archive' },
  { signature: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], name: '7-Zip archive' },
  { signature: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], name: 'XZ archive' },

  // Images
  { signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], name: 'PNG image' },
  { signature: [0xff, 0xd8, 0xff], name: 'JPEG image' },
  { signature: [0x47, 0x49, 0x46, 0x38], name: 'GIF image' },
  { signature: [0x42, 0x4d], name: 'BMP image' },
  { signature: [0x00, 0x00, 0x01, 0x00], name: 'ICO image' },
  { signature: [0x52, 0x49, 0x46, 0x46], name: 'WEBP/RIFF file' },

  // Documents
  { signature: [0x25, 0x50, 0x44, 0x46], name: 'PDF document' },
  {
    signature: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    name: 'Microsoft Office (OLE)',
  },

  // Media
  { signature: [0x49, 0x44, 0x33], name: 'MP3 audio (ID3)' },
  { signature: [0xff, 0xfb], name: 'MP3 audio' },
  { signature: [0xff, 0xfa], name: 'MP3 audio' },
  { signature: [0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70], name: 'MP4 video' },
  { signature: [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], name: 'MP4 video' },
  { signature: [0x66, 0x74, 0x79, 0x70], name: 'MP4/M4A container' },
  { signature: [0x4f, 0x67, 0x67, 0x53], name: 'OGG audio/video' },
  { signature: [0x1a, 0x45, 0xdf, 0xa3], name: 'WebM/MKV video' },

  // Database
  { signature: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65], name: 'SQLite database' },

  // Binary data formats
  { signature: [0x00, 0x00, 0x00], name: 'Null-prefixed binary' },
];

/**
 * Result of file content validation
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check if a buffer starts with a known binary file signature.
 *
 * @param buffer - The file buffer to check
 * @returns Object with detected binary type, or null if no match
 */
function detectBinarySignature(buffer: Buffer): { name: string } | null {
  for (const { signature, name } of BINARY_SIGNATURES) {
    if (buffer.length >= signature.length) {
      let match = true;
      for (let i = 0; i < signature.length; i++) {
        if (buffer[i] !== signature[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        return { name };
      }
    }
  }
  return null;
}

/**
 * Check if a buffer contains only valid UTF-8 text characters.
 * Allows common text characters, whitespace, and extended Unicode.
 * Rejects control characters (except tab, newline, carriage return).
 *
 * @param buffer - The buffer to check (first portion is sufficient)
 * @param sampleSize - Number of bytes to sample (default: 8KB)
 * @returns True if content appears to be valid text
 */
function isValidTextContent(buffer: Buffer, sampleSize = 8192): boolean {
  const checkLength = Math.min(buffer.length, sampleSize);

  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i];

    // Allow printable ASCII (0x20-0x7E), tab (0x09), newline (0x0A), carriage return (0x0D)
    if ((byte >= 0x20 && byte <= 0x7e) || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue;
    }

    // Allow UTF-8 multi-byte sequences (0x80-0xFF as continuation bytes)
    // Valid UTF-8 lead bytes: 0xC0-0xF7
    if (byte >= 0x80) {
      // This is a simplified check - we're allowing UTF-8 range bytes
      // A more thorough check would validate full UTF-8 sequences
      continue;
    }

    // Reject other control characters (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F)
    // These are never valid in JSON or CSV text files
    return false;
  }

  return true;
}

/**
 * Validate that a buffer contains valid JSON-like content.
 * Performs lightweight checks without full parsing.
 *
 * @param buffer - The file buffer to validate
 * @returns Validation result with error message if invalid
 */
export function validateJsonContent(buffer: Buffer): FileValidationResult {
  // Check for empty file
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Check for binary file signatures
  const binaryType = detectBinarySignature(buffer);
  if (binaryType) {
    return {
      valid: false,
      error: `File appears to be a ${binaryType.name}, not a JSON file`,
    };
  }

  // Check for valid text content (no binary control characters)
  if (!isValidTextContent(buffer)) {
    return {
      valid: false,
      error: 'File contains binary data or invalid characters',
    };
  }

  // Find first non-whitespace character to check JSON structure
  const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 1024));
  const trimmed = content.trimStart();

  if (trimmed.length === 0) {
    return { valid: false, error: 'File contains only whitespace' };
  }

  // JSON must start with { or [ (or a primitive, but we expect objects/arrays for data files)
  const firstChar = trimmed[0];
  if (firstChar !== '{' && firstChar !== '[') {
    return {
      valid: false,
      error: `Invalid JSON: expected '{' or '[' but found '${firstChar}'`,
    };
  }

  return { valid: true };
}

/**
 * Validate that a buffer contains valid CSV-like content.
 * Performs lightweight checks without full parsing.
 *
 * @param buffer - The file buffer to validate
 * @returns Validation result with error message if invalid
 */
export function validateCsvContent(buffer: Buffer): FileValidationResult {
  // Check for empty file
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  // Check for binary file signatures
  const binaryType = detectBinarySignature(buffer);
  if (binaryType) {
    return {
      valid: false,
      error: `File appears to be a ${binaryType.name}, not a CSV file`,
    };
  }

  // Check for valid text content (no binary control characters)
  if (!isValidTextContent(buffer)) {
    return {
      valid: false,
      error: 'File contains binary data or invalid characters',
    };
  }

  // Check that there's actual content
  const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 4096));
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'File contains only whitespace' };
  }

  // CSV should have at least one line with content
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { valid: false, error: 'CSV file has no data rows' };
  }

  // Check if first line looks like CSV (contains commas, semicolons, or tabs)
  const firstLine = lines[0];
  const hasDelimiter = /[,;\t]/.test(firstLine);
  if (!hasDelimiter && lines.length === 1) {
    return {
      valid: false,
      error: 'File does not appear to be CSV format (no delimiters found)',
    };
  }

  return { valid: true };
}
