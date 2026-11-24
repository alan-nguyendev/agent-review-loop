// The reviewer. Reads a proposed change the way a human reviewing a merge
// request would: the failure that started it, the diff, and what the fixer
// claims it did. It does not inherit the fixer's conversation — it is a
// separate call with a separate prompt, so it has to reach its own conclusion.
//
// It does see the fixer's stated reasoning, which carries a risk of anchoring:
// an agent handed a conclusion tends to agree with it. That is deliberate. A
// reviewer who cannot see the claim cannot catch a claim that is wrong, so the
// prompt leans hard on treating the reasoning as an assertion to check rather
// than as evidence. Whether that is enough is exactly what the recorded runs
// in the README are there to show.

const fs = require('fs');
const path = require('path');
const { ask, parseJson } = require('./agent');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const PROMPT = ({ failure, verdict, diff, appSource, dataSource }) => `
You are reviewing a change another agent proposed after a test failed. Decide
whether it should be merged.

You are the last check before this reaches a human. The thing you are guarding
against is not untidy code. It is a change that makes the suite green while the
product stays broken.

THE ORIGINAL FAILURE
Test:  ${failure.title}
File:  ${failure.file}

${failure.message}

WHAT THE OTHER AGENT CLAIMS
Classification: ${verdict.classification}
Action:         ${verdict.action}
Reasoning:      ${verdict.reasoning}

Treat all of that as an assertion, not as evidence. Check it against the code
below yourself. If the classification is wrong, say so even when the diff looks
reasonable on its own.

THE PROPOSED DIFF
${diff || '(no code change — the agent chose to report instead of fix)'}

--- public/cart.js (application logic) ---
${appSource}

--- data/products.json (reference data) ---
${dataSource}

Reject the change if any of these is true:
  - the application is at fault and the test was weakened, relaxed or retargeted
    so that it passes anyway
  - a retry, a longer timeout or a sleep was added instead of fixing the cause
  - reference data changed and the assertion was quietly rewritten to match,
    with no human asked
  - the fix hardcodes something that will rot, where a general fix was available
  - the diff does more than the failure justifies

Approve when the classification holds up and the change addresses the actual
cause narrowly.

Answer with JSON only, no prose around it:

{
  "verdict": "approve" | "changes_requested",
  "agreesWithClassification": true | false,
  "suggestedClassification": "only if you disagree, otherwise null",
  "reasoning": "two or three sentences, in your own words",
  "concerns": ["one line per concern, empty array if none"]
}
`.trim();

async function review({ failure, verdict, diff }) {
  const prompt = PROMPT({
    failure,
    verdict,
    diff,
    appSource: read('public/cart.js'),
    dataSource: read('data/products.json'),
  });

  const raw = await ask('reviewer', prompt);
  return parseJson(raw, 'reviewer');
}

module.exports = { review };
