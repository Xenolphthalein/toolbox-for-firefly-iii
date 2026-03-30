interface SaveFilePickerWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface SaveFilePickerHandle {
  createWritable(): Promise<SaveFilePickerWritable>;
}

interface SaveFilePickerType {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName: string;
  types: SaveFilePickerType[];
}

interface WindowWithSaveFilePicker extends Window {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<SaveFilePickerHandle>;
}

export interface SaveBlobOptions {
  description: string;
  extensions: string[];
  mimeType: string;
  suggestedName: string;
}

/**
 * Save a blob via the browser's Save As dialog when supported.
 * Falls back to the standard download flow when the picker API is unavailable.
 */
export async function saveBlobWithDialog(blob: Blob, options: SaveBlobOptions): Promise<boolean> {
  const browserWindow = window as WindowWithSaveFilePicker;

  if (typeof browserWindow.showSaveFilePicker === 'function') {
    try {
      const fileHandle = await browserWindow.showSaveFilePicker({
        suggestedName: options.suggestedName,
        types: [
          {
            description: options.description,
            accept: {
              [options.mimeType]: options.extensions,
            },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return false;
      }
      throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.suggestedName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '').trim();
}
