# Reverts each table rule of proposal-v2.md section 3 in turn (run from model/: python3 mutations.py) and checks that some check fails
# that does not fail on the unmutated model: a FAILPAIR (check, run, ...) that is new, or the same check and run with a different counterexample.
# Each mutant runs only the search (ONLY=) that can show it, and is compared with the baseline of the same search.
# M mutates model.ts (run by main.ts); MW mutates wire.ts (run by wire-main.ts): the amended wire rules of stories-amended 2.10.4, 2.10.17.2, 2.10.17.3.
import os, shutil, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
M = [
 # (name, only, old, new, what)
 ("3.5 ranks: world, adapters, setup fibers, Runtime waits, actor schedules", "Eq", "ranksOk: true,", "ranksOk: false,", "equal instants fire in arming order only, so an actor retain timer (Runtime wait) fires before a later-armed setup-scoped SDK tick that is due at the same instant"),
 ("3.5 'then by arming' is the last key", "Eq", "armTie: true,", "armTie: false,", "two equal-keyed deadlines (the suite adapter's close bound and a Runtime retain timer of one tab at one instant) have no order, so it depends on scan order"),
 ("3.1 suspended: the tab runs nothing", "S[reconnect]", "suspendHolds: true,", "suspendHolds: false,", "advance(d, { suspended }) lets the tab's reconnect timer fire inside the window"),
 ("3.1 world/together/advance settle after each control", "W[reject]", "settleAfterWire: true,", "settleAfterWire: false,", "a release leaves the handler runnable after the step"),
 ("3.2 NothingHeld", "W[reject]", "nothingHeld: true,", "nothingHeld: false,", "release with nothing held is silently fine, so the error row is unreachable"),
 ("2.6 a Held lane is left by retry or cancel", "W[reject]", "heldEscapes: true,", "heldEscapes: false,", "retry and cancel ignore a Held lane, so it can never be left"),
 ("3.2 release() also removes standing rules (the old release()/NothingHeld deadlock)", "W[reject]", "releaseEndsStanding: true,", "releaseEndsStanding: false,", "release with nothing held is an error even if a drop(always) stands, so the rule can never end (revision 1's contradiction)"),
 ("3.2 release() ends only its own target's standing rules", "W[reject]", "targetScoped: true,", "targetScoped: false,", "a handle release also ends an endpoint rule"),
 ("T2/C3 no step names an ending", "W[reject]", "noInject: true,", "noInject: false,", "an `inject unknown` step exists"),
 ("3.2 a request of a gone client stays in transit", "W[reject]", "orphanTravels: true,", "orphanTravels: false,", "a held request of a cancelled or closed client is removed instead of travelling"),
 ("3.2 cancel with the request on the wire interrupts the client", "W[reject]", "cancelInterrupts: true,", "cancelInterrupts: false,", "cancel leaves a wire-stage Attempt alone"),
 ("2.5 the acknowledgement write gates the send", "W[reject]", "ackGate: true,", "ackGate: false,", "a persisted Attempt is sent without waiting for its acknowledgement"),
 ("2.10 only an awaiting finalizer makes a close wait (suite)", "S[suite,callback]", "closeHold: true,", "closeHold: false,", "the suite adapter's close never waits, so the release bound is unreachable"),
 ("3.2 release({ drop }) of a Held request makes it Lost", "W[reject]", "lostNotServed: true,", "lostNotServed: false,", "release({ drop: true }) serves the request instead"),
 ("3.3 drop({ at: open }) refuses the attempt", "S[reconnect]", "dropOpenRefuses: true,", "dropOpenRefuses: false,", "a dropped open is accepted"),
 ("3.2 duplicate(): the client sees the first answer only", "W[reject]", "dupAnswerIgnored: true,", "dupAnswerIgnored: false,", "the duplicate's answer also reaches the client"),
 ("3.2 the answer of a gone client goes nowhere", "W[reject]", "goneDiscarded: true,", "goneDiscarded: false,", "an orphan's answer is applied to the lane"),
 ("3.4 leave() of a resumable fragment freezes it", "Eq", 'h.st = h.resum ? "Frozen" : "Absent";', 'h.st = "Absent";', "a resumable fragment is abandoned on leave"),
 ("3.6 ghost restore (revision 1): writes of a tab are FIFO", "Wreload", "writeFifo: true,", "writeFifo: false,", "the capture that removes a cancelled Attempt's record no longer queues behind its held acknowledgement, which then lands late"),
 ("3.6 ghost restore (revision 1): a Held write is aborted with its tab", "Wreload", "abortOnClose: true,", "abortOnClose: false,", "a held acknowledgement survives closeTab and lands after the reload"),
 ("3.6 ghost restore (revision 1): an ended Attempt queues a capture that removes its record", "Wreload", "clearOnResolve: true,", "clearOnResolve: false,", "nothing removes a cancelled Attempt's record, so its late acknowledgement is restored"),
]

