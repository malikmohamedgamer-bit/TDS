// Loads a vendored classic (non-module) script once, on demand, and resolves with the global it
// defines. Used for vendor/supabase/supabase.js (UMD build), which only online play needs, so the
// 200 KB file is never parsed or run by single-player sessions (the service worker may still
// precache it for offline play).

/** @type {Map<string, Promise<any>>} script URL -> pending or finished load */
const loads = new Map();

/**
 * @param {string} src script URL (absolute, or relative to the page)
 * @param {{ globalName?: string, doc?: Document, scope?: object }} [opts]
 *   globalName: the global the script defines; resolves with it, and skips loading if it already exists.
 *   doc / scope: injectable for tests (default `document` / `globalThis`).
 * @returns {Promise<any>} the global (or undefined when no globalName is given)
 */
export function loadScript(src, { globalName, doc = globalThis.document, scope = globalThis } = {}) {
  if (globalName && scope[globalName]) return Promise.resolve(scope[globalName]);
  const pending = loads.get(src);
  if (pending) return pending;
  if (!doc) return Promise.reject(new Error(`loadScript(${src}): no document (not running in a browser)`));
  const p = new Promise((resolve, reject) => {
    const el = doc.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => {
      if (globalName && !scope[globalName]) {
        loads.delete(src);
        reject(new Error(`${src} loaded but did not define ${globalName}`));
        return;
      }
      resolve(globalName ? scope[globalName] : undefined);
    };
    el.onerror = () => {
      // forget the failure so a later call (for example after the network returns) retries
      loads.delete(src);
      el.remove?.();
      reject(new Error(`could not load ${src}`));
    };
    (doc.head || doc.documentElement).appendChild(el);
  });
  loads.set(src, p);
  return p;
}
