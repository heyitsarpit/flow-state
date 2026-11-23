// The builder's mutants: each breaks one id it names (D33). A citation counts as tested only if a mutant of it fails a test
// citing it. The independent set is mutants-second.ts; that kill rate is the number to read.
import type { Mutant } from "../conformance/mutate.ts";

export const MUTANTS: readonly Mutant[] = [
  {
    id: "drop-fence",
    kills: ["D5", "S4"],
    edits: [
      [
        "step.ts",
        'if (lane && p?.t === "wire" && p.gen === i.send) {',
        'if (lane && p?.t === "wire") {',
      ],
    ],
  },
  {
    id: "drop-timer-fence",
    kills: ["D5"],
    edits: [["step.ts", "if (!t || t.gen !== i.gen)", "if (!t)"]],
  },
  {
    id: "retry-mints-new-id",
    kills: ["rule:19", "S6"],
    edits: [
      [
        "lane.ts",
        "const h: Attempt = { ...l!.head, owner: a.owner ?? l!.head.owner };",
        "const h: Attempt = { ...l!.head, id: tx.env.id(), owner: a.owner ?? l!.head.owner };",
      ],
    ],
  },
  {
    id: "invoke-before-ack",
    kills: ["S7", "cell:lane.invoked.InFlight"],
    edits: [
      [
        "durable.ts",
        'if (!tx.machines[lane.machine]!.persisted) return { t: "ready" };',
        'if (on === "ack" || !tx.machines[lane.machine]!.persisted) return { t: "ready" };',
      ],
    ],
  },
  {
    id: "restore-notsent-when-acked",
    kills: ["cell:lane.restore.InFlight", "rule:46"],
    edits: [["durable.ts", "(h.held || h.acked", "(h.held"]],
  },
  {
    id: "restore-forgets-mayHaveApplied",
    kills: ["rule:18"],
    edits: [
      [
        "durable.ts",
        'mayHaveApplied: h.mayHaveApplied || ending.ch === "unknown",',
        "mayHaveApplied: false,",
      ],
    ],
  },
  {
    id: "rule18-off",
    kills: ["rule:18"],
    edits: [["lane.ts", 'ending.ch === "failure" && h.mayHaveApplied', "false"]],
  },
  {
    id: "timeout-no-interrupt",
    kills: ["D8"],
    edits: [
      ["step.ts", 'tx.commands.push({ k: "interrupt", attempt: t.attempt, send: p.gen });', ""],
    ],
  },
  {
    id: "timeout-never-armed",
    kills: ["D8", "rule:25"],
    edits: [["lane.ts", "if (op.timeoutMs !== undefined)", "if (false)"]],
  },
  {
    id: "timeout-first-send-only",
    kills: ["D8"],
    edits: [
      [
        "lane.ts",
        "if (op.timeoutMs !== undefined)",
        "if (op.timeoutMs !== undefined && h.sends === 0)",
      ],
    ],
  },
  {
    id: "timers-not-restored",
    kills: ["S10"],
    edits: [["durable.ts", "armTimer(tx, spec as never);", ""]],
  },
  {
    id: "late-treated-as-current",
    kills: ["rule:14"],
    edits: [
      ["turn.ts", "if (a.activations[item.owner.node] === item.owner.activation)", "if (true)"],
    ],
  },
  {
    id: "rule15-off",
    kills: ["rule:15"],
    edits: [["turn.ts", "if (late && leavesWork(tx, a, alt, item)) {", "if (false) {"]],
  },
  {
    id: "ending-cell-lost-on-refusal",
    kills: ["F3", "rule:12"],
    edits: [
      [
        "turn.ts",
        'if (item.k === "ending") admit(tx, item); // A0: kept whatever the turn does',
        'const w0 = tx.w; if (item.k === "ending") admit(tx, item);',
      ],
      ["turn.ts", "tx.w = kept.w;", "tx.w = w0;"],
    ],
  },
  {
    id: "invalid-turn-keeps-members",
    kills: ["F6", "rule:12"],
    edits: [
      ["turn.ts", "tx.commands.length = kept.commands;", ""],
      ["turn.ts", "tx.w = kept.w;", ""],
    ],
  },
  {
    id: "storage-silence-refuses",
    kills: ["D30"],
    edits: [
      [
        "durable.ts",
        'if (l) note(tx, "StorageSilent", { op: l.op, attempt });',
        'if (l) cell(tx, "storageRefused", l, { actor: l.actor, machine: l.machine, op: l.op, key: l.key });',
      ],
    ],
  },
  {
    id: "dispose-unbounded",
    kills: ["D6", "L5"],
    edits: [["step.ts", "dueAt: tx.env.now + tx.bounds.disposeMs", "dueAt: tx.env.now + 1e12"]],
  },
  {
    id: "resend-skips-capture",
    kills: ["cell:lane.retry.Held"],
    edits: [["lane.ts", 'phase: requestDurable(tx, l!, h, "capture")', 'phase: { t: "ready" }']],
  },
  {
    id: "id-not-from-env",
    kills: ["S11"],
    edits: [["lane.ts", "id: tx.env.id(),", "id: `r${Math.random()}`,"]],
  },
  {
    id: "observer-loses-interrupts",
    kills: ["D6", "S4"],
    edits: [
      [
        "driver.ts",
        "fibers.delete(key);",
        "fibers.delete(key); if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;",
      ],
    ],
  },
  {
    id: "cancelled-reads-interrupted",
    kills: ["rule:24", "cell:lane.cancel.InFlight"],
    edits: [["step.ts", 'cancelled ? "Cancelled" : "Interrupted"', '"Interrupted"']],
  },
  {
    id: "cancelled-sticks",
    kills: ["rule:24"],
    edits: [
      [
        "lane.ts",
        'phase: { t: "wire", gen, cancelled: false },',
        'phase: { t: "wire", gen, cancelled: h.sends > 0 },',
      ],
    ],
  },
  {
    id: "release-keeps-lane",
    kills: ["cell:lane.cancel.Held"],
    edits: [
      [
        "lane.ts",
        'hook(tx, "released", (m, s, cx) => m.released!(s, { attempt: h.id }, cx)); promote(tx, tx.w.lanes[l!.id]!);',
        'hook(tx, "released", (m, s, cx) => m.released!(s, { attempt: h.id }, cx));',
      ],
    ],
  },
  {
    id: "unknown-resolves-lane",
    kills: ["cell:lane.unknown.InFlight", "rule:21"],
    edits: [["lane.ts", 'unknown: { Settled: "hold" },', 'unknown: { Settled: "resolve" },']],
  },
  {
    id: "interrupt-resolves-lane",
    kills: ["cell:lane.interrupt.InFlight"],
    edits: [["lane.ts", 'interrupt: { Settled: "hold" },', 'interrupt: { Settled: "resolve" },']],
  },
  {
    id: "double-commit-mints",
    kills: ["rule:16", "cell:lane.commit.InFlight"],
    edits: [
      [
        "lane.ts",
        'if (policy === "reject") return decline(tx, a, "Rejected"); queueBehind(tx, l!, a, policy);',
        'if (policy === "reject") return ACTIONS.mint(tx, l, a); queueBehind(tx, l!, a, policy);',
      ],
    ],
  },
  {
    id: "held-commit-not-declined",
    kills: ["cell:lane.commit.Held"],
    edits: [["lane.ts", 'Settled: "busy", Held: "busy",', 'Settled: "busy", Held: "mint",']],
  },
  {
    id: "rejected-not-delivered",
    kills: ["rule:16"],
    edits: [
      [
        "lane.ts",
        'enqueue(tx, { k: "ending", actor: a.actor, op: a.op, key: a.key, owner: a.owner!, ending: e });',
        "",
      ],
    ],
  },
  {
    id: "idle-always-passes",
    kills: ["cell:lane.idle.Idle"],
    edits: [
      ["lane.ts", 'idle: { Idle: "pass", Waiting: "deny"', 'idle: { Idle: "deny", Waiting: "deny"'],
    ],
  },
  {
    id: "retry-budget-off",
    kills: ["cell:lane.retryable.Held"],
    edits: [
      [
        "lane.ts",
        'v === "budget" && lane!.head.retryCount < (times ?? Infinity)',
        'v === "budget"',
      ],
    ],
  },
  {
    id: "retry-count-at-retry",
    kills: ["cell:lane.invoked.InFlight"],
    edits: [
      [
        "lane.ts",
        "retryCount: h.sends > 0 ? h.retryCount + 1 : h.retryCount,",
        "retryCount: h.retryCount + 1,",
      ],
    ],
  },
  {
    id: "dead-timer-fires",
    kills: ["sec:2.5"],
    edits: [
      [
        "turn.ts",
        'if (item.k === "fire" && !Object.values(a.activations).includes(item.activation))',
        "if (false)",
      ],
      ["turn.ts", "disarmTimer(tx, timerKeyOf(a.key, a.activations[a.leaf]!, s.id));", ""],
    ],
  },
  {
    id: "after-memory-reads-before",
    kills: ["rule:22"],
    edits: [["turn.ts", "const after = { memory, event: ev.payload };", "const after = before;"]],
  },
  {
    id: "commit-reads-before",
    kills: ["rule:22"],
    edits: [
      [
        "turn.ts",
        "const input = run(mem.input, after);",
        "const input = run(mem.input, { memory: a.memory, event: after.event });",
      ],
    ],
  },
  {
    id: "read-no-fence",
    kills: ["D23", "D5"],
    edits: [
      ["reads.ts", "if (!r || r.gen !== send) return undefined;", "if (!r) return undefined;"],
    ],
  },
  {
    id: "read-no-supersede-interrupt",
    kills: ["D23"],
    edits: [
      [
        "reads.ts",
        'tx.commands.push({ k: "interrupt", attempt: key, send: old.gen }); } const gen',
        "} const gen",
      ],
    ],
  },
  {
    id: "read-defect-no-issue",
    kills: ["sec:2.7.1"],
    edits: [
      [
        "step.ts",
        'if (i.exit.t === "defect") issue(tx, { code: "Defect", origin: `${r.actor} ${r.op}` });',
        "",
      ],
    ],
  },
  {
    id: "mail-lifo",
    kills: ["D1"],
    edits: [
      [
        "world.ts",
        "tx.w = { ...tx.w, mail: [...tx.w.mail, m] };",
        "tx.w = { ...tx.w, mail: [m, ...tx.w.mail] };",
      ],
    ],
  },
  {
    id: "follow-not-head",
    kills: ["D1"],
    edits: [
      [
        "turn.ts",
        "tx.w = { ...tx.w, follow: [...mail, ...tx.w.follow] };",
        "tx.w = { ...tx.w, mail: [...tx.w.mail, ...mail] };",
      ],
    ],
  },
  {
    id: "follow-unbounded",
    kills: ["D35"],
    edits: [["turn.ts", "if (tx.w.chain >= tx.bounds.followUps) {", "if (tx.w.chain >= 2000) {"]],
  },
  {
    id: "notify-chain-off",
    kills: ["D35"],
    edits: [["driver.ts", "if (chain >= bounds.notifyChain) {", "if (chain >= 3000) {"]],
  },
  {
    id: "send-reenters-during-notify",
    kills: ["D2"],
    edits: [
      [
        "driver.ts",
        "inbox.push(i); return; } if (!running) {",
        "inbox.push(i); notifying = false; pump(); notifying = true; return; } if (!running) {",
      ],
    ],
  },
  {
    id: "send-queues-when-idle",
    kills: ["D2"],
    edits: [["driver.ts", "inbox.push(i); pump(); }", "inbox.push(i); host.later(pump); }"]],
  },
  {
    id: "disarm-not-before-sinks",
    kills: ["D6"],
    edits: [["driver.ts", "try { exec(c); } catch (e) {", "try { exec(c); break; } catch (e) {"]],
  },
  {
    id: "start-throw-loses-completion",
    kills: ["D6"],
    edits: [
      [
        "driver.ts",
        'input({ k: "sent", attempt: c.attempt, send: c.send, exit: { t: "defect", cause } });',
        "void cause;",
      ],
    ],
  },
  {
    id: "hook-throw-aborts",
    kills: ["D27"],
    edits: [
      [
        "hooks.ts",
        "if (e instanceof Refused) throw e; disable(tx, m, String(name), e, k);",
        "throw e;",
      ],
    ],
  },
  {
    id: "core-throw-survives",
    kills: ["D27"],
    edits: [["driver.ts", "goFatal(e); break;", "continue;"]],
  },
  {
    id: "disabled-store-still-blocks",
    kills: ["D27"],
    edits: [["hooks.ts", "if (!m.blocks || !active(tx, m)) continue;", "if (!m.blocks) continue;"]],
  },
  {
    id: "settled-not-parked-on-disposal",
    kills: ["cell:lane.runtimeDisposal.InFlight"],
    edits: [["lane.ts", 'if (tx.w.status === "disposing") {', "if (false) {"]],
  },
  {
    id: "disposal-ignores-fibers-ending",
    kills: ["D6"],
    edits: [
      [
        "step.ts",
        'if (tx.w.status === "disposing" && wires(tx.w).length === 0 && input.k !== "disposeRuntime")',
        "if (false)",
      ],
    ],
  },
  {
    id: "mutates-mint-queue-order",
    kills: ["D3", "S13", "L2"],
    edits: [
      ["entities.ts", "queue: [...r.queue, w.attempt] }));", "queue: [w.attempt, ...r.queue] }));"],
    ],
  },
  {
    id: "queue-off",
    kills: ["D3", "S5", "rule:29"],
    edits: [["entities.ts", 'if (at > 0) return { on: "queue", behind: q.slice(0, at) };', ""]],
  },
  {
    id: "unknown-leaves-queue",
    kills: ["D3", "cell:store.unknown"],
    edits: [
      [
        "entities.ts",
        "return holdFor(s, e, ending, cx);",
        "return removeEntry(holdFor(s, e, ending, cx), attempt);",
      ],
    ],
  },
  {
    id: "retry-rejoins-tail",
    kills: ["D3", "rule:31"],
    edits: [
      [
        "entities.ts",
        "blocks(s, attempt): false | Claim { const e = s.entries[attempt];",
        'blocks(s, attempt): false | Claim { const e = s.entries[attempt]; if (e?.unknown) return { on: "queue", behind: recOf(s, e.refs[0]!).queue.filter((x) => x !== attempt) };',
      ],
    ],
  },
  {
    id: "resend-ignores-repair",
    kills: ["D39"],
    edits: [["entities.ts", 'if (s.repairs[ref]) return { on: "repair", ref }; // D39', ""]],
  },
  {
    id: "repair-unbounded",
    kills: ["D40"],
    edits: [
      [
        "entities.ts",
        "cx.arm(timerKey(ref), cx.now + cx.repairMs);",
        "cx.arm(timerKey(ref), cx.now + 1e12);",
      ],
    ],
  },
  {
    id: "repair-bound-clears-mark",
    kills: ["D40"],
    edits: [
      [
        "entities.ts",
        'cx.note("RepairOverdue", { ref }); // the mark stays',
        'cx.note("RepairOverdue", { ref }); s = withRec(s, ref, (r) => ({ ...r, marks: [] }));',
      ],
    ],
  },
  {
    id: "late-repair-accepted",
    kills: ["D40"],
    edits: [["entities.ts", "if (!cur || cur.gen !== a.gen) {", "if (false) {"]],
  },
  {
    id: "bound-evicts-live-hold",
    kills: ["D40", "D3"],
    edits: [
      [
        "entities.ts",
        "if (e.released && !e.refs.some((x) => out.repairs[x])) out = removeEntry(out, id);",
        "if (!e.refs.some((x) => out.repairs[x])) out = removeEntry(out, id);",
      ],
    ],
  },
  {
    id: "failure-forces-repair",
    kills: ["cell:store.failure", "rule:30"],
    edits: [
      [
        "entities.ts",
        'if (ending.ch === "failure") return removeEntry(s, attempt);',
        'if (ending.ch === "failure") return removeEntry(startRepair(s, e.refs[0]!, e.machine, cx), attempt);',
      ],
    ],
  },
  {
    id: "failure-keeps-prediction",
    kills: ["cell:store.failure"],
    edits: [
      [
        "entities.ts",
        'if (ending.ch === "failure") return removeEntry(s, attempt);',
        'if (ending.ch === "failure") return s;',
      ],
    ],
  },
  {
    id: "unknown-drops-prediction",
    kills: ["cell:store.unknown", "rule:30"],
    edits: [
      [
        "entities.ts",
        "out: Slice = { ...s, entries: { ...s.entries, [e.attempt]: { ...e, unknown: true } } };",
        "out: Slice = { ...s, entries: { ...s.entries, [e.attempt]: { ...e, unknown: true, predicted: [] } } };",
      ],
    ],
  },
  {
    id: "omitted-not-unconfirmed",
    kills: ["cell:store.success", "rule:30"],
    edits: [
      [
        "entities.ts",
        "unconfirmed: [...new Set([...x.unconfirmed, ...held])],",
        "unconfirmed: x.unconfirmed,",
      ],
    ],
  },
  {
    id: "success-ignores-carrier",
    kills: ["cell:store.success"],
    edits: [["entities.ts", "for (const c of carried) out = carry(out, c.ref, c);", ""]],
  },
  {
    id: "read-clears-mark",
    kills: ["rule:32"],
    edits: [
      [
        "entities.ts",
        "...r, base: c.fields ?? {}, unconfirmed: [] }));",
        "...r, base: c.fields ?? {}, unconfirmed: [], marks: [] }));",
      ],
    ],
  },
  {
    id: "success-clears-unresolved-marks",
    kills: ["rule:32"],
    edits: [["entities.ts", "m.attempt === e.attempt || (m.given && m.mint < e.mint)", "true"]],
  },
  {
    id: "later-success-keeps-given-mark",
    kills: ["rule:32"],
    edits: [
      [
        "entities.ts",
        "m.attempt === e.attempt || (m.given && m.mint < e.mint)",
        "m.attempt === e.attempt",
      ],
    ],
  },
  {
    id: "release-clears-mark",
    kills: ["rule:32"],
    edits: [
      [
        "entities.ts",
        "marks: r.marks.map((m) => (m.attempt === attempt ? { ...m, given: true } : m)),",
        "marks: r.marks.filter((m) => m.attempt !== attempt),",
      ],
    ],
  },
  {
    id: "overload-off",
    kills: ["rule:35", "cell:notsent.Overloaded"],
    edits: [
      [
        "entities.ts",
        "if (refs.some((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };",
        "",
      ],
    ],
  },
  {
    id: "partial-join",
    kills: ["rule:35"],
    edits: [
      [
        "entities.ts",
        "if (refs.some((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };",
        "if (refs.every((ref) => recOf(s, ref).queue.length >= cx.queueMax)) return { s, ok: false };",
      ],
    ],
  },
  {
    id: "supersede-keeps-entry",
    kills: ["cell:notsent.Superseded"],
    edits: [
      [
        "lane.ts",
        'hook(tx, "withdraw", (m, s, cx) => m.withdraw!(s, { attempt: x.id, why: "Superseded" }, cx));',
        "",
      ],
    ],
  },
  {
    id: "latest-keeps-both",
    kills: ["rule:29"],
    edits: [
      [
        "lane.ts",
        "return setLane(tx, { ...tx.w.lanes[l.id]!, w: [made.attempt] });",
        "return setLane(tx, { ...tx.w.lanes[l.id]!, w: [...l.w, made.attempt] });",
      ],
    ],
  },
  {
    id: "serialize-lifo",
    kills: ["D43"],
    edits: [["lane.ts", "w: [...l.w, made.attempt] });", "w: [made.attempt, ...l.w] });"]],
  },
  {
    id: "no-promotion",
    kills: ["D3", "rule:21"],
    edits: [
      [
        "lane.ts",
        "const [next, ...w] = lane.w; if (!next) return deleteLane(tx, lane.id);",
        "const [next, ...w] = lane.w; if (true || !next) return deleteLane(tx, lane.id);",
      ],
    ],
  },
  {
    id: "predicted-keys-not-captured",
    kills: ["rule:38"],
    edits: [
      [
        "entities.ts",
        "capture: (s, attempt) => s.entries[attempt]?.refs,",
        "capture: () => undefined,",
      ],
    ],
  },
  {
    id: "predictions-persisted",
    kills: ["rule:38"],
    edits: [
      [
        "entities.ts",
        "capture: (s, attempt) => s.entries[attempt]?.refs,",
        "capture: (s, attempt) => s.entries[attempt]?.predicted.map((p) => JSON.stringify({ ref: p.ref, refundedCents: 1 })),",
      ],
    ],
  },
  {
    id: "restored-no-repair",
    kills: ["rule:30", "rule:46"],
    edits: [
      ["entities.ts", "out = startRepair(out, ref, w.machine, cx); } return out;", "} return out;"],
    ],
  },
  {
    id: "restored-no-mark",
    kills: ["rule:38"],
    edits: [
      [
        "entities.ts",
        "queue: [...r.queue, w.attempt], marks: [...r.marks, { attempt: w.attempt, mint: w.mint, given: false }],",
        "queue: [...r.queue, w.attempt],",
      ],
    ],
  },
  {
    id: "prediction-publishes-late",
    kills: ["rule:28"],
    edits: [
      [
        "entities.ts",
        "const e: Entry = { ...w, refs, predicted: p.predicted, unknown: false, released: false };",
        "const e: Entry = { ...w, refs, predicted: [], unknown: false, released: false };",
      ],
    ],
  },
  {
    id: "store-waits-for-admission",
    kills: ["rule:27", "S8"],
    edits: [
      [
        "lane.ts",
        'hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: h.id, ending: final }, cx)); if (tx.w.status',
        "if (tx.w.status",
      ],
    ],
  },
  {
    id: "field-fn-uses-stale-base",
    kills: ["rule:30"],
    edits: [
      [
        "entities.ts",
        'next[k] = typeof v === "function" ? (v as (b: unknown, i: unknown) => unknown)(base, input) : v;',
        'next[k] = typeof v === "function" ? (v as (b: unknown, i: unknown) => unknown)({ ...base, unitPriceCents: 2000, refundedCents: 0 }, input) : v;',
      ],
    ],
  },
  {
    id: "storage-refused-firstsend-resolves-silent",
    kills: ["cell:notsent.StorageRefused", "cell:lane.storageRefused.InFlight"],
    edits: [
      [
        "lane.ts",
        'storageRefused: { Waiting: "refuseFirst", Resend: "refuseResend" },',
        'storageRefused: { Waiting: "refuseResend", Resend: "refuseResend" },',
      ],
    ],
  },
  {
    id: "refused-resend-ends",
    kills: ["cell:lane.storageRefused.InFlight"],
    edits: [
      [
        "lane.ts",
        'storageRefused: { Waiting: "refuseFirst", Resend: "refuseResend" },',
        'storageRefused: { Waiting: "refuseFirst", Resend: "refuseFirst" },',
      ],
    ],
  },
  {
    id: "disposed-keeps-prediction",
    kills: ["cell:notsent.Disposed"],
    edits: [
      [
        "lane.ts",
        'const e = declined("Disposed"); noteEnding(tx, { op: l!.op, attempt: h.id }, e); hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: h.id, ending: e }, cx));',
        'const e = declined("Disposed"); noteEnding(tx, { op: l!.op, attempt: h.id }, e);',
      ],
    ],
  },
  {
    id: "cancel-never-sent-keeps-prediction",
    kills: ["cell:notsent.Cancelled"],
    edits: [
      [
        "lane.ts",
        'disarmTimer(tx, `storage/${h.id}`); hook(tx, "settled", (m, s, cx) => m.settled!(s, { attempt: h.id, ending: e }, cx));',
        "disarmTimer(tx, `storage/${h.id}`);",
      ],
    ],
  },
  {
    id: "restored-w-dropped",
    kills: ["cell:notsent.Restored"],
    edits: [
      [
        "durable.ts",
        "noteEnding(tx, { op: l.op, attempt: a.id }, e); mail(tx, l, a, e, false);",
        "void e;",
      ],
    ],
  },
  {
    id: "restored-held-redelivers-twice",
    kills: ["cell:lane.restore.Held"],
    edits: [
      [
        "lane.ts",
        'restore: { Settled: "byEnding", Held: "nothing" },',
        'restore: { Settled: "byEnding", Held: "release" },',
      ],
    ],
  },
  {
    id: "disposal-held-released",
    kills: ["cell:lane.runtimeDisposal.Held"],
    edits: [
      [
        "lane.ts",
        'Settled: "disposeSettled", Held: "nothing",',
        'Settled: "disposeSettled", Held: "release",',
      ],
    ],
  },
  {
    id: "held-cancel-ignored",
    kills: ["cell:lane.cancel.Held", "rule:24"],
    edits: [
      [
        "lane.ts",
        'Settled: "nothing", // the real ending has settled; a settled ending is never rewritten (rule 24) Held: "release",',
        'Settled: "nothing", Held: "nothing",',
      ],
    ],
  },
  {
    id: "cancel-idle-issues",
    kills: ["cell:lane.cancel.Idle"],
    edits: [["lane.ts", 'cancel: { Idle: "nothing",', 'cancel: { Idle: "nothingToResend",']],
  },
  {
    id: "resolve-success-holds",
    kills: ["cell:lane.success.InFlight", "rule:17"],
    edits: [["lane.ts", 'success: { Settled: "resolve" },', 'success: { Settled: "hold" },']],
  },
  {
    id: "resolve-failure-holds",
    kills: ["cell:lane.failure.InFlight"],
    edits: [["lane.ts", 'failure: { Settled: "resolve" },', 'failure: { Settled: "hold" },']],
  },
  {
    id: "commit-idle-not-mint",
    kills: ["cell:lane.commit.Idle"],
    edits: [["lane.ts", 'commit: { Idle: "mint",', 'commit: { Idle: "nothing",']],
  },
  {
    id: "dispatch-only-after-turns",
    kills: ["D4"],
    edits: [
      [
        "step.ts",
        'if (tx.w.status !== "live") return; for (const id of',
        'if (tx.w.status !== "live" || tx.cause === "stored") return; for (const id of',
      ],
    ],
  },
];
