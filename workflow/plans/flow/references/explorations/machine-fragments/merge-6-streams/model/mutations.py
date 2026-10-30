# Reverts each listed mutant of proposal-v2.md section 3.5 in turn (run from model/: python3 mutations.py) and checks that some check fails
# that does not fail on the unmutated model: a (check, system, kind) triple that is new, or the same triple with a different shortest counterexample.
import os, re, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ENV = dict(os.environ, REPAIR="1")  # REPAIR=1: isolate the baseline findings N1 and N2 (see model.ts READ) so they do not mask mutants
M = [
 ("a fact before its missed (FC4, FC55; I1)", "missedBeforeDroppedFact: true,", "missedBeforeDroppedFact: false,", "a value in Dropped is delivered with no missed Unproven first", "I1"),
 ("the budget reset on the first value (FC41; I12)", "resetOnlyAtFail: true,", "resetOnlyAtFail: false,", "the reconnect budget resets on the first value of a connection, not after resetAfter registered", "I12"),
 ("liveSince not cleared at connect or drop (RV1 M3; I12)", "liveSinceCleared: true,", "liveSinceCleared: false,", "liveSince survives a drop and a connect, so a connection that never registered can reset the budget", "I12"),
 ("a value before live read as proven (FC64; I1)", "openingValueUnproven: true,", "openingValueUnproven: false,", "a plain Stream's first value in Opening starts as proven, with no missed", "I1"),
 ("a status evicted on overflow (FC26; I1, I8)", "keepStatusWhenFull: true,", "keepStatusWhenFull: false,", "a full Feed.callback queue drops a signal instead of merging it", "I1a"),
 ("a group emitting down before live whatever the order (MDL F5; I1, I8) [C4]", "groupOrderAware: true,", "groupOrderAware: false,", "the group is (down, live) again: [proof, down] ends live", "I1a"),
 ("a state delivery admitted after a drop (FC20, FC54; I9)", "admitNeedsLive: true,", "admitNeedsLive: false,", "state admission no longer requires st = Live and slotConn = conn", "I9"),
 ("a value after down making value current (FC54; I16)", "droppedValueNotCurrent: true,", "droppedValueNotCurrent: false,", "a state value in Dropped confirms and is delivered", "I16"),
 ("a value after down made own (RV1 M6; I16) [C3]", "droppedValueNotOwn: true,", "droppedValueNotOwn: false,", "a state value in Dropped sets own = true, so a later proof can re-confirm it", "I16"),
 ("equality on facts (FC1, FC25; I3)", "noEqualityOnFacts: true,", "noEqualityOnFacts: false,", "a fact equal to the last one is not delivered", "I3"),
 ("a catch-up started before live (FC51; I23)", "catchUpAfterLive: true,", "catchUpAfterLive: false,", "the repair starts at connect; the socket registers later than the page read", "I23"),
 ("a catch-up completing on an empty page or a stream end (FC42; I18)", "completeOnlyOnLastPage: true,", "completeOnlyOnLastPage: false,", "an empty page with a next cursor, or the end of the inner stream, completes the repair", "I18"),
 ("a page failure dropping the socket at once (FC23; I19)", "pageRetryKeepsSocket: true,", "pageRetryKeepsSocket: false,", "a retryable page failure fails the connection although pageSched has steps left", "I19"),
 ("a restart before the scope closed (FC33; I10)", "successorAfterClosed: true,", "successorAfterClosed: false,", "the successor session opens while the predecessor is Releasing", "I10"),
 ("last = the highest position seen (FC22; I4)", "lastIsEmitted: true,", "lastIsEmitted: false,", "last follows buffered positions, not the last value emitted downstream", "I4"),
 ("a proof re-confirming a restored or cached last (FC78; I17)", "proofNeedsOwn: true,", "proofNeedsOwn: false,", "a proof confirms a last that this session did not set", "I17"),
 ("the buffer emitted on abandonment (RV1 H1; I21, I23)", "discardBufferOnAbandon: true,", "discardBufferOnAbandon: false,", "abandon() emits the buffered values", "I21"),
 ("page values emitted after a drop (FC43; I21)", "cancelPageOnEnd: true,", "cancelPageOnEnd: false,", "ending a connection no longer interrupts the page read", "I21"),
 ("signalled not set by the implicit live (MDL F7; I20)", "signalledSetByImplicit: true,", "signalledSetByImplicit: false,", "a second value after a drop emits a second implicit live", "I20"),
 ("dedupe only at completion (MDL F6; I13)", "ringKeptAfterComplete: true,", "ringKeptAfterComplete: false,", "the ring is emptied by complete(), so later socket values are not filtered", "I13"),
 ("a re-confirm not offered to the machine (RV1 H2; I24)", "reconcileAfterProof: true,", "reconcileAfterProof: false,", "a proof that re-confirms last does not go through reconcile", "I24"),
 ("the slot kept when a newer value equals heard (MDL F2; I24)", "clearSlotWhenEqual: true,", "clearSlotWhenEqual: false,", "reconcile no longer clears the slot", "I24"),
 ("listen staleness withdrawn on an unproven start (FC19, FC47; I15)", "listenGapStale: true,", "listenGapStale: false,", "an unproven start or settle(lost) adds no feedGap", "I15"),
 ("listen staleness withdrawn on a pending start (FC19, FC47; I15)", "listenPendingDown: true,", "listenPendingDown: false,", "a pending start adds no feedDown", "I15"),
 ("progress written by a superseded Attempt (FC30; I14)", "setterOnlyAddr: true,", "setterOnlyAddr: false,", "a setter from any Attempt writes the row", "I14"),
 ("fresh emitted on a reconnect (RV2 H1; I1)", "freshOnlyFirst: true,", "freshOnlyFirst: false,", "register() emits fresh although something was emitted", "I1"),
 ("C1: the repair's proof announced before it is earned", "pendingAnnounced: true,", "pendingAnnounced: false,", "startRepair emits proof, not pending, and complete() settles nothing", "I23"),
 ("C2: CannotRepair is not an exit from the repair", "cannotRepairExits: true,", "cannotRepairExits: false,", "CannotRepair is handled as a retryable page failure", "I22"),
 ("C6: an overflowing queue ends instead of failing with Overflow", "overflowFails: true,", "overflowFails: false,", "closing = ending after an overflow", "C6-overflow"),
 ("C5: time (at, dropAt, startAt) across clocks and sleep", None, None, "no invariant in 3.7 reads a time variable: at, dropAt and startAt are not modelled", "-"),
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
    print("baseline failing (check, system, kind):", len(base))
    for k in sorted(base): print("   ", k[0], "|", k[1], "|", k[2])
    ok_all = True
    for name, old, new, what, inv in M:
        if os.environ.get("ONLY") and os.environ["ONLY"] not in name: continue
        if old is None:
            print(f"NOT KILLABLE {name}: {what}"); continue
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
