# Reverts each listed mutant of proposal-v2.md section 3.5 in turn (run from model/: python3 mutations.py) and checks that some check fails
# that does not fail on the unmutated model: a (check, system, kind) triple that is new, or the same triple with a different shortest counterexample.
# REPAIR=1 swaps the 3.3 group order for a repaired one so that the 3.3 order finding (CB-order, I1) does not mask the Feed.callback mutant.
import os, re, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ENV = dict(os.environ, REPAIR="1")
M = [
 ("a fact before its missed (FC4, FC55; I1)", "missedBeforeDroppedFact: true,", "missedBeforeDroppedFact: false,", "a value in Dropped is delivered with no missed Unproven first", "I1"),
 ("the budget reset on the first value (FC41; I12)", "resetOnlyAtFail: true,", "resetOnlyAtFail: false,", "the reconnect budget resets on the first value of a connection, not after a live period of resetAfter", "I12"),
 ("a value before live read as proven (FC64; I1)", "openingValueUnproven: true,", "openingValueUnproven: false,", "a plain Stream's first value in Opening is not preceded by missed Unproven", "I1"),
 ("a status evicted on overflow (FC26; I1)", "keepStatusWhenFull: true,", "keepStatusWhenFull: false,", "a full Feed.callback queue drops a signal instead of merging it", "I1"),
 ("a state delivery admitted after a drop (FC20, FC54; I9)", "admitNeedsLive: true,", "admitNeedsLive: false,", "state admission no longer requires st = Live and slotConn = conn", "I9"),
 ("a value after down making value current (FC54; I16)", "droppedValueNotCurrent: true,", "droppedValueNotCurrent: false,", "a state value in Dropped confirms and is delivered", "I16"),
 ("equality on facts (FC1, FC25; I3)", "noEqualityOnFacts: true,", "noEqualityOnFacts: false,", "a fact equal to the last one is not delivered", "I3"),
 ("a catch-up started before live (FC51; I4, here G2)", "catchUpAfterLive: true,", "catchUpAfterLive: false,", "the catch-up starts at connect; the socket registers later than the page read", "G2"),
 ("a catch-up completing on an empty page or a stream end (FC42; I18)", "completeOnlyOnLastPage: true,", "completeOnlyOnLastPage: false,", "an empty page with a next cursor, or the end of the inner stream, completes the catch-up", "I18"),
 ("a page failure dropping the socket at once (FC23; I19)", "pageRetryKeepsSocket: true,", "pageRetryKeepsSocket: false,", "a retryable page failure fails the connection although pageSched has steps left", "I19"),
 ("a restart before the scope closed (FC33; I10)", "successorAfterClosed: true,", "successorAfterClosed: false,", "the successor session opens while the predecessor is Releasing", "I10"),
 ("last = the highest position seen (FC22; I4)", "lastIsEmitted: true,", "lastIsEmitted: false,", "last follows buffered positions, not the last value emitted downstream", "I4"),
 ("a state proof re-confirming a restored last (FC78; I17)", "proofNeedsOwn: true,", "proofNeedsOwn: false,", "a state proof confirms a last that this session did not set", "I17"),
 ("listen staleness withdrawn on an unproven start (FC19, FC47; I15)", None, None, "no variable in 3.1-3.4 models a covered answer or a listen read", "I15"),
 ("progress written by a superseded Attempt (FC30; I14)", None, None, "no variable in 3.1-3.4 models row.progress or an Attempt", "I14"),
 ("page values emitted after a drop (FC43; I21)", "cancelPageOnEnd: true,", "cancelPageOnEnd: false,", "ending a connection no longer interrupts the page read", "I21"),
]
def run(d, env=ENV):
    p = subprocess.run(["bun", "main.ts"], cwd=d, env=env, capture_output=True, text=True, timeout=300)
    res = {}
    for line in p.stdout.splitlines():
        if line.startswith("FAILPAIR "):
            i, s, k, t = [x.strip() for x in line[9:].split(" | ", 3)]
            res[(i, s, k)] = t
    return res
tmp = tempfile.mkdtemp()
try:
    for f in os.listdir(HERE):
        if f.endswith(".ts"): shutil.copy(os.path.join(HERE, f), tmp)
    base = run(tmp)
    print("baseline failing (check, system, kind), REPAIR=1:", len(base))
    for k in sorted(base): print("   ", k[0], "|", k[1], "|", k[2])
    ok_all = True
    for name, old, new, what, inv in M:
        if os.environ.get("ONLY") and os.environ["ONLY"] not in name: continue
        if old is None:
            print(f"NOT MODELLED {name}: {what}"); continue
        src = open(os.path.join(HERE, "model.ts")).read()
        assert src.count(old) == 1, (name, src.count(old))
        open(os.path.join(tmp, "model.ts"), "w").write(src.replace(old, new))
        res = run(tmp)
        newk = sorted(k for k in res if k not in base)
        chg = sorted(k for k in res if k in base and res[k] != base[k])
        ok = bool(newk or chg); ok_all &= ok
        fmt = lambda ks: ", ".join(f"{a} [{b} {c}]" for a, b, c in ks) or "none"
        print(f"{'OK  ' if ok else 'MISS'} {name}: {what}\n      newly failing: {fmt(newk)}\n      changed counterexample: {fmt(chg)}")
        if not newk and chg:
            k = chg[0]; print(f"        e.g. {k[0]} [{k[1]} {k[2]}]: baseline {base[k]}\n          mutant {res[k]}")
    sys.exit(0 if ok_all else 1)
finally:
    shutil.rmtree(tmp)
