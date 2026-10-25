import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  UNREADABLE_MESSAGES,
  UnsupportedFormatError,
  extractDocument,
  normalizeFormat,
} from '../src/index.js';
import {
  SAMPLE_PARAGRAPHS,
  SAMPLE_TABLE,
  createDocx,
  createHwp,
  createHwpx,
  createPdf,
  createTextlessPdf,
} from './fixtures.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const expectedParagraphs = SAMPLE_PARAGRAPHS.map((content, i) => ({
  sequence_no: i + 1,
  location: '¶' + (i + 1),
  content,
}));

describe('HWP (legacy binary Hangul)', () => {
  it('reads paragraphs in order with ¶ positions', async () => {
    const result = await extractDocument(await createHwp(SAMPLE_PARAGRAPHS), 'hwp');
    expect(result).toEqual({ status: 'ok', paragraphs: expectedParagraphs });
  });

  it('reads table cells with 1-based row/column and joins cell paragraphs with a newline', async () => {
    const result = await extractDocument(
      await createHwp(SAMPLE_PARAGRAPHS, { table: SAMPLE_TABLE }),
      'hwp'
    );
    expect(result.status).toBe('ok');
    const cells = result.paragraphs.filter((p) => p.table_row !== undefined);
    expect(cells.map((c) => [c.table_row, c.table_col, c.content])).toEqual([
      [1, 1, '구분'],
      [1, 2, '권수'],
      [2, 1, '어린이 책\n그림책 포함'],
      [2, 2, '120권'],
    ]);
    expect(cells[0].sequence_no).toBe(SAMPLE_PARAGRAPHS.length + 1);
  });

  it('refuses a password-protected file with reason "encrypted"', async () => {
    // public-safety-allow: throwaway lock phrase for a made-up test file, not a secret
    const locked = await createHwp(SAMPLE_PARAGRAPHS, { lockPhrase: 'sample-lock' });
    expect(await extractDocument(locked, 'hwp')).toEqual({
      status: 'unreadable',
      paragraphs: [],
      reason: 'encrypted',
      message: UNREADABLE_MESSAGES.encrypted,
    });
  });

  it('reports a truncated file as "corrupt"', async () => {
    const whole = await createHwp(SAMPLE_PARAGRAPHS);
    const result = await extractDocument(whole.subarray(0, 600), 'hwp');
    expect(result).toMatchObject({ status: 'unreadable', reason: 'corrupt' });
  });
});

describe('HWPX', () => {
  it('reads paragraphs and decodes XML entities', async () => {
    const result = await extractDocument(await createHwpx(SAMPLE_PARAGRAPHS), 'report.HWPX');
    expect(result).toEqual({ status: 'ok', paragraphs: expectedParagraphs });
  });

  it('gives the same content and positions as HWP for the same paragraphs', async () => {
    const [hwp, hwpx] = await Promise.all([
      extractDocument(await createHwp(SAMPLE_PARAGRAPHS), 'hwp'),
      extractDocument(await createHwpx(SAMPLE_PARAGRAPHS), 'hwpx'),
    ]);
    expect(hwp.paragraphs).toEqual(hwpx.paragraphs);
  });

  it('reports non-zip bytes as "corrupt"', async () => {
    const result = await extractDocument(new TextEncoder().encode('not a zip'), 'hwpx');
    expect(result).toMatchObject({ status: 'unreadable', reason: 'corrupt' });
  });
});

describe('DOCX', () => {
  it('reads body paragraphs then table cells with row/column', async () => {
    const result = await extractDocument(
      await createDocx(SAMPLE_PARAGRAPHS, [
        ['구분', '권수'],
        ['어린이 책', '120권'],
      ]),
      '.docx'
    );
    expect(result.status).toBe('ok');
    expect(result.paragraphs.slice(0, SAMPLE_PARAGRAPHS.length)).toEqual(expectedParagraphs);
    expect(result.paragraphs.slice(SAMPLE_PARAGRAPHS.length).map((p) => [p.table_row, p.table_col, p.content])).toEqual([
      [1, 1, '구분'],
      [1, 2, '권수'],
      [2, 1, '어린이 책'],
      [2, 2, '120권'],
    ]);
  });

  it('reports an OLE container (how Word stores locked .docx) as "encrypted"', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(await extractDocument(ole, 'docx')).toMatchObject({ status: 'unreadable', reason: 'encrypted' });
  });

  it('reports an empty document as "no-text"', async () => {
    expect(await extractDocument(await createDocx([]), 'docx')).toMatchObject({
      status: 'unreadable',
      reason: 'no-text',
    });
  });
});