MW = [
 # (name, only, old, new, what)
 ("W fifoAnswers: one FIFO answer list, drained when nothing else is runnable", "Calls[ack]", "fifoAnswers: true,", "fifoAnswers: false,", "each answer is delivered inside its handler's turn, before the next arrived request has run"),
 ("W answerFifoOrder: the oldest answer is delivered first", "Calls[ack]", "answerFifoOrder: true,", "answerFifoOrder: false,", "the list is a stack"),
 ("W framesBeforeAnswer: a handler's sends are delivered before the next answer", "Calls[ack]", "framesBeforeAnswer: true,", "framesBeforeAnswer: false,", "B's frames are delivered only at B's turn, after A's answer"),
 ("W arrivalOrder: handlers run in arrival order", "Calls[dedupe]", "arrivalOrder: true,", "arrivalOrder: false,", "the later arrival's handler runs first"),
 ("W connOrder: rows reach connections in their open order (G7)", "Frames", "connOrder: true,", "connOrder: false,", "sends and releases walk the connections in scan order"),
 ("W earliestWins: the earliest-set arrival rule wins", "Calls[dedupe]", "earliestWins: true,", "earliestWins: false,", "the latest-set rule wins"),
 ("W oneRule: arrivals consume only the winning rule", "Calls[dedupe]", "oneRule: true,", "oneRule: false,", "every covering rule's times drops"),
 ("W attemptSkipsDup: a duplicate means nothing to an attempt (G5)", "Handle", "attemptSkipsDup: true,", "attemptSkipsDup: false,", "an attempt takes a handle's duplicate and consumes it"),
 ("W handleCoversAttempts: a hold or drop on a handle covers the next attempt (G4)", "Handle", "handleCoversAttempts: true,", "handleCoversAttempts: false,", "a handle's hold or drop covers calls only"),
 ("W framesAllApply: frames rules do not compete (G9, G8)", "Frames", "framesAllApply: true,", "framesAllApply: false,", "a new connection takes only the earliest covering frames rule"),
 ("W holdsJoin: a connection is silent while any hold covering it stands (G2)", "Frames", "holdsJoin: true,", "holdsJoin: false,", "a second hold on a silent connection does not join"),
 ("W handleBoth: a word on a handle is two rules", "Handle", "handleBoth: true,", "handleBoth: false,", "handle.hold() does not silence open connections"),
 ("W offline: drop() with times above 1 or always also stands", "Handle", "offline: true,", "offline: false,", "the next attempt gets through"),
 ("W dropStandsIfNone: default drop() stands only when no connection matched", "Handle", "dropStandsIfNone: true,", "dropStandsIfNone: false,", "a handle drop() both closes and stands"),
 ("W noConnErr: a stream drop() with nothing matched is NoConnection", "Frames", "noConnErr: true,", "noConnErr: false,", "a silent no-op"),
 ("W dropCloses: drop() closes matching connections at once", "Frames", "dropCloses: true,", "dropCloses: false,", "drop() leaves the connection"),
 ("W releaseScoped: release() delivers only its own rules' items", "Handle", "releaseScoped: true,", "releaseScoped: false,", "post.release() delivers what a handle's hold held"),
 ("W releaseEnds: release() ends its target's rules", "Frames", "releaseEnds: true,", "releaseEnds: false,", "a release leaves its rules"),
 ("W releaseEndsFirst: release ends its rules, then delivers (G16)", "Handle", "releaseEndsFirst: true,", "releaseEndsFirst: false,", "the open a release completes takes the rule being ended"),
 ("W releaseMatch: release({ match }) is its own word", "Calls[dedupe]", "releaseMatch: true,", "releaseMatch: false,", "a matching release also ends the rule"),
 ("W matchOnly: release({ match }) leaves the rest held", "Calls[dedupe]", "matchOnly: true,", "matchOnly: false,", "a matching release delivers everything"),
 ("W releaseAnswersFirst: released answers join before released handlers run (G3)", "Calls[dedupe]", "releaseAnswersFirst: true,", "releaseAnswersFirst: false,", "a released request's handler runs before a released answer joins"),
 ("W nothingHeld: release with nothing held and nothing standing is NothingHeld", "Calls[dedupe]", "nothingHeld: true,", "nothingHeld: false,", "a release with nothing to do is fine"),
 ("W nthCallError: nth with fewer than k held is NothingHeld", "Calls[dedupe]", "nthCallError: true,", "nthCallError: false,", "release({ nth: 2 }) with one held releases it"),
 ("W releaseArrivalOrder: held items go in arrival order", "Calls[dedupe]", "releaseArrivalOrder: true,", "releaseArrivalOrder: false,", "held items are delivered newest first"),
 ("W orderCopy: one outcome order, a copy first (G1)", "Calls[dedupe]", "orderCopy: true,", "orderCopy: false,", "a copy is answered"),
 ("W orderHold: marked to hold before gone (G1)", "Calls[dedupe]", "orderHold: true,", "orderHold: false,", "a hold-marked gone request is an orphan, not HeldAnswer"),
 ("W orderDrop: marked to drop", "Calls[dedupe]", "orderDrop: true,", "orderDrop: false,", "a drop-marked answer reaches the client"),
 ("W orderGone: gone is orphan", "Calls[dedupe]", "orderGone: true,", "orderGone: false,", "a gone client is answered"),
 ("W crashAtomic: a crashed handler commits no truth and sends no frames", "Calls[dedupe]", "crashAtomic: true,", "crashAtomic: false,", "a crashed post still commits and sends"),
 ("W copyDiscarded: the copy's answer is discarded", "Calls[dedupe]", "copyDiscarded: true,", "copyDiscarded: false,", "the duplicate's answer reaches the client"),
 ("W copyFrames: the copy's frames are not discarded", "Calls[nodedupe]", "copyFrames: true,", "copyFrames: false,", "the copy's send list is dropped"),
 ("W goneFrames: an orphan's frames still go", "Calls[nodedupe]", "goneFrames: true,", "goneFrames: false,", "a released request whose client has gone sends no frames"),
 ("W closeLast: a server close under hold is queued last", "Closing", "closeLast: true,", "closeLast: false,", "the close lands at once and loses the queue"),
 ("W closeDropped: release({ drop }) of Closing is close 1006", "Closing", "closeDropped: true,", "closeDropped: false,", "the server's code is delivered"),
 ("W closeUncounted: release({ nth }) does not count the close", "Closing", "closeUncounted: true,", "closeUncounted: false,", "the close takes a turn in the reorder"),
 ("W closingNoSend: a send to a Closing connection reaches nothing", "Closing", "closingNoSend: true,", "closingNoSend: false,", "frames queue behind a queued close"),
 ("W afterPerConn: hold({ after }) counts per connection", "Frames", "afterPerConn: true,", "afterPerConn: false,", "one counter is shared"),
 ("W afterFromFirst: a count set before open starts at the first frame", "Frames", "afterFromFirst: true,", "afterFromFirst: false,", "the replay is not counted"),
 ("W afterDupTwice: a duplicated frame counts as two", "Frames", "afterDupTwice: true,", "afterDupTwice: false,", "a duplicated frame counts as one"),
 ("W timesPerConn: times counts connections", "Frames", "timesPerConn: true,", "timesPerConn: false,", "hold({ times: 1 }) silences both"),
 ("W nthPerConn: release({ nth }) is per queue", "Nth", "nthPerConn: true,", "nthPerConn: false,", "nth on a connection releases in order"),
 ("W endOnOpen: end: true on open is frames, then close 1000", "Open", "endOnOpen: true,", "endOnOpen: false,", "end: true is ignored"),
 ("W refuseCode: refuse is Closed { code }", "Open", "refuseCode: true,", "refuseCode: false,", "a refused open closes with the crash code"),
 ("W holdSilencesNow: hold() takes effect on an Open connection at once", "Frames", "holdSilencesNow: true,", "holdSilencesNow: false,", "hold() waits for the next connection"),
 ("W afterNegErr: a negative hold({ after }) is StoryInvalidCommand", "Open", "afterNegErr: true,", "afterNegErr: false,", "after: -1 is accepted"),
 ("W openCrashCode: a crashed open is Closed { 1011 }", "Open", "openCrashCode: 1011,", "openCrashCode: 1006,", "a crashed open reads as a network loss"),
 ("W dropHeldLost: release({ drop }) of a Held request is lost before the server", "Calls[dedupe]", "dropHeldLost: true,", "dropHeldLost: false,", "the dropped request is served"),
 ("W pruneSpent: a used-up rule that holds nothing is removed (N3)", "Calls[dedupe]", "pruneSpent: true,", "pruneSpent: false,", "a used-up drop stays, so release() is not NothingHeld"),
 ("W pruneKeepsHolding: a used-up rule that still silences a connection is kept", "Frames", "pruneKeepsHolding: true,", "pruneKeepsHolding: false,", "a used-up hold({ times: 1 }) is removed while its connection is silent"),
 ("W matchNothingHeld: release({ match }) with no matching held item is NothingHeld (N1)", "Calls[dedupe]", "matchNothingHeld: true,", "matchNothingHeld: false,", "a typo'd match is silently fine when other items are held or a rule stands"),
 ("W ownRulesNotApplied: a release's own target's frames rules do not apply to what it delivers (RV3 M6)", "Frames", "ownRulesNotApplied: true,", "ownRulesNotApplied: false,", "release({ match }) delivery takes the releasing target's own counts and duplicates"),
 ("W countPausedWhileSilent: a count pauses while the connection is silent (N4)", "Frames", "countPausedWhileSilent: true,", "countPausedWhileSilent: false,", "queued frames are counted"),
 ("W dupEarliestOnly: one frame takes only the earliest armed duplicate (N5)", "Frames", "dupEarliestOnly: true,", "dupEarliestOnly: false,", "two armed duplicates deliver one frame three times"),
 ("W nthWithinKind: nth orders within a kind; answers still join first (N2)", "Calls[dedupe]", "nthWithinKind: true,", "nthWithinKind: false,", "the k-th Held request's handler runs before the released answers join"),
 ("W handleReleaseOrder: a handle's release reaches queues, then answers, then requests (RV3 L2)", "Handle", "handleReleaseOrder: true,", "handleReleaseOrder: false,", "a handle's release walks calls before connection queues"),
 ("W finishReleases: the finish phase releases every held item", "Pump", "finishReleases: true,", "finishReleases: false,", "a fiber waiting on a held call stays parked at the end"),
 ("W finishCloses: the finish phase closes every open connection as the network would", "Pump", "finishCloses: true,", "finishCloses: false,", "a fiber waiting on its connection stays parked at the end"),
 ("W finishSettles: the finish phase settles after each step", "Pump", "finishSettles: true,", "finishSettles: false,", "released calls are never answered, so their waiting fiber stays parked"),
 ("W finishOnClone: nothing from the finish phase reaches the evidence", "Pump", "finishOnClone: true,", "finishOnClone: false,", "the finish phase mutates the run's own state"),
 ("W finishIgnoresNew: the finish phase reports only fibers parked at the last cut (U3)", "Pump", "finishIgnoresNew: true,", "finishIgnoresNew: false,", "a long chain started by the finish phase is reported"),
 ("W pendingCountsAsHeld: a request marked to hold, still at the server, is a held item for every release (U2)", "Calls[dedupe]", "pendingCountsAsHeld: true,", "pendingCountsAsHeld: false,", "release() over such a request is NothingHeld or leaves its mark"),
 ("W countRequeues: a count reaching n during a release's own delivery queues the rest again (U1)", "Frames", "countRequeues: true,", "countRequeues: false,", "release({ match }) delivers past a count reaching n"),
 ("W pingDelivers: a ping is delivered when due", "Ping", "pingDelivers: true,", "pingDelivers: false,", "no ping reaches an Open connection"),
 ("W pingNotCounted: a ping takes no count of hold({ after })", "Ping", "pingNotCounted: true,", "pingNotCounted: false,", "a ping counts toward after"),
 ("W pingNotDoubled: a ping takes no duplicate", "Ping", "pingNotDoubled: true,", "pingNotDoubled: false,", "a ping takes an armed duplicate"),
 ("W pingStopsOnHold: a hold stops pings", "Ping", "pingStopsOnHold: true,", "pingStopsOnHold: false,", "pings reach a Silent or Closing connection"),
 ("W pingNoQueue: a ping never queues", "Ping", "pingNoQueue: true,", "pingNoQueue: false,", "a ping queues behind a hold"),
 ("W pingRankFirst: a ping ranks before a client's idle deadline", "Ping", "pingRankFirst: true,", "pingRankFirst: false,", "the idle deadline fires first and drops a connection a ping would keep alive"),
 ("W pingResumes: after a hold the next ping is every from then", "Ping", "pingResumes: true,", "pingResumes: false,", "the old schedule is kept, so a ping is due at once"),
 ("W pumpK: a chain of K hops completes (K smaller)", "Pump", "pumpK: 3,", "pumpK: 2,", "a chain of exactly K hops is cut"),
 ("W pumpK: a chain longer than K is cut (K larger)", "Pump", "pumpK: 3,", "pumpK: 4,", "a chain of K+1 hops completes"),
 ("W idleResets: the idle count resets on any arrival", "Pump", "idleResets: true,", "idleResets: false,", "idle hops accumulate across activity, so a short chain is cut"),
 ("W eorOnce: HostTimeWait is classified once, at the end of the run", "Pump", "eorOnce: true,", "eorOnce: false,", "a settle rejects the parked fiber at once"),
]
def run(d, only, main="main.ts"):
    p = subprocess.run(["bun", main], cwd=d, env=dict(os.environ, ONLY=only), capture_output=True, text=True, timeout=300)
    res = {}
    for line in p.stdout.splitlines():
        if line.startswith("FAILPAIR "):
            i, s, t = [x.strip() for x in line[9:].split(" | ", 2)]
            res[(i, s)] = t
    return res
