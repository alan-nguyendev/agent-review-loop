// How the loop talks to a model.
//
// Three providers, chosen with AGENT_PROVIDER:
//
//   api     (default) Anthropic Messages API, needs ANTHROPIC_API_KEY
//   cli               shells out to Claude Code in print mode
//   replay            replays a recorded run from recordings/
//
// Every live call is written to recordings/ as it happens. That is what makes
// `replay` possible, and it is the reason someone can clone this repo with no
// credentials at all and still watch the loop work. A demo nobody else can run
// is a screenshot with extra steps.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROVIDER = process.env.AGENT_PROVIDER || 'api';
const MODEL = process.env.AGENT_MODEL || 'claude-sonnet-5-5';
const RECORDINGS = path.join(__dirname, '..', 'recordings');

// Key on the role and the prompt, so a replay lines up with the run that
// recorded it and a changed prompt is a visible cache miss rather than a
// stale answer silently reused.
const keyOf = (role, prompt) =>
  `${role}-${crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 12)}`;

function record(role, prompt, response) {
  fs.mkdirSync(RECORDINGS, { recursive: true });
  const file = path.join(RECORDINGS, `${keyOf(role, prompt)}.json`);
  fs.writeFileSync(file, JSON.stringify({ role, model: MODEL, prompt, response }, null, 2));
  return file;
}

function replay(role, prompt) {
  const file = path.join(RECORDINGS, `${keyOf(role, prompt)}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No recording for ${role}. The prompt has changed since the run was ` +
      `recorded, so there is nothing honest to replay. Re-run with ` +
      `AGENT_PROVIDER=api or cli to record a fresh one.`
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')).response;
}

async function viaApi(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set (or use AGENT_PROVIDER=cli / replay)');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.content.map(c => c.text || '').join('');
}

function viaCli(prompt) {
  // Claude Code in print mode. Uses whatever credentials that CLI already has,
  // so no API key is needed.
  return execFileSync('claude', ['-p', prompt], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
}

// role is only a label for the recording — the agents are separate calls with
// separate prompts and no shared conversation.
async function ask(role, prompt) {
  if (PROVIDER === 'replay') return replay(role, prompt);

  const response = PROVIDER === 'cli' ? viaCli(prompt) : await viaApi(prompt);
  record(role, prompt, response);
  return response;
}

// The agents are told to answer as JSON. Models sometimes wrap it in a fenced
// block anyway, so unwrap before parsing rather than failing the whole run.
function parseJson(text, role) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${role} did not return usable JSON. Got:\n${text.slice(0, 500)}`);
  }
}

module.exports = { ask, parseJson, PROVIDER, MODEL };
