// Runs the test suite and turns the JSON report into a list of failures the
// agents can reason about. Nothing here talks to a model.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESULTS = path.join(__dirname, '..', 'test-results', 'results.json');

// Playwright colours its error messages. The escape codes are noise to a model
// and burn tokens, so they come off before anything else sees them.
const stripAnsi = s => (s || '').replace(/\u001b\[[0-9;]*m/g, '');

function runTests() {
  try {
    execFileSync('npx', ['playwright', 'test'], { stdio: 'pipe' });
  } catch {
    // A non-zero exit just means tests failed, which is the normal case here.
    // The report on disk is what we actually read.
  }
  if (!fs.existsSync(RESULTS)) {
    throw new Error(`No test report at ${RESULTS} — did the run start at all?`);
  }
  return JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
}

// Walk the nested suite tree and yield every spec, wherever it sits.
function* eachSpec(node) {
  for (const suite of node.suites || []) yield* eachSpec(suite);
  for (const spec of node.specs || []) yield spec;
}

// Playwright's call log records how many times it retried while waiting —
// "9 x locator resolved to ...". That count depends on how fast the machine is,
// so it differs between a laptop and a CI runner. It tells the agent nothing it
// cannot see from the rest of the message, and leaving it in makes the prompt
// machine-specific, which silently breaks replay everywhere except where the
// recording was made. CI caught exactly that.
const stabilise = s => s
  .replace(/\b\d+ (×|x) locator resolved/g, 'N × locator resolved')
  .replace(/\b\d+(\.\d+)?ms\b(?! exceeded)(?! waiting)/g, 'Nms');

// On a timeout, result.error.message is only "Test timeout exceeded" — the part
// that says WHICH locator was being waited on sits in result.errors[]. A fixer
// given just the first message cannot classify anything, so take them all.
function errorText(result) {
  const all = (result.errors?.length ? result.errors : [result.error || {}])
    .map(e => stabilise(stripAnsi(e.message).trim()))
    .filter(Boolean);
  return [...new Set(all)].join('\n\n');
}

function collectFailures(report) {
  const failures = [];
  for (const spec of eachSpec(report)) {
    if (spec.ok) continue;
    const result = spec.tests?.[0]?.results?.[0];
    if (!result) continue;

    failures.push({
      title: spec.title,
      file: spec.file,
      line: spec.line,
      message: errorText(result),
      // The snippet Playwright points at — usually the failing assertion.
      snippet: stripAnsi(result.error?.snippet).trim(),
      durationMs: result.duration,
    });
  }
  return failures;
}

function summarise(report) {
  const s = report.stats || {};
  return { expected: s.expected ?? 0, unexpected: s.unexpected ?? 0, flaky: s.flaky ?? 0 };
}

module.exports = { runTests, collectFailures, summarise };

// Allow a quick look on its own: node loop/collect-failures.js
if (require.main === module) {
  const report = runTests();
  const failures = collectFailures(report);
  console.log(JSON.stringify({ stats: summarise(report), failures }, null, 2));
}
