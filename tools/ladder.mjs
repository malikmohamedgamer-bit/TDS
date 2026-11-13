// Difficulty ladder, presets and modes in one run (ROADMAP chunk 3): the 12 core towers, bot skill
// 0.7, 20 seeds per row by default, rows in parallel. Writes docs/balance-ladder.json.
//   node tools/ladder.mjs [--seeds 20] [--jobs 4] [--out docs/balance-ladder.json] [--maps a,b --difficulty a,b]
// Gate levels: the permanent tower level a player has when the difficulty unlocks (docs/TUNING.md).
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const seeds = Number(opt('seeds', 20));
const jobs = Number(opt('jobs', 4));
const out = opt('out', 'docs/balance-ladder.json');
const CORE = 'rifleman,marksman,gunner,rocket_battery,gunship,supply_depot,mine_layer,ember_adept,frost_weaver,storm_caller,rune_totem,spirit_summoner';

const GATES = [['easy', 1], ['normal', 1], ['medium', 3], ['hard', 6], ['extra_hard', 9], ['extreme', 12], ['impossible', 15]];
// --maps a,b and --difficulty a,b: only the ladder rows for those (no presets or modes)
const onlyMaps = opt('maps', null)?.split(',');
const onlyDiffs = opt('difficulty', null)?.split(',');
const rows = [];
for (const map of onlyMaps || ['riftline', 'frostmere']) for (const [difficulty, level] of GATES) if (!onlyDiffs || onlyDiffs.includes(difficulty)) rows.push({ kind: 'ladder', map, difficulty, level });
if (!onlyMaps) for (const preset of ['relaxed', 'original']) rows.push({ kind: 'preset', map: 'riftline', difficulty: 'normal', level: 1, preset });
// modes on Riftline Normal (Daily has its own date-based check: npm run balance -- --daily 10)
if (!onlyMaps) for (const mode of ['endless', 'boss_rush', 'time_attack', 'challenge', 'skirmish', 'mutation', 'war_chest', 'last_stand']) {
  rows.push({ kind: 'mode', map: 'riftline', difficulty: 'normal', level: mode === 'last_stand' ? 5 : 1, mode });
}

const run = (r) => new Promise((resolve) => {
  const a = ['tools/balance.mjs', '--map', r.map, '--seeds', String(seeds), '--loadout', CORE, '--difficulty', r.difficulty, '--level', String(r.level)];
  if (r.preset) a.push('--preset', r.preset);
  if (r.mode) a.push('--mode', r.mode);
  const t0 = Date.now();
  execFile(process.execPath, a, { maxBuffer: 1 << 24 }, (err, stdout) => {
    const m = /(\d+)\/(\d+) won \((\d+)%\), avg waves cleared ([\d.]+)/.exec(stdout || '');
    Object.assign(r, m ? { wins: +m[1], seeds: +m[2], rate: +m[1] / +m[2], waves: +m[4] } : { error: String(err?.message || stdout).slice(0, 160) });
    console.log(`${r.kind.padEnd(6)} ${r.map.padEnd(10)} ${(r.mode || r.preset || r.difficulty).padEnd(12)} L${r.level}: ${m ? `${r.wins}/${r.seeds} (${Math.round(r.rate * 100)}%), waves ${r.waves}` : `FAILED ${r.error}`} [${Math.round((Date.now() - t0) / 1000)}s]`);
    resolve();
  });
});
const queue = [...rows];
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await run(queue.shift()); }));
writeFileSync(out, `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), seeds, loadout: 'core 12', skill: 0.7, rows }, null, 1)}\n`);
console.log(`wrote ${out}`);
