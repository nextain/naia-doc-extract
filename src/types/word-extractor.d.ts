declare module 'word-extractor' {
  interface WordExtractorDocument {
    getBody(options?: { filterUnicode?: boolean }): string;
    getTextboxes(options?: {
      filterUnicode?: boolean;
      includeHeadersAndFooters?: boolean;
      includeBody?: boolean;
    }): string;
  }

  export default class WordExtractor {
    extract(source: Buffer | string): Promise<WordExtractorDocument>;
  }
}
