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

/** The curated core towers (not generated batches, not legendary): what the balance tests guard. */
export const coreTowers = (C) => [...C.towers.values()].filter((t) => !t.generated && t.rarity !== 'legendary').map((t) => t.id);
