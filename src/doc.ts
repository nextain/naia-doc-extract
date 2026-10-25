import WordExtractor from 'word-extractor';
import { ExtractedParagraph, ExtractionResult, looksEncrypted, ok, unreadable } from './types.js';

function nonEmptyLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Reads a legacy binary Word 97-2003 (.doc) document. Text boxes follow the body. */
export async function extractDoc(data: Uint8Array): Promise<ExtractionResult> {
  try {
    const document = await new WordExtractor().extract(Buffer.from(data));
    const lines = [
      ...nonEmptyLines(document.getBody({ filterUnicode: false })),
      ...nonEmptyLines(
        document.getTextboxes({ filterUnicode: false, includeHeadersAndFooters: false })
      ),
    ];
    const paragraphs: ExtractedParagraph[] = lines.map((content, i) => ({
      sequence_no: i + 1,
      location: '¶' + (i + 1),
      content,
    }));
    return ok(paragraphs);
  } catch (error) {
    return unreadable(looksEncrypted(error) ? 'encrypted' : 'corrupt');
  }
}
