// localStorage wrapper with an in-memory fallback (private mode, blocked storage, Node tests).

export function createStorage(backend = globalThis.localStorage) {
  const memory = new Map();
  let usable = false;
  try {
    if (backend) {
      const k = '__tds_probe__';
      backend.setItem(k, '1');
      backend.removeItem(k);
      usable = true;
    }
  } catch {
    usable = false;
  }
  return {
    persistent: usable,
    get(key) {
      if (usable) {
        try { return backend.getItem(key); } catch { /* fall through */ }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    set(key, value) {
      memory.set(key, value);
      if (!usable) return false;
      try { backend.setItem(key, value); return true; } catch { return false; }
    },
    remove(key) {
      memory.delete(key);
      if (usable) {
        try { backend.removeItem(key); } catch { /* ignore */ }
      }
    },
  };
}
