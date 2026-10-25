import JSZip from 'jszip';
import { ExtractedParagraph, ExtractionResult, looksEncrypted, ok, unreadable } from './types.js';
import { decodeXmlEntities } from './xml.js';

function textOf(xml: string): string {
  const runs = xml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi) ?? [];
  return runs
    .map((t) => decodeXmlEntities(t.replace(/^<w:t\b[^>]*>/i, '').replace(/<\/w:t>$/i, '')))
    .join('')
    .trim();
}

/** Reads a Word (.docx) document: body paragraphs and table cells, in order. */
export async function extractDocx(data: Uint8Array): Promise<ExtractionResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (error) {
    // Password-protected .docx files are OLE containers, not zip archives.
    const bytes = data.subarray(0, 4);
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
    return unreadable(isOle || looksEncrypted(error) ? 'encrypted' : 'corrupt');
  }

  const docFile = zip.file('word/document.xml');
  if (!docFile) return unreadable('corrupt');
  const xml = await docFile.async('text');
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i)?.[1];
  if (body === undefined) return unreadable('corrupt');

  const paragraphs: ExtractedParagraph[] = [];
  const push = (content: string, row?: number, col?: number) => {
    if (content.length === 0) return;
    const n = paragraphs.length + 1;
    paragraphs.push({
      sequence_no: n,
      location: '¶' + n,
      content,
      ...(row !== undefined ? { table_row: row, table_col: col } : {}),
    });
  };

  const tagRe = /<(w:p|w:tbl)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(body)) !== null) {
    const tag = match[1];
    const closeTag = `</${tag}>`;
    const closeIndex = body.indexOf(closeTag, match.index);
    if (closeIndex === -1) break;
    const element = body.slice(match.index, closeIndex + closeTag.length);
    tagRe.lastIndex = closeIndex + closeTag.length;

    if (tag === 'w:p') {
      push(textOf(element));
    } else {
      const rows = element.match(/<w:tr\b[\s\S]*?<\/w:tr>/gi) ?? [];
      rows.forEach((tr, r) => {
        const cells = tr.match(/<w:tc\b[\s\S]*?<\/w:tc>/gi) ?? [];
        cells.forEach((tc, c) => push(textOf(tc), r + 1, c + 1));
      });
    }
  }
  return ok(paragraphs);
}
