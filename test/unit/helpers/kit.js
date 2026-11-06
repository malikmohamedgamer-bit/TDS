import { BOSS_BODIES, BOSS_PARTS } from '../../../src/engine/bossKit.js';
export function checkKit(kit) {
  if (!BOSS_BODIES[kit.body]) throw new Error(`body ${kit.body}`);
  for (const p of kit.parts) if (!BOSS_PARTS[p]) throw new Error(`part ${p}`);
}
