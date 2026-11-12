// node tools/package-itch.mjs: builds the site and zips it for itch.io (an HTML5 upload whose
// index.html is at the zip root). Output: dist/tds-<version>-web.zip. The zip is written here with
// node:zlib (no system zip tool needed): standard deflate entries, central directory, no zip64
// (the site is far below 4 GB and 65535 files).
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { join, resolve } from 'node:path';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const dist = resolve('dist');
const site = join(dist, 'itch');
const out = join(dist, `tds-${version}-web.zip`);
rmSync(site, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
execFileSync(process.execPath, ['tools/build-site.mjs', site], { stdio: 'inherit' });

const files = readdirSync(site, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile())
  .map((d) => join(d.parentPath, d.name))
  .sort();
const chunks = [];
const central = [];
let offset = 0;
// fixed DOS timestamp (2026-01-01 00:00) so the same site gives the same zip
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
for (const full of files) {
  const name = Buffer.from(full.slice(site.length + 1).replaceAll('\\', '/'), 'utf8');
  const raw = readFileSync(full);
  const packed = deflateRawSync(raw, { level: 9 });
  const useDeflate = packed.length < raw.length;
  const body = useDeflate ? packed : raw;
  const crc = crc32(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, name, body);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(20, 4);
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(useDeflate ? 8 : 0, 10);
  c.writeUInt16LE(DOS_TIME, 12);
  c.writeUInt16LE(DOS_DATE, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(body.length, 20);
  c.writeUInt32LE(raw.length, 24);
  c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += local.length + name.length + body.length;
}
const cdSize = central.reduce((a, b) => a + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...chunks, ...central, end]);
writeFileSync(out, zip);
console.log(`${out}: ${(zip.length / 1048576).toFixed(1)} MB, ${files.length} files (itch.io HTML5 limits: 500 MB, 1000 files)`);
