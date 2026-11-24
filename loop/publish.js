// Turning a run into something a human looks at.
//
// This is the only part of the loop allowed to reach outside the working tree,
// and the agents never call it — the orchestrator does, and only when asked
// with --pr. The agents hold no credentials of their own.

const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const gh = (...args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8' }).trim();
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

// Lets a later run recognise its own earlier output instead of filing it twice.
const marker = test => `<!-- agent-review-loop:${Buffer.from(test).toString('base64url').slice(0, 24)} -->`;

function alreadyOpen(kind, test) {
  try {
    const list = JSON.parse(gh(kind, 'list', '--state', 'open', '--json', 'number,body', '--limit', '100'));
    const hit = list.find(x => (x.body || '').includes(marker(test)));
    return hit ? hit.number : null;
  } catch {
    return null; // no repo access, or none exist yet — treat as nothing open
  }
}

async function openPullRequest(branch, summary) {
  const approved = summary.results.filter(r => r.outcome === 'approved');
  if (!approved.length) {
    console.log('\nNo approved fixes, so no pull request.');
    return;
  }

  const existing = alreadyOpen('pr', approved[0].test);
  if (existing) {
    console.log(`\nPull request #${existing} already covers this. Not opening another.`);
    return;
  }

  const body = [
    `Opened automatically after a failing run. **Nothing here is merged by a machine.**`,
    ``,
    `| test | classification | reviewer |`,
    `|---|---|---|`,
    ...approved.map(r => `| ${r.test} | \`${r.classification}\` | ${r.reviewerVerdict} |`),
    ``,
    `### What each agent said`,
    ...approved.flatMap(r => [
      ``,
      `**${r.test}**`,
      ``,
      `- fixer (\`${r.classification}\`): ${r.fixerReasoning}`,
      `- reviewer: ${r.reviewerReasoning}`,
      ...(r.reviewerConcerns?.length ? [`- concerns raised: ${r.reviewerConcerns.join('; ')}`] : []),
    ]),
    ``,
    `### Suite`,
    ``,
    `Before: ${summary.before.expected} passed, ${summary.before.unexpected} failed`,
    summary.after ? `After: ${summary.after.expected} passed, ${summary.after.unexpected} failed` : '',
    ``,
    `Failures left deliberately unfixed are filed as issues, not patched.`,
    ``,
    marker(approved[0].test),
  ].join('\n');

  git('push', '-u', 'origin', branch);
  const url = gh('pr', 'create', '--title', `Agent fixes: ${approved.length} test(s)`, '--body', body, '--head', branch);
  console.log(`\npull request: ${url}`);
}

async function openIssues(summary) {
  const reported = summary.results.filter(r => r.outcome === 'reported');
  for (const r of reported) {
    const existing = alreadyOpen('issue', r.test);
    if (existing) {
      console.log(`issue #${existing} already open for "${r.test}" — skipped`);
      continue;
    }
    const body = [
      `A failing test was left failing on purpose.`,
      ``,
      `**Test:** ${r.test}`,
      `**Classified as:** \`${r.classification}\``,
      ``,
      `### Why it was not fixed`,
      ``,
      r.fixerReasoning,
      ``,
      ...(r.fixerReport ? [`### What a human needs to decide`, ``, r.fixerReport, ``] : []),
      `The suite is correct here. Changing the test to make it pass would hide this.`,
      ``,
      marker(r.test),
    ].join('\n');
    const url = gh('issue', 'create', '--title', `${r.classification}: ${r.test}`, '--body', body);
    console.log(`issue: ${url}`);
  }
}

module.exports = { openPullRequest, openIssues };
