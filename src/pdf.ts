import { extractText, extractTextItems } from 'unpdf';
import { ExtractedParagraph, ExtractionResult, looksEncrypted, ok, unreadable } from './types.js';

interface TextItem {
  str: string;
  y: number;
  height?: number;
  fontSize?: number;
}

interface Line {
  y: number;
  height: number;
  text: string;
}

/** Items on the same baseline (within 2 units) form one line. */
function toLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const item of items) {
    if (!current || Math.abs(item.y - current.y) > 2) {
      if (current) lines.push(current);
      current = { y: item.y, height: item.height || item.fontSize || 12, text: item.str };
    } else {
      current.text += item.str;
      if ((item.height || 0) > current.height) current.height = item.height!;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Lines become one paragraph until a blank line or a vertical gap larger than
 * 1.5 times the previous line height, so wrapped lines stay together.
 */
function toParagraphs(lines: Line[]): string[] {
  const out: string[] = [];
  let buffer: string[] = [];
  let prev: Line | null = null;
  const flush = () => {
    if (buffer.length > 0) out.push(buffer.join(' '));
    buffer = [];
  };

  for (const line of lines) {
    const text = line.text.trim();
    if (text.length === 0) {
      flush();
      prev = null;
      continue;
    }
    if (prev && prev.y - line.y > (prev.height || 12) * 1.5) flush();
    buffer.push(text);
    prev = line;
  }
  flush();
  return out;
}

/** Reads the text layer of a PDF. Scanned pages without a text layer yield nothing. */
export async function extractPdf(data: Uint8Array): Promise<ExtractionResult> {
  // pdf.js may detach the buffer it is given, so always pass a private copy.
  const copy = () => new Uint8Array(data);
  const pages: string[][] = [];

  try {
    const result = (await extractTextItems(copy())) as { totalPages: number; items: TextItem[][] };
    for (let i = 0; i < result.totalPages; i++) pages.push(toParagraphs(toLines(result.items[i] ?? [])));
  } catch (firstError) {
    if (looksEncrypted(firstError)) return unreadable('encrypted');
    try {
      const result = await extractText(copy());
      for (let i = 0; i < result.totalPages; i++) {
        pages.push(
          (result.text[i] ?? '')
            .split(/\n\s*\n+/)
            .map((block) => block.split('\n').map((l) => l.trim()).filter(Boolean).join(' ').trim())
            .filter((block) => block.length > 0)
        );
      }
    } catch (error) {
      return unreadable(looksEncrypted(error) ? 'encrypted' : 'corrupt');
    }
  }

  const paragraphs: ExtractedParagraph[] = [];
  pages.forEach((blocks, pageIndex) => {
    blocks.forEach((content, blockIndex) => {
      paragraphs.push({
        sequence_no: paragraphs.length + 1,
        location: `${pageIndex + 1}쪽 ¶${blockIndex + 1}`,
        content,
        page: pageIndex + 1,
      });
    });
  });
  return ok(paragraphs);
}
