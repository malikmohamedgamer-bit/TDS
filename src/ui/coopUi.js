// Shared co-op presentation helpers (pure): seat colours, quick-ping texts and player names.

/** Seat colours in join order: gold, cyan, magenta, lime (readable on dark panels and on the map). */
export const SEAT_COLORS = ['#FFD166', '#4CC9F0', '#F15BB5', '#9BE564'];
export const seatColor = (i) => SEAT_COLORS[((i % SEAT_COLORS.length) + SEAT_COLORS.length) % SEAT_COLORS.length];

/** Quick pings (sent as an index, so nobody can send free text). */
export const PING_TEXTS = ['Help here!', 'Boss incoming', 'Saving cash', 'Upgrade this!', 'Nice!', 'Ready for the next wave'];

/** Display name rules: 1-16 characters of letters, digits, space, - and _ (anything else removed). */
export function cleanName(raw, fallback = 'Commander') {
  const s = String(raw ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s || fallback;
}
