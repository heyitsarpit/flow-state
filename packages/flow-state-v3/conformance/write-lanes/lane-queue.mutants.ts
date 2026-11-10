import type { Mutant } from "../dsl/oracle.ts";

const lane = (find: string, replace: string) => [{ file: "lane.ts", find, replace }];

const CANCEL_ALL =
  '  setLane(tx, cleared);\n  cell(tx, "cancel", cleared, a);\n  for (const x of queued) {';

/**
 * Wrong runtimes the lane-queue oracle must catch: most edit one cell of the prototype's lane
 * table; the release, boot and double-invoke ones edit the turn, boot or driver code.
 *
 * **Details**
 *
 * The names that match the prototype suite's mutants and wrong runtimes are the same edits, so the
 * two suites' verdicts compare: `lie.serialize-as-latest`, `lane.queue-unbounded`,
 * `1b.cancel-all-queue-reversed`, `1b.cancel-all-promotes-before-emptying`,
 * `1b.cancel-all-wire-held-at-once`, `audit-1.cancel-all-leaves-the-head` and
 * `p1h.cancel-all-idle-declines`. The `lane.*` ones are written from WriteLanes' text:
 * `lane.latest-as-serialize` (R7), `lane.fresh-mint-on-held` (R7, R8), `lane.unknown-promotes`
 * (R8), `lane.cancel-held-keeps` (R14), `lane.cancel-wire-as-never-sent` (R14, I20) and
 * `lane.held-auto-resend`. The rest are written for this suite: `lie.held-released-unguarded`,
 * `lie.release-on-guarded-read` and `mutant.release-drops-held` (R8, I12),
 * `mutant.boot-resends-held` (I12) and `mutant.double-invoke` (I1); for the convergence design's
 * anchoring, `lie.release-other-lane` and `lie.void-retry-releases` (I12), `lane.reject-queues`
 * (I8), `mutant.boot-replays-never-sent` (I1), `mutant.members-reversed` (I10, order) and
 * `lie.release-member-claimed` (I12, review H1).
 */
