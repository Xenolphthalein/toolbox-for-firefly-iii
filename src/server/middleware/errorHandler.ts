import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ErrorHandler');

/**
 * Custom error class with status code support
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create a 400 Bad Request error
 */
export function badRequest(message: string): AppError {
  return new AppError(400, message);
}

/**
 * Create a 401 Unauthorized error
 */
export function unauthorized(message = 'Unauthorized'): AppError {
  return new AppError(401, message);
}

/**
 * Create a 404 Not Found error
 */
export function notFound(message = 'Resource not found'): AppError {
  return new AppError(404, message);
}

/**
 * Create a 500 Internal Server Error
 */
export function internalError(message = 'Internal server error'): AppError {
  return new AppError(500, message, false);
}

/**
 * Global error handling middleware
 */
export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error using logger
  if (err instanceof AppError && err.isOperational) {
    logger.warn(`${err.statusCode} ${err.message}`);
  } else {
    logger.error('Unexpected error', err);
  }

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // Determine message (hide internal errors in production)
  const message =
    config.nodeEnv === 'development' || (err instanceof AppError && err.isOperational)
      ? err.message
      : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
}

/**
 * Async route handler wrapper to catch errors
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * SSE utilities for consistent streaming error handling
 */
export interface SSEWriter {
  /** Send an SSE event. Returns false if client disconnected. */
  send: (type: string, data: unknown) => boolean;
  /** Send an error event and end the stream */
  error: (err: Error | string) => void;
  /** End the stream */
  end: () => void;
  /** Check if client is still connected */
  isConnected: () => boolean;
  /** Register a cleanup callback for when the client disconnects */
  onClose: (callback: () => void) => void;
}

/** Default heartbeat interval in milliseconds (25 seconds, below common proxy timeouts of 30-60s) */
const SSE_HEARTBEAT_INTERVAL = 25_000;

/**
 * Set up SSE response headers and return a writer object with cancellation support.
 *
 * Features:
 * - Automatic heartbeat every 25 seconds to keep proxies alive
 * - Connection state tracking via `isConnected()`
 * - Cleanup callbacks via `onClose()` for resource cleanup when client disconnects
 *
 * @param res Express response object
 * @param _req Unused (kept for backwards compatibility with existing callers)
 */
export function setupSSE(res: Response, _req?: Request): SSEWriter {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  let connected = true;
  const cleanupCallbacks: Array<() => void> = [];

  // Handle client disconnect
  const handleClose = () => {
    if (!connected) return;
    connected = false;
    cleanupCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignore cleanup errors
      }
    });
    clearInterval(heartbeatInterval);
  };

  // Listen for response close event only.
  // IMPORTANT: Do NOT listen to req.on('close') or req.on('aborted') because
  // for POST requests with SSE responses, those events fire when the request
  // body is fully received (immediately), not when the client disconnects.
  // The res.on('close') event correctly fires when the response connection ends.
  res.on('close', handleClose);

  // Start heartbeat to keep connection alive through proxies
  // Sends SSE comment (line starting with :) which clients ignore
  const heartbeatInterval = setInterval(() => {
    if (connected && !res.writableEnded) {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }
  }, SSE_HEARTBEAT_INTERVAL);

  return {
    send(type: string, data: unknown): boolean {
      if (!connected || res.writableEnded) {
        return false;
      }
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      return true;
    },
    error(err: Error | string) {
      if (!connected || res.writableEnded) {
        return;
      }
      const message = err instanceof Error ? err.message : err;
      res.write(`data: ${JSON.stringify({ type: 'error', data: { error: message } })}\n\n`);
      this.end();
    },
    end() {
      clearInterval(heartbeatInterval);
      if (!res.writableEnded) {
        res.end();
      }
      connected = false;
    },
    isConnected() {
      return connected && !res.writableEnded;
    },
    onClose(callback: () => void) {
      cleanupCallbacks.push(callback);
    },
  };
}
