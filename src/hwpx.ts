import JSZip from 'jszip';
import { ExtractedParagraph, ExtractionResult, ok, unreadable } from './types.js';
import { decodeXmlEntities } from './xml.js';

/** Reads an HWPX (OWPML, zip-based Hangul) document, section by section. */
export async function extractHwpx(data: Uint8Array): Promise<ExtractionResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return unreadable('corrupt');
  }

  const sections = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0));
  if (sections.length === 0) return unreadable('corrupt');

  const paragraphs: ExtractedParagraph[] = [];
  for (const name of sections) {
    const xml = await zip.file(name)!.async('text');
    const pXmls = xml.match(/<(?:hp:)?p\b[\s\S]*?<\/(?:hp:)?p>/gi) ?? [];
    for (const pXml of pXmls) {
      const runs = pXml.match(/<(?:hp:)?t\b[^>]*>([\s\S]*?)<\/(?:hp:)?t>/gi) ?? [];
      const content = runs
        .map((t) =>
          decodeXmlEntities(t.replace(/^<(?:hp:)?t\b[^>]*>/i, '').replace(/<\/(?:hp:)?t>$/i, ''))
        )
        .join('')
        .trim();
      if (content.length > 0) {
        const n = paragraphs.length + 1;
        paragraphs.push({ sequence_no: n, location: '¶' + n, content });
      }
    }
  }
  return ok(paragraphs);
}