tmp = tempfile.mkdtemp()
try:
    base = {}
    ok_all = True
    JOBS = [(n, o, "model.ts", a, b, w, "main.ts") for (n, o, a, b, w) in M] + [(n, o, "wire.ts", a, b, w, "wire-main.ts") for (n, o, a, b, w) in MW]
    for name, only, fname, old, new, what, main in JOBS:
        if os.environ.get("ONLY") and os.environ["ONLY"] not in name: continue
        for f in os.listdir(HERE):
            if f.endswith(".ts"): shutil.copy(os.path.join(HERE, f), tmp)
        if (main, only) not in base: base[(main, only)] = run(tmp, only, main)
        src = open(os.path.join(HERE, fname)).read()
        assert src.count(old) == 1, (name, src.count(old))
        open(os.path.join(tmp, fname), "w").write(src.replace(old, new))
        res = run(tmp, only, main); b = base[(main, only)]
        newk = sorted(k for k in res if k not in b)
        chg = sorted(k for k in res if k in b and res[k] != b[k])
        ok = bool(newk or chg); ok_all &= ok
        fmt = lambda ks: "; ".join(f"{a} [{s}]" for a, s in ks) or "none"
        print(f"{'OK  ' if ok else 'MISS'} {name} ({only}): {what}\n      newly failing: {fmt(newk)}\n      changed: {fmt(chg)}")
        for k in (newk + chg)[:1]: print(f"        e.g. {k[0]}: {res[k][:230]}")
        sys.stdout.flush()
    sys.exit(0 if ok_all else 1)
finally:
    shutil.rmtree(tmp)
