// browserReadJson: one data/bundle.json request when the built site has it, single files otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserReadJson } from '../../src/core/content.js';

test('browserReadJson reads the bundle once, falls back to single files, and hands out copies', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      calls.push(url);
      if (url === 'b/bundle.json') return { ok: true, json: async () => ({ 'a.json': { n: 1 } }) };
      if (url === 'b/x.json') return { ok: true, json: async () => ({ x: true }) };
      return { ok: false, status: 404 };
    };
    const read = browserReadJson('b/');
    const a1 = await read('a.json');
    a1.n = 99; // a loader that edits what it got must not change the next read
    assert.deepEqual(await read('a.json'), { n: 1 });
    assert.deepEqual(await read('x.json'), { x: true }, 'not in the bundle: its own file');
    assert.equal(calls.filter((u) => u === 'b/bundle.json').length, 1, 'bundle fetched once');
    globalThis.fetch = async (url) => { calls.push(url); return url.endsWith('bundle.json') ? { ok: false, status: 404 } : { ok: true, json: async () => ({ ok: url }) }; };
    assert.deepEqual(await browserReadJson('dev/')('m.json'), { ok: 'dev/m.json' }, 'no bundle (dev server): single files');
  } finally {
    globalThis.fetch = realFetch;
  }
});
