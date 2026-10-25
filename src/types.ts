/** One paragraph (or one table cell) read from a document. */
export interface ExtractedParagraph {
  /** 1-based order across the whole document. */
  sequence_no: number;
  /** Human-readable position: `¶3` for word processors, `2쪽 ¶1` for PDF. */
  location: string;
  /** Plain text. Paragraphs inside one table cell are joined with `\n`. */
  content: string;
  /** 1-based page number (PDF only). */
  page?: number;
  /** 1-based table row, when the text came from a table cell. */
  table_row?: number;
  /** 1-based table column, when the text came from a table cell. */
  table_col?: number;
}

/** Why a document could not be read. */
export type UnreadableReason =
  /** Password-protected document. */
  | 'encrypted'
  /** Damaged file, or bytes that are not the declared format. */
  | 'corrupt'
  /** The file opened but contained no text (for example a scanned PDF). */
  | 'no-text'
  /** The HWP WebAssembly engine could not be loaded (environment problem). */
  | 'engine-unavailable';

export type ExtractionResult =
  | { status: 'ok'; paragraphs: ExtractedParagraph[] }
  | {
      status: 'unreadable';
      paragraphs: [];
      reason: UnreadableReason;
      /** Short Korean message that can be shown to an end user. */
      message: string;
    };

export const UNREADABLE_MESSAGES: Record<UnreadableReason, string> = {
  encrypted: '암호가 걸린 문서라 읽지 못합니다. 암호를 풀어 다시 올려 주세요.',
  corrupt: '문서가 손상되었거나 형식이 맞지 않아 읽지 못합니다.',
  'no-text': '글자를 찾지 못했습니다(그림만 있는 문서일 수 있음).',
  'engine-unavailable': '한글 읽기 엔진을 불러오지 못했습니다(설치·설정 문제).',
};

export function unreadable(reason: UnreadableReason): ExtractionResult {
  return { status: 'unreadable', paragraphs: [], reason, message: UNREADABLE_MESSAGES[reason] };
}

export function ok(paragraphs: ExtractedParagraph[]): ExtractionResult {
  return paragraphs.length === 0 ? unreadable('no-text') : { status: 'ok', paragraphs };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Libraries used here report encryption only through message text. */
export function looksEncrypted(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  return name === 'PasswordException' || /암호|password|encrypt/i.test(errorMessage(error));
}
