// Per-map difficulty calibration above Normal (data/difficultyHp.json). For each map and difficulty
// the balance bot (12 core towers, Standard, skill 0.7) plays at the tower level the difficulty
// unlocks at; the map's enemy health factor for that difficulty is nudged until the win rate is in
// the band (default 50-75%, aiming at 65%), at most --tries measurements per cell. Results are
// written after every cell, so a cut-off run resumes where it stopped (cells already in the file are
// skipped unless --force).
//   node tools/ladder-calibrate.mjs [--maps all|a,b] [--difficulty medium,hard,...] [--seeds 12]
//     [--jobs 4] [--tries 3] [--force]
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const seeds = Number(opt('seeds', 12));
const jobs = Number(opt('jobs', 4));
const tries = Number(opt('tries', 3));
const force = args.includes('--force');
const LO = 0.5;
const HI = 0.75;
const AIM = 0.65;
const CORE = 'rifleman,marksman,gunner,rocket_battery,gunship,supply_depot,mine_layer,ember_adept,frost_weaver,storm_caller,rune_totem,spirit_summoner';
const GATE = { medium: 3, hard: 6, extra_hard: 9, extreme: 12, impossible: 15 };
const FILE = 'data/difficultyHp.json';
const LOG = 'docs/balance-difficulty.json';

const index = JSON.parse(readFileSync('data/index.json', 'utf8'));
const allMaps = index.maps.map((f) => JSON.parse(readFileSync(`data/${f}`, 'utf8')).id);
const maps = opt('maps', 'all') === 'all' ? allMaps : opt('maps').split(',');
const diffs = opt('difficulty', Object.keys(GATE).join(',')).split(',');
const data = JSON.parse(readFileSync(FILE, 'utf8'));
let log = {};
try { log = JSON.parse(readFileSync(LOG, 'utf8')); } catch { /* first run */ }

const save = () => {
  writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`);
  writeFileSync(LOG, `${JSON.stringify(log, null, 1)}\n`);
};

const measure = (map, diff, f) => new Promise((resolve) => {
  const a = ['tools/balance.mjs', '--map', map, '--seeds', String(seeds), '--loadout', CORE, '--difficulty', diff, '--level', String(GATE[diff]), '--diffhp', String(f)];
  execFile(process.execPath, a, { maxBuffer: 1 << 24 }, (err, stdout) => {
    const m = /(\d+)\/(\d+) won/.exec(stdout || '');
    resolve(m ? +m[1] / +m[2] : null);
  });
});

async function cell(map, diff) {
  const pts = [];
  let f = 1;
  for (let t = 0; t < tries; t++) {
    const rate = await measure(map, diff, f);
    if (rate === null) { console.log(`${map} ${diff}: measurement failed at x${f}`); break; }
    pts.push({ f: +f.toFixed(3), rate });
    if (rate >= LO && rate <= HI) break;
    let next;
    if (pts.length === 1 || pts.at(-1).rate === pts.at(-2).rate) {
      // win rate is steep (about 25 points per 10% health at Normal, steeper higher up): move
      // gently, then further if the same rate comes back (0% or 100% twice)
      const p = pts.at(-1);
      const step = pts.length === 1 ? 0.18 : 0.35;
      next = p.rate > AIM ? p.f * (1 + step) : p.f / (1 + step);
    } else {
      const [p, q] = pts.slice(-2);
      next = p.f + ((AIM - p.rate) * (q.f - p.f)) / (q.rate - p.rate);
      next = Math.max(Math.min(p.f, q.f) * 0.8, Math.min(Math.max(p.f, q.f) * 1.25, next));
    }
    f = Math.max(0.3, Math.min(3, next));
  }
  if (!pts.length) return;
  const best = pts.reduce((b, p) => (Math.abs(p.rate - AIM) < Math.abs(b.rate - AIM) ? p : b));
  (data.maps[map] ||= {})[diff] = best.f;
  (log[map] ||= {})[diff] = pts.map((p) => `x${p.f} -> ${Math.round(p.rate * 100)}%`).join(', ');
  save();
  console.log(`${map.padEnd(20)} ${diff.padEnd(11)} ${log[map][diff]} => x${best.f}`);
}

const queue = [];
for (const map of maps) for (const diff of diffs) if (force || data.maps[map]?.[diff] === undefined) queue.push([map, diff]);
console.log(`${queue.length} cells to calibrate (${seeds} seeds, ${jobs} jobs)`);
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await cell(...queue.shift()); }));
// keep the file tidy: maps in index order, difficulties in ladder order
data.maps = Object.fromEntries(allMaps.filter((m) => data.maps[m]).map((m) => [m, Object.fromEntries(Object.keys(GATE).filter((d) => data.maps[m][d] !== undefined).map((d) => [d, data.maps[m][d]]))]));
save();
console.log('done');
