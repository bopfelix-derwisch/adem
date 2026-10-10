// tests/harness.mjs — mini-testrunner (Node 12 heeft geen `node --test`)
const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }

export async function runAll() {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log('  ok   ' + name); }
    catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} geslaagd`);
  return failed;
}
