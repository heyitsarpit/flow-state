# Reverts each key rule of the write lane in turn and checks that some check fails that does not fail on the unmutated model
# (run from lane-model/: python3 mutations.py). Everything is read from the revision 10 reading, where the
# unmutated model fails only the two stated-limit checks, so any other failing check is caused by the mutation.
import os, re, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ENV = dict(os.environ, ACK="attempt", COMMITS="2", RESEND="1", DEPTH="200", QUICK="1")
M = [
 ("interrupted Attempt becomes Held", "interruptHeld: true,", "interruptHeld: false,", "an interrupt (after cancel or by an adapter) no longer retains the unknown, so a newer commit is sent while the request may still land"),
 ("promote only on release", "promoteOnResolve: true,", "promoteOnResolve: false,", "success and failure no longer promote the queued commit; only cancel does"),
 ("invocation whatever the turn's outcome", "invokeWhateverOutcome: true,", "invokeWhateverOutcome: false,", "an Attempt promoted by an ending in a Denied/Unhandled/InvalidTurn turn is never invoked"),
 ("cancel by history", "cancelByHistory: true,", "cancelByHistory: false,", "cancel before invocation always ends NotSent { Cancelled }, even for a re-send that was sent before"),
 ("the serialize hold", "serializeHolds: true,", "serializeHolds: false,", "serialize promotes the next queued commit on an unknown, as if it were resolved"),
 ("HeldThisTurn", "heldThisTurn: true,", "heldThisTurn: false,", "cancel and allow keep an unknown across turns instead of for its own turn only"),
 ("ending kept on a non-ok turn (F8)", "endingKeptOnDeniedTurn: true,", "endingKeptOnDeniedTurn: false,", "a Denied/Unhandled/InvalidTurn turn drops the ending it admitted"),
 ("F2 acknowledgement once per Attempt", "ackPerAttempt: true,", "ackPerAttempt: false,", "every (re-)send needs its own acknowledgement again (revision 9)"),
 ("F3 a reload delivers a Held lane", "restoreDeliversHeld: true,", "restoreDeliversHeld: false,", "a reload leaves a Held lane undelivered (revision 9: not delivered again)"),
 ("F5 a refused re-send re-delivers unknown", "refusedResendDelivers: true,", "refusedResendDelivers: false,", "a storage-refused re-send returns to Held and tells nobody (revision 9)"),
 ("K25 drop the pending-outcome save", "savePendingOutcome: true,", "savePendingOutcome: false,", "an ending with no live actor is evidence even though the identity's record survives (revision 10)"),
 ("K26 adopted endings and Restored are current", "currentFromActiveLeaf: true,", "currentFromActiveLeaf: false,", "an adopted lane's endings and unknown { Restored } route late, from the root (MD rule 14 as written)"),
 ("G3 one delivery for a saved unknown and Restored", "restoredDedup: true,", "restoredDedup: false,", "a saved pending unknown and unknown { Restored } for the same hold are both delivered"),
 ("K21 lane identity (actor identity, contract id, key)", "identityScoped: true,", "identityScoped: false,", "one lane per contract id and key: a new incarnation adopts any identity's lane (revision 9)"),
]
def run(src_dir):
    p = subprocess.run(["bun", "main.ts"], cwd=src_dir, env=ENV, capture_output=True, text=True, timeout=300)
    res = {}; on = False
    for line in p.stdout.splitlines():
        if line.startswith("######## reading:"): on = "revision 10" in line
        m = re.match(r"RESULT mode=([\w-]+) (inv\d[\w-]*) (\w+)", line)
        if m and (on or m.group(1).startswith(('identity','system'))): res[(m.group(1), m.group(2))] = m.group(3)
    return res
def bad(r): return {k for k, v in r.items() if v in ("FAIL", "MISSING")}
tmp = tempfile.mkdtemp()
try:
    for f in os.listdir(HERE):
        if f.endswith(".ts"): shutil.copy(os.path.join(HERE, f), tmp)
    base = run(tmp)
    print("baseline failing checks:", sorted(f"{m}:{t}" for m, t in bad(base)))
    ok_all = True
    for name, old, new, what in M:
        src = open(os.path.join(HERE, "model.ts")).read()
        assert src.count(old) == 1, (name, src.count(old))
        open(os.path.join(tmp, "model.ts"), "w").write(src.replace(old, new))
        res = run(tmp)
        newbad = sorted(f"{m}:{t}" for m, t in bad(res) - bad(base))
        ok = bool(newbad); ok_all &= ok
        print(f"{'OK  ' if ok else 'MISS'} {name}: {what}\n      new failing checks: {', '.join(newbad) or 'none'}")
    sys.exit(0 if ok_all else 1)
finally:
    shutil.rmtree(tmp)
