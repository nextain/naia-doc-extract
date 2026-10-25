// Generates made-up sample documents in memory. No real-world data is used.
import JSZip from 'jszip';
import { loadRhwpModule } from '../src/hwp.js';

export const SAMPLE_PARAGRAPHS = [
  '견본 문서: 동네 도서관 이용 안내 (지어낸 자료)',
  '열람실은 평일 오전 9시부터 오후 6시까지 엽니다.',
  '책은 한 사람이 다섯 권까지 두 주 동안 빌릴 수 있습니다.',
  'Mixed text with symbols: A & B < C > D "quoted".',
  '반납함은 정문 옆에 있습니다.',
];

export const SAMPLE_TABLE: (string | string[])[][] = [
  ['구분', '권수'],
  [['어린이 책', '그림책 포함'], '120권'],
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function createHwp(
  paragraphs: string[],
  options: { lockPhrase?: string; table?: (string | string[])[][] } = {}
): Promise<Uint8Array> {
  const { HwpDocument } = await loadRhwpModule();
  const doc = HwpDocument.createEmpty();
  try {
    doc.createBlankDocument();
    if (paragraphs.length > 0) {
      doc.insertText(0, 0, 0, paragraphs[0]);
      for (let i = 1; i < paragraphs.length; i++) {
        doc.splitParagraph(0, i - 1, doc.getParagraphLength(0, i - 1));
        doc.insertText(0, i, 0, paragraphs[i]);
      }
    }

    const table = options.table;
    if (table && table.length > 0) {
      const rows = table.length;
      const cols = Math.max(...table.map((row) => row.length));
      const anchor = doc.getParagraphCount(0) - 1;
      const created = JSON.parse(
        doc.createTable(0, anchor, doc.getParagraphLength(0, anchor), rows, cols)
      ) as { paraIdx: number; controlIdx: number };

      for (let cell = 0; cell < rows * cols; cell++) {
        const { row, col } = JSON.parse(
          doc.getCellInfo(0, created.paraIdx, created.controlIdx, cell)
        ) as { row: number; col: number };
        const value = table[row]?.[col] ?? '';
        const parts = typeof value === 'string' ? [value] : value;
        for (let p = 0; p < parts.length; p++) {
          if (p > 0) {
            const prevLen = doc.getCellParagraphLength(0, created.paraIdx, created.controlIdx, cell, p - 1);
            doc.splitParagraphInCell(0, created.paraIdx, created.controlIdx, cell, p - 1, prevLen);
          }
          if (parts[p]) {
            doc.insertTextInCell(0, created.paraIdx, created.controlIdx, cell, p, 0, parts[p]);
          }
        }
      }
    }

    return options.lockPhrase ? doc.exportHwpWithPassword(options.lockPhrase) : doc.exportHwp();
  } finally {
    doc.free();
  }
}

export async function createHwpx(paragraphs: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const body = paragraphs
    .map((text, i) => `  <hp:p id="${i}"><hp:run><hp:t>${escapeXml(text)}</hp:t></hp:run></hp:p>`)
    .join('\n');
  zip.file('mimetype', 'application/hwp+zip');
  zip.file(
    'Contents/section0.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
${body}
</hs:sec>`
  );
  return zip.generateAsync({ type: 'uint8array' });
}

export async function createDocx(
  paragraphs: string[],
  table?: string[][]
): Promise<Uint8Array> {
  const zip = new JSZip();
  const p = (text: string) =>
    `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  const tbl = table
    ? `<w:tbl>${table
        .map((row) => `<w:tr>${row.map((cell) => `<w:tc>${p(cell)}</w:tc>`).join('')}</w:tr>`)
        .join('')}</w:tbl>`
    : '';
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map(p)
      .join('')}${tbl}</w:body></w:document>`
  );
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Minimal PDF with an Identity-H font and a ToUnicode map, so every UTF-16
 * code unit maps to itself. A paragraph given as an array is drawn as wrapped
 * lines 18 units apart; paragraphs are 36 units apart.
 */
export function createPdf(pages: (string | string[])[][]): Uint8Array {
  const cmap = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Custom-ToUnicode def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

  const streams = pages.map((paras) => {
    let s = 'BT /F1 12 Tf\n';
    let y = 750;
    for (const para of paras) {
      const lines = Array.isArray(para) ? para : [para];
      lines.forEach((line, i) => {
        const hex = [...line].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
        s += `1 0 0 1 50 ${y} Tm <${hex}> Tj\n`;
        if (i < lines.length - 1) y -= 18;
      });
      y -= 36;
    }
    return s + 'ET\n';
  });

  const n = pages.length;
  const pageIds = pages.map((_, i) => 5 + i);
  const contentIds = pages.map((_, i) => 5 + n + i);
  const offsets: number[] = [];
  let pdf = '%PDF-1.4\n';
  const obj = (id: number, body: string) => {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${body}\nendobj\n`;
  };

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`);
  obj(
    3,
    '<< /Type /Font /Subtype /Type0 /BaseFont /SampleFont /Encoding /Identity-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SampleFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor << /Type /FontDescriptor /FontName /SampleFont /Flags 4 /FontBBox [-1000 -1000 1000 1000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 800 /StemV 80 >> >>] /ToUnicode 4 0 R >>'
  );
  obj(4, `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`);
  pageIds.forEach((id, i) =>
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 1200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[i]} 0 R >>`
    )
  );
  contentIds.forEach((id, i) => obj(id, `<< /Length ${streams[i].length} >>\nstream\n${streams[i]}\nendstream`));

  const total = 4 + 2 * n;
  const xref = Buffer.byteLength(pdf, 'latin1');
  const entries = Array.from({ length: total }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`);
  pdf += `xref\n0 ${total + 1}\n${'0'.repeat(10)} 65535 f \n${entries.join('')}`;
  pdf += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

/** A one-page PDF with no text layer, like a scanned page without OCR. */
export function createTextlessPdf(): Uint8Array {
  const offsets: number[] = [];
  let pdf = '%PDF-1.4\n';
  const obj = (id: number, body: string) => {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${body}\nendobj\n`;
  };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>');
  const xref = pdf.length;
  const entries = [1, 2, 3].map((id) => `${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  pdf += `xref\n0 4\n${'0'.repeat(10)} 65535 f \n${entries.join('')}`;
  pdf += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}
