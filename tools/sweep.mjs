// node tools/sweep.mjs [--seeds 20] [--jobs 4] [--out docs/balance-sweep.json]
// Final balance sweep: every map on Standard Normal with the 12 core towers (the calibration
// baseline), run as parallel tools/balance.mjs processes. Prints one line per map and a summary,
// and writes the numbers to a JSON file so docs can quote them.
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const seeds = Number(opt('seeds', 20));
const jobs = Number(opt('jobs', 4));
const out = opt('out', 'docs/balance-sweep.json');
const CORE = 'rifleman,marksman,gunner,rocket_battery,gunship,supply_depot,mine_layer,ember_adept,frost_weaver,storm_caller,rune_totem,spirit_summoner';
const index = JSON.parse(readFileSync('data/index.json', 'utf8'));
const maps = index.maps.map((f) => JSON.parse(readFileSync(`data/${f}`, 'utf8')).id);

const results = [];
const queue = [...maps];
const run = (id) => new Promise((resolve) => {
  execFile(process.execPath, ['tools/balance.mjs', '--map', id, '--seeds', String(seeds), '--loadout', CORE], { maxBuffer: 1 << 24 }, (err, stdout) => {
    const m = /(\d+)\/(\d+) won/.exec(stdout || '');
    const r = { map: id, wins: m ? Number(m[1]) : null, seeds, rate: m ? Number(m[1]) / Number(m[2]) : null, error: err ? String(err.message).slice(0, 120) : undefined };
    results.push(r);
    console.log(`${id.padEnd(20)} ${r.wins}/${seeds} ${r.rate === null ? 'FAILED' : `${Math.round(r.rate * 100)}%`}`);
    resolve();
  });
});
const worker = async () => { while (queue.length) await run(queue.shift()); };
await Promise.all(Array.from({ length: jobs }, worker));

results.sort((a, b) => maps.indexOf(a.map) - maps.indexOf(b.map));
const ok = results.filter((r) => r.rate !== null);
const inBand = (lo, hi) => ok.filter((r) => r.rate >= lo && r.rate <= hi).length;
const summary = {
  date: new Date().toISOString().slice(0, 10), seeds, loadout: 'core 12', difficulty: 'normal', preset: 'standard',
  maps: ok.length, mean: +(ok.reduce((a, r) => a + r.rate, 0) / Math.max(1, ok.length)).toFixed(3),
  in60to70: inBand(0.6, 0.7), in50to80: inBand(0.5, 0.8), below50: ok.filter((r) => r.rate < 0.5).map((r) => r.map), above80: ok.filter((r) => r.rate > 0.8).map((r) => r.map),
};
writeFileSync(out, `${JSON.stringify({ summary, results }, null, 1)}\n`);
console.log(JSON.stringify(summary));
