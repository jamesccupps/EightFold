# Shared by the browser suites: print what was seen, compare it with what should be seen, and exit non-zero if anything
# differs. Each suite gives a table of expectations: a value to equal, or a function that says whether a value is right.
# A suite's page errors must be empty unless it says which ones it expects.
import sys
_failed = []
def report(name, r, expect):
    if name: print('==', name)
    for k, v in r.items(): print('  ', k, '=', v)
    exp = dict(expect)
    if 'errors' in r and 'errors' not in exp: exp['errors'] = []
    for k, want in exp.items():
        if k not in r: _failed.append('%s: %s was never measured' % (name or 'suite', k)); continue
        try: ok = want(r[k]) if callable(want) else r[k] == want
        except Exception as e: ok = False
        if not ok: _failed.append('%s: %s = %r' % (name or 'suite', k, r[k]))
def done():
    if _failed:
        print('\nFAILED (%d):' % len(_failed))
        for f in _failed: print('  ', f[:300])
        sys.exit(1)
    print('\nall checks passed')
