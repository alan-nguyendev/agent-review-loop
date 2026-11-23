// The fixer. Looks at one failing test and decides what kind of failure it is,
// then either proposes a narrow edit or refuses and explains why.
//
// It returns a targeted find/replace rather than a whole file. Four failures in
// this demo live in the same spec file, so whole-file answers would overwrite
// each other; and a small replacement is far easier for the reviewer to judge.

const fs = require('fs');
const path = require('path');
const { ask, parseJson } = require('./agent');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const PROMPT = ({ failure, specSource, pomSource, appSource, dataSource }) => `
You are triaging a failing end-to-end test. Decide what is actually broken.

Classify the failure as exactly one of:

  ui-change    The application changed in a legitimate way (renamed test id,
               moved element). The test is now out of date. Fix the test.
  test-defect  The test was always written badly (fixed waits, non-waiting
               assertions, wrong assumptions about timing). Fix the test
               properly — never by adding a retry or a longer sleep.
  data-drift   Reference data changed. The test is not wrong and the app is not
               broken, but a human has to decide which value is correct now.
               Do NOT silently rewrite the assertion.
  app-bug      The application is genuinely misbehaving. The test is correct and
               is doing its job by failing. REFUSE to change the test.
  flaky-infra  The failure is environmental, not a defect in test or app.

The single most important rule: if the application is wrong, the test must be
left failing. Making the suite green is not the goal. A suite that passes while
the product is broken is worse than no suite at all.

FAILING TEST: ${failure.title}
FILE: ${failure.file}

ERROR:
${failure.message}

CODE AROUND THE FAILURE:
${failure.snippet || '(none provided)'}

--- tests/cart.spec.js ---
${specSource}

--- pom/shop.page.js ---
${pomSource}

--- public/cart.js (application logic) ---
${appSource}

--- data/products.json (reference data) ---
${dataSource}

Answer with JSON only, no prose around it:

{
  "classification": "ui-change|test-defect|data-drift|app-bug|flaky-infra",
  "reasoning": "two or three sentences on what you concluded and why",
  "action": "fix" | "report",
  "patch": {
    "file": "relative path",
    "find": "exact snippet to replace, copied verbatim from the file above",
    "replace": "what it becomes"
  },
  "report": "if action is report, what a human needs to know and decide"
}

Use "fix" only for ui-change and test-defect. Use "report" with patch set to
null for data-drift and app-bug. The "find" string must appear exactly once in
the named file.
`.trim();

async function triage(failure) {
  const prompt = PROMPT({
    failure,
    specSource: read('tests/cart.spec.js'),
    pomSource: read('pom/shop.page.js'),
    appSource: read('public/cart.js'),
    dataSource: read('data/products.json'),
  });

  const raw = await ask('fixer', prompt);
  const verdict = parseJson(raw, 'fixer');
  verdict.test = failure.title;
  return verdict;
}

// Applies one proposed edit. Deliberately strict: the snippet has to match
// exactly once. A near-miss is reported rather than guessed at, because a
// fuzzy patch is how an agent quietly breaks a file nobody is watching.
function applyPatch(patch) {
  const file = path.join(root, patch.file);
  if (!fs.existsSync(file)) return { ok: false, why: `no such file: ${patch.file}` };

  const content = fs.readFileSync(file, 'utf8');
  const hits = content.split(patch.find).length - 1;
  if (hits === 0) return { ok: false, why: `snippet not found in ${patch.file}` };
  if (hits > 1) return { ok: false, why: `snippet appears ${hits}× in ${patch.file}, too ambiguous to apply` };

  fs.writeFileSync(file, content.replace(patch.find, patch.replace));
  return { ok: true };
}

module.exports = { triage, applyPatch };
