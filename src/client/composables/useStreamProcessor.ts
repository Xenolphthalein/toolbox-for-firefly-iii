import type { z } from 'zod';
import { validateData, ProgressDataSchema } from '../utils/validation';

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

export interface StreamEvent<T = unknown> {
  type: 'progress' | 'result' | 'suggestion' | 'error' | 'complete' | 'validation-error';
  data: T;
}

export interface ProgressData {
  current: number;
  total: number;
  message?: string;
}

export interface ValidationErrorData {
  eventType: string;
  error: string;
}

export interface StreamOptions {
  /**
   * Include credentials (session cookie) with the request.
   * Required for authenticated endpoints that use server-side session state.
   * @deprecated The session cookie is now always included via credentials: 'include'.
   * This option is kept for backwards compatibility but has no effect.
   */
  includeSession?: boolean;
  /** Optional schema for validating result/suggestion data */
  resultSchema?: z.ZodType;
}

/**
 * Composable for processing Server-Sent Events (SSE) streams
 *
 * Handles edge cases:
 * - Multi-byte UTF-8 characters split across chunks
 * - SSE data lines split across chunks
 * - Proper buffer flushing on stream end
 *
 * Session identity is managed server-side via Express session cookies,
 * which are automatically included with credentials: 'include'.
 */
export function useStreamProcessor() {
  /**
   * Parse and handle a single SSE data line
   * @returns true if the line was successfully processed
   */
  function parseSSELine<T>(
    line: string,
    onEvent: (event: StreamEvent<T>) => void,
    options: StreamOptions
  ): boolean {
    // SSE lines must start with "data: " prefix
    if (!line.startsWith('data: ')) {
      return false;
    }

    const jsonPayload = line.slice(6);

    // Skip empty data payloads
    if (!jsonPayload.trim()) {
      return false;
    }

    let rawEvent: unknown;
    try {
      rawEvent = JSON.parse(jsonPayload);
    } catch (e) {
      // Log parse errors for debugging (helps identify malformed payloads)
      console.warn('[StreamProcessor] Failed to parse SSE data:', {
        payload: jsonPayload.slice(0, 200), // Truncate for readability
        error: e instanceof Error ? e.message : 'Unknown parse error',
      });
      return false;
    }

    // Validate event structure
    if (!isValidStreamEvent(rawEvent)) {
      console.warn('[StreamProcessor] Invalid event structure:', rawEvent);
      return false;
    }

    // Validate progress events
    if (rawEvent.type === 'progress') {
      const progressResult = validateData(ProgressDataSchema, rawEvent.data, 'stream-progress');
      if (progressResult.success) {
        onEvent({ type: 'progress', data: progressResult.data } as StreamEvent<T>);
      } else {
        console.error(
          `[StreamProcessor] Progress validation failed:`,
          progressResult.error,
          rawEvent.data
        );
        onEvent({
          type: 'validation-error',
          data: {
            eventType: 'progress',
            error: progressResult.error || 'Unknown validation error',
          },
        } as StreamEvent<T>);
      }
      return true;
    }

    // Validate result/suggestion events if schema provided
    if ((rawEvent.type === 'result' || rawEvent.type === 'suggestion') && options.resultSchema) {
      const validationResult = validateData(
        options.resultSchema,
        rawEvent.data,
        `stream-${rawEvent.type}`
      );
      if (validationResult.success) {
        onEvent({ type: rawEvent.type, data: validationResult.data } as StreamEvent<T>);
      } else {
        console.error(
          `[StreamProcessor] Skipping invalid ${rawEvent.type}:`,
          validationResult.error,
          rawEvent.data
        );
        onEvent({
          type: 'validation-error',
          data: {
            eventType: rawEvent.type,
            error: validationResult.error || 'Unknown validation error',
          },
        } as StreamEvent<T>);
      }
      return true;
    }

    // Pass through error/complete events and unvalidated results
    onEvent(rawEvent as StreamEvent<T>);
    return true;
  }

  /**
   * Type guard to validate basic StreamEvent structure
   */
  function isValidStreamEvent(value: unknown): value is { type: string; data: unknown } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof (value as Record<string, unknown>).type === 'string' &&
      'data' in value
    );
  }

  /**
   * Process buffered lines from the SSE stream
   * @param buffer - Current buffer content
   * @param onEvent - Event callback
   * @param options - Stream options
   * @param flush - If true, process all content including incomplete lines
   * @returns Remaining buffer content (unprocessed)
   */
  function processBuffer<T>(
    buffer: string,
    onEvent: (event: StreamEvent<T>) => void,
    options: StreamOptions,
    flush: boolean = false
  ): string {
    const lines = buffer.split('\n');

    // If not flushing, keep the last line in buffer (might be incomplete)
    const remainder = flush ? '' : (lines.pop() ?? '');

    for (const line of lines) {
      // Skip empty lines (SSE uses blank lines as event separators)
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }

      parseSSELine(trimmedLine, onEvent, options);
    }

    return remainder;
  }

  /**
   * Process an SSE stream from a POST endpoint
   * @param url - The API endpoint URL
   * @param body - Request body to send
   * @param onEvent - Callback for each parsed event
   * @param options - Stream options
   */
  async function processStream<T>(
    url: string,
    body: Record<string, unknown>,
    onEvent: (event: StreamEvent<T>) => void,
    options: StreamOptions = {}
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add CSRF token to the request (required for POST requests)
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) {
      headers[CSRF_TOKEN_HEADER] = csrfToken;
    }

    // Session identity is now managed server-side via Express session cookie.
    // The includeSession option is deprecated but kept for backwards compatibility.
    // We always include credentials to send the session cookie.

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include', // Send session cookie for server-side session identity
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Stream request failed');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Streaming not supported');
    }

    // TextDecoder with stream: true handles multi-byte UTF-8 characters
    // that may be split across chunk boundaries
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Flush any remaining bytes from the decoder
          // This handles multi-byte characters at the end of the stream
          buffer += decoder.decode(new Uint8Array(), { stream: false });

          // Process any remaining data in the buffer
          if (buffer.trim()) {
            processBuffer(buffer, onEvent, options, true);
          }
          break;
        }

        // Decode chunk with stream: true to handle partial multi-byte sequences
        // The decoder will buffer incomplete sequences until the next chunk arrives
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from the buffer
        buffer = processBuffer(buffer, onEvent, options, false);
      }
    } finally {
      // Ensure reader is properly released
      reader.releaseLock();
    }
  }

  return {
    processStream,
  };
}
