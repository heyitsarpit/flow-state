// Second author's mutants for round 3 (D56). Each is one small bug that breaks one stated rule.
//
// What I read: machine-design.md 2.4 (rules), 2.5, 2.7.13, 2.8.5-2.8.6, 2.9.2-2.9.4; convergence-3.md whole; the rows of D3, D15,
// D21, D22 in convergence-1.md and D39, D40 in convergence-2.md (D3, D15 and the like found by a grep of those files, not a read
// of them whole); every round-3/*.ts except this file; conformance/mutate.ts.
// What I did not read: conformance/scenarios, conformance/search, conformance/fixtures (I only saw the compiled types as turn.ts
// and world.ts use them), SCENARIOS.md, expected-changes.log, expected.lock, round-3/suite-output.txt, red-round-*.txt,
// round-2/mutants*, round-2/review.md. round-3's builder list (round-3/mutants.ts), if there is one, I did not read either.
// What I did not do: run any of these. No bun, no suite, no runner. Each `find` was checked by a text search that builds mutate.ts's
// regex and counts matches in the named file; nothing else about them is verified. A mutant that survives may be one the suite
// misses or one I wrongly think is observable; I dropped those I suspected, and marked the two I am least sure of.
import type { Mutant } from "../conformance/mutate.ts";

