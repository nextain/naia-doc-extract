# naia-doc-extract

한글(HWP·HWPX)·워드(DOC·DOCX)·PDF 파일의 바이트를 받아 문단 글자와 그 위치를
돌려주는 Node.js 모듈입니다. 문서를 AI 에 넘기거나 근거 문장의 위치를 보여 줄 때
쓰려고 만들었습니다.

[English](#english)

## 만든 까닭과 감사

넥스테인은 [이음오피스(IeumOffice)](https://github.com/pblsketch/openoffice)의
문서 처리 방식(`packages/file-parse`)을 참고해, 여러 서비스가 코드 수준에서 그대로
다시 쓸 수 있도록 이 모듈을 독립 저장소로 개발했습니다. 옛 한글은 rhwp, 옛 워드는
word-extractor 로 읽는다는 선택을 이음오피스에서 배웠습니다. 이음오피스의 코드는
옮겨 오지 않았고, 이 저장소의 코드는 새로 작성했습니다.

문서 처리 방법을 오픈소스로 공개해 주신 이음오피스 만드신 분들께 감사드립니다.

## 지원 형식

| 형식 | 읽는 방법 | 위치 표기 | 표 |
| --- | --- | --- | --- |
| HWP (한글 5.x) | [@rhwp/core](https://github.com/edwardkim/rhwp) | `¶3` | 칸마다 행·열 번호 |
| HWPX | zip 안 `Contents/section*.xml` | `¶3` | 칸 번호 없음 |
| DOC (워드 97–2003) | [word-extractor](https://github.com/morungos/node-word-extractor) | `¶3` | 칸 번호 없음 |
| DOCX | zip 안 `word/document.xml` | `¶3` | 칸마다 행·열 번호 |
| PDF | [unpdf](https://github.com/unjs/unpdf) (pdf.js) | `2쪽 ¶1` | 없음 |

## 설치

```sh
npm install github:nextain/naia-doc-extract
```

Node.js 22 이상, ESM 전용입니다(PDF 엔진 unpdf 가 Node.js 22 이상을 요구합니다). 브라우저에서는 쓰지 않습니다.

## 사용

```ts
import { readFile } from 'node:fs/promises';
import { extractDocument } from '@nextain/naia-doc-extract';

const result = await extractDocument(await readFile('회의록.hwp'), '회의록.hwp');

if (result.status === 'ok') {
  for (const p of result.paragraphs) console.log(p.location, p.content);
} else {
  console.log(result.reason, result.message); // 예: 'encrypted', '암호가 걸린 문서라 …'
}
```

두 번째 인자는 `hwp`, `.HWP`, `보고서.hwp` 처럼 형식이나 파일 이름 어느 쪽이든
됩니다. 형식별 함수(`extractHwp`, `extractHwpx`, `extractDoc`, `extractDocx`,
`extractPdf`)도 따로 씁니다.

돌려주는 값:

```ts
type ExtractionResult =
  | { status: 'ok'; paragraphs: ExtractedParagraph[] }
  | { status: 'unreadable'; paragraphs: []; reason: UnreadableReason; message: string };

interface ExtractedParagraph {
  sequence_no: number;   // 문서 전체에서 1부터
  location: string;      // '¶3' 또는 '2쪽 ¶1'
  content: string;       // 표 한 칸 안의 여러 문단은 '\n' 으로 이음
  page?: number;         // PDF 만
  table_row?: number;    // 표 칸일 때 1부터
  table_col?: number;
}

type UnreadableReason = 'encrypted' | 'corrupt' | 'no-text' | 'engine-unavailable';
```

읽지 못하는 문서는 예외를 던지지 않고 `status: 'unreadable'` 로 돌려줍니다. 지원하지
않는 형식만 `UnsupportedFormatError` 를 던집니다.

HWP 엔진의 WebAssembly 파일은 설치된 `@rhwp/core` 에서 찾습니다. 묶음 도구 때문에
경로가 달라지면 `extractDocument(bytes, 'hwp', { hwp: { wasmPath } })` 나 환경 변수
`RHWP_WASM_PATH` 로 알려 줍니다.

## 한계

- 스캔한 PDF 처럼 글자 층이 없는 문서는 글자 인식(OCR)을 하지 않습니다. `no-text` 로 돌려줍니다.
- HWP 글상자 안의 글자는 아직 읽지 않습니다.
- 암호가 걸린 문서는 풀지 않고 거절합니다. HWP·DOCX·PDF 는 `encrypted`, 암호 걸린 HWPX 는 아직 구별하지 못해 `corrupt` 로 나올 수 있습니다.
- HWP·HWPX·DOC·DOCX 의 머리말·꼬리말·각주는 읽지 않습니다(DOC 의 글상자는 본문 뒤에 붙입니다). PDF 는 쪽에 찍힌 글자를 모두 읽으므로 머리말·꼬리말도 문단으로 나옵니다.
- HWPX·DOC 의 표는 칸 번호 없이 문단으로 나오며, HWPX 표 안 글자는 순서가 흐트러질 수 있습니다.
- PDF 는 줄 사이 간격으로 문단을 나눕니다. 여러 단으로 짠 쪽은 읽는 순서가 바뀔 수 있습니다.

## 시험

```sh
npm install
npm test
```

시험 견본은 모두 지어낸 자료입니다. HWP·HWPX·DOCX·PDF 견본은 시험 중에 만들고,
`tests/fixtures/` 에는 만들기 어려운 두 파일만 둡니다.

- `sample.doc`: `sample-doc.html` 을 LibreOffice 로 바꾼 파일
  (`soffice --headless --convert-to 'doc:MS Word 97' sample-doc.html`)
- `encrypted.pdf`: `python3 scripts/make-encrypted-pdf.py` (pikepdf 필요)

## 사용권

[Apache License 2.0](LICENSE). 참고 출처와 의존성의 사용권은 [NOTICE](NOTICE) 에
적었습니다. 의존성: @rhwp/core(MIT), word-extractor(MIT), unpdf(MIT, pdf.js 는
Apache 2.0), jszip(MIT 또는 GPL-3.0 중 MIT 로 사용).

---

## English

`naia-doc-extract` reads paragraphs (text plus position) from HWP, HWPX, DOC,
DOCX and PDF bytes in Node.js 22+ (ESM only; the PDF engine unpdf requires Node.js 22+).

Nextain developed it as a standalone module, informed by the document-handling
approach of [IeumOffice](https://github.com/pblsketch/openoffice)
(`packages/file-parse`), so that several services can reuse it at the code
level. No IeumOffice code was copied. Our thanks to the IeumOffice authors for
publishing their work as open source.

```ts
import { extractDocument } from '@nextain/naia-doc-extract';
const result = await extractDocument(bytes, 'report.hwp');
// { status: 'ok', paragraphs: [{ sequence_no, location, content, page?, table_row?, table_col? }] }
// or { status: 'unreadable', reason: 'encrypted' | 'corrupt' | 'no-text' | 'engine-unavailable', message }
```

Limits: no OCR for scanned PDFs; text inside HWP text boxes is not read yet;
password-protected documents are refused (`encrypted`; a locked HWPX may
come back as `corrupt`); headers, footers and footnotes are skipped except in
PDF, where every printed line is read; HWPX and DOC tables come out without cell coordinates.

License: Apache-2.0. Dependency licenses and the reference to IeumOffice are
listed in [NOTICE](NOTICE).
