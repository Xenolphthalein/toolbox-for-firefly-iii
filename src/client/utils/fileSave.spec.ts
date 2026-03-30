import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeFilenamePart, saveBlobWithDialog } from './fileSave';

describe('fileSave', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  describe('sanitizeFilenamePart', () => {
    it('should keep alphanumeric characters and remove separators', () => {
      expect(sanitizeFilenamePart(' DE89 3704 0044-0532_0130 00 ')).toBe('DE89370400440532013000');
    });
  });

  describe('saveBlobWithDialog', () => {
    it('should use showSaveFilePicker when supported', async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      const close = vi.fn().mockResolvedValue(undefined);
      const createWritable = vi.fn().mockResolvedValue({ write, close });
      const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
      const blob = new Blob(['test'], { type: 'application/json' });

      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        writable: true,
        value: showSaveFilePicker,
      });

      const result = await saveBlobWithDialog(blob, {
        suggestedName: 'fints-DE123-config.json',
        description: 'JSON configuration',
        mimeType: 'application/json',
        extensions: ['.json'],
      });

      expect(result).toBe(true);
      expect(showSaveFilePicker).toHaveBeenCalledWith({
        suggestedName: 'fints-DE123-config.json',
        types: [
          {
            description: 'JSON configuration',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      });
      expect(createWritable).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledWith(blob);
      expect(close).toHaveBeenCalledOnce();
    });

    it('should return false when the save dialog is cancelled', async () => {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        writable: true,
        value: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
      });

      const result = await saveBlobWithDialog(new Blob(['test']), {
        suggestedName: 'csv-importer-config.json',
        description: 'JSON configuration',
        mimeType: 'application/json',
        extensions: ['.json'],
      });

      expect(result).toBe(false);
    });

    it('should fall back to anchor download when showSaveFilePicker is unavailable', async () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const result = await saveBlobWithDialog(new Blob(['test']), {
        suggestedName: 'csv-importer-config.json',
        description: 'JSON configuration',
        mimeType: 'application/json',
        extensions: ['.json'],
      });

      expect(result).toBe(true);
      expect(createObjectUrlSpy).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:test');
    });
  });
});
