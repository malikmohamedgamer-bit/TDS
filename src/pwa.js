// Registers the service worker (offline play, install) on real hosts only: local development and
// tests always load fresh files. `notify(text)` shows a short message to the player.
export function initPwa(notify = () => {}) {
  if (!('serviceWorker' in navigator)) return;
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const hadController = !!navigator.serviceWorker.controller;
    // an update that finished downloading earlier: switch to it now (the page has just started)
    if (reg.waiting && hadController) {
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
      reg.waiting.postMessage('skipWaiting');
      return;
    }
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state !== 'installed') return;
        if (hadController) notify('Update downloaded: it applies the next time you open the game');
        else { w.postMessage('skipWaiting'); notify('Ready to play offline'); }
      });
    });
  }).catch(() => { /* offline support is optional */ });
}
