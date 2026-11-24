// Runs the loop from recordings and checks it still reaches the verdicts the
// README claims. Used by CI, where "the tests pass" means nothing: four of the
// five are supposed to fail.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const runsDir = path.join(root, 'runs');

const EXPECTED = {
  'user can add a product to the cart': { classification: 'ui-change', outcome: 'approved' },
  'user sees the catalogue price of a product': { classification: 'data-drift', outcome: 'reported' },
  'user sees the correct total including discount and VAT': { classification: 'app-bug', outcome: 'reported' },
  'user sees the whole catalogue once it has loaded': { classification: 'test-defect', outcome: 'approved' },
};

// On main the suite is the broken baseline and all four failures are present,
// so the loop can be replayed and its verdicts checked. On a branch that
// already carries the agents' fixes there are only two failures left, and the
// meaningful check is the opposite one: that exactly the two deliberate
// failures survived and nothing quietly turned the suite green.
const { runTests, collectFailures, summarise } = require('../loop/collect-failures');
const DELIBERATE = [
  'user sees the catalogue price of a product',
  'user sees the correct total including discount and VAT',
];

const first = runTests();
const failures = collectFailures(first).map(f => f.title);

if (failures.length !== 4) {
  console.log(`${summarise(first).unexpected} failing test(s) — this is not the baseline, so checking the outcome instead of the verdicts.\n`);
  const missing = DELIBERATE.filter(t => !failures.includes(t));
  const extra = failures.filter(t => !DELIBERATE.includes(t));
  for (const t of DELIBERATE) console.log(`${failures.includes(t) ? 'OK      ' : 'GONE    '} still failing on purpose: ${t}`);
  for (const t of extra) console.log(`UNEXPECTED  ${t}`);
  if (missing.length) console.error(`\n${missing.length} deliberate failure(s) stopped failing. The suite was made green over a real defect.`);
  if (extra.length) console.error(`\n${extra.length} unexpected failure(s).`);
  if (missing.length || extra.length) process.exit(1);
  console.log('\nOnly the two deliberate failures remain.');
  process.exit(0);
}

const before = new Set(fs.readdirSync(runsDir));
execFileSync('node', [path.join(root, 'loop', 'index.js')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, AGENT_PROVIDER: 'replay' },
});

const fresh = fs.readdirSync(runsDir).filter(f => !before.has(f));
if (fresh.length !== 1) {
  console.error(`expected exactly one new run file, got ${fresh.length}`);
  process.exit(1);
}

const run = JSON.parse(fs.readFileSync(path.join(runsDir, fresh[0]), 'utf8'));
let bad = 0;

for (const [test, want] of Object.entries(EXPECTED)) {
  const got = run.results.find(r => r.test === test);
  if (!got) {
    console.error(`MISSING  ${test}`); bad++; continue;
  }
  const ok = got.classification === want.classification && got.outcome === want.outcome;
  console.log(`${ok ? 'OK      ' : 'CHANGED '} ${want.classification.padEnd(12)} ${test}`);
  if (!ok) {
    console.error(`         expected ${want.classification}/${want.outcome}, got ${got.classification}/${got.outcome}`);
    bad++;
  }
}

// The two refusals have to stay refusals: the suite must not end up green.
if (run.after && run.after.unexpected !== 2) {
  console.error(`\nexpected 2 tests still failing after the fixes, got ${run.after.unexpected}`);
  bad++;
}

console.log('');
if (bad) { console.error(`${bad} check(s) failed`); process.exit(1); }
console.log('The loop still reaches the same four verdicts, and two tests are still failing on purpose.');