export const MUTANTS: readonly Mutant[] = [
  // ── Fragments: rules 1, 6, 9, 14, 15, 22, 44, 48-60, 2.5's order, 2.9.3's releasing rows.

  // Rule 22: "every payload mapper ... sees before". Parts read the working copy, so a raise's mapper sees the source's patch.
  {
    id: "s-before-reads-working-copy",
    kills: ["rule:22", "sec:2.5"],
    edits: [["turn.ts", `return kidAt(w.root0, path) ?? cur;`, `return cur;`]],
  },
  // Rule 22: "commit input selects ... read after". A select reads the pre-turn memory: the stale-etag bug.
  {
    id: "s-select-reads-before",
    kills: ["rule:22", "sec:2.5"],
    edits: [
      [
        "turn.ts",
        `const inc = kidAt(w.root, part.path) ?? kidAt(w.root0, part.path)!; const after = inView(inc, part.event);`,
        `const inc = kidAt(w.root, part.path) ?? kidAt(w.root0, part.path)!; const after = inView(kidAt(w.root0, part.path) ?? inc, part.event);`,
      ],
    ],
  },
  // Rule 1: "A reset gives the trait a new incarnation before the turn's parts react". Only the commit's re-check resets.
  {
    id: "s-no-reset-before-walk",
    kills: ["rule:1", "sec:2.5"],
    edits: [["turn.ts", `if (source) doResets(w);`, ``]],
  },
  // Rule 54: adoption deliveries run "after any pending reset". The reset is queued last.
  {
    id: "s-pending-reset-after-adoption",
    kills: ["rule:54", "rule:1"],
    edits: [
      ["turn.ts", `...(reset ? [{ k: "recheck" as const, actor: w.a.key }] : []),`, ``],
      [
        "turn.ts",
        `...follows.map((event: Ev) => ({ k: "send" as const, actor: w.a.key, event })),`,
        `...follows.map((event: Ev) => ({ k: "send" as const, actor: w.a.key, event })), ...(reset ? [{ k: "recheck" as const, actor: w.a.key }] : []),`,
      ],
    ],
  },
  // Rule 9: "keys past max are dropped".
  {
    id: "s-each-ignores-max",
    kills: ["rule:9"],
    edits: [
      ["inc.ts", `if (seen.has(key) || keys.length >= p.each!.max) {`, `if (seen.has(key)) {`],
    ],
  },
  // Rule 6: whenAbandoned's "payload mappers read the incarnation's pre-turn memory". A copy ended by the final list, after a raise
  // patched it this turn, reports the patched memory. Least sure: needs that exact shape in a scenario.
  {
    id: "s-abandoned-reads-final-memory",
    kills: ["rule:6"],
    edits: [
      [
        "turn.ts",
        `const view = inView(kidAt(w.root0, e.path) ?? e.inc, {});`,
        `const view = inView(e.inc, {});`,
      ],
    ],
  },
  // Rule 14: "never an activation of this incarnation (an adopted lane) -> current, from the active leaf". It routes late from the root.
  {
    id: "s-adopted-ending-routes-late",
    kills: ["rule:14", "rule:54"],
    edits: [["turn.ts", `if (item.restored || item.owner.inc !== inc.id)`, `if (item.restored)`]],
  },
  // Rule 15: a late turn may not exit "an active subroutine".
  {
    id: "s-late-leaves-subroutine",
    kills: ["rule:15", "rule:6"],
    edits: [["turn.ts", `if (exits.some((n) => frag.nodes[n]!.subroutine)) return true;`, ``]],
  },
  // 2.5: LateMayNotLeave applies "in steps 2 and 3 alike". A filling reached from a late turn may leave.
  {
    id: "s-late-filling-may-leave",
    kills: ["rule:15", "sec:2.5"],
    edits: [["turn.ts", `if (w.lateFill && leavesWork(w, host, alt)) continue;`, ``]],
  },
  // Rule 51: "a commit from an incarnation whose subject path differs from the lane's ends NotSent { Rejected }".
  {
    id: "s-commit-from-other-path-joins",
    kills: ["rule:51", "rule:16", "sec:2.9.3"],
    edits: [
      [
        "turn.ts",
        `if (lane && !sameSubject(lane.subject, subject)) { decline(tx,`,
        `if (false) { decline(tx,`,
      ],
    ],
  },
  // Rule 1: "A firing already queued when X is left is retracted, and fires on return". It stays queued, hits the frost and is lost.
  {
    id: "s-queued-firing-not-retracted",
    kills: ["rule:1", "rule:8"],
    edits: [["turn.ts", `if (m.k === "fire" && m.inc === inc.id) {`, `if (false) {`]],
  },
  // Rule 60: "every lane of that operation whose subject path is the ending incarnation's". Every subject's lanes are released.
  {
    id: "s-release-every-subject",
    kills: ["rule:60"],
    edits: [
      [
        "turn.ts",
        `if (l.actor === w.a.key && l.op === op && sameSubject(l.subject, subject))`,
        `if (l.actor === w.a.key && l.op === op)`,
      ],
    ],
  },
  // Rule 60, 2.9.3: "the marks apply after every member of the turn, so a commit in a copy the same turn removes is marked too".
  {
    id: "s-release-before-members",
    kills: ["rule:60", "sec:2.9.3", "sec:2.5"],
    edits: [
      [
        "turn.ts",
        `for (const { op, subject } of w.releases) for (const l of Object.values(tx.w.lanes)) if (l.actor === w.a.key && l.op === op && sameSubject(l.subject, subject)) cell(tx, "release", l, argsOf(l));`,
        ``,
      ],
      [
        "turn.ts",
        `for (const r of reads) {`,
        `for (const { op, subject } of w.releases) for (const l of Object.values(tx.w.lanes)) if (l.actor === w.a.key && l.op === op && sameSubject(l.subject, subject)) cell(tx, "release", l, argsOf(l)); for (const r of reads) {`,
      ],
    ],
  },
  // 2.9.3, rebind: "the mark is cleared; the lane is adopted". The returning subject's ending stays evidence.
  {
    id: "s-rebind-keeps-releasing",
    kills: ["sec:2.9.3", "rule:60", "rule:54"],
    edits: [["turn.ts", `if (next.releasing && !m.local) {`, `if (false) {`]],
  },
  // Rule 60, 2.9.3, an ending lands: "applied to the lane and store, then evidence". It is delivered or parked as usual.
  {
    id: "s-releasing-ending-delivered",
    kills: ["rule:60", "rule:17", "sec:2.9.3"],
    edits: [
      [
        "turn.ts",
        `if (releasing) { const cur = tx.w.lanes[laneId];`,
        `if (false) { const cur = tx.w.lanes[laneId];`,
      ],
    ],
  },
  // Rule 54: "the parked endings in saved order, then a held head's unknown { Restored } once". Holds go first.
  {
    id: "s-adoption-holds-before-parked",
    kills: ["rule:54", "rule:44"],
    edits: [["turn.ts", `return [...out, ...holds];`, `return [...holds, ...out];`]],
  },
  // Rule 53: "With no binding incarnation ... the ending is parked raw on the lane record". It becomes evidence and is lost.
  {
    id: "s-unplaced-ending-is-evidence",
    kills: ["rule:53", "rule:8", "rule:17"],
    edits: [
      [
        "turn.ts",
        `if (!path) return parkEnding(tx, item, lane, subject, a.machine);`,
        `if (!path) return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });`,
      ],
    ],
  },
  // Rule 44: "An ending with no live actor incarnation is parked raw on its lane record for the identity's saved record".
  {
    id: "s-unbound-ending-never-parks",
    kills: ["rule:44", "OD:21"],
    edits: [["turn.ts", `if (keep) return parkEnding(tx, item, lane, subject, machine);`, ``]],
  },

  // ── The fixes: D45, D46, D47, D48, D49, D50, D15, D21, D55, the seam's disposal.

  // D45: "`sent` is set ... by the restore row". A restored unknown forgets it, so a later cancel says never sent (H1).
  {
    id: "s-restore-forgets-history",
    kills: ["D45", "cell:lane.restore.InFlight"],
    edits: [
      [
        "durable.ts",
        `const head = revive(h, phase, h.mayHaveApplied || unknown);`,
        `const head = revive(h, phase, h.mayHaveApplied);`,
      ],
    ],
  },
  // D46: "A user closure outside a turn never disables and never kills". Its throw escapes the step: fatal.
  {
    id: "s-outside-closure-is-fatal",
    kills: ["D46"],
    edits: [
      ["hooks.ts", `if (tx.inTurn) return run(slot, ...args);`, `return run(slot, ...args);`],
    ],
  },
  // D46: "what would join declines NotSent { ModuleDisabled }". It starts anyway, unordered.
  {
    id: "s-disabled-store-admits",
    kills: ["D46"],
    edits: [
      ["hooks.ts", `if (!active(tx, m)) return "ModuleDisabled";`, `if (!active(tx, m)) continue;`],
    ],
  },
  // D46: "Fails closed: what joined it stays unsent". H3's trace: a write on the wire past an unresolved one.
  {
    id: "s-disabled-store-sends",
    kills: ["D46", "D3"],
    edits: [
      [
        "hooks.ts",
        `if (!active(tx, m)) { if (uses(tx, machine, m)) return { on: "disabled", module: m.id }; continue; }`,
        `if (!active(tx, m)) { continue; }`,
      ],
    ],
  },
  // D46: "A module's own code ... its effects roll back". The world keeps what the hook did before it threw.
  {
    id: "s-defect-keeps-effects",
    kills: ["D46"],
    edits: [
      [
        "hooks.ts",
        `tx.w = { ...k.w, disabled: { ...k.w.disabled, [m.id]: true } };`,
        `tx.w = { ...tx.w, disabled: { ...tx.w.disabled, [m.id]: true } };`,
      ],
    ],
  },
  // D46: "A stored record ... Per record: quarantined, the rest boots". A bad actor record reaches the boot.
  {
    id: "s-bad-record-reaches-boot",
    kills: ["D46"],
    edits: [
      [
        "durable.ts",
        `if (!tx.machines[v.machine] || !goodInc(v.root)) {`,
        `if (!tx.machines[v.machine]) {`,
      ],
    ],
  },
  // D47: "an answer older than what we hold, and different, is not applied". Every answer applies (H4, M3).
  {
    id: "s-answers-have-no-position",
    kills: ["D47"],
    edits: [
      [
        "entities.ts",
        `r.changedAt > pos && !Object.entries(fields).every(([k, v]) => same(r.base?.[k], v));`,
        `false;`,
      ],
    ],
  },
  // D47's table: "lost, repair, re-send succeeds with the same value: no extra read". A same-valued old answer forces a repair.
  {
    id: "s-stale-ignores-differs",
    kills: ["D47"],
    edits: [
      [
        "entities.ts",
        `r.changedAt > pos && !Object.entries(fields).every(([k, v]) => same(r.base?.[k], v));`,
        `r.changedAt > pos;`,
      ],
    ],
  },
  // D48: "Cancel or replace in that window records `then` and waits". The cancel says NotSent with the ack still out (M1).
  {
    id: "s-cancel-does-not-wait-for-ack",
    kills: ["D48", "cell:lane.cancel.InFlight"],
    edits: [
      [
        "lane.ts",
        `if (ackOut(h) && h.phase.t === "durable") return setLane(tx, { ...l!, head: { ...h, phase: { ...h.phase, then: "cancel" } } });`,
        ``,
      ],
    ],
  },
  // D48: "On ok the never-sent cell runs". The recorded cancel is forgotten and the write goes out after the user stopped it.
  {
    id: "s-ack-forgets-then",
    kills: ["D48", "rule:24"],
    edits: [["durable.ts", `if (p.then) afterAck(tx, acked, p.then);`, ``]],
  },
  // D49: "`stalled` on the row. Public."
  {
    id: "s-row-hides-stalled",
    kills: ["D49"],
    edits: [
      ["publish.ts", `...(w.stalled[l.head.id] ? { stalled: w.stalled[l.head.id] } : {}),`, ``],
    ],
  },
  // D49: "It ends nothing: D30 and D3 stand". Silence is treated as refusal, so a write that may be acked is told NotSent.
  {
    id: "s-silence-is-refusal",
    kills: ["D49", "D30"],
    edits: [
      [
        "durable.ts",
        `tx.w = { ...tx.w, stalled: { ...tx.w.stalled, [attempt]: "storage" } }; tx.visible = true;`,
        `return cell(tx, "storageRefused", l, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });`,
      ],
    ],
  },
  // D50: "redelivered once, after other mail". It comes back at the head, before its siblings.
  {
    id: "s-redelivery-jumps-mail",
    kills: ["D50"],
    edits: [
      [
        "turn.ts",
        `enqueue(tx, { ...rest, redelivered: true });`,
        `tx.w = { ...tx.w, follow: [{ ...rest, redelivered: true }, ...tx.w.follow] };`,
      ],
    ],
  },
  // D50: "with no second cell". The redelivery applies the ending to the lane again.
  {
    id: "s-redelivery-second-cell",
    kills: ["D50", "rule:27"],
    edits: [
      [
        "turn.ts",
        `enqueue(tx, { ...rest, redelivered: true });`,
        `enqueue(tx, { ...item, redelivered: true });`,
      ],
    ],
  },
  // D15: "A bound lane never yields". An actor back within the 5 minutes still loses its hold.
  {
    id: "s-bound-hold-yields",
    kills: ["D15", "D3", "OD:6"],
    edits: [
      [
        "step.ts",
        `if (!l?.head || l.head.phase.t !== "held" || tx.w.actors[l.actor]) return;`,
        `if (!l?.head || l.head.phase.t !== "held") return;`,
      ],
    ],
  },
  // D21: "A local actor's lanes are not adopted ... a sent one finishes to evidence". It goes on looking for a binding incarnation.
  {
    id: "s-local-sent-not-evidence",
    kills: ["D21"],
    edits: [["step.ts", `else setLane(tx, { ...l, releasing: true });`, ``]],
  },
  // D55: "A success that clears a given-up mark forces one repair".
  {
    id: "s-given-clear-no-repair",
    kills: ["D55"],
    edits: [
      [
        "entities.ts",
        `if (gone.some((m) => m.given)) out = startRepair(out, ref, e.machine, cx);`,
        ``,
      ],
    ],
  },
  // D51: "`dispose(s, cx)` NEW: stops its fibers"; M7. A repair's fiber outlives the Runtime.
  {
    id: "s-dispose-leaves-repair-fiber",
    kills: ["D51", "D6"],
    edits: [
      [
        "entities.ts",
        `for (const [ref, r] of Object.entries(s.repairs)) cx.command({ k: "stop", ref, gen: r.gen });`,
        ``,
      ],
    ],
  },

  // ── Lane cells, rule 18, rules 27-32, D3, restore order.

  // Rule 18: "a definite failure only if no earlier send of the same Attempt ended unknown; otherwise StillUnknown".
  {
    id: "s-no-still-unknown",
    kills: ["rule:18", "sec:2.8.6.E8"],
    edits: [
      [
        "lane.ts",
        `ending.ch === "failure" && h.mayHaveApplied ? { ch: "unknown", reason: "StillUnknown", value: ending } : ending;`,
        `ending;`,
      ],
    ],
  },
  // Rule 18, D45: an unknown ending must set the history bit. Only a restore does now, so a live re-send's failure is definite.
  {
    id: "s-settle-forgets-unknown",
    kills: ["rule:18", "D45"],
    edits: [
      [
        "lane.ts",
        `head: { ...h, mayHaveApplied: h.mayHaveApplied || final.ch === "unknown" },`,
        `head: { ...h },`,
      ],
    ],
  },
  // 2.7.13, flags: "retryCount ... counted at the invoked cell, not at retry, so a re-send that never left uses no budget".
  {
    id: "s-retry-count-at-retry",
    kills: ["cell:lane.invoked.InFlight", "cell:lane.retry.Held", "rule:21"],
    edits: [
      [
        "lane.ts",
        `const h: Attempt = { ...l!.head!, owner: a.owner ?? l!.head!.owner };`,
        `const h: Attempt = { ...l!.head!, owner: a.owner ?? l!.head!.owner, retryCount: l!.head!.retryCount + 1 };`,
      ],
      [
        "lane.ts",
        `retryCount: h.mayHaveApplied ? h.retryCount + 1 : h.retryCount,`,
        `retryCount: h.retryCount,`,
      ],
    ],
  },
  // Rule 29: "a newer commit replaces a never-sent queued write: Superseded, prediction removed, queue entry removed". The store is not told.
  {
    id: "s-superseded-store-not-told",
    kills: ["rule:29", "rule:30", "sec:2.8.5"],
    edits: [["lane.ts", `tellEnded(tx, x.id, "superseded");`, ``]],
  },
  // Rule 30: "a definite failure removes predictions without repair".
  {
    id: "s-failure-forces-repair",
    kills: ["rule:30", "sec:2.8.6"],
    edits: [
      [
        "entities.ts",
        `if (ending.ch === "failure") return removeEntry(s, attempt);`,
        `if (ending.ch === "failure") return e.refs.reduce((o, ref) => startRepair(o, ref, e.machine, cx), removeEntry(s, attempt));`,
      ],
    ],
  },
  // Rule 32: "Released is a store effect: the record queue learns the Attempt is given up". A later success can never clear its mark.
  {
    id: "s-released-mark-not-given",
    kills: ["rule:32", "rule:30"],
    edits: [
      [
        "entities.ts",
        `marks: r.marks.map((m) => (m.attempt === attempt ? { ...m, given: true } : m)),`,
        `marks: r.marks,`,
      ],
    ],
  },
  // D3: "Queue order is mint order". A new write joins at the front of the record's queue and passes an unresolved one.
  {
    id: "s-new-write-heads-queue",
    kills: ["D3", "rule:29", "S5"],
    edits: [
      [
        "entities.ts",
        `out = withRec(out, ref, (r) => ({ ...r, queue: [...r.queue, w.attempt] }));`,
        `out = withRec(out, ref, (r) => ({ ...r, queue: [w.attempt, ...r.queue] }));`,
      ],
    ],
  },
  // Rule 44, 2.7.13: restore delivers "per lane in creation order". Records keep storage's order. Least sure: survives if a
  // fake's storage hands records back in mint order anyway.
  {
    id: "s-restore-unsorted",
    kills: ["rule:44", "D3"],
    edits: [
      [
        "durable.ts",
        `for (const [, l] of lanes.sort(([, a], [, b]) => mintOf(a) - mintOf(b))) {`,
        `for (const [, l] of lanes) {`,
      ],
    ],
  },
  // 2.7.13, restore: "acknowledged but never invoked" restores as unknown { Restored } (G1). It is told NotSent, as if never out.
  {
    id: "s-acked-restores-notsent",
    kills: ["cell:lane.restore.InFlight", "rule:17", "rule:46"],
    edits: [
      [
        "durable.ts",
        `h.held || h.acked ? { ch: "unknown", reason: "Restored" }`,
        `h.held ? { ch: "unknown", reason: "Restored" }`,
      ],
    ],
  },
  // Rule 24: on the wire, cancel's ending is "unknown, Cancelled". It classifies as Interrupted, so a "stopped" handler never runs.
  {
    id: "s-cancel-reads-interrupted",
    kills: ["cell:lane.cancel.InFlight", "rule:24"],
    edits: [
      [
        "lane.ts",
        `setLane(tx, { ...l!, head: { ...h, phase: { ...h.phase, cancelled: true } } });`,
        `setLane(tx, { ...l! });`,
      ],
    ],
  },
  // 2.7.13, cancel: "a re-send -> it returns to Held and is released", never NotSent: it may have landed (R7 H2).
  {
    id: "s-cancel-resend-says-notsent",
    kills: ["cell:lane.cancel.InFlight", "rule:24", "D45"],
    edits: [["lane.ts", `Resend: "cancelResend",`, `Resend: "cancelNeverSent",`]],
  },
  // 2.7.13, commit in Held: "the hold refuses or queues; nothing is sent". Under `latest` a hold is replaced as if never sent (OD5).
  {
    id: "s-commit-replaces-hold",
    kills: ["cell:lane.commit.Held", "rule:21", "OD:5"],
    edits: [
      ["lane.ts", `Settled: "busy", Held: "busy",`, `Settled: "busy", Held: "commitOverWaiting",`],
    ],
  },
  // 2.7.13, storage refused: "A re-send ... returns to Held, and the mapped unknown is delivered again" (OD20 F5). It reads never sent.
  {
    id: "s-refused-capture-says-notsent",
    kills: ["cell:lane.storageRefused.InFlight", "OD:20"],
    edits: [
      [
        "lane.ts",
        `storageRefused: { Waiting: "refuseFirst", Resend: "refuseResend" },`,
        `storageRefused: { Waiting: "refuseFirst", Resend: "refuseFirst" },`,
      ],
    ],
  },
  // Rule 35: "any record queue". Only the first predicted record's bound is checked, so a queue past 64 is joined.
  {
    id: "s-overflow-checks-first-record",
    kills: ["rule:35", "sec:2.8.5"],
    edits: [
      [
        "entities.ts",
        `if (refs.some((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };`,
        `if (refs.slice(0, 1).some((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };`,
      ],
    ],
  },
];
