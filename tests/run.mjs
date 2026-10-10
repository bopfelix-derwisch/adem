// tests/run.mjs — draai met: node tests/run.mjs [filter]
import { readdirSync } from 'fs';
import { runAll } from './harness.mjs';

async function main() {
  const dir = new URL('./adem/', import.meta.url);
  const filter = process.argv[2] || '';
  const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs') && f.includes(filter)).sort();
  for (const f of files) await import(new URL(f, dir).href);
  const failed = await runAll();
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
