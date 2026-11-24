"""Checks that every blockquote in the README appears verbatim in a recorded run.

A README full of quotes from an agent is only worth anything if the quotes are
real. It is easy to tidy one while editing and end up with a paraphrase inside
quotation marks, which is the same thing as making it up. This caught three of
mine.

    python3 -I scripts/verify-readme-quotes.py

Use [...] in a quote to mark a deliberate omission; each remaining piece is
checked on its own.
"""
import json, glob, re, sys, os

repo = sys.argv[1] if len(sys.argv) > 1 else '.'
norm = lambda s: ' '.join(re.sub(r'[*`]', '', s).replace('\\', '').split())

sources = (glob.glob(os.path.join(repo, 'runs', '*.json'))
           + glob.glob(os.path.join(repo, 'recordings', '*.json')))
hay = norm(' '.join(
    json.dumps(json.load(open(f, encoding='utf-8')), ensure_ascii=False)
    for f in sources))

quotes, cur = [], []
for line in open(os.path.join(repo, 'README.md'), encoding='utf-8').read().split('\n'):
    if line.startswith('>'):
        cur.append(line.lstrip('>').strip())
    elif cur:
        quotes.append(' '.join(cur)); cur = []
if cur: quotes.append(' '.join(cur))

bad = 0
for q in quotes:
    missing = [p for p in [norm(x) for x in norm(q).split('[...]')] if len(p) > 20 and p not in hay]
    print(('OK      ' if not missing else 'NESEDI  ') + norm(q)[:66] + '...')
    for m in missing:
        print('          chybi: ' + m[:95]); bad += 1

print()
print('VSECHNY CITACE DOLOZENE' if not bad else f'{bad} fragmentu nedolozenych')
sys.exit(1 if bad else 0)
