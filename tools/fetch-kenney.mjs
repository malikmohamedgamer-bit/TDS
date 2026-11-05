// node tools/fetch-kenney.mjs <slug> [<slug> ...]
// Downloads CC0 asset packs from the official kenney.nl site the same way its Download button
// does (asks kenney.nl/download-link/<id> for a fresh signed URL), into assets/packs/_zips/<slug>.zip.
// The raw packs are not committed (see .gitignore); docs/credits.md lists every pack and URL.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (TDS asset fetch)';
mkdirSync('assets/packs/_zips', { recursive: true });
for (const slug of process.argv.slice(2)) {
  if (!/^[a-z0-9-]+$/.test(slug)) { console.log(`${slug}: bad slug`); continue; }
  const page = `https://kenney.nl/assets/${slug}`;
  const html = await (await fetch(page, { headers: { 'User-Agent': UA } })).text();
  if (!/CC0/.test(html)) { console.log(`${slug}: page does not say CC0, skipped`); continue; }
  const id = Buffer.from(`assets/${slug}`).toString('hex');
  const res = await fetch(`https://kenney.nl/download-link/${id}`, { headers: { 'User-Agent': UA, Referer: page } });
  const data = await res.json().catch(() => ({}));
  if (!data.url || !data.url.startsWith('https://kenney.nl/download/')) { console.log(`${slug}: no download link (manual: ${page})`); continue; }
  const zip = await fetch(data.url, { headers: { 'User-Agent': UA, Referer: page } });
  const buf = Buffer.from(await zip.arrayBuffer());
  if (buf.subarray(0, 2).toString() !== 'PK') { console.log(`${slug}: response is not a zip (manual: ${page})`); continue; }
  writeFileSync(`assets/packs/_zips/${slug}.zip`, buf);
  console.log(`${slug}: ${(buf.length / 1e6).toFixed(1)} MB`);
}
