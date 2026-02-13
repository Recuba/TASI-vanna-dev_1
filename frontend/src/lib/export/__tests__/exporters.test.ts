import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QueryResults } from '@/types/queries';

// We need to mock the download mechanism since jsdom doesn't support it
const mockClick = vi.fn();
let lastBlobParts: BlobPart[] = [];
let lastAnchorDownload = '';

// Store original Blob
const OriginalBlob = globalThis.Blob;

beforeEach(() => {
  mockClick.mockClear();
  lastBlobParts = [];
  lastAnchorDownload = '';

  // Mock Blob to capture content
  globalThis.Blob = class MockBlob extends OriginalBlob {
    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      if (parts) lastBlobParts = parts;
    }
  };

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      return {
        href: '',
        set download(val: string) {
          lastAnchorDownload = val;
        },
        get download() {
          return lastAnchorDownload;
        },
        click: mockClick,
      } as unknown as HTMLAnchorElement;
    }
    return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
  });
});

afterEach(() => {
  globalThis.Blob = OriginalBlob;
  vi.restoreAllMocks();
});

// Import after setup so mocks are in place
async function getExporter() {
  // Dynamic import to pick up mocks
  const mod = await import('../exporters');
  return mod;
}

function getBlobText(): string {
  // Extract text from blob parts
  return lastBlobParts.map((p) => (typeof p === 'string' ? p : '')).join('');
}

describe('exportToCsv', () => {
  const sampleData: QueryResults = {
    columns: ['ticker', 'name', 'market_cap'],
    rows: [
      ['2222.SR', 'Aramco', 7500000000000],
      ['1120.SR', 'Al Rajhi', 320000000000],
    ],
  };

  it('should create a CSV blob and trigger download', async () => {
    const { exportToCsv } = await getExporter();
    exportToCsv(sampleData);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
  });

  it('should include BOM for Arabic support', async () => {
    const { exportToCsv } = await getExporter();
    exportToCsv(sampleData);
    const text = getBlobText();
    expect(text.startsWith('\uFEFF')).toBe(true);
  });

  it('should properly escape CSV values with commas', async () => {
    const { exportToCsv } = await getExporter();
    const dataWithCommas: QueryResults = {
      columns: ['name', 'description'],
      rows: [['Test Corp', 'A, B, and C company']],
    };

    exportToCsv(dataWithCommas);
    const text = getBlobText();
    expect(text).toContain('"A, B, and C company"');
  });

  it('should properly escape CSV values with quotes', async () => {
    const { exportToCsv } = await getExporter();
    const dataWithQuotes: QueryResults = {
      columns: ['name'],
      rows: [['The "Big" Company']],
    };

    exportToCsv(dataWithQuotes);
    const text = getBlobText();
    expect(text).toContain('"The ""Big"" Company"');
  });

  it('should handle null values', async () => {
    const { exportToCsv } = await getExporter();
    const dataWithNulls: QueryResults = {
      columns: ['a', 'b'],
      rows: [[null, 'value']],
    };

    exportToCsv(dataWithNulls);
    const text = getBlobText();
    expect(text).toContain(',value');
  });

  it('should use custom filename when provided', async () => {
    const { exportToCsv } = await getExporter();
    exportToCsv(sampleData, 'custom_export.csv');
    expect(lastAnchorDownload).toBe('custom_export.csv');
  });

  it('should generate timestamped filename by default', async () => {
    const { exportToCsv } = await getExporter();
    exportToCsv(sampleData);
    expect(lastAnchorDownload).toMatch(/^raid_ai_results_\d{4}-\d{2}-\d{2}.*\.csv$/);
  });

  it('should handle empty rows', async () => {
    const { exportToCsv } = await getExporter();
    const emptyData: QueryResults = {
      columns: ['a', 'b'],
      rows: [],
    };

    expect(() => exportToCsv(emptyData)).not.toThrow();
  });

  it('should handle values with newlines', async () => {
    const { exportToCsv } = await getExporter();
    const dataWithNewlines: QueryResults = {
      columns: ['text'],
      rows: [['line1\nline2']],
    };

    exportToCsv(dataWithNewlines);
    const text = getBlobText();
    expect(text).toContain('"line1\nline2"');
  });
});
