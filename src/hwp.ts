import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { HwpDocument } from '@rhwp/core';
import {
  ExtractedParagraph,
  ExtractionResult,
  errorMessage,
  looksEncrypted,
  ok,
  unreadable,
} from './types.js';

type RhwpModule = typeof import('@rhwp/core');

export interface HwpOptions {
  /**
   * Path to `rhwp_bg.wasm`. Lookup order: this option, the `RHWP_WASM_PATH`
   * environment variable, then the copy installed with `@rhwp/core`.
   */
  wasmPath?: string;
}

let rhwpModulePromise: Promise<RhwpModule> | undefined;

class RhwpEngineLoadError extends Error {
  constructor(readonly originalError: unknown) {
    super(errorMessage(originalError));
    this.name = 'RhwpEngineLoadError';
  }
}

function resolveWasmPath(options: HwpOptions): string {
  if (options.wasmPath !== undefined) return path.resolve(options.wasmPath);
  if (process.env.RHWP_WASM_PATH) return path.resolve(process.env.RHWP_WASM_PATH);
  return createRequire(import.meta.url).resolve('@rhwp/core/rhwp_bg.wasm');
}

/**
 * Loads and initialises the rhwp WebAssembly engine once per process.
 * A failed load is not cached, so the next call retries.
 */
export function loadRhwpModule(options: HwpOptions = {}): Promise<RhwpModule> {
  if (rhwpModulePromise) return rhwpModulePromise;

  let wasmPath: string;
  try {
    wasmPath = resolveWasmPath(options);
  } catch (error) {
    return Promise.reject(new RhwpEngineLoadError(error));
  }

  const pending = (async () => {
    try {
      const mod = await import('@rhwp/core');
      await mod.default({ module_or_path: fs.readFileSync(wasmPath) });
      return mod;
    } catch (error) {
      throw new RhwpEngineLoadError(error);
    }
  })();

  rhwpModulePromise = pending;
  void pending.catch(() => {
    if (rhwpModulePromise === pending) rhwpModulePromise = undefined;
  });
  return pending;
}

function readTableCells(
  doc: HwpDocument,
  section: number,
  paragraph: number,
  push: (content: string, row: number, col: number) => void
): void {
  let controlCount = 0;
  try {
    const positions = JSON.parse(doc.getControlTextPositions(section, paragraph));
    if (Array.isArray(positions)) controlCount = positions.length;
  } catch {
    controlCount = 0;
  }

  for (let control = 0; control < controlCount; control++) {
    let dims: { cellCount?: number; rowCount?: number; colCount?: number };
    try {
      dims = JSON.parse(doc.getTableDimensions(section, paragraph, control));
    } catch {
      continue; // Not a table (text box, picture, ...).
    }

    const cellCount = dims.cellCount ?? (dims.rowCount ?? 0) * (dims.colCount ?? 0);
    if (!Number.isInteger(cellCount) || cellCount <= 0) continue;

    for (let cell = 0; cell < cellCount; cell++) {
      try {
        const info = JSON.parse(doc.getCellInfo(section, paragraph, control, cell)) as {
          row: number;
          col: number;
        };
        const count = doc.getCellParagraphCount(section, paragraph, control, cell);
        const parts: string[] = [];
        for (let p = 0; p < count; p++) {
          const len = doc.getCellParagraphLength(section, paragraph, control, cell, p);
          const text = doc.getTextInCell(section, paragraph, control, cell, p, 0, len).trim();
          if (text.length > 0) parts.push(text);
        }
        const content = parts.join('\n');
        if (content.length > 0) push(content, info.row + 1, info.col + 1);
      } catch {
        // One malformed cell does not hide the others.
      }
    }
  }
}

/** Reads a legacy binary HWP (Hangul Word Processor 5.x) document. */
export async function extractHwp(
  data: Uint8Array,
  options: HwpOptions = {}
): Promise<ExtractionResult> {
  let doc: HwpDocument | undefined;

  try {
    const { HwpDocument } = await loadRhwpModule(options);
    doc = new HwpDocument(new Uint8Array(data));

    const paragraphs: ExtractedParagraph[] = [];
    const push = (content: string, row?: number, col?: number) => {
      const n = paragraphs.length + 1;
      paragraphs.push({
        sequence_no: n,
        location: '¶' + n,
        content,
        ...(row !== undefined ? { table_row: row, table_col: col } : {}),
      });
    };

    for (let section = 0; section < doc.getSectionCount(); section++) {
      const count = doc.getParagraphCount(section);
      for (let paragraph = 0; paragraph < count; paragraph++) {
        const len = doc.getParagraphLength(section, paragraph);
        const text = doc.getTextRange(section, paragraph, 0, len).trim();
        if (text.length > 0) push(text);
        readTableCells(doc, section, paragraph, push);
      }
    }

    return ok(paragraphs);
  } catch (error) {
    if (error instanceof RhwpEngineLoadError) return unreadable('engine-unavailable');
    // rhwp has no typed error kinds; encrypted files are reported by message.
    return unreadable(looksEncrypted(error) ? 'encrypted' : 'corrupt');
  } finally {
    doc?.free();
  }
}
