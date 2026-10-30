# Reverts each table rule of proposal-v2.md section 3 in turn (run from model/: python3 mutations.py) and checks that some check fails
# that does not fail on the unmutated model: a FAILPAIR (check, run, ...) that is new, or the same check and run with a different counterexample.
# Each mutant runs only the search (ONLY=) that can show it, and is compared with the baseline of the same search.
import os, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
M = [
 # (name, only, old, new, what)
 ("3.5 ranks: world, adapters, Runtime waits, actor schedules", "Eq", "ranksOk: true,", "ranksOk: false,", "equal instants fire in arming order only, so a Runtime wait can fire before the fake server's answer"),
 ("3.5 'then by arming' is the last key", "Eq", "armTie: true,", "armTie: false,", "two equal-keyed deadlines (two tabs' handlers at one instant) have no order, so it depends on scan order"),
 ("3.1 suspended: the tab runs nothing", "S[reconnect]", "suspendHolds: true,", "suspendHolds: false,", "advance(d, { suspended }) lets the tab's reconnect timer fire inside the window"),
 ("3.1 world/together/advance settle after each control", "W[reject]", "settleAfterWire: true,", "settleAfterWire: false,", "a release leaves the handler runnable after the step"),
 ("3.1 NothingHeld", "W[reject]", "nothingHeld: true,", "nothingHeld: false,", "release with nothing held is silently fine, so the error row is unreachable"),
 ("2.6/3.1 a Held lane is left by retry or cancel", "W[reject]", "heldEscapes: true,", "heldEscapes: false,", "retry and cancel ignore a Held lane, so it can never be left"),
 ("2.5 release() ends standing rules (against the strict NothingHeld reading)", "W[reject]", "releaseEndsStanding: true,", "releaseEndsStanding: false,", "release with nothing held is an error even if a drop(always) stands, so the rule can never end"),
 ("T2/C3 no step names an ending", "W[reject]", "noInject: true,", "noInject: false,", "an `inject unknown` step exists"),
 ("3.2 a request of a gone client stays in transit", "W[reject]", "orphanTravels: true,", "orphanTravels: false,", "a held request of a cancelled or closed client is removed instead of travelling"),
 ("3.2/2.6 cancel with the request on the wire interrupts the client", "W[reject]", "cancelInterrupts: true,", "cancelInterrupts: false,", "cancel leaves a wire-stage Attempt alone"),
 ("2.5 the acknowledgement write gates the send", "W[reject]", "ackGate: true,", "ackGate: false,", "a persisted Attempt is sent without waiting for its acknowledgement"),
 ("3.3 hold({ at: close }) makes the close wait", "S[reconnect]", "closeHold: true,", "closeHold: false,", "the client close never waits, so the release bound is unreachable"),
 ("3.2 release({ drop }) of a Held request makes it Lost", "W[reject]", "lostNotServed: true,", "lostNotServed: false,", "release({ drop: true }) serves the request instead"),
 ("3.3 drop({ at: open }) refuses the attempt", "S[reconnect]", "dropOpenRefuses: true,", "dropOpenRefuses: false,", "a dropped open is accepted"),
 ("3.2 duplicate(): the client sees the first answer only", "W[reject]", "dupAnswerIgnored: true,", "dupAnswerIgnored: false,", "the duplicate's answer also reaches the client"),
 ("3.2 the answer of a gone client goes nowhere", "W[reject]", "goneDiscarded: true,", "goneDiscarded: false,", "an orphan's answer is applied to the lane"),
 ("3.4 leave() of a resumable fragment freezes it", "Eq", 'h.st = h.resum ? "Frozen" : "Absent";', 'h.st = "Absent";', "a resumable fragment is abandoned on leave"),
]
def run(d, only):
    p = subprocess.run(["bun", "main.ts"], cwd=d, env=dict(os.environ, ONLY=only), capture_output=True, text=True, timeout=300)
    res = {}
    for line in p.stdout.splitlines():
        if line.startswith("FAILPAIR "):
            i, s, t = [x.strip() for x in line[9:].split(" | ", 2)]
            res[(i, s)] = t
    return res
tmp = tempfile.mkdtemp()
try:
    for f in os.listdir(HERE):
        if f.endswith(".ts"): shutil.copy(os.path.join(HERE, f), tmp)
    base = {}
    ok_all = True
    for name, only, old, new, what in M:
        if os.environ.get("ONLY") and os.environ["ONLY"] not in name: continue
        if only not in base:
            for f in os.listdir(HERE):
                if f.endswith(".ts"): shutil.copy(os.path.join(HERE, f), tmp)
            base[only] = run(tmp, only)
        src = open(os.path.join(HERE, "model.ts")).read()
        assert src.count(old) == 1, (name, src.count(old))
        open(os.path.join(tmp, "model.ts"), "w").write(src.replace(old, new))
        res = run(tmp, only); b = base[only]
        newk = sorted(k for k in res if k not in b)
        chg = sorted(k for k in res if k in b and res[k] != b[k])
        ok = bool(newk or chg); ok_all &= ok
        fmt = lambda ks: "; ".join(f"{a} [{s}]" for a, s in ks) or "none"
        print(f"{'OK  ' if ok else 'MISS'} {name} ({only}): {what}\n      newly failing: {fmt(newk)}\n      changed: {fmt(chg)}")
        for k in (newk + chg)[:1]: print(f"        e.g. {k[0]}: {res[k][:230]}")
    sys.exit(0 if ok_all else 1)
finally:
    shutil.rmtree(tmp)
