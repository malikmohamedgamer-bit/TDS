// Help screen search (pure): every word of the query must appear in the question, answer or tags.
export function filterHelp(topics, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return topics;
  return topics
    .map((t) => ({ ...t, entries: t.entries.filter((e) => { const hay = `${e.q} ${e.a} ${e.tags || ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) }))
    .filter((t) => t.entries.length);
}
