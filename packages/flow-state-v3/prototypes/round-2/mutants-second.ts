// Second author's mutant set (D33), written from the rule text and the runtime code, without reading the scenarios, the
// search or the builder's list. Proposed and throwaway. Not run by its author.
import type { Mutant } from "../conformance/mutate.ts";

export const MUTANTS: readonly Mutant[] = [
  // ── Lane table cells ────────────────────────────────────────────────────────────────────────
  // Table, commit in Held: "the hold refuses or queues; nothing is sent". Here a commit mints over the hold.
  {
    id: "commit-over-hold-mints",
    kills: ["cell:lane.commit.Held"],
    edits: [["lane.ts", `Settled: "busy", Held: "busy",`, `Settled: "busy", Held: "mint",`]],
  },
  // Table, commit in InFlight (OD20 F4): "an addressable Attempt never sent and not yet invoked is replaced too". Here it queues behind.
  {
    id: "latest-never-sent-head-not-replaced",
    kills: ["cell:lane.commit.InFlight"],
    edits: [["lane.ts", `Waiting: "commitOverWaiting",`, `Waiting: "busy",`]],
  },
  // Rule 29: a replaced waiting commit has "prediction removed, queue entry removed". Here W is overwritten and the store is not told.
  {
    id: "latest-replaced-w-not-withdrawn",
    kills: ["rule:29"],
    edits: [["lane.ts", `for (const x of l.w) supersede(tx, a.op, x);`, ``]],
  },
  // Table: W is "a FIFO of at most 64 under serialize". Here a new commit goes to the front.
  {
    id: "serialize-w-is-lifo",
    kills: ["cell:lane.commit.InFlight"],
    edits: [
      [
        "lane.ts",
        `setLane(tx, { ...tx.w.lanes[l.id]!, w: [...l.w, made.attempt] });`,
        `setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt, ...l.w] });`,
      ],
    ],
  },
  // Rule 16: a commit on a busy `reject` lane "ends NotSent { why: Rejected }". Here it is evidence, so no handler runs.
  {
    id: "reject-is-evidence-not-ending",
    kills: ["rule:16"],
    edits: [
      [
        "lane.ts",
        `if (policy === "reject") return decline(tx, a, "Rejected");`,
        `if (policy === "reject") return note(tx, "Rejected", { op: a.op });`,
      ],
    ],
  },
  // Flags table: retryCount is "counted at the invoked cell, not at retry, so a re-send that never left uses no budget".
  {
    id: "retry-count-at-retry-not-invoked",
    kills: ["cell:lane.invoked.InFlight"],
    edits: [
      [
        "lane.ts",
        `const h: Attempt = { ...l!.head, owner: a.owner ?? l!.head.owner };`,
        `const h: Attempt = { ...l!.head, retryCount: l!.head.retryCount + 1, owner: a.owner ?? l!.head.owner };`,
      ],
      [
        "lane.ts",
        `retryCount: h.sends > 0 ? h.retryCount + 1 : h.retryCount,`,
        `retryCount: h.retryCount,`,
      ],
    ],
  },
  // Rule 24: cancel in Held "promotes the next queued commit" and "never drops a queued commit". Here the lane goes, W with it.
  {
    id: "cancel-held-drops-waiting",
    kills: ["rule:24"],
    edits: [["lane.ts", `promote(tx, tx.w.lanes[l!.id]!);`, `deleteLane(tx, l!.id);`]],
  },
  // Table, cancel of a waiting re-send: "returns to Held and is released". Here it returns to Held and stops there.
  {
    id: "cancel-resend-not-released",
    kills: ["cell:lane.cancel.InFlight"],
    edits: [
      [
        "lane.ts",
        `ACTIONS.release(tx, l, {} as CellArgs);`,
        `setLane(tx, { ...l!, head: { ...l!.head, phase: { t: "held" } } });`,
      ],
    ],
  },
  // Table, storage refused for a re-send: "returns to Held", unknown delivered again. Here it ends NotSent, though it was sent before.
  {
    id: "refused-resend-ends-not-sent",
    kills: ["cell:lane.storageRefused.InFlight"],
    edits: [["lane.ts", `Resend: "refuseResend"`, `Resend: "refuseFirst"`]],
  },
  // Table, Runtime disposal: "Waiting re-send: → Held". Here it ends NotSent { Disposed }, removing what may have been applied.
  {
    id: "dispose-resend-as-never-sent",
    kills: ["cell:lane.runtimeDisposal.InFlight"],
    edits: [["lane.ts", `Resend: "disposeResend",`, `Resend: "disposeNeverSent",`]],
  },

  // ── Rule 18 ─────────────────────────────────────────────────────────────────────────────────
  // Rule 18: a definite failure "only if no earlier send of the same Attempt ended unknown". Off by one: the first retry's failure is definite.
  {
    id: "rule18-first-retry-failure-definite",
    kills: ["rule:18"],
    edits: [
      [
        "lane.ts",
        `ending.ch === "failure" && h.mayHaveApplied`,
        `ending.ch === "failure" && h.retryCount > 1`,
      ],
    ],
  },

  // ── Rules 14 and 15 ─────────────────────────────────────────────────────────────────────────
  // Rule 14: "if that activation is alive". Here any activation of the same state counts, so re-entry makes a late ending current.
  {
    id: "owner-tested-by-node-not-activation",
    kills: ["rule:14"],
    edits: [
      [
        "turn.ts",
        `if (a.activations[item.owner.node] === item.owner.activation)`,
        `if (a.activations[item.owner.node] !== undefined)`,
      ],
    ],
  },
  // Rule 14: late "routes from the nearest strict ancestor of the owner". Here it routes from the active leaf.
  {
    id: "late-routes-from-leaf",
    kills: ["rule:14"],
    edits: [
      [
        "turn.ts",
        `return { start: m.nodes[item.owner.node]?.parent ?? m.root, late: true };`,
        `return { start: a.leaf, late: true };`,
      ],
    ],
  },
  // Rule 14: "Every unknown { Restored } is current from the active leaf". Here it takes the owner test and can read late.
  {
    id: "restored-takes-owner-test",
    kills: ["rule:14"],
    edits: [["turn.ts", `if (item.restored) return { start: a.leaf, late: false };`, ``]],
  },
  // Rule 15: an alternative that would exit a state owning another pending call "is denied (LateMayNotLeave)". Here it moves.
  {
    id: "late-may-leave",
    kills: ["rule:15"],
    edits: [["turn.ts", `if (late && leavesWork(tx, a, alt, item)) {`, `if (false) {`]],
  },

  // ── Rule 22, and turn rollback ──────────────────────────────────────────────────────────────
  // Rule 22: a commit's select reads after, "the memory this turn publishes". Here it reads before: the stale-etag bug.
  {
    id: "commit-select-reads-before",
    kills: ["rule:22"],
    edits: [
      [
        "turn.ts",
        `const input = run(mem.input, after);`,
        `const input = run(mem.input, { ...after, memory: a.memory });`,
      ],
    ],
  },
  // Rule 22: guards "see the pre-turn lanes with the turn's own ending admitted". Here the ending's cell applies after the turn.
  {
    id: "ending-admitted-after-its-turn",
    kills: ["rule:22"],
    edits: [
      [
        "turn.ts",
        `if (item.k === "ending") admit(tx, item); // A0: kept whatever the turn does`,
        ``,
      ],
      [
        "turn.ts",
        `runTurn(tx, a, ev, start, late, item);`,
        `runTurn(tx, a, ev, start, late, item); if (item.k === "ending") admit(tx, item);`,
      ],
    ],
  },
  // Table (invocation, R7): an ending in an InvalidTurn "keeps its lane effects". Here the rollback undoes the ending's cell too.
  {
    id: "invalid-turn-rolls-back-ending-cell",
    kills: ["rule:21"],
    edits: [
      [
        "turn.ts",
        `if (item.k === "ending") admit(tx, item); // A0: kept whatever the turn does`,
        `const beforeAdmit = tx.w; if (item.k === "ending") admit(tx, item);`,
      ],
      ["turn.ts", `tx.w = kept.w;`, `tx.w = beforeAdmit;`],
    ],
  },

  // ── Promotion and lane persistence ──────────────────────────────────────────────────────────
  // Rules 38, 46: the Attempt's one acknowledgement comes "before its first invocation". Here a promoted commit skips it.
  {
    id: "promoted-skips-acknowledgement",
    kills: ["rule:46"],
    edits: [
      [
        "lane.ts",
        `setLane(tx, { ...lane, head: { ...next, phase: requestDurable(tx, lane, next, "ack") }, w });`,
        `setLane(tx, { ...lane, head: { ...next, phase: { t: "ready" } }, w });`,
      ],
    ],
  },
  // Rule 38: "its predicted keys are written in one capture". Here they are not, so a restore has no mark and no repair.
  {
    id: "capture-omits-predicted-keys",
    kills: ["rule:38"],
    edits: [
      [
        "entities.ts",
        `capture: (s, attempt) => s.entries[attempt]?.refs,`,
        `capture: () => undefined,`,
      ],
    ],
  },

  // ── Entities: D3, D39, D40, rules 30, 32, 35 ────────────────────────────────────────────────
  // D3: an entry leaves "only when resolved or released", and blocks in every record. Here only its first record's queue counts.
  {
    id: "queue-blocks-on-first-record-only",
    kills: ["D3"],
    edits: [
      [
        "entities.ts",
        `if (at > 0) return { on: "queue", behind: q.slice(0, at) };`,
        `if (at > 0 && ref === e.refs[0]) return { on: "queue", behind: q.slice(0, at) };`,
      ],
    ],
  },
  // D40: "If still Held, the entry stays". Here a repair's end removes a live hold's entry, so the next write passes it.
  {
    id: "repair-end-removes-live-hold",
    kills: ["D40"],
    edits: [
      [
        "entities.ts",
        `if (e.released && !e.refs.some((x) => out.repairs[x])) out = removeEntry(out, id);`,
        `if (!e.refs.some((x) => out.repairs[x])) out = removeEntry(out, id);`,
      ],
    ],
  },
  // D39: "A re-send waits for its own record's forced repair to settle". Here it goes at once.
  {
    id: "resend-does-not-wait-for-repair",
    kills: ["D39"],
    edits: [
      [
        "entities.ts",
        `for (const ref of e.refs) if (s.repairs[ref]) return { on: "repair", ref };`,
        ``,
      ],
    ],
  },
  // Rule 30, E8: "unknown, including StillUnknown, keeps live predictions" and marks the record. Here StillUnknown takes the failure row.
  {
    id: "still-unknown-takes-failure-row",
    kills: ["cell:store.unknown"],
    edits: [
      [
        "entities.ts",
        `return holdFor(s, e, ending, cx);`,
        `if (ending.reason === "StillUnknown") return removeEntry(s, attempt); return holdFor(s, e, ending, cx);`,
      ],
    ],
  },
  // Rule 32: "a mark whose Attempt is still unresolved stays". Here a later write's success clears every older mark.
  {
    id: "later-success-clears-unresolved-mark",
    kills: ["rule:32"],
    edits: [
      [
        "entities.ts",
        `marks: r.marks.filter((m) => !(m.attempt === e.attempt || (m.given && m.mint < e.mint))),`,
        `marks: r.marks.filter((m) => !(m.attempt === e.attempt || m.mint < e.mint)),`,
      ],
    ],
  },
  // Rule 35: a commit past "any record queue" is declined. Here it is declined only when every record's queue is full.
  {
    id: "overflow-only-if-every-queue-full",
    kills: ["rule:35"],
    edits: [
      [
        "entities.ts",
        `if (refs.some((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };`,
        `if (refs.length > 0 && refs.every((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };`,
      ],
    ],
  },

  // ── Restore and storage ─────────────────────────────────────────────────────────────────────
  // Table, restore in InFlight: "an Attempt acknowledged once restores as unknown { Restored }". Here it restores NotSent: "not charged".
  {
    id: "acknowledged-restores-not-sent",
    kills: ["cell:lane.restore.InFlight"],
    edits: [["durable.ts", `h.held || h.acked`, `h.held`]],
  },
  // Table, restore (G3): "if a saved pending outcome exists for this Attempt, that outcome is delivered instead". Here it is ignored.
  {
    id: "restore-ignores-parked-ending",
    kills: ["cell:lane.restore.InFlight"],
    edits: [["durable.ts", `parkedHead?.ending ??`, ``]],
  },
  // D30: "silence is pending; only a real refusal ends the Attempt". Here the 10 s bound refuses, which was D14.
  {
    id: "silent-storage-refuses",
    kills: ["D30"],
    edits: [
      [
        "durable.ts",
        `if (l) note(tx, "StorageSilent", { op: l.op, attempt });`,
        `if (l) cell(tx, "storageRefused", l, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });`,
      ],
    ],
  },

  // ── Driver ──────────────────────────────────────────────────────────────────────────────────
  // D2: "send runs synchronously when idle". Here a send waits for the host's next tick.
  {
    id: "send-deferred-when-idle",
    kills: ["D2"],
    edits: [
      [
        "driver.ts",
        `inbox.push(i); pump();`,
        `inbox.push(i); if (i.k === "send") host.later(pump); else pump();`,
      ],
    ],
  },
  // D6: "at least one sent per invoke". Here a commit closure that throws synchronously becomes an issue, and the lane waits forever.
  {
    id: "sync-commit-throw-sends-nothing",
    kills: ["D6"],
    edits: [
      [
        "driver.ts",
        `input({ k: "sent", attempt: c.attempt, send: c.send, exit: { t: "defect", cause } });`,
        `guarded(() => cfg.onIssue([{ code: "CommandFailed", origin: "invoke", input: String(cause) }]));`,
      ],
    ],
  },
  // D27: "a hook throw disables that module with an issue and the core's work stands". Here it escapes and is fatal.
  {
    id: "hook-throw-is-fatal",
    kills: ["D27"],
    edits: [["hooks.ts", `disable(tx, m, String(name), e, k);`, `throw e;`]],
  },
  // D35: past the chain bound a send is dropped, and "an outside input resets the count". Here the count is never reset.
  {
    id: "notify-chain-never-resets",
    kills: ["D35"],
    edits: [["driver.ts", `if (!running) { chain = 0;`, `if (!running) {`]],
  },

  // ── Reads, fences, follow-ups ───────────────────────────────────────────────────────────────
  // D23: "a read's generation drops superseded answers". Here an old answer is taken, and clears the newer lookup.
  {
    id: "superseded-read-answer-accepted",
    kills: ["D23"],
    edits: [
      ["reads.ts", `if (!r || r.gen !== send) return undefined;`, `if (!r) return undefined;`],
    ],
  },
  // D5: "generations on commands and inputs; core drops stale". Here a timed-out send's late exit settles the re-send now on the wire.
  {
    id: "stale-send-exit-accepted",
    kills: ["D5"],
    edits: [
      [
        "step.ts",
        `if (lane && p?.t === "wire" && p.gen === i.send) {`,
        `if (lane && p?.t === "wire") {`,
      ],
    ],
  },
  // D1: "follow-ups run next". Here a follow-up joins the tail, behind other mail.
  {
    id: "follow-up-joins-tail",
    kills: ["D1"],
    edits: [
      [
        "turn.ts",
        `tx.w = { ...tx.w, follow: [...mail, ...tx.w.follow] };`,
        `tx.w = { ...tx.w, mail: [...tx.w.mail, ...mail] };`,
      ],
    ],
  },
];
