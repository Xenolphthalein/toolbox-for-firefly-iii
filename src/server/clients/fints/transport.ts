/**
 * FinTS HTTP transport layer
 *
 * Handles sending FinTS messages to the bank server and receiving responses.
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { logger } from './utils.js';

/**
 * Make HTTP request to FinTS server
 */
export async function sendRequest(url: string, message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    // FinTS requires base64 encoding of the message
    const encodedMessage = Buffer.from(message, 'latin1').toString('base64');

    logger.debug(`Sending request to ${parsedUrl.hostname}${parsedUrl.pathname}`);
    logger.debug(`Request size: ${encodedMessage.length} bytes (base64)`);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=ISO-8859-1',
        'Content-Length': Buffer.byteLength(encodedMessage, 'ascii'),
      },
    };

    const startTime = Date.now();

    const req = httpModule.request(options, (res) => {
      const chunks: Buffer[] = [];

      logger.debug(`HTTP Status: ${res.statusCode} ${res.statusMessage}`);

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const rawResponse = Buffer.concat(chunks).toString('ascii');
        const duration = Date.now() - startTime;
        logger.debug(`Response received in ${duration}ms, size: ${rawResponse.length} bytes`);

        // Check for HTTP errors
        if (res.statusCode && res.statusCode >= 400) {
          logger.error(`HTTP error ${res.statusCode}: ${rawResponse.substring(0, 500)}`);
          reject(new Error(`HTTP error ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        // FinTS responses are base64 encoded
        if (rawResponse.length === 0) {
          resolve('');
          return;
        }

        try {
          const decodedResponse = Buffer.from(rawResponse, 'base64').toString('latin1');
          resolve(decodedResponse);
        } catch {
          // If not valid base64, return as-is (might be an error page)
          logger.debug('Response is not base64 encoded, returning raw');
          resolve(rawResponse);
        }
      });
    });

    req.on('error', (error) => {
      logger.error(`Request failed: ${error.message}`);
      reject(new Error(`FinTS request failed: ${error.message}`));
    });

    req.write(encodedMessage, 'ascii');
    req.end();
  });
}
