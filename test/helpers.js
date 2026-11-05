import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadContent } from '../src/core/content.js';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const nodeReadJson = async (path) => JSON.parse(await readFile(join(dataDir, path), 'utf8'));

let cached;
export function content() {
  cached ??= loadContent(nodeReadJson);
  return cached;
}
