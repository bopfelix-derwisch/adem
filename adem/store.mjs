// adem/store.mjs — opslag van profiel en sessies (puur, geen DOM)
//
// De app praat alleen met dit kleine contract, zodat een andere omgeving (bv. een
// dashboard met login) een eigen opslag kan meegeven via globalThis.ADEM_STORE:
//   loadProfile() → object | null      saveProfile(p)
//   loadHistory() → [sessie, …] (nieuwste eerst)
//   addSession(s) → nieuwe geschiedenis  updateLatest(patch) → nieuwe geschiedenis
// Alles is synchroon; een asynchrone opslag houdt een cache bij en schrijft op de achtergrond.

export const MAX_HISTORY = 20;
const HISTORY_KEY = 'adem.history', PROFILE_KEY = 'adem.profile';

// storage: een localStorage-achtig object, of undefined (dan wordt niets bewaard)
export function localStore(storage) {
  const read = k => { try { return storage ? JSON.parse(storage.getItem(k)) : null; } catch (e) { return null; } };
  const write = (k, v) => { try { if (storage) storage.setItem(k, JSON.stringify(v)); } catch (e) { /* privémodus: alleen dit scherm */ } };

  const loadHistory = () => { const h = read(HISTORY_KEY); return Array.isArray(h) ? h : []; };
  return {
    loadProfile() { const p = read(PROFILE_KEY); return p && typeof p === 'object' && !Array.isArray(p) ? p : null; },
    saveProfile(p) { write(PROFILE_KEY, p); },
    loadHistory,
    addSession(item) { const h = [item, ...loadHistory()].slice(0, MAX_HISTORY); write(HISTORY_KEY, h); return h; },
    updateLatest(patch) {
      const h = loadHistory();
      if (!h.length) return h;
      h[0] = Object.assign({}, h[0], patch);
      write(HISTORY_KEY, h);
      return h;
    },
  };
}
