// Chunking for large session messages (snapshots). Transports have message size limits (Supabase
// Realtime ~256 KB, the relay 512 KB), so the session layer splits big JSON strings into parts of at
// most CHUNK_BYTES UTF-8 bytes and reassembles them on the other side. Pure: no DOM.

/** Default chunk size: 48 KB of UTF-8 (docs/multiplayer.md contract 3). */
export const CHUNK_BYTES = 48 * 1024;

/** UTF-8 byte length of one UTF-16 code unit sequence starting at i (handles surrogate pairs). */
function charBytes(str, i) {
  const c = str.charCodeAt(i);
  if (c < 0x80) return [1, 1];
  if (c < 0x800) return [2, 1];
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
    const d = str.charCodeAt(i + 1);
    if (d >= 0xdc00 && d <= 0xdfff) return [4, 2]; // a surrogate pair is one 4-byte character
  }
  return [3, 1];
}

/**
 * Split a string into parts whose UTF-8 size is at most maxBytes each. Never splits a surrogate
 * pair, so every part is valid on its own and `parts.join('') === str`.
 * @param {string} str
 * @param {number} [maxBytes]
 * @returns {string[]} at least one part (an empty string gives [''])
 */
export function splitUtf8(str, maxBytes = CHUNK_BYTES) {
  if (!(maxBytes >= 4)) throw new Error('chunk size must be at least 4 bytes');
  const parts = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < str.length;) {
    const [b, units] = charBytes(str, i);
    if (bytes + b > maxBytes) {
      parts.push(str.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += b;
    i += units;
  }
  parts.push(str.slice(start));
  return parts;
}

/**
 * Collects the parts of chunked messages ({ id, part, of, data }) and returns the whole string once
 * every part of one id has arrived. Only the newest id is kept: a newer id drops older partial ones
 * (a fresh snapshot always supersedes a stale one). Duplicates are ignored.
 */
export class Reassembler {
  constructor() {
    this.id = null;
    this.parts = [];
    this.have = 0;
    this.of = 0;
    this.startedAt = 0;
    this.lastAt = 0;
  }

  /**
   * Add one part. Returns the full string when this part completed the message, otherwise null.
   * @param {{id:number, part:number, of:number, data:string}} m
   * @param {number} [now] timestamp, stored so the owner can time out a stuck transfer
   */
  add(m, now = 0) {
    if (!m || typeof m.data !== 'string' || !Number.isInteger(m.part) || !Number.isInteger(m.of)) return null;
    if (m.of < 1 || m.part < 0 || m.part >= m.of) return null;
    if (this.id !== null && m.id < this.id) return null; // stale transfer
    if (this.id !== m.id) {
      this.id = m.id;
      this.parts = new Array(m.of);
      this.have = 0;
      this.of = m.of;
      this.startedAt = now;
    }
    if (m.of !== this.of || this.parts[m.part] !== undefined) return null;
    this.parts[m.part] = m.data;
    this.have++;
    this.lastAt = now;
    if (this.have < this.of) return null;
    const whole = this.parts.join('');
    this.parts = [];
    this.have = 0;
    this.of = 0;
    return whole;
  }

  /** True while a transfer has started but not completed. */
  get pending() {
    return this.of > 0 && this.have < this.of;
  }

  /** Part numbers of the pending transfer that have not arrived (empty when nothing is pending). */
  missing() {
    if (!this.pending) return [];
    const out = [];
    for (let i = 0; i < this.of; i++) if (this.parts[i] === undefined) out.push(i);
    return out;
  }

  /** Forget any partial transfer (keeps the id so older parts stay rejected). */
  reset() {
    this.parts = [];
    this.have = 0;
    this.of = 0;
  }
}
