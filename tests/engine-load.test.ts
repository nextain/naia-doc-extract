// Runs in its own module context (vitest isolates test files), so the engine starts unloaded.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNREADABLE_MESSAGES, extractHwp } from '../src/index.js';
import { SAMPLE_PARAGRAPHS, createHwp } from './fixtures.js';

describe('HWP engine loading', () => {
  it('reports a missing engine file as "engine-unavailable", retries later, then keeps the loaded engine', async () => {
    const hwpx = new Uint8Array(16);
    const missing = path.join(import.meta.dirname, 'does-not-exist.wasm');

    for (let i = 0; i < 2; i++) {
      expect(await extractHwp(hwpx, { wasmPath: missing })).toEqual({
        status: 'unreadable',
        paragraphs: [],
        reason: 'engine-unavailable',
        message: UNREADABLE_MESSAGES['engine-unavailable'],
      });
    }

    const sample = await createHwp(SAMPLE_PARAGRAPHS); // loads the engine from @rhwp/core
    expect((await extractHwp(sample)).status).toBe('ok');
    expect((await extractHwp(sample, { wasmPath: missing })).status).toBe('ok');
  });
});
