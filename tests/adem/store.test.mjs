import assert from 'assert';
import { test } from '../harness.mjs';
import { localStore, MAX_HISTORY } from '../../adem/store.mjs';

// Nep-localStorage; `broken` gooit zoals Safari in privémodus
function fakeStorage(broken) {
  const m = new Map();
  return {
    getItem: k => { if (broken) throw new Error('nope'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (broken) throw new Error('nope'); m.set(k, String(v)); },
    raw: m,
  };
}

test('store: leeg → geen profiel, lege geschiedenis', () => {
  const s = localStore(fakeStorage());
  assert.strictEqual(s.loadProfile(), null);
  assert.deepStrictEqual(s.loadHistory(), []);
});

test('store: profiel bewaren en teruglezen', () => {
  const st = fakeStorage(), s = localStore(st);
  s.saveProfile({ age: 50, sex: 'm', height: 184, weight: 82 });
  assert.deepStrictEqual(localStore(st).loadProfile(), { age: 50, sex: 'm', height: 184, weight: 82 });
});

test('store: nieuwste sessie voorop, maximaal MAX_HISTORY', () => {
  const s = localStore(fakeStorage());
  for (let i = 0; i < MAX_HISTORY + 5; i++) s.addSession({ n: i });
  const h = s.loadHistory();
  assert.strictEqual(h.length, MAX_HISTORY);
  assert.strictEqual(h[0].n, MAX_HISTORY + 4);
});

test('store: addSession geeft de nieuwe geschiedenis terug', () => {
  const s = localStore(fakeStorage());
  s.addSession({ n: 1 });
  assert.deepStrictEqual(s.addSession({ n: 2 }), [{ n: 2 }, { n: 1 }]);
});

test('store: updateLatest past alleen de nieuwste sessie aan', () => {
  const s = localStore(fakeStorage());
  s.addSession({ n: 1 }); s.addSession({ n: 2 });
  const h = s.updateLatest({ feel: 'gejaagd' });
  assert.deepStrictEqual(h, [{ n: 2, feel: 'gejaagd' }, { n: 1 }]);
  assert.deepStrictEqual(s.loadHistory()[0], { n: 2, feel: 'gejaagd' });
});

test('store: updateLatest zonder sessies → lege lijst', () => {
  assert.deepStrictEqual(localStore(fakeStorage()).updateLatest({ feel: 'x' }), []);
});

test('store: kapotte of vreemde data → veilige standaard', () => {
  const st = fakeStorage(), s = localStore(st);
  st.raw.set('adem.history', '{"geen":"lijst"}'); st.raw.set('adem.profile', '"tekst"');
  assert.deepStrictEqual(s.loadHistory(), []);
  assert.strictEqual(s.loadProfile(), null);
  st.raw.set('adem.history', 'niet json');
  assert.deepStrictEqual(s.loadHistory(), []);
});

test('store: privémodus (opslag gooit) → werkt zonder te crashen', () => {
  const s = localStore(fakeStorage(true));
  assert.strictEqual(s.loadProfile(), null);
  s.saveProfile({ age: 40 });
  assert.deepStrictEqual(s.addSession({ n: 1 }), [{ n: 1 }]);
});

test('store: zonder localStorage (Node) → werkt zonder te crashen', () => {
  const s = localStore(undefined);
  assert.deepStrictEqual(s.loadHistory(), []);
});
