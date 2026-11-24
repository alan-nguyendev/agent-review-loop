// Publishes a run that already happened: node loop/publish-run.js runs/<file>.json
//
// Separate from the loop on purpose. Re-running the agents just to open a pull
// request would pay for the same answers twice, and the run file already holds
// everything a human needs to see.

const fs = require('fs');
const path = require('path');
const { openPullRequest, openIssues } = require('./publish');

const file = process.argv[2];
if (!file) {
  console.error('usage: node loop/publish-run.js runs/<file>.json');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));

(async () => {
  await openPullRequest(summary.branch, summary);
  await openIssues(summary);
})().catch(err => { console.error(err.message); process.exit(1); });
