import { extractDoc } from './doc.js';
import { extractDocx } from './docx.js';
import { extractHwp, type HwpOptions } from './hwp.js';
import { extractHwpx } from './hwpx.js';
import { extractPdf } from './pdf.js';
import type { ExtractionResult } from './types.js';

export * from './types.js';
export { extractDoc } from './doc.js';
export { extractDocx } from './docx.js';
export { extractHwp, loadRhwpModule, type HwpOptions } from './hwp.js';
export { extractHwpx } from './hwpx.js';
export { extractPdf } from './pdf.js';

export const SUPPORTED_FORMATS = ['hwp', 'hwpx', 'doc', 'docx', 'pdf'] as const;
export type DocumentFormat = (typeof SUPPORTED_FORMATS)[number];

export class UnsupportedFormatError extends Error {
  constructor(readonly format: string) {
    super(`Unsupported document format: ${format}`);
    this.name = 'UnsupportedFormatError';
  }
}

/** Accepts `hwp`, `.HWP` or a file name such as `report.hwp`. */
export function normalizeFormat(formatOrFileName: string): DocumentFormat | undefined {
  const ext = formatOrFileName.trim().toLowerCase().split('.').pop() ?? '';
  return (SUPPORTED_FORMATS as readonly string[]).includes(ext) ? (ext as DocumentFormat) : undefined;
}

export interface ExtractOptions {
  hwp?: HwpOptions;
}

/**
 * Reads the paragraphs of a document from its bytes.
 * Never throws for unreadable content (see `status`); throws
 * `UnsupportedFormatError` only when the format itself is not supported.
 */
export async function extractDocument(
  data: Uint8Array,
  formatOrFileName: string,
  options: ExtractOptions = {}
): Promise<ExtractionResult> {
  switch (normalizeFormat(formatOrFileName)) {
    case 'hwp':
      return extractHwp(data, options.hwp);
    case 'hwpx':
      return extractHwpx(data);
    case 'doc':
      return extractDoc(data);
    case 'docx':
      return extractDocx(data);
    case 'pdf':
      return extractPdf(data);
    default:
      throw new UnsupportedFormatError(formatOrFileName);
  }
}
