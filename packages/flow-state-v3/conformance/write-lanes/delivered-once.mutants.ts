import type { Mutant } from "../dsl/oracle.ts";

const ADMIT = "  const a = getActor(tx.w.actors, item.actor);\n  const lane = tx.w.lanes[laneId];";

const RESTORED_MAIL = "mail(tx, l, h, ending, true, !h.held);";

const FAIL = 'item.ending.ch !== "success"';

const SAME_MAIL =
  '[...tx.w.mail].some((x: any) => x.actor === item.actor && !(x.k === "ending" && x.attempt === item.attempt))';

const OTHER_MAIL = "[...tx.w.mail].some((x: any) => x.actor !== item.actor)";

const RELEASED = 'note(tx, "Released", { op: item.op, attempt: item.attempt ?? "" });';

const EVIDENCE_ONLY =
  'return note(tx, "evidenceOnly", { op: item.op, attempt: item.attempt ?? "" });';

const DELIVERED_NOT_RUN =
  'note(tx, "delivered", { op: item.op, attempt: item.attempt ?? "", event: "x" }); return;';

const OTHER_ACTOR =
  'const a0 = getActor(tx.w.actors, item.actor);\n  const other = a0 && item.attempt && item.ending.ch === "failure" ? (tx.w.actors as any).flat().filter(Boolean).flatMap((b: any) => Object.values(b)).find((x: any) => x.machine === a0.machine && x.key !== a0.key) : undefined;\n  const a = other ?? a0;\n  const lane = tx.w.lanes[laneId];';

const REDELIVER =
  '    if (item.k === "ending" && !again) {\n      const { onLane: _o, ...rest } = item;\n      enqueue(tx, { ...rest, redelivered: true });\n    }';

const when = (condition: string, body: string) => `${ADMIT}\n  if (a && ${condition}) { ${body} }`;

/**
 * Wrong runtimes the delivered-once oracle must catch: each edits how the prototype admits,
 * parks, records or reports an ending.
 *
 * **Details**
 *
 * - `a2.deliv-fail-samemail`: an ending not taken while its actor has other mail is said
 *   delivered and runs nothing.
 * - `d154.moved-fail-released`: the same ending is said released and recorded as evidence.
 * - `lie.released`: an ending not taken while another actor has mail is released and recorded.
 * - `e8.wa-failure`: a failure ending runs in another live actor of the same machine.
 * - `mutant.superseded-claimed`: a failure ending is reported Superseded and recorded as evidence
 *   instead of delivered, under an operation no later commit replaces or interrupts.
 * - `mutant.delivered-during-disposal`: an ending that settles during the Runtime's disposal is
 *   delivered to its actor instead of parked.
 * - `mutant.replaced-delivered`: an Attempt interrupted under `cancel` is reported delivered.
 * - `mutant.success-then-failure`: a settled success is followed by a failure ending.
 * - `1b.r8-refused-ending-not-redelivered`: a refused ending is never delivered once more.
 * - `d6.disposed-ending-is-evidence`: an ending of a disposed persisted actor is recorded, not
 *   parked.
 * - `mutant.parked-delivered-as-other-tag`: a parked definite ending is delivered, at adoption,
 *   as an unknown (review F2; T6 M1). It proves F2's cell (also `ending-channels` I3), not I15's
 *   delivery count.
 * - `mutant.boot-skips-restored`: a boot restores a Held head without its `unknown { Restored }`
 *   (Restore I6, CQ11).
 * - `mutant.restore-skips-unsent`: a boot restores an acknowledged head that was never sent
 *   without its `unknown { Restored }` (Restore R3, I6: the store landed its acknowledgement; step
 *   5 review M1).
 * - `1b.r8-third-try`: a twice-refused ending is delivered a third time in the same life
 *   (WriteLanes I15: the second refusal is final; the fold reports the delivery to a kept ending
 *   as Actors I24 and its refusal as I15).
 * - `mutant.adoption-skips-parked`: an adopting incarnation drops its lane's parked endings
 *   instead of hearing them (T6 L11: a parked ending is owed to the incarnation that opens).
 * - `mutant.restored-twice`: a boot decides and mails a restored head's `unknown { Restored }` twice
 *   (S2 L5).
 * - `mutant.kept-retried-without-boot`: a kept ending's boot try, refused, is tried once more in
 *   the same boot (Actors R15, I24: one try per boot or adoption).
 * - `lie.boot-says-disposed` and `lie.boot-drops-held` edit the prototype's boot, where a Held
 *   head's decided `unknown { Restored }` is queued for its actor: each drops that mail, so the
 *   restore ending is decided and never delivered (WriteLanes I15; the lane itself survives, so
 *   not Actors I29).
 */