export const laneQueueMutants: ReadonlyArray<Mutant> = [
  {
    name: "lie.serialize-as-latest",
    says: "a serialize commit supersedes the queued ones, as latest does",
    expects: "WriteLanes I8",
    runtime: "prototype",
    cases: ["LANE-01"],
    edits: lane(
      'if (policy === "latest") {',
      'if (policy === "latest" || policy === "serialize") {',
    ),
  },
  {
    name: "lane.queue-unbounded",
    says: "serialize queues past its bound of 64 instead of declining Overloaded",
    expects: "WriteLanes I8",
    runtime: "prototype",
    cases: ["LANE-02"],
    edits: lane(
      'if (policy === "serialize" && l.w.length >= tx.bounds.queueMax) {',
      'if (policy === "serialize" && l.w.length >= Infinity) {',
    ),
  },
  {
    name: "lane.latest-as-serialize",
    says: "latest keeps every queued commit, as serialize does",
    expects: "WriteLanes I8",
    runtime: "prototype",
    cases: ["LANE-06"],
    edits: lane('if (policy === "latest") {', 'if (policy === "never") {'),
  },
  {
    name: "lane.fresh-mint-on-held",
    says: "a commit on a Held lane mints a fresh head, dropping the hold",
    expects: "WriteLanes I11",
    runtime: "prototype",
    cases: ["LANE-03"],
    edits: lane('    Held: "busy",\n  },\n  retry:', '    Held: "mint",\n  },\n  retry:'),
  },
  {
    name: "lane.unknown-promotes",
    says: "an unknown ending resolves the head and promotes the queue",
    expects: "WriteLanes I11",
    runtime: "prototype",
    cases: ["LANE-03"],
    edits: lane(
      '  hold(tx, l) {\n    setLane(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } });\n  },',
      "  hold(tx, l) {\n    promote(tx, l!);\n  },",
    ),
  },
  {
    name: "lane.cancel-held-keeps",
    says: "a cancel on a Held head keeps the hold",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["LANE-03", "PAY-03"],
    edits: lane("  giveUp(tx, l) {\n    release(tx, l!);\n  },", "  giveUp() {},"),
  },
  {
    name: "lane.cancel-wire-as-never-sent",
    says: "a cancel on the wire ends the head NotSent Cancelled at once, as if never sent",
    expects: "WriteLanes I20",
    runtime: "prototype",
    cases: ["LANE-04"],
    edits: lane(
      '  interruptWire(tx, l) {\n    const h = l!.head!;\n    if (h.phase.t !== "wire") return;',
      '  interruptWire(tx, l) {\n    const h = l!.head!;\n    if (h.phase.t !== "wire") return;\n    return endNeverSent(tx, l!);',
    ),
  },
  {
    name: "lane.held-auto-resend",
    says: "a Held head is re-sent the moment its unknown ends, with no retry",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["LANE-03", "PAY-15/press-pay-while-held"],
    edits: lane(
      '  hold(tx, l) {\n    setLane(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } });\n  },',
      '  hold(tx, l) {\n    const held = { ...l!, head: { ...l!.head!, phase: { t: "held" as const } } };\n    setLane(tx, held);\n    ACTIONS.invoke(tx, held, argsOf(held));\n  },',
    ),
  },
  {
    name: "1b.cancel-all-queue-reversed",
    says: "cancelAll ends the queue in reverse mint order",
    expects: "WriteLanes I21",
    runtime: "prototype",
    cases: ["LANE-04"],
    edits: lane("for (const x of queued) {", "for (const x of [...queued].reverse()) {"),
  },
  {
    name: "1b.cancel-all-promotes-before-emptying",
    says: "cancelAll cancels the head before emptying the queue, so the first queued commit is promoted",
    expects: "WriteLanes I21",
    runtime: "prototype",
    cases: ["LANE-03"],
    edits: lane(
      '  const queued = lane.w;\n  const cleared = { ...lane, w: [] };\n  setLane(tx, cleared);\n  cell(tx, "cancel", cleared, a);',
      '  cell(tx, "cancel", lane, a);\n  const now = tx.w.lanes[lane.id];\n  const queued = now?.w ?? [];\n  if (now) setLane(tx, { ...now, w: [] });',
    ),
  },
  {
    name: "1b.cancel-all-wire-held-at-once",
    says: "cancelAll marks a head on the wire Held at once, before its fiber exits",
    expects: "WriteLanes I20",
    runtime: "prototype",
    cases: ["LANE-04"],
    edits: lane(
      '  cell(tx, "cancel", cleared, a);\n  for (const x of queued) {',
      '  cell(tx, "cancel", cleared, a);\n  { const c2 = tx.w.lanes[lane.id]; if (c2?.head?.phase.t === "wire") setLane(tx, { ...c2, head: { ...c2.head, phase: { t: "held" } } }); }\n  for (const x of queued) {',
    ),
  },
  {
    name: "audit-1.cancel-all-leaves-the-head",
    says: "cancelAll ends the queue and leaves the head alone",
    expects: "WriteLanes I20",
    runtime: "prototype",
    cases: ["LANE-04"],
    edits: lane(CANCEL_ALL, "  setLane(tx, cleared);\n  for (const x of queued) {"),
  },
  {
    name: "p1h.cancel-all-idle-declines",
    says: "cancelAll on an Idle lane declines NotSent Cancelled instead of doing nothing",
    expects: "WriteLanes I21",
    runtime: "prototype",
    cases: ["LANE-05"],
    edits: lane(
      '  if (!lane?.w.length) return cell(tx, "cancel", lane, a);',
      '  if (!lane) return void decline(tx, a, "Cancelled");\n  if (!lane.w.length) return cell(tx, "cancel", lane, a);',
    ),
  },
  {
    name: "lie.held-released-unguarded",
    says: "a head held by an unknown is released at once, with no cancel, and reported Released",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["LANE-03", "PAY-15/press-pay-while-held"],
    edits: lane(
      '  hold(tx, l) {\n    setLane(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } });\n  },',
      '  hold(tx, l) {\n    setLane(tx, { ...l!, head: { ...l!.head!, phase: { t: "held" } } });\n    release(tx, tx.w.lanes[l!.id]!);\n  },',
    ),
  },
  {
    name: "mutant.double-invoke",
    says: "an Attempt on the wire is invoked a second time, with no commit, promotion or retry",
    expects: "WriteLanes I1",
    runtime: "prototype",
    cases: ["PAY-01", "LANE-01"],
    edits: lane(
      '    note(tx, "invoked", { op: l!.op, attempt: h.id, send: gen });',
      '    note(tx, "invoked", { op: l!.op, attempt: h.id, send: gen });\n    note(tx, "invoked", { op: l!.op, attempt: h.id, send: gen });\n    tx.commands.push({ k: "invoke", attempt: h.id, send: gen, machine: a.machine, op: l!.op, input: h.input, ctx: { id: h.id, mayHaveApplied: h.mayHaveApplied } });',
    ),
  },
  {
    name: "mutant.release-drops-held",
    says: "an actor whose last use was released drops its lanes when its grace ends, reporting its Held head Released with no cancel",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["DISP-01"],
    edits: [
      {
        file: "step.ts",
        find: 'if (m.local && how !== "remount")',
        replace: 'if (m.local ? how !== "remount" : how === "end")',
      },
    ],
  },
  {
    name: "mutant.boot-resends-held",
    says: "a boot re-sends a Held head revived from its own parked ending, with no retry",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed"],
    edits: [
      {
        file: "lane.ts",
        find: "const argsOf = (l: Lane): CellArgs => ({",
        replace: "export const argsOf = (l: Lane): CellArgs => ({",
      },
      {
        file: "lane.ts",
        find: "const ACTIONS: Readonly<",
        replace: "export const ACTIONS: Readonly<",
      },
      {
        file: "durable.ts",
        find: 'import { afterAck, cell, ofIdentity, olderOf, sameFields, sameVersion, stampFields } from "./lane.ts";',
        replace:
          'import { ACTIONS, argsOf, afterAck, cell, ofIdentity, olderOf, sameFields, sameVersion, stampFields } from "./lane.ts";',
      },
      {
        file: "durable.ts",
        find: "        restoredHook(tx, l, h, parked.find((p) => p.attempt === h.id)!.ending);",
        replace:
          "        restoredHook(tx, l, h, parked.find((p) => p.attempt === h.id)!.ending);\n        ACTIONS.invoke(tx, tx.w.lanes[base.id]!, argsOf(tx.w.lanes[base.id]!));",
      },
    ],
  },
  {
    name: "lie.release-on-guarded-read",
    says: "a turn of IntentRead releases a Held pay head though the alternative it took has no cancel",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["PAY-15/retry-budget"],
    edits: [
      {
        file: "lane.ts",
        find: "const release = (tx: Tx, l: Lane) => {",
        replace: "export const release = (tx: Tx, l: Lane) => {",
      },
      {
        file: "turn.ts",
        find: "import { admitRow, cancelAll,",
        replace: "import { release, admitRow, cancelAll,",
      },
      {
        file: "turn.ts",
        find: "  tx.touchedActors.add(w.a.key);",
        replace:
          '  tx.touchedActors.add(w.a.key);\n  if (ev.tag === "IntentRead") for (const l of Object.values(tx.w.lanes)) if (l.op === "pay" && l.head?.phase.t === "held") release(tx, l);',
      },
    ],
  },
  {
    name: "lie.release-other-lane",
    says: "a turn of IntentRead releases every Held pay lane, other actors' included, not only its own",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["PAY-21"],
    edits: [
      {
        file: "lane.ts",
        find: "const release = (tx: Tx, l: Lane) => {",
        replace: "export const release = (tx: Tx, l: Lane) => {",
      },
      {
        file: "turn.ts",
        find: "import { admitRow, cancelAll,",
        replace: "import { release, admitRow, cancelAll,",
      },
      {
        file: "turn.ts",
        find: "  tx.touchedActors.add(w.a.key);",
        replace:
          '  tx.touchedActors.add(w.a.key);\n  if (ev.tag === "IntentRead") for (const l of Object.values(tx.w.lanes)) if (l.op === "pay" && l.actor !== w.a.key && l.head?.phase.t === "held") release(tx, l);',
      },
    ],
  },
  {
    name: "lie.void-retry-releases",
    says: "a VoidUnsure turn releases the Held void before its members run, so the retry alternative releases too",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["PAY-22"],
    edits: [
      {
        file: "lane.ts",
        find: "const release = (tx: Tx, l: Lane) => {",
        replace: "export const release = (tx: Tx, l: Lane) => {",
      },
      {
        file: "turn.ts",
        find: "import { admitRow, cancelAll,",
        replace: "import { release, admitRow, cancelAll,",
      },
      {
        file: "turn.ts",
        find: "  applyMembers(w, reads);",
        replace:
          '  if (ev.tag === "VoidUnsure") for (const l of Object.values(tx.w.lanes)) if (l.op === "void" && l.actor === w.a.key && l.head?.phase.t === "held") release(tx, l);\n  applyMembers(w, reads);',
      },
    ],
  },
  {
    name: "lane.reject-queues",
    says: "a commit on a busy reject lane queues behind the head instead of declining Rejected",
    expects: "WriteLanes I8",
    runtime: "prototype",
    cases: ["PAY-02"],
    edits: lane(
      '  busy(tx, l, a) {\n    const policy = tx.machines[a.machine]!.ops[a.op]!.concurrency;\n    if (policy === "reject") return decline(tx, a, "Rejected");',
      '  busy(tx, l, a) {\n    const policy = tx.machines[a.machine]!.ops[a.op]!.concurrency;\n    if (policy === "reject") return void queueBehind(tx, l!, a, "serialize");',
    ),
  },
  {
    name: "mutant.boot-replays-never-sent",
    says: "a boot sends a head restored from disk that was never invoked",
    expects: "WriteLanes I1",
    runtime: "prototype",
    cases: ["PAY-09/ack-stored-confirmation-lost"],
    edits: [
      {
        file: "lane.ts",
        find: "const argsOf = (l: Lane): CellArgs => ({",
        replace: "export const argsOf = (l: Lane): CellArgs => ({",
      },
      {
        file: "lane.ts",
        find: "const ACTIONS: Readonly<",
        replace: "export const ACTIONS: Readonly<",
      },
      {
        file: "durable.ts",
        find: 'import { afterAck, cell, ofIdentity, olderOf, sameFields, sameVersion, stampFields } from "./lane.ts";',
        replace:
          'import { ACTIONS, argsOf, afterAck, cell, ofIdentity, olderOf, sameFields, sameVersion, stampFields } from "./lane.ts";',
      },
      {
        file: "durable.ts",
        find: "      noteEnding(tx, { op: l.op, attempt: h.id }, ending);\n      const phase: Phase = h.held",
        replace:
          "      if (!h.held) ACTIONS.invoke(tx, { ...base, head: h } as never, argsOf({ ...base, head: h } as never));\n      noteEnding(tx, { op: l.op, attempt: h.id }, ending);\n      const phase: Phase = h.held",
      },
    ],
  },
  {
    name: "mutant.members-reversed",
    says: "a turn applies its lane members in reverse action order",
    expects: "WriteLanes I10",
    runtime: "prototype",
    cases: ["PAY-03"],
    edits: [
      {
        file: "turn.ts",
        find: "  const tx = w.tx;\n  for (const r of reads) {",
        replace: "  const tx = w.tx;\n  for (const r of [...reads].reverse()) {",
      },
    ],
  },
  {
    name: "lie.release-member-claimed",
    says: "a turn of IntentRead reports a release member of pay and releases the Held pay head, though Pay leaves nothing releasing",
    expects: "WriteLanes I12",
    runtime: "prototype",
    cases: ["PAY-15/retry-budget"],
    edits: [
      {
        file: "lane.ts",
        find: "const release = (tx: Tx, l: Lane) => {",
        replace: "export const release = (tx: Tx, l: Lane) => {",
      },
      {
        file: "turn.ts",
        find: "import { admitRow, cancelAll,",
        replace: "import { release, admitRow, cancelAll,",
      },
      {
        file: "turn.ts",
        find: "  const reads = readMembers(w);",
        replace:
          '  const claimed = ev.tag === "IntentRead" ? Object.values(tx.w.lanes).filter((l) => l.op === "pay" && l.actor === w.a.key && l.head?.phase.t === "held") : [];\n  for (const l of claimed) w.releases.push({ op: l.op, subject: l.subject ?? [] });\n  const reads = readMembers(w);',
      },
      {
        file: "turn.ts",
        find: "  applyMembers(w, reads);",
        replace: "  for (const l of claimed) release(tx, l);\n  applyMembers(w, reads);",
      },
    ],
  },
];