describe('DOC (legacy binary Word)', () => {
  it('reads the five sample lines as ¶1..¶5', async () => {
    const result = await extractDocument(fs.readFileSync(path.join(fixtures, 'sample.doc')), 'doc');
    expect(result.status).toBe('ok');
    expect(result.paragraphs.map((p) => [p.location, p.content])).toEqual([
      ['¶1', '견본 문서: 옛 워드 형식 안내문 (지어낸 자료)'],
      ['¶2', '열람실은 평일 오전 9시부터 오후 6시까지 엽니다.'],
      ['¶3', '책은 한 사람이 다섯 권까지 두 주 동안 빌릴 수 있습니다.'],
      ['¶4', 'Plain English line for the DOC sample.'],
      ['¶5', '반납함은 정문 옆에 있습니다.'],
    ]);
  });

  it('reports random bytes as "corrupt"', async () => {
    const result = await extractDocument(new Uint8Array(64).fill(7), 'doc');
    expect(result).toMatchObject({ status: 'unreadable', reason: 'corrupt' });
  });
});

describe('PDF', () => {
  const pages = [
    [SAMPLE_PARAGRAPHS[0], SAMPLE_PARAGRAPHS[1]],
    [
      ['첫 줄은 여기서 끝나고', '둘째 줄이 같은 문단으로 이어집니다.'],
      SAMPLE_PARAGRAPHS[4],
    ],
  ];

  it('keeps page numbers and per-page paragraph numbers', async () => {
    const result = await extractDocument(createPdf(pages), 'pdf');
    expect(result.status).toBe('ok');
    expect(result.paragraphs.map((p) => [p.sequence_no, p.page, p.location])).toEqual([
      [1, 1, '1쪽 ¶1'],
      [2, 1, '1쪽 ¶2'],
      [3, 2, '2쪽 ¶1'],
      [4, 2, '2쪽 ¶2'],
    ]);
    expect(result.paragraphs[0].content).toBe(SAMPLE_PARAGRAPHS[0]);
  });

  it('joins wrapped lines into one paragraph', async () => {
    const result = await extractDocument(createPdf(pages), 'pdf');
    expect(result.paragraphs.find((p) => p.location === '2쪽 ¶1')?.content).toBe(
      '첫 줄은 여기서 끝나고 둘째 줄이 같은 문단으로 이어집니다.'
    );
  });

  it('does not detach the caller buffer', async () => {
    const bytes = createPdf(pages);
    await extractDocument(bytes, 'pdf');
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect((await extractDocument(bytes, 'pdf')).status).toBe('ok');
  });

  it('reports a PDF without a text layer as "no-text" (no OCR)', async () => {
    expect(await extractDocument(createTextlessPdf(), 'pdf')).toMatchObject({
      status: 'unreadable',
      reason: 'no-text',
    });
  });

  it('reports a password-protected PDF as "encrypted"', async () => {
    const result = await extractDocument(fs.readFileSync(path.join(fixtures, 'encrypted.pdf')), 'pdf');
    expect(result).toMatchObject({ status: 'unreadable', reason: 'encrypted' });
  });
});

describe('format handling', () => {
  it('normalizes extensions and file names', () => {
    expect(normalizeFormat('HWP')).toBe('hwp');
    expect(normalizeFormat('.docx')).toBe('docx');
    expect(normalizeFormat('folder/report.final.pdf')).toBe('pdf');
    expect(normalizeFormat('notes.txt')).toBeUndefined();
  });

  it('throws UnsupportedFormatError for other formats', async () => {
    await expect(extractDocument(new Uint8Array(1), 'xlsx')).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});
