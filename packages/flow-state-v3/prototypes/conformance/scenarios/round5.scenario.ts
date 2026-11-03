// Round 5: the review's findings as scenarios, on real shapes. Expected results are worked out by hand from convergence-5's tables,
// from the rule cited, or from the real file a fixture copies. D65-D73 are proposed.
import {
  deskFixture,
  deskNoVersionFixture,
  eachResetFixture,
  eachWriteFixture,
  lateFillFixture,
  ticketRef,
  traitWriteFixture,
} from "../typed/desk.ts";
import {
  deskFeedFixture,
  deskFeedNoReconnect,
  roomsFixture,
  type Cursor,
} from "../fixtures/feed.compiled.ts";
import { issuesPersisted } from "../typed/lab-machines.ts";
import { ODD_KINDS, oddAllFixture } from "../fixtures/oddall.compiled.ts";
import type { Fixture, Harness, Step } from "../harness.ts";
import { NoHeldRequest } from "../fake-world.ts";
import { checkClaims, checkEndings, checkMints, Ctx, Mismatch, type Scenario } from "./ctx.ts";

const T = { actor: "Desk/Tickets", id: "a" };
const T1 = ticketRef("t1");
const TW = { actor: "Lab/TraitWrite", id: "a" };
const EW = { actor: "Lab/EachWrite", id: "a" };
const LF = { actor: "Lab/LateFill", id: "a" };
const ER = { actor: "Lab/EachReset", id: "a" };
const F = { actor: "DispatchDesk/DeskFeed", id: "w1" };
const R = { actor: "Desk/Rooms", id: "a" };
const OP = "activity";
const oldRow = (over: object = {}) => ({
  id: "t1",
  title: "title t1",
  slug: "title t1",
  archived: false,
  readAt: null,
  revision: 1,
  ...over,
});
const at = (
  c0: Ctx,
  f: Fixture,
  actor: { actor: string; id: string },
  bounds?: Record<string, number>,
) => {
  const c = new Ctx(c0.fresh([f], bounds), actor);
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const opened = (c: Ctx) => {
  c.to(T, "Load");
  c.answer("list", { truth: true });
};
const on = (c0: Ctx, f: Fixture) => {
  const c = at(c0, f, T);
  opened(c);
  return c;
};
const repairs = (c: Ctx) => c.reqs("repair").length;
const got = (c: Ctx) => c.inner(["t"])?.memory.got;
const edit = (f: (r: any) => void) => (raw: string) => {
  const r = JSON.parse(raw);
  f(r);
  return JSON.stringify(r);
};
const corrupt = (c: Ctx, match: string, f: (r: any) => void) =>
  c.fault({ corruptStored: { match, edit: edit(f) } });
const stopped = (c: Ctx) => {
  c.eq("not stopped", c.r.quiet().fatal, false);
  c.eq(
    "no module disabled",
    c.r.issues().filter((i) => i.code === "ModuleDefect" || i.code === "Fatal"),
    [],
  );
};

// ── Sessions' helpers.
const cur = (seq: number, epoch = 1): Cursor => ({ epoch, seq });
const entry = (id: string, seq?: number) => ({
  id,
  ...(seq === undefined ? {} : { cursor: cur(seq) }),
});
const frame = (c: Ctx, f: unknown) => c.do({ feed: OP, frame: f });
const hello = (c: Ctx, replayedFrom?: Cursor) =>
  frame(c, { t: "hello", ...(replayedFrom ? { replayedFrom } : {}) });
const value = (c: Ctx, id: string, seq?: number) =>
  frame(c, { t: "activity", entry: entry(id, seq) });
const conns = (c: Ctx) => c.r.outside().feeds;
const lastFrom = (c: Ctx) => conns(c).at(-1)?.from;
const row = (c: Ctx, a = F) => c.r.module("sessions", `${a.actor}/${a.id}|${OP}`);
const ids = (c: Ctx) => c.mem().activity.map((e: any) => e.id);
const saved = (c: Ctx, a = F) => c.record(a);
const bookmark = (c: Ctx, a = F): any =>
  Object.values((saved(c, a)?.root?.partition?.sessions ?? {}) as Record<string, unknown>)[0];

// Every closure kind crossed with every odd value. One oracle above the usual: nothing stops the core (D65).
const cycle: any = { a: 1 };
cycle.self = cycle;
const ODD_VALUES: readonly unknown[] = [
  Symbol("odd"), // D139, F4: it was the one hole
  new Date(5),
  Infinity,
  undefined,
  null,
  5,
  -1,
  NaN,
  1e12,
  10n,
  "constructor",
  "__proto__",
  [null],
  {},
  cycle,
  { tag: 5 },
  { tag: "constructor", payload: null },
  { ref: "constructor" },
  [{ ref: "constructor", fields: { a: 1 } }],
  [{ ref: "__proto__", patch: { a: 1 } }],
  [{ ref: 5 }],
];
const O = { actor: "Odd/All", id: "a" };
const ODD_SCRIPT: ReadonlyArray<Step | (() => Step)> = [
  { send: O, event: "Patch" },
  { send: O, event: "Guard" },
  { send: O, event: "Follow" },
  { send: O, event: "Raise" },
  { send: O, event: "TokenGo" },
  { send: O, event: "PortHit" },
  { send: O, event: "Commit" },
  { answer: "w", with: { ok: {} } },
  { send: O, event: "Commit" },
  { answer: "w", with: { fail: { tag: "Refused" } } },
  { send: O, event: "Commit" },
  { answer: "w", with: { lost: true } },
  { answer: "repair", with: { ok: { n: 3 } } },
  { send: O, event: "Cancel" },
  { send: O, event: "Lookup" },
  { answer: "r", with: { ok: [] } },
  { send: O, event: "Arm" },
  { advance: 2000 },
  { send: O, event: "Back" },
  { send: O, event: "RaiseLeave" },
  { send: O, event: "Back" },
  { reload: true },
];
export const searchOddAll = (make: () => Harness) => {
  let n = 0;
  for (const kind of ODD_KINDS)
    for (const v of ODD_VALUES) {
      oddOne(make, kind, v);
      n++;
    }
  return n;
};
const oddOne = (make: () => Harness, kind: string, v: unknown) => {
  const h = make();
  const label = `${kind}=${String(typeof v === "object" ? JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? "big" : x === cycle ? "cycle" : x)) : v)}`;
  const check = (at: string) => {
    if (h.read.quiet().fatal) throw new Mismatch(`D65: ${label} stopped the Runtime at ${at}`);
    const i = h.read.issues().find((x) => x.code === "Fatal" || x.code === "ModuleDefect");
    if (i)
      throw new Mismatch(`D65: ${label}: ${i.code} ${i.origin ?? ""} at ${at}: ${String(i.input)}`);
    checkClaims(h.read);
    checkEndings(h.read);
    checkMints(h.read);
  };
  h.do({ ensure: O });
  // D132: a value may not stop the core, so the actor must be there to be not stopped. It passed on no runtime.
  if (h.read.state(O) === undefined) throw new Mismatch(`no actor: ${label}`);
  h.do({ send: O, event: "Set", payload: { odd: { kind, value: v } } });
  check("Set");
  for (const s of ODD_SCRIPT) {
    const step = typeof s === "function" ? s() : s;
    try {
      h.do(step);
    } catch (e) {
      if (!(e instanceof NoHeldRequest))
        throw new Mismatch(
          `D65: ${label} threw at ${JSON.stringify(Object.keys(step))}: ${String(e)}`,
        );
    }
    if ("reload" in step) {
      const q = h.read.quiet();
      if (q.fatal) throw new Mismatch(`D65: ${label} stopped the Runtime at reload`);
    }
    check(JSON.stringify(step, (_k, x) => (typeof x === "bigint" ? "big" : x)).slice(0, 40));
  }
};

export const round5Scenarios: readonly Scenario[] = [
  {
    id: "REV5-H1",
    kind: "fault",
    fixtures: [deskFixture],
    actor: T,
    cites: ["D65", "D57", "rule:12"],
    namedIssues: ["InvalidTurn", "UnmappedEnding"],
    variants: {
      "prototype-names-at-the-doors"(c0) {
        const c = at(c0, deskFixture, T);
        for (const tag of ["constructor", "toString", "__proto__", "hasOwnProperty"]) c.send(tag);
        c.eq("no turn", c.r.evidence("turn").length, 0);
        c.do({ send: T, event: "Load", payload: {}, to: ["constructor"] });
        c.do({ send: T, event: "Load", payload: {}, to: ["__proto__"] });
        c.eq("no read", c.reqs("list").length, 0);
        stopped(c);
      },
      "a-server-tag-named-like-a-prototype-key-is-unmapped"(c0) {
        const c = at(c0, deskFixture, T);
        c.send("Archive", { id: "t1" });
        c.answer("archive", { fail: { tag: "constructor" } });
        c.eq("the owner is told", c.r.issues().at(-1)?.code, "UnmappedEnding");
        stopped(c);
      },
      "an-event-of-no-shape-is-refused-at-the-door"(c0) {
        const c = at(c0, deskFixture, T);
        c.do({ send: T, event: 5 as never, payload: {} });
        c.do({ send: T, event: undefined as never, payload: {} });
        c.eq("named", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 2);
        stopped(c);
      },
      "each-closure-kind-of-no-shape-refuses-its-turn"(c0) {
        // Not only "nothing stops": the gate says so. Script per kind; InvalidTurn is the effect in a turn.
        const cases: ReadonlyArray<readonly [string, unknown, readonly Step[]]> = [
          ["patch", 5, [{ send: O, event: "Patch" }]],
          ["guard", 5, [{ send: O, event: "Guard" }]],
          ["raiseFrom", 5, [{ send: O, event: "Raise" }]],
          ["notifyFrom", 5, [{ send: O, event: "Raise" }]],
          ["exitFrom", 5, [{ send: O, event: "RaiseLeave" }]],
          ["portGuard", 5, [{ send: O, event: "PortHit" }]],
          ["fragInitial", 5, [{ send: O, event: "Arm" }, { advance: 2000 }]],
          [
            "success",
            5,
            [
              { send: O, event: "Commit" },
              { answer: "w", with: { ok: {} } },
            ],
          ],
        ];
        for (const [kind, value, script] of cases) {
          const h = c0.fresh([oddAllFixture]);
          h.do({ ensure: O });
          h.do({ send: O, event: "Set", payload: { odd: { kind, value } } });
          for (const st of script) h.do(st);
          if (!h.read.issues().some((i) => i.code === "InvalidTurn"))
            throw new Mismatch(`D65: ${kind} of no shape was believed`);
        }
      },
      "ensure-of-an-unknown-machine"(c0) {
        const c = at(c0, deskFixture, T);
        for (const m of ["Nope", "constructor"]) c.do({ ensure: { actor: m, id: "x" } });
        c.eq("named", c.r.issues().filter((i) => i.code === "InvalidTurn").length, 2);
        stopped(c);
      },
    },
  },
  {
    id: "SEARCH-ODD-ALL",
    kind: "bounded",
    fixtures: [oddAllFixture],
    actor: O,
    cites: ["D65", "D57"],
    run(c) {
      const make = () => c.fresh([oddAllFixture]);
      // In the suite, one value of each class. All of them: search/run.ts --which oddall.
      const some = [
        undefined,
        5,
        "constructor",
        [null],
        { tag: "constructor", payload: null },
        [{ ref: "constructor", fields: { a: 1 } }],
      ];
      for (const kind of ODD_KINDS) for (const v of some) oddOne(make, kind, v);
    },
  },
  {
    id: "REV5-H2",
    kind: "fault",
    fixtures: [traitWriteFixture],
    actor: TW,
    cites: ["D65", "D61", "rule:46", "P19"],
    namedIssues: ["RecordQuarantined"],
    variants: {
      "a-frozen-ending-of-a-removed-operation-is-orphaned-not-fatal"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go", { k: "keep" });
        c.ack();
        c.answer("put", { ok: {} });
        c.send("Away");
        corrupt(c, "actor/", (r) => {
          r.root.kids.t.frozen.parked = [
            {
              k: "ending",
              actor: r.key,
              op: "removedInThisRelease",
              key: {},
              owner: { inc: r.root.kids.t.id, node: "root", activation: "x", chain: [] },
              ending: { ch: "success", value: {} },
              input: {},
              attempt: "read/x",
              inc: r.root.kids.t.id,
            },
          ];
        });
        c.reload();
        c.eq("evidence", c.r.evidence("Orphaned").length, 1);
        c.send("Back");
        c.eq("the actor kept its memory", got(c), ["ok:keep"]);
        stopped(c);
      },
      "junk-in-frozen-quarantines-at-boot"(c0) {
        for (const junk of [[null], [5], [{ k: "ending" }], "x"]) {
          const c = at(c0, traitWriteFixture, TW);
          c.send("Away");
          corrupt(c, "actor/", (r) => (r.root.kids.t.frozen.parked = junk));
          c.reload();
          c.eq("quarantined", c.r.issues().at(-1)?.code, "RecordQuarantined");
          c.ensure();
          c.send("Away");
          c.send("Back");
          stopped(c);
        }
      },
      "junk-frozen-timers-quarantine-at-boot"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.send("Away");
        corrupt(c, "actor/", (r) => (r.root.kids.t.frozen.timers = [{ kind: "schedule" }]));
        c.reload();
        c.eq("quarantined", c.r.issues().at(-1)?.code, "RecordQuarantined");
        stopped(c);
      },
      "stored-names-like-prototype-keys"(c0) {
        for (const [match, f] of [
          ["actor/", (r: any) => (r.machine = "constructor")],
          ["actor/", (r: any) => (r.machine = "toString")],
          ["lane/", (r: any) => (r.op = "constructor")],
          ["lane/", (r: any) => (r.machine = "__proto__")],
          ["lane/", (r: any) => (r.id = "other")],
        ] as const) {
          const c = at(c0, traitWriteFixture, TW);
          c.into(["t"], "Go");
          c.ack();
          corrupt(c, match, f);
          c.reload();
          c.eq(
            `quarantined ${String(f)}`,
            c.r.issues().some((i) => i.code === "RecordQuarantined"),
            true,
          );
          stopped(c);
        }
      },
      "a-module-value-of-no-shape-on-disk-does-not-disable-it"(c0) {
        const c = new Ctx(c0.fresh([issuesPersisted]), { actor: "Issues/List", id: "a" });
        c.ensure();
        c.send("Toggle", { id: "i1", liked: true });
        c.ack();
        corrupt(c, "lane/", (r) => (r.head.ext = { entities: 5 }));
        c.namedIssues = ["UserClosure", "RecordQuarantined"];
        c.reload();
        stopped(c);
      },
    },
  },
  {
    id: "REV5-H3",
    kind: "example",
    fixtures: [deskFixture],
    actor: T,
    cites: ["D66", "D59", "sec:2.8.6"],
    namedIssues: ["UserClosure"],
    variants: {
      "no-version-a-read-overlapping-a-confirmed-archive-doubts"(c0) {
        const c = on(c0, deskNoVersionFixture);
        c.send("Archive", { id: "t1" });
        c.to(T, "Load");
        c.answer("archive", { apply: true });
        c.answer("list", { ok: [oldRow()] });
        c.eq("the write stands", c.rec(T1)?.data.archived, true);
        c.eq("marked", c.rec(T1)?.uncertain, true);
        c.eq("asks", repairs(c), 1);
        c.answer("repair", { truth: true });
        c.eq(
          "settled",
          [c.rec(T1)?.data.archived, c.rec(T1)?.uncertain, c.rec(T1)?.unconfirmed],
          [true, false, []],
        );
      },
      "version-the-same-read-cannot-show-the-write-and-does-not-undo-it"(c0) {
        const c = on(c0, deskFixture);
        c.send("Archive", { id: "t1" });
        c.to(T, "Load");
        c.answer("archive", { apply: true });
        c.answer("list", { ok: [oldRow()] });
        c.eq(
          "the write stands, placed, unconfirmed",
          [c.rec(T1)?.data.archived, c.rec(T1)?.unconfirmed],
          [true, ["archived"]],
        );
        c.eq("no doubt: the version places it", c.rec(T1)?.uncertain, false);
        c.eq("no read spent", repairs(c), 0);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.eq(
          "a later version confirms it",
          [c.rec(T1)?.data.archived, c.rec(T1)?.unconfirmed],
          [true, []],
        );
      },
      "a-resend-with-nothing-carried-and-no-prediction-doubts"(c0) {
        for (const f of [deskFixture, deskNoVersionFixture]) {
          const c = on(c0, f);
          c.send("Archive", { id: "t1" });
          c.answer("archive", { lost: true });
          c.answer("repair", { truth: true });
          c.eq("the repair ended the prediction", c.rec(T1)?.data.archived, false);
          c.send("Reconcile", { id: "t1" });
          c.answer("archive", { apply: true });
          c.eq("it landed; we cannot say what it did", c.rec(T1)?.uncertain, true);
          c.eq(
            "no request left unasked",
            c.r.outside().open.some((o) => o.op === "repair"),
            true,
          );
          c.answer("repair", { truth: true });
          c.eq("truth", [c.rec(T1)?.data.archived, c.rec(T1)?.uncertain], [true, false]);
        }
      },
      "a-confirmed-remove-stays-removed"(c0) {
        for (const f of [deskFixture, deskNoVersionFixture]) {
          const c = on(c0, f);
          c.send("Remove", { id: "t1" });
          c.eq("hidden", c.rec(T1)?.data, undefined);
          c.answer("remove", { apply: true });
          c.eq("gone", c.rec(T1), undefined);
          c.eq("no read needed", repairs(c), 0);
        }
      },
      "an-old-list-does-not-bring-a-removed-record-back"(c0) {
        const c = on(c0, deskNoVersionFixture);
        c.send("Remove", { id: "t1" });
        c.to(T, "Load");
        c.answer("remove", { apply: true });
        c.answer("list", { ok: [oldRow()] });
        c.eq("not back", c.rec(T1)?.data, undefined);
        c.eq("marked", c.rec(T1)?.uncertain, true);
        c.answer("repair", { truth: true });
        c.eq("gone", c.rec(T1), undefined);
        const v = on(c0, deskFixture);
        v.send("Remove", { id: "t1" });
        v.to(T, "Load");
        v.answer("remove", { apply: true });
        v.answer("list", { ok: [oldRow()] });
        v.eq("version: dropped", [v.rec(T1), repairs(v)], [undefined, 0]);
      },
      "w-is-off-the-disk-once-it-has-ended"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.into(["t"], "Go");
        c.reload();
        c.reload();
        c.eq(
          "D72: once, not again at the next boot",
          got(c).filter((x: string) => x === "no:a:Restored").length,
          1,
        );
      },
      "many-records-one-write"(c0) {
        for (const f of [deskFixture, deskNoVersionFixture]) {
          const c = on(c0, f);
          c.send("MarkRead", { ids: ["t1", "t2"], at: 9 });
          c.answer("markRead", { apply: true });
          for (const r of [T1, ticketRef("t2")])
            c.eq("kept", [c.rec(r)?.data.readAt, c.rec(r)?.unconfirmed], [9, ["readAt"]]);
        }
      },
    },
  },
  {
    id: "REV5-H8",
    kind: "example",
    fixtures: [deskFixture],
    actor: T,
    cites: ["D67", "sec:2.8.6"],
    namedIssues: ["UserClosure"],
    variants: {
      "an-older-version-drops-whatever-its-kind-no-repair"(c0) {
        const c = on(c0, deskFixture);
        c.to(T, "Load");
        c.send("Rename", { id: "t1", title: "New" });
        c.answer("rename", { apply: true });
        c.eq("carried", c.rec(T1)?.data.revision, 2);
        c.answer("list", { ok: [oldRow()] });
        c.eq("dropped", c.rec(T1)?.data.title, "New");
        c.eq("no doubt, no read", [c.rec(T1)?.uncertain, repairs(c)], [false, 0]);
        c.yes("said", c.r.evidence("Stale").length >= 1);
      },
      "the-same-without-a-version-costs-a-read"(c0) {
        const c = on(c0, deskNoVersionFixture);
        c.to(T, "Load");
        c.send("Rename", { id: "t1", title: "New" });
        c.answer("rename", { apply: true });
        c.answer("list", { ok: [oldRow()] });
        c.eq("D58", [c.rec(T1)?.data.title, c.rec(T1)?.uncertain, repairs(c)], ["New", true, 1]);
        c.answer("repair", { truth: true });
      },
      "a-newer-version-applies-whatever-overlaps"(c0) {
        const c = on(c0, deskFixture);
        c.to(T, "Load");
        c.send("Rename", { id: "t1", title: "Mine" });
        c.answer("rename", { apply: true });
        c.answer("list", { ok: [oldRow({ title: "Theirs", revision: 7 })] });
        c.eq(
          "the version places it; no read",
          [c.rec(T1)?.data.title, c.rec(T1)?.uncertain, repairs(c)],
          ["Theirs", false, 0],
        );
      },
      "a-success-older-than-what-we-hold-drops"(c0) {
        const c = on(c0, deskFixture);
        c.send("Rename", { id: "t1", title: "B" });
        c.answer("rename", { ok: oldRow({ title: "B", revision: 5 }) });
        c.send("Rename", { id: "t1", title: "A" });
        c.answer("rename", { ok: oldRow({ title: "A", revision: 4 }) });
        c.eq("the version decides", [c.rec(T1)?.data.title, c.rec(T1)?.uncertain], ["B", false]);
      },
      "equal-versions-merge-and-confirm-a-partial-answer"(c0) {
        const c = on(c0, deskFixture);
        c.send("Retitle", { id: "t1", title: "New" });
        c.answer("retitle", { apply: true });
        c.eq("slug unconfirmed", c.rec(T1)?.unconfirmed, ["slug"]);
        c.to(T, "Load");
        c.answer("list", { truth: true });
        c.eq("confirmed", c.rec(T1)?.unconfirmed, []);
      },
      "a-tombstone-has-a-version"(c0) {
        const c = on(c0, deskFixture);
        c.to(T, "Load");
        c.send("Purge", { id: "t1" });
        c.answer("purge", { apply: true });
        c.answer("list", { ok: [oldRow()] });
        c.eq("older: stays gone, no read", [c.rec(T1), repairs(c)], [undefined, 0]);
        c.to(T, "Load");
        c.answer("list", { ok: [oldRow({ revision: 9, title: "again" })] });
        c.eq("newer: back", c.rec(T1)?.data.title, "again");
      },
      "a-version-of-no-shape-falls-back-with-an-issue"(c0) {
        for (const bad of [null, {}, NaN, true]) {
          const c = on(c0, deskFixture);
          c.to(T, "Load");
          c.answer("list", { ok: [oldRow({ revision: bad, title: "odd" })] });
          c.yes(
            "named",
            c.r.issues().some((i) => i.code === "UserClosure"),
          );
          c.eq("applied by position", c.rec(T1)?.data.title, "odd");
          stopped(c);
        }
      },
      "a-mark-is-not-a-versions-to-clear"(c0) {
        const c = on(c0, deskFixture);
        c.send("Rename", { id: "t1", title: "New" });
        c.answer("rename", { lost: true });
        c.to(T, "Load");
        c.answer("list", { ok: [oldRow({ revision: 3 })] });
        c.eq("rule 32: a read does not clear it", c.rec(T1)?.uncertain, true);
        c.answer("repair", { truth: true });
      },
    },
  },
  {
    id: "REV5-H5H6",
    kind: "example",
    fixtures: [traitWriteFixture],
    actor: TW,
    cites: ["rule:54", "rule:45", "rule:17", "C2", "D72", "D73"],
    variants: {
      "a-persisted-rebind-adopts-its-fragments-ending"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.dispose();
        c.answer("put", { ok: {} });
        c.ensure();
        c.eq("no reload needed", got(c), ["ok:a"]);
      },
      "and-its-lost-answer-once-with-no-restored"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.dispose();
        c.answer("put", { lost: true });
        c.ensure();
        c.eq("once", got(c), ["unsure:a:NoResponse"]);
        c.eq(
          "a hold with an owner",
          c.r.quiet().waits.find((w) => w.kind === "held")?.owner,
          "bound",
        );
      },
      "a-hold-heard-before-disposal-is-restored-to-the-rebound-life"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.answer("put", { lost: true });
        c.dispose();
        c.ensure();
        c.eq("told", got(c), ["unsure:a:NoResponse", "unsure:a:Restored"]);
      },
      "a-frozen-kid-adopts-at-the-thaw-not-at-the-rebind"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.send("Away");
        c.dispose();
        c.answer("put", { ok: {} });
        c.ensure();
        c.eq("not yet", got(c), []);
        c.send("Back");
        c.eq("now", got(c), ["ok:a"]);
      },
      "w-behind-a-parked-hold-ends-at-a-reload"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.into(["t"], "Go");
        c.send("Away");
        c.answer("put", { lost: true });
        c.reload();
        c.send("Back");
        c.yes("the first", got(c).includes("unsure:a:NoResponse"));
        c.yes("the second", got(c).includes("no:a:Restored"));
        c.eq(
          "two mints, two endings",
          [
            c.r.evidence("mint").length,
            new Set(c.r.evidence("ending").map((e) => e["attempt"])).size,
          ],
          [2, 2],
        );
        c.eq("the hold stayed", c.r.quiet().waits.filter((w) => w.kind === "held").length, 1);
      },
      "a-disposed-identity-sleeps-through-a-reload"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.dispose();
        c.reload();
        c.eq("not woken", c.r.state(TW), undefined);
        c.ensure();
        c.eq("its memory came back", got(c), ["unsure:a:Restored"]);
      },
    },
  },
  {
    id: "REV5-M1",
    kind: "fault",
    fixtures: [traitWriteFixture],
    actor: TW,
    cites: ["D72", "rule:44", "rule:17"],
    bounds: { drainMs: -1 },
    variants: {
      "a-crash-during-recovery-loses-no-parked-ending"(c0) {
        const c = at(c0, traitWriteFixture, TW, { drainMs: -1 });
        c.into(["t"], "Go");
        c.ack();
        c.dispose();
        c.answer("put", { ok: {} });
        c.do({ reload: true, crashAfterBoot: true });
        c.ensure();
        c.eq("delivered", got(c), ["ok:a"]);
      },
      "nor-a-w-behind-an-acked-head"(c0) {
        const c = at(c0, traitWriteFixture, TW, { drainMs: -1 });
        c.into(["t"], "Go");
        c.ack();
        c.into(["t"], "Go");
        c.do({ reload: true, crashAfterBoot: true });
        c.yes("the head", got(c).includes("unsure:a:Restored"));
        c.yes("the second", got(c).includes("no:a:Restored"));
      },
      "the-record-goes-once-delivered"(c0) {
        const c = at(c0, traitWriteFixture, TW, { drainMs: -1 });
        c.into(["t"], "Go");
        c.ack();
        c.dispose();
        c.answer("put", { ok: {} });
        c.reload();
        c.ensure();
        c.eq(
          "the lane is off the disk",
          c.laneKeys(),
          [],
        );
      },
    },
  },
  {
    id: "REV5-M2",
    kind: "example",
    fixtures: [eachResetFixture],
    actor: ER,
    cites: ["rule:1", "rule:9"],
    run(c0) {
      const c = at(c0, eachResetFixture, ER);
      const before = c.inner(["c:x"])!;
      c.eq("two copies", [before.state, c.mem().c.length], ["root", 2]);
      c.into(["c:x"], "Bump");
      c.eq("reseeded in the pending reset's own turn", c.mem().c.length, 2);
      c.eq(
        "fresh",
        c.mem().c.map((x: any) => x.fresh),
        [true, true],
      );
    },
  },
  {
    id: "REV5-H4",
    kind: "example",
    fixtures: [deskFeedFixture],
    actor: F,
    cites: ["D68"],
    run(c0) {
      const c = at(c0, deskFeedFixture, F);
      hello(c);
      c.send("Peek");
      c.answer("peek", { ok: {} });
      stopped(c);
      value(c, "after", 1);
      c.eq("streams still run", ids(c), ["after"]);
    },
  },
  {
    id: "REV5-SESS",
    kind: "example",
    fixtures: [deskFeedFixture],
    actor: F,
    cites: ["rule:69", "rule:70", "rule:68", "T1", "T2:4", "T3:bookmark", "T3:filled", "T9", "D70"],
    bounds: {},
    variants: {
      "a-burst-keeps-one-in-mail"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        c.do({
          feed: OP,
          frames: Array.from({ length: 12 }, (_, i) => ({
            t: "activity",
            entry: entry(`e${i}`, i + 1),
          })),
        });
        c.eq("all", ids(c).length, 12);
        c.eq("in order", ids(c).slice(0, 2), ["e0", "e1"]);
        c.eq("never two", c.r.peakDeliveriesInMail(), 1);
      },
      "a-notice-and-a-value-at-once-are-still-one-at-a-time"(c0) {
        const c = at(c0, deskFeedFixture, F, { drainMs: -1 });
        hello(c);
        value(c, "a", 1);
        c.reload();
        c.do({
          feed: OP,
          frames: [
            { t: "hello" },
            { t: "activity", entry: entry("b", 2) },
            { t: "activity", entry: entry("c", 3) },
          ],
        });
        c.eq("all", [ids(c), c.mem().notices], [["a", "b", "c"], 1]);
        c.eq("never two", c.r.peakDeliveriesInMail(), 1);
      },
      "a-clear-and-leave-is-a-wipe-the-reconnect-owes"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        value(c, "a", 1);
        c.eq("filled", bookmark(c)?.filled, true);
        c.send("ClearAndLeave");
        c.eq("T3: a releasing turn does not lower filled", bookmark(c)?.filled, true);
        c.do({ advance: 20 });
        c.send("Open");
        c.eq("connect sees the wipe: from nothing", lastFrom(c), undefined);
        c.eq("at once", bookmark(c), { filled: false });
        hello(c);
        c.eq("T2 row 5", c.mem().notices, 1);
      },
      "a-leave-and-return-during-a-slow-close-waits-then-connects"(c0) {
        const r = at(c0, roomsFixture, R);
        hello(r);
        value(r, "a", 1);
        r.send("Away");
        r.send("Back");
        r.eq("never two: waits for its predecessor", conns(r).length, 1);
        r.eq("still closing", conns(r)[0]?.closing, true);
        r.do({ advance: 20 });
        r.eq("now", [conns(r).length, conns(r).at(-1)?.open, lastFrom(r)], [2, true, cur(1)]);
        hello(r);
        r.eq("live", row(r, R).connection, "Live");
      },
      "a-close-that-never-finishes-is-overdue"(c0) {
        const r = at(c0, roomsFixture, R);
        hello(r);
        r.fault({ socketClose: Infinity });
        r.send("Away");
        r.send("Back");
        r.eq("waits", conns(r).length, 1);
        r.do({ advance: 5000 });
        r.eq("said", r.r.evidence("ReleaseOverdue").length, 1);
        r.eq("and moves on", conns(r).length, 2);
      },
      "a-member-stops-what-is-already-in-mail-from-moving"(c0) {
        const c = at(c0, deskFeedFixture, F, { drainMs: -1 });
        hello(c);
        value(c, "a", 1);
        c.h.raw({ send: F, event: "Jump", payload: { at: cur(50) } });
        c.do({ feed: OP, frame: { t: "activity", entry: entry("b", 2) } });
        c.eq("delivered", ids(c), ["a", "b"]);
        c.eq("T1: a value behind a member does not move it", bookmark(c)?.at, cur(50));
      },
      "a-proof-with-nothing-claimed-is-not-believed"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        value(c, "a", 1);
        c.send("Refetch");
        c.reload();
        c.eq("no claim", lastFrom(c), undefined);
        const before = c.mem().notices;
        frame(c, { t: "signal", signal: { _feed: "live", proof: "I replayed" } });
        c.eq("T2: row 7, with a notice", c.mem().notices, before + 1);
      },
      "a-healthy-minute-resets-the-backoff"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        c.do({ feed: OP, end: true });
        c.advance(1000);
        hello(c);
        c.do({ feed: OP, end: true });
        c.advance(1999);
        c.eq("doubled", conns(c).length, 2);
        c.advance(1);
        c.eq("again", conns(c).length, 3);
        hello(c);
        c.advance(30_000);
        frame(c, { t: "ping" });
        c.advance(30_000);
        c.do({ feed: OP, end: true });
        c.advance(1000);
        c.eq("back to one second", conns(c).length, 4);
      },
      "a-value-with-no-position-keeps-the-place"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        value(c, "a", 1);
        value(c, "nopos");
        c.eq("T3", bookmark(c)?.at, cur(1));
      },
      "a-value-re-arms-idle"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        c.advance(40_000);
        value(c, "a", 1);
        c.advance(40_000);
        c.eq("still", row(c).st, "Live");
        c.advance(5000);
        c.eq("silent now", row(c).st, "Waiting");
      },
      "a-failure-behind-a-release-is-discarded"(c0) {
        const c = at(c0, deskFeedNoReconnect, F, { drainMs: -1 });
        hello(c);
        c.h.raw({ send: F, event: "SignOut", payload: {} });
        c.do({ feed: OP, end: true });
        c.eq("no turn for it", c.mem().endedElsewhere, false);
        c.eq("said", c.r.evidence("discarded").length >= 1, true);
      },
      "input-is-read-once"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        c.send("BreakInput");
        c.eq("no issue", c.r.issues().length, 0);
        c.eq("still connected", [conns(c).at(-1)?.open, row(c).connection], [true, "Live"]);
      },
      "end-delivers-what-is-queued-first"(c0) {
        const c = at(c0, deskFeedNoReconnect, F);
        hello(c);
        c.do({
          feed: OP,
          frames: [1, 2, 3].map((i) => ({ t: "activity", entry: entry(`e${i}`, i) })),
        });
        c.do({ feed: OP, end: true });
        c.eq("T9: the failure behind queued items", ids(c), ["e1", "e2", "e3"]);
        c.state("RETRY_WAIT");
      },
      "end-behind-a-queued-value-under-a-slow-drain"(c0) {
        const c = at(c0, deskFeedNoReconnect, F, { drainMs: -1 });
        hello(c);
        value(c, "a", 1);
        c.reload();
        c.h.raw({ feed: OP, frames: [{ t: "hello" }, { t: "activity", entry: entry("b", 2) }] });
        c.do({ feed: OP, end: true });
        c.eq("T9: the failure behind what is queued", ids(c), ["a", "b"]);
        c.state("RETRY_WAIT");
      },
      "under-pull-a-drop-cannot-overtake-a-value-already-taken"(c0) {
        const c = at(c0, deskFeedFixture, F, { drainMs: -1 });
        hello(c);
        value(c, "a", 1);
        c.reload();
        c.h.raw({ feed: OP, frames: [{ t: "hello" }, { t: "activity", entry: entry("b", 2) }] });
        c.do({ feed: OP, end: true });
        c.eq("told", c.mem().notices, 1);
        c.eq("D71: the end waits behind it", [ids(c), bookmark(c)?.at], [["a", "b"], cur(2)]);
      },
      "a-reset-mark-does-not-outlive-its-notice"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        value(c, "a", 1);
        frame(c, { t: "reset", epoch: 2 });
        c.eq("moved", bookmark(c)?.at, cur(0, 2));
        value(c, "b", 5);
        c.eq("moved on", bookmark(c)?.at, cur(5));
        c.do({ feed: OP, end: true });
        c.advance(1000);
        frame(c, { t: "hello" });
        c.eq("not back to the reset", bookmark(c)?.at, cur(5));
        c.eq("asked from the value", lastFrom(c), cur(5));
      },
      "a-member-with-an-empty-field-writes-filled-false"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        c.send("SignOut");
        c.do({ advance: 20 });
        c.send("Jump", { at: cur(9) });
        c.eq("T3", bookmark(c), { at: cur(9), filled: false });
        c.send("Open");
        c.eq("the jump holds", lastFrom(c), cur(9));
      },
      "a-position-that-cannot-be-saved-at-registration-ends-it"(c0) {
        const c = new Ctx(c0.fresh([deskFeedFixture]), F);
        c.namedIssues = ["UnencodableValue"];
        c.ensure();
        frame(c, { t: "signal", signal: { _feed: "live", restartAt: 10n } });
        c.state("RETRY_WAIT");
        c.eq("T1: Defect, nothing saved", bookmark(c), undefined);
        c.namedIssues.push("UnencodableValue");
      },
      "a-drop-with-one-in-mail-loses-what-moves"(c0) {
        const c = at(c0, deskFeedFixture, F);
        hello(c);
        value(c, "a", 1);
        c.do({ feed: OP, end: true });
        c.eq("waiting", row(c).queued, 0);
      },
    },
  },
  {
    id: "REV5-S",
    kind: "example",
    fixtures: [eachWriteFixture],
    actor: EW,
    cites: ["rule:51", "rule:15", "D26", "D50"],
    namedIssues: ["InvalidTurn"],
    variants: {
      "another-paths-commit-under-serialize-is-rejected"(c0) {
        const c = at(c0, eachWriteFixture, EW);
        c.into(["c:x"], "Go");
        c.into(["c:y"], "Go");
        c.eq("rule 51", c.inner(["c:y"])?.memory.got, ["no:Rejected"]);
        c.eq("one request", c.reqs("put").length, 1);
        c.answer("put", { ok: {} });
        c.eq("its own", c.inner(["c:x"])?.memory.got, ["ok"]);
      },
      "a-late-fillings-target-may-not-leave-the-hosts-work"(c0) {
        const c = at(c0, lateFillFixture, LF);
        c.send("HostGo");
        c.into(["kid"], "Go");
        c.into(["kid"], "Move");
        c.answer("kidPut", { ok: {} });
        c.state("HOST");
        c.answer("hostPut", { ok: {} });
      },
      "a-resends-capture-is-awaited"(c0) {
        const c = at(c0, traitWriteFixture, TW);
        c.into(["t"], "Go");
        c.ack();
        c.answer("put", { lost: true });
        c.into(["t"], "Resend");
        c.eq(
          "D26: an awaited capture",
          c.r.outside().storage.some((s) => s.purpose === "capture"),
          true,
        );
        c.eq("no second request yet", c.reqs("put").length, 1);
        c.ack();
        c.eq("the same key", [c.reqs("put").length, c.keys("put").length], [2, 1]);
      },
    },
  },
];
void Mismatch;
