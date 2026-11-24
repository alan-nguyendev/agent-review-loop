// The loop.
//
//   run the suite -> for each failure: fixer proposes -> reviewer judges
//   -> approved fixes become commits on a branch, nothing else is touched
//
// What this deliberately never does:
//   - commit to main
//   - push anything (that needs --pr, and even then only a branch)
//   - edit its own rules: loop/, playwright.config.js and scripts/ are
//     reverted after every round, whatever the agents did to them
//   - "fix" a test whose failure is the application's fault

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { runTests, collectFailures, summarise } = require('./collect-failures');
const { triage, applyPatch } = require('./fixer');
const { review } = require('./reviewer');
const { PROVIDER, MODEL } = require('./agent');

const root = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

// Paths the agents are judged by. If a proposed patch lands in here, it is
// undone — an agent that can edit the rules it is measured against is not
// being reviewed, it is grading itself.
const PROTECTED = ['loop/', 'playwright.config.js', 'scripts/', '.gitlab-ci.yml', 'README.md'];

const MAX_ROUNDS = Number(process.env.MAX_ROUNDS || 3);
const WANT_PR = process.argv.includes('--pr');

function restoreProtected() {
  const dirty = git('status', '--porcelain').split('\n').filter(Boolean)
    .map(l => l.slice(3).trim())
    .filter(f => PROTECTED.some(p => f === p || f.startsWith(p)));
  if (!dirty.length) return [];
  git('checkout', '--', ...dirty);
  return dirty;
}

async function handleFailure(failure, log) {
  let feedback = null;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const verdict = await triage(failure);
    log(`    round ${round}: ${verdict.classification} / ${verdict.action}`);

    // The agent refused to touch the test. That is a valid, and often the
    // correct, outcome — it becomes an issue for a human, not a patch.
    if (verdict.action !== 'fix' || !verdict.patch) {
      return { failure, verdict, outcome: 'reported', rounds: round };
    }

    const applied = applyPatch(verdict.patch);
    if (!applied.ok) {
      log(`      patch did not apply: ${applied.why}`);
      return { failure, verdict, outcome: 'patch-failed', why: applied.why, rounds: round };
    }

    const reverted = restoreProtected();
    if (reverted.length) {
      log(`      blocked edit to protected path(s): ${reverted.join(', ')}`);
      return { failure, verdict, outcome: 'blocked', reverted, rounds: round };
    }

    const diff = git('diff');
    if (!diff) {
      return { failure, verdict, outcome: 'no-op', rounds: round };
    }

    const judgement = await review({ failure, verdict, diff });
    log(`      reviewer: ${judgement.verdict}${judgement.agreesWithClassification ? '' : ' (disputes the classification)'}`);

    if (judgement.verdict === 'approve') {
      git('add', '-A');
      git('commit', '-m',
        `Fix: ${failure.title}\n\n${verdict.classification}: ${verdict.reasoning}\n\nReviewed by a second agent: ${judgement.reasoning}`);
      return { failure, verdict, judgement, diff, outcome: 'approved', rounds: round };
    }

    // Rejected — throw the change away and let the next round start clean.
    git('checkout', '--', '.');
    feedback = judgement;
    if (round === MAX_ROUNDS) {
      return { failure, verdict, judgement, outcome: 'rejected', rounds: round };
    }
  }
}

async function main() {
  console.log(`provider=${PROVIDER} model=${MODEL} max_rounds=${MAX_ROUNDS}\n`);

  if (git('status', '--porcelain')) {
    console.error('Working tree is not clean. Commit or stash first — this loop commits as it goes.');
    process.exit(1);
  }

  const startBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const branch = `autofix/${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  console.log('running the suite...');
  const report = runTests();
  const failures = collectFailures(report);
  const stats = summarise(report);
  console.log(`  ${stats.expected} passed, ${stats.unexpected} failed\n`);

  if (!failures.length) {
    console.log('Nothing to do.');
    return;
  }

  git('checkout', '-q', '-b', branch);
  console.log(`working on ${branch}\n`);

  const results = [];
  for (const failure of failures) {
    console.log(`  ${failure.title}`);
    results.push(await handleFailure(failure, console.log));
    console.log('');
  }

  // Anything that was fixed has to be shown to actually pass now. An unverified
  // fix is a guess with a commit message attached.
  const approved = results.filter(r => r.outcome === 'approved');
  let after = null;
  if (approved.length) {
    console.log('re-running the suite to check the fixes...');
    after = summarise(runTests());
    console.log(`  ${after.expected} passed, ${after.unexpected} failed\n`);
  }

  const summary = {
    branch,
    provider: PROVIDER,
    model: MODEL,
    before: stats,
    after,
    results: results.map(r => ({
      test: r.failure.title,
      classification: r.verdict?.classification,
      action: r.verdict?.action,
      outcome: r.outcome,
      rounds: r.rounds,
      fixerReasoning: r.verdict?.reasoning,
      fixerReport: r.verdict?.report,
      reviewerVerdict: r.judgement?.verdict,
      reviewerReasoning: r.judgement?.reasoning,
      reviewerConcerns: r.judgement?.concerns,
      why: r.why,
    })),
  };

  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  const runFile = path.join(root, 'runs', `${branch.replace('autofix/', '')}.json`);
  fs.writeFileSync(runFile, JSON.stringify(summary, null, 2));

  console.log('─'.repeat(70));
  for (const r of summary.results) {
    const mark = { approved: 'fixed   ', reported: 'reported', rejected: 'rejected',
                   blocked: 'blocked ', 'patch-failed': 'failed  ', 'no-op': 'no-op   ' }[r.outcome];
    console.log(`${mark}  ${r.classification?.padEnd(12) || '—'.padEnd(12)}  ${r.test}`);
  }
  console.log('─'.repeat(70));
  console.log(`\nrun written to runs/${path.basename(runFile)}`);
  console.log(`branch ${branch} holds ${approved.length} commit(s); you are back on ${startBranch} with 'git checkout ${startBranch}'`);

  if (WANT_PR) {
    const { openPullRequest, openIssues } = require('./publish');
    await openPullRequest(branch, summary);
    await openIssues(summary);
  } else {
    console.log('\nNothing was pushed. Re-run with --pr to open a pull request and issues.');
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