export const deliveredOnceMutants: ReadonlyArray<Mutant> = [
  {
    name: "lane.releasing-delivers",
    says: "an ending on a releasing lane is admitted as an ordinary ending, not evidence",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: [
      "LANE-12/release-ends-queue",
      "LANE-12/release-leaves-head",
      "LANE-12/release-uninterruptible-lost",
    ],
    edits: [
      {
        file: "turn.ts",
        find: "  const releasing = before?.releasing === true;",
        replace: "  const releasing = false;",
      },
    ],
  },
  {
    name: "a2.deliv-fail-samemail",
    says: "an ending is said delivered while its actor has mail, and no turn runs it",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-01"],
    edits: [
      { file: "turn.ts", find: ADMIT, replace: when(`${FAIL} && ${SAME_MAIL}`, DELIVERED_NOT_RUN) },
    ],
  },
  {
    name: "d154.moved-fail-released",
    says: "an ending is said released and recorded as evidence while its actor has mail",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-01"],
    edits: [
      {
        file: "turn.ts",
        find: ADMIT,
        replace: when(`${FAIL} && ${SAME_MAIL}`, `${RELEASED} ${EVIDENCE_ONLY}`),
      },
    ],
  },
  {
    name: "lie.released",
    says: "an ending is released and recorded as evidence while another actor has mail",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-02"],
    edits: [
      {
        file: "turn.ts",
        find: ADMIT,
        replace: when(`${FAIL} && ${OTHER_MAIL}`, `${RELEASED} ${EVIDENCE_ONLY}`),
      },
    ],
  },
  {
    name: "e8.wa-failure",
    says: "a failure ending runs in another live actor of the same machine",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-03"],
    edits: [{ file: "turn.ts", find: ADMIT, replace: OTHER_ACTOR }],
  },
  {
    name: "mutant.superseded-claimed",
    says: "a failure ending is reported Superseded and recorded as evidence instead of delivered",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-03"],
    edits: [
      {
        file: "turn.ts",
        find: ADMIT,
        replace: when(
          'item.ending.ch === "failure" && !!item.attempt',
          `note(tx, "Superseded", { op: item.op, attempt: item.attempt ?? "" }); ${EVIDENCE_ONLY}`,
        ),
      },
    ],
  },
  {
    name: "mutant.delivered-during-disposal",
    says: "an ending that settles during the Runtime's disposal is delivered instead of parked",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-16/settled-during-disposal-parked"],
    edits: [
      {
        file: "step.ts",
        find: 'tx.w = { ...tx.w, status: "disposing", mail: [], rota: [], follow: [] };',
        replace:
          'tx.w = { ...tx.w, status: "disposing", mail: tx.w.mail.filter(() => false), rota: [], follow: [] };',
      },
      {
        file: "step.ts",
        find: 'if (tx.w.status === "disposing" && wires(tx.w).length === 0 && input.k !== "disposeRuntime")',
        replace:
          'if (tx.w.status === "disposing" && wires(tx.w).length === 0 && tx.w.mail.length === 0 && input.k !== "disposeRuntime")',
      },
      {
        file: "driver.ts",
        find: '(world.mail.length > 0 && world.status === "live"));',
        replace: '(world.mail.length > 0 && world.status !== "disposed"));',
      },
      {
        file: "lane.ts",
        find: 'if (tx.w.status === "disposing") return parkAtDisposal(tx, next, final);',
        replace: 'if (tx.w.status === "disposing") return settleHead(tx, next, final);',
      },
    ],
  },
  {
    name: "mutant.replaced-delivered",
    says: "an Attempt interrupted by a later commit under cancel is reported delivered, not recorded",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["LANE-07"],
    edits: [
      {
        file: "step.ts",
        find: '    note(tx, "evidenceOnly", { op: was.op, attempt: i.attempt });',
        replace: '    note(tx, "delivered", { op: was.op, attempt: i.attempt, event: "Ok" });',
      },
    ],
  },
  {
    name: "mutant.success-then-failure",
    says: "a settled success is followed by a failure ending of the same Attempt",
    expects: "WriteLanes I16",
    runtime: "prototype",
    cases: ["PAY-01"],
    edits: [
      {
        file: "lane.ts",
        find: "  toMail(tx, lane, lane.head!, e);\n};",
        replace:
          '  toMail(tx, lane, lane.head!, e);\n  if (e.ch === "success") noteEnding(tx, { op: lane.op, attempt: lane.head!.id }, { ch: "failure", tag: "CardDeclined", value: {} });\n};',
      },
    ],
  },
  {
    name: "1b.r8-refused-ending-not-redelivered",
    says: "an ending whose turn is refused at admission is never delivered once more",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-04", "DLV-06"],
    edits: [
      {
        file: "turn.ts",
        find: 'if (item.k === "ending" && !again) {',
        replace: 'if (item.k === "ending" && !again && false) {',
      },
    ],
  },
  {
    name: "d6.disposed-ending-is-evidence",
    says: "an ending that lands after its persisted actor was disposed is recorded as evidence, not parked",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DISP-06"],
    edits: [
      {
        file: "turn.ts",
        find: "(own(tx.w.retired, item.actor) !== undefined || tx.machines[machine]?.persisted);",
        replace: "own(tx.w.retired, item.actor) !== undefined;",
      },
    ],
  },
  {
    name: "mutant.parked-delivered-as-other-tag",
    says: "a parked definite ending is delivered at adoption as an unknown",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DISP-06", "DISP-01", "DISP-05", "PAY-15/dispose-held"],
    edits: [
      {
        file: "turn.ts",
        find: "        ending: p.ending,\n        input: p.input,\n        subject: l.subject,",
        replace:
          '        ending: p.ending.ch === "unknown" ? p.ending : { ch: "unknown", reason: "Restored" },\n        input: p.input,\n        subject: l.subject,',
      },
    ],
  },
  {
    name: "mutant.boot-skips-restored",
    says: "a boot restores a Held head and never decides its unknown { Restored }",
    expects: "Restore I6",
    runtime: "prototype",
    cases: ["DLV-01", "DLV-02", "PAY-15/reload-holds-exactly-once"],
    edits: [
      {
        file: "durable.ts",
        find: "      noteEnding(tx, { op: l.op, attempt: h.id }, ending);\n      const phase: Phase",
        replace: "      const phase: Phase",
      },
      {
        file: "durable.ts",
        find: "        mail(tx, l, h, ending, true, !h.held);",
        replace: "",
      },
    ],
  },
  {
    name: "mutant.restore-skips-unsent",
    says: "a boot restores an acknowledged head that was never sent without its unknown { Restored }",
    expects: "Restore I6",
    runtime: "prototype",
    cases: ["PAY-09/ack-stored-confirmation-lost", "PAY-18"],
    edits: [
      {
        file: "durable.ts",
        find: "      noteEnding(tx, { op: l.op, attempt: h.id }, ending);\n      const phase: Phase",
        replace:
          "      if (h.held) noteEnding(tx, { op: l.op, attempt: h.id }, ending);\n      const phase: Phase",
      },
      {
        file: "durable.ts",
        find: "        mail(tx, l, h, ending, true, !h.held);",
        replace: "        if (h.held) mail(tx, l, h, ending, true, !h.held);",
      },
    ],
  },
  {
    name: "1b.r8-third-try",
    says: "a twice-refused ending is delivered a third time before it is kept",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DLV-04", "DLV-05"],
    edits: [
      {
        file: "turn.ts",
        find: REDELIVER,
        replace: `${REDELIVER}\n    if (item.k === "ending" && again && !item.kept) enqueue(tx, { ...item, kept: true });`,
      },
    ],
  },
  {
    name: "mutant.kept-retried-without-boot",
    says: "a kept ending's refused boot try is tried once more in the same boot",
    expects: "Actors I24",
    runtime: "prototype",
    cases: ["DLV-04", "DLV-05"],
    edits: [
      {
        file: "turn.ts",
        find: REDELIVER,
        replace: `${REDELIVER}\n    if (item.k === "ending" && again && item.kept) { const { kept: _k, ...r } = item; enqueue(tx, r); }`,
      },
    ],
  },
  {
    name: "mutant.adoption-skips-parked",
    says: "an adopting incarnation drops its lane's parked endings unheard",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["DISP-06"],
    edits: [
      {
        file: "turn.ts",
        find: '    for (const p of l.parked) {\n      note(tx, "unparked"',
        replace: '    for (const p of thawing ? l.parked : []) {\n      note(tx, "unparked"',
      },
    ],
  },
  {
    name: "mutant.restored-twice",
    says: "a boot decides and mails a restored head's unknown Restored twice",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-09/ack-stored-confirmation-lost", "DLV-07"],
    edits: [
      {
        file: "durable.ts",
        find: "        mail(tx, l, h, ending, true, !h.held);",
        replace:
          "        mail(tx, l, h, ending, true, !h.held);\n        noteEnding(tx, { op: l.op, attempt: h.id }, ending);\n        mail(tx, l, h, ending, true, !h.held);",
      },
    ],
  },
  {
    name: "lie.boot-says-disposed",
    says: "a boot drops a Held head's restored ending and notes a disposal start instead",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-15/dispose-held", "PAY-15/dispose-held-moved"],
    edits: [
      {
        file: "durable.ts",
        find: RESTORED_MAIL,
        replace: `if (h.held) note(tx, "DisposeStart", {}); else ${RESTORED_MAIL}`,
      },
    ],
  },
  {
    name: "lie.boot-drops-held",
    says: "a boot drops a Held head's restored ending and says nothing",
    expects: "WriteLanes I15",
    runtime: "prototype",
    cases: ["PAY-15/dispose-held", "PAY-15/dispose-held-moved"],
    edits: [{ file: "durable.ts", find: RESTORED_MAIL, replace: `if (!h.held) ${RESTORED_MAIL}` }],
  },
];
