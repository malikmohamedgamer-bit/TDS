// Online co-op settings: data/online.json plus URL overrides (?net=local|relay|supabase and
// ?relay=wss://...; both handled by transportKind / relayUrl in transports.js). Pure apart from
// reading the JSON through the given reader.
import { transportKind, relayUrl } from './transports.js';

const DEFAULTS = { transport: 'local', supabaseUrl: '', supabaseAnonKey: '', relayUrl: '', turnTicks: 6, delayTicks: 12, supabaseTurnTicks: 10 };

/** @param {(path: string) => Promise<object>} readJson  reads a file under data/ */
export async function loadOnlineConfig(readJson, search = globalThis.location?.search ?? '') {
  let file = {};
  try { file = (await readJson('online.json')) || {}; } catch { /* no file: local play only */ }
  return resolveOnlineConfig(file, search);
}

/** Merge the file with defaults and URL overrides; adds `kind`, `relay` and the turn timing to use. */
export function resolveOnlineConfig(file = {}, search = '') {
  const cfg = { ...DEFAULTS, ...file };
  const kind = transportKind(cfg, search);
  const num = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  return {
    ...cfg,
    kind,
    relay: kind === 'relay' ? relayUrl(cfg, search) : '',
    // Supabase counts every message: fewer, larger turns there
    turnTicks: num(kind === 'supabase' ? cfg.supabaseTurnTicks : cfg.turnTicks, 6, 2, 30),
    delayTicks: num(cfg.delayTicks, 12, 4, 60),
    // what the player is told about the connection
    label: kind === 'supabase' ? 'Online (Supabase)' : kind === 'relay' ? 'Online (relay server)' : 'This browser only (local test mode)',
    ready: kind === 'local' || (kind === 'supabase' ? !!(cfg.supabaseUrl && cfg.supabaseAnonKey) : !!relayUrl(cfg, search)),
  };
}
