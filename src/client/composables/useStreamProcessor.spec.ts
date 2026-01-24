import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { z } from 'zod';
import { useStreamProcessor, type StreamEvent, type ProgressData } from './useStreamProcessor';

describe('useStreamProcessor', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock ReadableStream from SSE data
   */
  function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;

    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  /**
   * Helper to create a mock fetch response
   */
  function mockFetch(chunks: string[], status = 200, ok = true) {
    const stream = createMockStream(chunks);
    global.fetch = vi.fn().mockResolvedValue({
      ok,
      status,
      body: stream,
      json: vi.fn().mockResolvedValue({ error: 'Test error' }),
    });
  }

  describe('processStream', () => {
    it('should process a simple progress event', async () => {
      const events: StreamEvent<ProgressData>[] = [];
      mockFetch([
        'data: {"type":"progress","data":{"current":1,"total":10,"message":"Loading..."}}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream<ProgressData>('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'progress',
        data: { current: 1, total: 10, message: 'Loading...' },
      });
    });

    it('should process multiple events', async () => {
      const events: StreamEvent<unknown>[] = [];
      mockFetch([
        'data: {"type":"progress","data":{"current":1,"total":2}}\n',
        'data: {"type":"result","data":{"id":"123"}}\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('progress');
      expect(events[1].type).toBe('result');
      expect(events[2].type).toBe('complete');
    });

    it('should handle events split across chunks', async () => {
      const events: StreamEvent<unknown>[] = [];
      // Split an event in the middle
      mockFetch([
        'data: {"type":"progress","data":{"current":1,',
        '"total":10}}\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: 'progress',
        data: { current: 1, total: 10 },
      });
    });

    it('should skip empty lines', async () => {
      const events: StreamEvent<unknown>[] = [];
      mockFetch([
        'data: {"type":"progress","data":{"current":1,"total":1}}\n',
        '\n',
        '\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(2);
    });

    it('should skip invalid JSON payloads', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const events: StreamEvent<unknown>[] = [];
      mockFetch([
        'data: {"type":"progress","data":{"current":1,"total":1}}\n',
        'data: {invalid json}\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StreamProcessor] Failed to parse SSE data:'),
        expect.any(Object)
      );
    });

    it('should skip events without proper structure', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const events: StreamEvent<unknown>[] = [];
      mockFetch([
        'data: {"type":"progress","data":{"current":1,"total":1}}\n',
        'data: {"missingType": true}\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StreamProcessor] Invalid event structure:'),
        expect.any(Object)
      );
    });

    it('should always include credentials for session cookie', async () => {
      mockFetch(['data: {"type":"complete","data":null}\n']);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', { key: 'value' }, () => {}, { includeSession: true });

      expect(global.fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: 'value' }),
        credentials: 'include',
      });
    });

    it('should include credentials even without includeSession option', async () => {
      mockFetch(['data: {"type":"complete","data":null}\n']);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, () => {});

      expect(global.fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        credentials: 'include',
      });
    });

    it('should throw error when response is not ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Server error' }),
      });

      const { processStream } = useStreamProcessor();
      await expect(processStream('/api/test', {}, () => {})).rejects.toThrow('Server error');
    });

    it('should throw error when streaming is not supported', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      });

      const { processStream } = useStreamProcessor();
      await expect(processStream('/api/test', {}, () => {})).rejects.toThrow(
        'Streaming not supported'
      );
    });

    it('should validate result events when schema is provided', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const events: StreamEvent<{ id: string; name: string }>[] = [];
      const resultSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      mockFetch([
        'data: {"type":"result","data":{"id":"1","name":"Test"}}\n',
        'data: {"type":"result","data":{"id":"2"}}\n', // Missing name - should be skipped
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream<{ id: string; name: string }>(
        '/api/test',
        {},
        (event) => events.push(event),
        { resultSchema }
      );

      // Valid result, validation-error for invalid, and complete
      expect(events).toHaveLength(3);
      expect(events[0].data).toEqual({ id: '1', name: 'Test' });
      expect(events[1].type).toBe('validation-error');
      expect(events[2].type).toBe('complete');
      // Validation logs the error
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should validate suggestion events when schema is provided', async () => {
      const events: StreamEvent<{ category: string }>[] = [];
      const resultSchema = z.object({
        category: z.string(),
      });

      mockFetch([
        'data: {"type":"suggestion","data":{"category":"Food"}}\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream<{ category: string }>('/api/test', {}, (event) => events.push(event), {
        resultSchema,
      });

      expect(events).toHaveLength(2);
      expect(events[0].data).toEqual({ category: 'Food' });
    });

    it('should pass through error events without validation', async () => {
      const events: StreamEvent<unknown>[] = [];

      mockFetch(['data: {"type":"error","data":{"message":"Something went wrong"}}\n']);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].data).toEqual({ message: 'Something went wrong' });
    });

    it('should handle multi-byte UTF-8 characters', async () => {
      const events: StreamEvent<{ text: string }>[] = [];
      // Emoji and special characters
      mockFetch([
        'data: {"type":"result","data":{"text":"Hello 🌍 世界"}}\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream<{ text: string }>('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(2);
      expect(events[0].data).toEqual({ text: 'Hello 🌍 世界' });
    });

    it('should handle data that ends without newline', async () => {
      const events: StreamEvent<unknown>[] = [];
      // Final chunk without trailing newline
      mockFetch([
        'data: {"type":"progress","data":{"current":1,"total":1}}\n',
        'data: {"type":"complete","data":null}',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(2);
      expect(events[1].type).toBe('complete');
    });

    it('should skip lines without data: prefix', async () => {
      const events: StreamEvent<unknown>[] = [];
      mockFetch([
        'event: message\n', // SSE event line (ignored)
        'data: {"type":"progress","data":{"current":1,"total":1}}\n',
        'id: 123\n', // SSE id line (ignored)
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(2);
    });

    it('should validate progress events with optional message', async () => {
      const events: StreamEvent<ProgressData>[] = [];
      mockFetch([
        'data: {"type":"progress","data":{"current":1,"total":10}}\n', // No message
        'data: {"type":"progress","data":{"current":2,"total":10,"message":"Processing..."}}\n',
        'data: {"type":"complete","data":null}\n',
      ]);

      const { processStream } = useStreamProcessor();
      await processStream<ProgressData>('/api/test', {}, (event) => events.push(event));

      expect(events).toHaveLength(3);
      expect(events[0].data).toEqual({ current: 1, total: 10 });
      expect(events[1].data).toEqual({ current: 2, total: 10, message: 'Processing...' });
    });
  });
});
