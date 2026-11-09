// Phase 1, record migration: what a persisted record becomes when the app ships a new release. Every expectation is the design's text (rule 46,
// rule 74, 2.2.2, 2.7.15, 2.7.17), worked out by hand before the runtime was changed; each variant names its rule.
import { Schema as S } from "effect";
import { actorRef, definition, ensureArgs, Flow, machine, resource, trait, transaction } from "../compile/index.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import type { Step } from "../harness.ts";
import { call, FakeApi, fixture, write } from "../typed/lab.ts";
import { LifeId, lifeFixture } from "../typed/lifetime.ts";
import { keyStampFixture } from "../typed/round13.ts";
import { CopiesId, copiesFixture, MemoId, memoFixture } from "../typed/phase1m.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const M = { actor: MemoId, id: "main" };
const KS = { actor: "Lab/KeyStamp", id: "a" };
const issued = (c: Ctx, code: string) => c.r.issues().filter((i) => i.code === code).length;
// Under Memo's release 1, a titled memo is saved and its answer is lost: the hold `{ memoId: m1 }`. Then release `to`, and the page boots again.
const memoAcross = (c0: Ctx, to: number) => {
  const rel: Release = { v: 1 };
  const c = memoHeld(c0, rel);
  c.h.release(() => void (rel.v = to), () => void (rel.v = 1));
  c.reload();
  return c;
};
const memoHeld = (c0: Ctx, rel: Release = { v: 1 }) => {
  const c = new Ctx(c0.fresh([memoFixture(rel)], { captureMs: 0 }), M);
  c.namedIssues = c0.namedIssues;
  c.ensure(M);
  c.send("Title", { title: "Groceries" });
  c.send("Body", { body: "milk eggs bread" });
  c.send("Save");
  c.ack();
  c.answer("save", { lost: true });
  c.eq("release 1: sent, its answer lost, the hold heard", [c.r.state(M), c.mem().unsure, c.reqs("save").length], ["SENT", 1, 1]);
  return c;
};
// Under KeyStamp's release 1, hold `{ k: a }` unsure; then release `to`, and the page boots again.
const holdAcross = (c0: Ctx, to: number) => {
  const rel: Release = { v: 1 };
  const c = new Ctx(c0.fresh([keyStampFixture(rel)], { captureMs: 0 }), KS);
  c.namedIssues = c0.namedIssues;
  c.ensure(KS);
  c.send("Go", { k: "a" });
  c.ack();
  c.answer("charge", { lost: true });
  c.h.release(() => void (rel.v = to), () => void (rel.v = 1));
  c.reload();
  return c;
};
// Round 3. `Lab/P1MProbe`: a persisted singleton with one write op over the contract `p1m/probe`, whose op name and key Schema a release may change.
const PP = { actor: "Lab/P1MProbe", id: "main" };
// `other`: a second write op of that name over another contract, `p1m/other`, fired by `GoOther`.
// `peek`: a read op of that name over the same contract `p1m/probe` (audit M2 survivor 11: a rename moves to the one WRITE op over the contract).
const probeOps = (name: string, k: S.Top, other?: string, peek?: string) => {
  const op = transaction({ id: "p1m/probe", input: { k }, key: ["k"], concurrency: "reject", services: [FakeApi], commit: write(name) });
  const op2 = transaction({ id: "p1m/other", input: { k: S.String }, key: ["k"], concurrency: "reject", services: [FakeApi], commit: write(other ?? "other") });
  const rd = resource({ id: "p1m/probe", input: { k }, key: ["k"], services: [FakeApi], lookup: (i: unknown) => call("peek")(i) } as never) as any;
  const outcomes = (E: any) => ({ success: E.Ok, failure: { NotSent: E.No.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.Unsure });
  const d = definition({
    id: PP.actor,
    persist: true,
    states: [],
    events: { Go: { k: S.Unknown }, GoOther: { k: S.Unknown } },
    internalEvents: { Ok: {}, No: { why: S.String }, Unsure: Flow.uncertain({}) },
    memory: { unsure: Flow.initial(S.Number, 0), why: Flow.initial(S.String, "") },
    operations: ({ E }) => ({ [name]: op.outcomes(outcomes(E)), ...(other ? { [other]: op2.outcomes(outcomes(E)) } : {}), ...(peek ? { [peek]: rd.outcomes({ success: E.Ok, failure: {} }) } : {}) }),
  } as never);
  type H = { readonly commit: (f: (a: { readonly event: { readonly k: unknown } }) => unknown) => never };
  return machine(d, ({ O }: { O: Record<string, H> }) => ({
    default: { node: "root" },
    on: {
      Go: { actions: [O[name]!.commit(({ event }) => ({ k: event.k }))] },
      GoOther: other ? { actions: [O[other]!.commit(({ event }) => ({ k: event.k }))] } : {},
      Ok: {},
      No: { updateMemory: ({ event }: { event: { why: string } }) => ({ why: event.why }) },
      Unsure: { updateMemory: ({ memory }: { memory: { unsure: number } }) => ({ unsure: memory.unsure + 1 }) },
    },
  }) as never);
};
// Under release 1 (`a`), hold `{ k }` unsure; then release 2 (`b`), and the page boots again.
const probeAcross = (c0: Ctx, a: () => unknown, b: () => unknown, k: unknown) => {
  const rel: Release = { v: 1 };
  const A = a();
  const B = b();
  const c = new Ctx(c0.fresh([fixture(() => (rel.v === 1 ? A : B) as never)], { captureMs: 0 }), PP);
  c.namedIssues = c0.namedIssues;
  c.ensure(PP);
  c.send("Go", { k });
  c.ack();
  c.answer("pay", { lost: true });
  c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
  c.reload();
  return c;
};
// `Lab/P1MVal`: a persisted machine named by its value `t`, a string in release 1 and a `NumberFromString` in release 2 (rule 74's versions).
const valueMachine = (v: number) => {
  const save = transaction({ id: "p1m/vsave", input: { t: S.String }, key: ["t"], concurrency: "reject", services: [FakeApi], commit: write("save") });
  const d = definition({
    id: "Lab/P1MVal",
    persist: true,
    states: [],
    events: { Go: {} },
    internalEvents: { Ok: {}, No: { why: S.String }, Unsure: Flow.uncertain({}) },
    memory: { t: Flow.input(v === 1 ? S.String : S.NumberFromString), unsure: Flow.initial(S.Number, 0) },
    operations: ({ E }) => ({ save: save.outcomes({ success: E.Ok, failure: { NotSent: E.No.from((r: { why: string }) => ({ why: r.why })) }, unknown: E.Unsure }) }),
  } as never);
  type Hs = { readonly save: { readonly commit: (f: (a: { readonly memory: { readonly t: unknown } }) => unknown) => never } };
  return machine(d, ({ O }: { O: Hs }) => ({
    default: { node: "root" },
    on: {
      Go: { actions: [O.save.commit(({ memory }) => ({ t: String(memory.t) }))] },
      Ok: {},
      No: {},
      Unsure: { updateMemory: ({ memory }: { memory: { unsure: number } }) => ({ unsure: memory.unsure + 1 }) },
    },
  }) as never);
};
const ensureStep = (a: ReturnType<typeof ensureArgs>): Step => ({ ensure: { actor: a.machine, id: a.id }, ...(a.input === undefined ? {} : { input: a.input }), ...(a.identity ? { identity: a.identity } : {}) });
// `Lab/P1MFrags`: one `.each` copy of a trait with states A and B. Release 1's memory has `got` and `extra`; release 2 stops declaring `extra` (a
// compatible change); release 3 keeps `got` under another Schema (incompatible, a fragment field); release 4 removes B (incompatible for a copy in B).
const FragsId = "Lab/P1MFrags";
const fragsFixture = (rel: Release) => {
  const mk = (v: number) =>
    machine(
      definition({
        id: FragsId,
        persist: true,
        states: [],
        events: {},
        internalEvents: {},
        memory: { ids: Flow.initial(S.Array(S.String), ["x"]) },
        traits: {
          c: trait(
            {
              id: "P1MFrag",
              states: v === 4 ? ["A"] : ["A", "B"],
              default: "A",
              events: { Go: {}, Move: {} },
              internalEvents: {},
              memory: { got: v === 3 ? Flow.initial(S.String, "0") : Flow.initial(S.Number, 0), ...(v === 1 ? { extra: Flow.initial(S.Number, 5) } : {}) },
              operations: () => ({}),
            } as never,
            ({ S: St }: { S: Record<string, unknown> }) =>
              ({
                on: { Go: { updateMemory: ({ memory }: { memory: { got: number } }) => ({ got: v === 3 ? memory.got : memory.got + 1 }) } },
                ...(v === 4 ? {} : { states: { A: { on: { Move: St["B"] } } } }),
              }) as never,
          ).each({ of: "ids", max: 8 }),
        },
        operations: () => ({}),
      } as never),
      () => ({ default: { node: "root" } }) as never,
    );
  const made = [mk(1), mk(2), mk(3), mk(4)];
  return fixture(() => made[rel.v - 1] as never);
};
// `Lab/P1MHist`: P with children X and Y, and Q. Leaving P from Y records P's history as Y; release 2 removes Y (audit M2's break 3).
const HistId = "Lab/P1MHist";
const histFixture = (rel: Release) => {
  const mk = (v: number) =>
    machine(
      definition({ id: HistId, persist: true, states: [{ P: v === 1 ? ["X", "Y"] : ["X"] }, "Q"], events: { ToY: {}, Leave: {} }, internalEvents: {}, memory: { n: Flow.initial(S.Number, 0) }, operations: () => ({}) } as never),
      ({ S: St }: { S: any }) =>
        ({ default: St.P, on: { Leave: St.Q, ...(v === 1 ? { ToY: St.P.Y } : {}) }, states: { P: { default: St.P.X } } }) as never,
    );
  const made = [mk(1), mk(2)];
  return fixture(() => made[rel.v - 1] as never);
};
// `Lab/P1MTimer`: DIRTY arms a 500 ms deadline whose `Due` the root hears; release 2 keeps `n` under another Schema (an incompatible change).
const TimerId = "Lab/P1MTimer";
const timerFixture = (rel: Release) => {
  const mk = (v: number) => {
    const d = definition({
      id: TimerId,
      persist: true,
      states: ["IDLE", "DIRTY"],
      events: { Edit: {} },
      internalEvents: { Due: {} },
      memory: { n: v === 1 ? Flow.initial(S.Number, 0) : Flow.initial(S.String, ""), log: Flow.initial(S.Array(S.String), []) },
      operations: () => ({}),
    } as never);
    return machine(d, ({ S: St, E }: { S: any; E: any }) =>
      ({
        default: St.IDLE,
        on: { Edit: St.DIRTY, Due: { updateMemory: ({ memory }: { memory: { log: readonly string[] } }) => ({ log: [...memory.log, "due"] }) } },
        states: { DIRTY: { schedules: { save: { schedule: "500 millis", send: E.Due, armOn: ["entry"] } } } },
      }) as never,
    );
  };
  const made = [mk(1), mk(2)];
  return fixture(() => made[rel.v - 1] as never);
};
// A record as Flow's record format 1 spelled it: untagged, a lane's id stored beside the actor, op and key it is made of, no contract, identity or
// saved shape (audit M2 survivor 10: such a record is never reset, Q1 A's stated limit).
const format1 = (raw: string) => {
  const v = JSON.parse(raw) as Record<string, unknown>;
  const { format: _f, contract: _c, identity: _i, shape: _s, ...rest } = v;
  return JSON.stringify(typeof v["op"] === "string" ? { ...rest, id: `${v["actor"]}|${v["op"]}|${JSON.stringify(v["key"])}` } : rest);
};
const refusal = (f: () => unknown) => {
  try {
    f();
    return "";
  } catch (e) {
    return String((e as Error).message).split(":")[0];
  }
};

export const phase1mScenarios: readonly Scenario[] = [
  {
    id: "P1-M",
    kind: "fault",
    fixtures: [memoFixture({ v: 1 })],
    actor: M,
    cites: ["rule:46", "rule:74", "sec:2.2.2", "sec:2.7.15", "sec:2.7.17"],
    namedIssues: ["OldVersionLane", "RecordQuarantined", "FieldDropped", "HoldWithoutRecord", "RecordShapeChanged", "LaneRekeyCollision"],
    variants: {
      // The real path, release 1's records met by release 2 across a reload, with the fake storage:
      // - The user's decision (migration Q1 A, automatic per definition): release 2 changes `title`'s Schema, a field both releases keep, so Memo's
      //   saved shape changed incompatibly: its saved memory and state are discarded and the actor starts fresh, with `RecordShapeChanged` naming
      //   the definition. "Writes in flight always kept": the lane, its hold and its ending survive, unbound until the ensure adopts them.
      // - 2.7.15: release 2 keys `save` by `memoId` and `rev`, so the saved lane is an old-version hold, "reported at each boot (`OldVersionLane`, an
      //   issue)"; "every commit of that operation for that actor declines `NotSent { OldVersion }`"; `previous[0].cancel(k)` names it by its own key.
      // - 2.7.13's restore row: the hold is heard once more, as `unknown { Restored }`, by the fresh actor.
      "release-1-records-restore-under-release-2-across-a-reload"(c0) {
        const c = memoAcross(c0, 2);
        c.eq("the shape change said once, naming Memo; the old hold an issue; nothing dropped (nothing restored)", [c.r.issues().filter((i) => i.code === "RecordShapeChanged").map((i) => (i.input as { definition?: string })?.definition), issued(c, "OldVersionLane"), issued(c, "FieldDropped")], [["Lab/Memo"], 1, 0]);
        c.ensure(M);
        c.eq("a fresh actor: new memory, its initial state, the hold heard", [c.mem(), c.r.state(M)], [{ title: { text: "", lang: "en" }, body: "", words: 0, unsure: 1, why: "", saved: 0, edits: 0 }, "DRAFT"]);
        c.send("Save");
        c.eq("a commit under the new key declines beside the old hold", [c.mem().why, c.reqs("save").length], ["OldVersion", 1]);
        c.send("Abandon");
        c.send("Save");
        c.ack();
        c.eq("previous[0].cancel lets the old hold go; the new key sends", [c.reqs("save").length, c.reqs("save").at(-1)?.input], [2, { memoId: "m1", rev: "1", body: "" }]);
        c.answer("save", { ok: {} });
        c.reload();
        c.ensure(M);
        c.eq("the next boot: nothing reset again, no old hold, and the fresh actor restores", [issued(c, "RecordShapeChanged"), issued(c, "OldVersionLane"), c.mem().saved], [1, 1, 1]);
      },
      // 2.7.15: "`O.x.previous[i].retry(k)` ... naming the old lanes by their own keys". The old hold goes out again, as the same Attempt.
      "previous-retry-re-sends-the-old-hold-as-the-same-attempt"(c0) {
        const c = memoAcross(c0, 2);
        c.ensure(M);
        c.send("Resend");
        c.ack();
        c.eq("re-sent with its own id and body", [c.reqs("save").length, c.keys("save").length, c.reqs("save").at(-1)?.input], [2, 1, { memoId: "m1", body: "milk eggs bread" }]);
      },
      // The user's decision (migration Q1 A): a state removed is an incompatible shape change: the definition's saved memory and state are discarded at
      // the boot (`RecordShapeChanged`), nothing is quarantined, and the actor starts fresh. Writes in flight survive: the held lane, unbound until
      // adopted (rule 46), is said (`HoldWithoutRecord`, round 2's ruling), heard by the fresh actor, and still holds its key.
      "a-state-a-release-removed-resets-the-definition-and-an-ensure-adopts-the-hold"(c0) {
        const c = memoAcross(c0, 3);
        c.eq("reset at the boot, nothing quarantined, its hold said", [issued(c, "RecordShapeChanged"), issued(c, "RecordQuarantined"), issued(c, "HoldWithoutRecord")], [1, 0, 1]);
        c.eq("the saved record is gone", c.record(M), undefined);
        c.ensure(M);
        c.eq("fresh, the hold heard", [c.r.state(M), c.mem().title, c.mem().unsure], ["DRAFT", "", 1]);
        c.send("Save");
        c.eq("the adopted hold still holds its key", [c.mem().why, c.reqs("save").length], ["Rejected", 1]);
      },
      // The same for a memory field both releases keep, reshaped (release 4's title is a struct): its Schema version changed, so the definition resets.
      "a-memory-field-reshaped-resets-the-definition"(c0) {
        const c = memoAcross(c0, 4);
        c.eq("reset at the boot, nothing quarantined, its hold said", [issued(c, "RecordShapeChanged"), issued(c, "RecordQuarantined"), issued(c, "HoldWithoutRecord")], [1, 0, 1]);
        c.ensure(M);
        c.eq("fresh, the hold heard", [c.r.state(M), c.mem().title, c.mem().unsure], ["DRAFT", { text: "", lang: "en" }, 1]);
      },
      // The same decision, the compatible side: release 5 stops declaring `legacy` and adds a computed `words`, so Memo's shape changed compatibly.
      // The record restores field by field (2.2.2): `legacy` dropped with `FieldDropped`, `words` "runs its computed initial over the restored
      // fields", in its saved leaf; nothing resets.
      "a-compatible-shape-change-restores-and-decodes-by-field"(c0) {
        const c = memoAcross(c0, 5);
        c.eq("no reset, legacy dropped", [issued(c, "RecordShapeChanged"), issued(c, "FieldDropped")], [0, 1]);
        c.ensure(M);
        c.eq("restored in its leaf, with its memory (decoded by each field's codec), words computed, the hold heard again", [c.r.state(M), c.mem().title, c.mem().body, c.mem().edits, c.mem().words, c.mem().unsure], ["SENT", "Groceries", "milk eggs bread", 1, 3, 2]);
      },
      // The same decision: "Other definitions are untouched". KeyStamp, in the same release, keeps its memory while Memo resets.
      "only-the-definition-whose-shape-changed-resets"(c0) {
        const rel: Release = { v: 1 };
        const c = new Ctx(c0.fresh([memoFixture(rel), keyStampFixture({ v: 1 })], { captureMs: 0 }), M);
        c.namedIssues = c0.namedIssues;
        c.ensure(M);
        c.send("Title", { title: "Groceries" });
        c.ensure(KS);
        c.to(KS, "Go", { k: "a" });
        c.ack();
        c.answer("charge", { ok: {} });
        c.h.release(() => void (rel.v = 4), () => void (rel.v = 1));
        c.reload();
        c.eq("one reset, Memo's", c.r.issues().filter((i) => i.code === "RecordShapeChanged").map((i) => (i.input as { definition?: string })?.definition), ["Lab/Memo"]);
        c.ensure(M);
        c.ensure(KS);
        c.eq("Memo fresh, KeyStamp restored", [c.mem().title, c.mem(KS)?.oks], [{ text: "", lang: "en" }, 1]);
      },
      // 2.7.15: an old-version hold is "never renamed or matched against a new key". Release 4 makes `k` a `Trim`: the current handle's key `{ k: a }`
      // has the old key's text, and still names no old-version lane; `previous[0].cancel` does.
      "a-current-keyed-member-never-names-an-old-version-hold-even-by-the-same-text"(c0) {
        const c = holdAcross(c0, 4);
        c.send("Cancel", { k: "a" });
        c.send("Go", { k: "b" });
        c.eq("not let go: a commit still declines", [c.mem(KS)?.why, c.reqs("charge").length], ["OldVersion", 1]);
        c.send("OldCancel", { k: "a" });
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("previous[0].cancel lets it go; then a commit sends", c.reqs("charge").length, 2);
      },
      // The converse (2.7.15: `previous[i]` names "the old lanes"): a previous member given a current lane's text names nothing.
      "a-previous-member-names-only-a-lane-of-its-own-version"(c0) {
        const c = holdAcross(c0, 4);
        c.send("OldCancel", { k: "a" });
        c.send("Go", { k: "b" });
        c.ack();
        c.answer("charge", { lost: true });
        c.send("OldCancel", { k: "b" });
        c.send("Go", { k: "b" });
        c.eq("the current hold stands: its own key is busy", [c.mem(KS)?.why, c.reqs("charge").length], ["Rejected", 2]);
      },
      // Rule 74 and 2.7.15's format tag: "a change to Flow's encoding is a migration Flow owes, never a new version of the user's machine, and the
      // tag tells an old record from a new one". Phase 1 migration round 2 (the runner's, proposed): every record carries Flow's record format;
      // format 2 stores a lane's id once, as the record's key (format 1 stored it beside the actor, op and key it is made of). Round 3: format 3
      // adds the lane's contract id (2.7.15: a lane is (actor identity, contract id, key)); format 4 adds the actor record's saved shape (Q1 A).
      "every-record-flow-writes-says-its-record-format"(c0) {
        const c = memoHeld(c0);
        const lane = [...c.r.stored()].find(([k]) => c.r.diskKind(k) === "lane")?.[1] as Record<string, unknown> | undefined;
        c.eq("actor and lane records in format 4; the lane stores its contract and no id of its own; the actor its shape", [c.record(M)?.format, lane?.["format"], lane?.["contract"], lane !== undefined && "id" in lane, Array.isArray(c.record(M)?.shape?.fields)], [4, 4, "memo/save", false, true]);
      },
      // The same: Flow reads every older format it wrote, by a pure upgrade at the boot. A format 1 record (untagged, the lane's id stored) restores
      // as the hold it is: the hold is heard again and still holds its key.
      "a-record-flow-wrote-in-format-1-restores-as-it-was"(c0) {
        const c = memoHeld(c0);
        c.fault({ corruptStored: { match: "Memo", edit: format1 } });
        c.reload();
        c.ensure(M);
        c.eq("restored in its leaf, its memory, the hold heard again", [c.r.state(M), c.mem().title, c.mem().unsure, issued(c, "RecordQuarantined")], ["SENT", "Groceries", 2, 0]);
        c.send("Save");
        c.eq("the hold still holds its key", [c.mem().why, c.reqs("save").length], ["Rejected", 1]);
      },
      // The same, the other way (rule 74: "a format newer than the running Flow's (a downgrade) reads as an old version", for a version entry): a
      // record of a newer record format than this Flow's is never misread. It is quarantined; the lane's id still holds its key (rule 46, D88).
      "a-record-of-a-newer-flow-record-format-is-quarantined-and-its-lane-still-holds"(c0) {
        const c = memoHeld(c0);
        c.fault({ corruptStored: { match: "Memo", edit: (raw: string) => raw.replace('"format":4', '"format":5') } });
        c.reload();
        c.eq("both quarantined", issued(c, "RecordQuarantined"), 2);
        c.ensure(M);
        c.eq("fresh, nothing heard", [c.r.state(M), c.mem().unsure], ["DRAFT", 0]);
        c.send("Save");
        c.eq("the key still held", [c.mem().why, c.reqs("save").length], ["Rejected", 1]);
      },
      // The runner's ruling (round 2): `previous[i].retryable(k, { times })` exists, as on the current handle, and sees only lanes of its version.
      "previous-retryable-sees-the-old-hold-and-retry-re-sends-it"(c0) {
        const c = holdAcross(c0, 2);
        c.send("OldRetryable", { k: "a" });
        c.ack();
        c.eq("yes, and re-sent", [c.mem(KS)?.notRetryable, c.reqs("charge").length], [0, 2]);
      },
      // The runner's ruling (round 2): on a fragment op, authority before version. `y`'s commit meets `x`'s old-version hold from another subject:
      // rule 51 declines it `Rejected`; `x`'s own commit declines `OldVersion` (2.7.15).
      "on-a-fragment-op-another-subjects-commit-is-rejected-before-the-old-version-check"(c0) {
        const rel: Release = { v: 1 };
        const CP = { actor: CopiesId, id: "a" };
        const c = new Ctx(c0.fresh([copiesFixture(rel)], { captureMs: 0 }), CP);
        c.namedIssues = c0.namedIssues;
        c.ensure(CP);
        c.into(["c:x"], "Go");
        c.ack();
        c.answer("put", { lost: true });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.ensure(CP);
        c.into(["c:y"], "Go");
        c.into(["c:x"], "Go");
        c.eq("y Rejected (rule 51), x OldVersion", [c.inner(["c:y"])?.memory.got, (c.inner(["c:x"])?.memory.got as string[] | undefined)?.at(-1), c.reqs("put").length], [["no:Rejected"], "no:OldVersion", 1]);
      },
      // ── Round 3 (the migration audit's gaps). 2.7.15: "So renaming an operation (`pay` to `charge`) changes nothing persisted"; a write lane is
      // "stored under (actor identity, contract id, key)". The held lane is the renamed op's: heard again, still holding its key, one record.
      "renaming-an-operation-changes-nothing-persisted"(c0) {
        const c = probeAcross(c0, () => probeOps("pay", S.String), () => probeOps("charge", S.String), "a");
        c.eq("nothing quarantined", issued(c, "RecordQuarantined"), 0);
        c.ensure(PP);
        c.send("Go", { k: "a" });
        c.eq("the hold heard again and still holding its key", [c.mem(PP)?.unsure, c.mem(PP)?.why, c.reqs("pay").length + c.reqs("charge").length], [2, "Rejected", 1]);
        c.reload();
        c.eq("one lane record, under the new name", [c.laneKeys().length, c.laneKeys().every((k) => k.includes("|charge|")), issued(c, "RecordQuarantined")], [1, true, 0]);
      },
      // The same rule, the other way (the reviewer's): release 2 renames `pay` to `charge` and adds a new `pay` over another contract. The held lane
      // is `charge`'s, its contract's; the new `pay` is another server thing and sends.
      "a-new-op-of-the-old-name-over-another-contract-does-not-take-the-lane"(c0) {
        const c = probeAcross(c0, () => probeOps("pay", S.String), () => probeOps("charge", S.String, "pay"), "a");
        c.ensure(PP);
        c.send("GoOther", { k: "a" });
        c.ack();
        c.send("Go", { k: "a" });
        c.eq("the new pay sends; charge's key is held", [c.reqs("pay").length, c.mem(PP)?.why, c.reqs("charge").length], [2, "Rejected", 0]);
      },
      // Rule 74: "A saved record of another field set is an old-version record ... Its non-`Idle` lanes stay unbound and listed (rule 44), since no ref
      // can spell its identity." Release 2 makes `t` a `NumberFromString`; the new value 42 names an actor with release 1's name text "42". The new
      // identity does not hear the old identity's hold.
      "a-new-version-actor-of-the-same-name-text-does-not-hear-the-old-hold"(c0) {
        const rel: Release = { v: 1 };
        const A = valueMachine(1);
        const B = valueMachine(2);
        const r1 = actorRef(A, { t: "42" } as never);
        const r2 = actorRef(B, { t: 42 } as never);
        const a2 = { actor: r2.machine, id: r2.id };
        const c = new Ctx(c0.fresh([fixture(() => (rel.v === 1 ? A : B))], { captureMs: 0 }), { actor: r1.machine, id: r1.id });
        c.namedIssues = c0.namedIssues;
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Go");
        c.ack();
        c.answer("save", { lost: true });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("the same name text; an old-version record, its lane unbound", [r2.id === r1.id, c.r.evidence("OldVersionActor").length, c.r.evidence("UnboundLane").length], [true, 1, 1]);
        c.do(ensureStep(ensureArgs(r2)));
        c.eq("the new identity did not hear the old hold", c.r.memory(a2)?.unsure, 0);
        c.reload();
        c.eq("and at the next boot the old lane is still unbound", c.r.evidence("UnboundLane").length, 2);
        // Audit M2 item 12: the old hold's restored ending comes again at this boot, and still never reaches the new identity.
        c.do(ensureStep(ensureArgs(r2)));
        c.eq("after the second boot the new identity has still heard nothing of it", c.r.memory(a2)?.unsure, 0);
      },
      // The runner's Q17 ruling (rule 74; 2.7.15 "(actor identity, contract id, key)"): the new identity on the same key gets its own lane. Its commit
      // neither declines against nor queues behind the old identity's hold; it sends, and its own ending reaches it. The old hold is kept and listed.
      "a-new-identity-of-the-same-name-text-gets-its-own-lane"(c0) {
        const rel: Release = { v: 1 };
        const A = valueMachine(1);
        const B = valueMachine(2);
        const r1 = actorRef(A, { t: "42" } as never);
        const r2 = actorRef(B, { t: 42 } as never);
        const a2 = { actor: r2.machine, id: r2.id };
        const c = new Ctx(c0.fresh([fixture(() => (rel.v === 1 ? A : B))], { captureMs: 0 }), { actor: r1.machine, id: r1.id });
        c.namedIssues = c0.namedIssues;
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Go");
        c.ack();
        c.answer("save", { lost: true });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.do(ensureStep(ensureArgs(r2)));
        c.to(a2, "Go");
        c.ack();
        c.eq("the new identity's commit is sent, not declined", c.reqs("save").length, 2);
        c.answer("save", { lost: true });
        c.eq("its own ending reaches it", c.r.memory(a2)?.unsure, 1);
        c.reload();
        c.eq("both lanes on disk; the old one listed unbound again", [c.laneKeys().length, c.r.evidence("UnboundLane").length], [2, 2]);
      },
      // Round 2's ruling, kept standing: "a newer, null or non-integer format is quarantined, never misread". Each of null, 2.5 and "2".
      "a-null-fractional-or-string-record-format-is-quarantined"(c0) {
        for (const bad of ["null", "2.5", '"2"']) {
          const c = memoHeld(c0);
          c.fault({ corruptStored: { match: "Memo", edit: (raw: string) => raw.replace('"format":4', `"format":${bad}`) } });
          c.reload();
          c.eq(`format ${bad}: both quarantined`, issued(c, "RecordQuarantined"), 2);
        }
      },
      // Rule 46: "each Attempt carries its `retryCount`"; a format 1 record restores as it was. Two re-sends before the reload; `retryable({ times: 3 })`
      // allows one more after it.
      "a-format-1-lane-keeps-its-retry-count"(c0) {
        const rel: Release = { v: 1 };
        const c = new Ctx(c0.fresh([keyStampFixture(rel)], { captureMs: 0 }), KS);
        c.namedIssues = c0.namedIssues;
        c.ensure(KS);
        c.send("Go", { k: "a" });
        c.ack();
        c.answer("charge", { lost: true });
        for (let i = 0; i < 2; i++) {
          c.send("Retry", { k: "a" });
          c.ack();
          c.answer("charge", { lost: true });
        }
        c.fault({ corruptStored: { match: "KeyStamp", edit: format1 } });
        c.reload();
        c.ensure(KS);
        for (let i = 0; i < 2; i++) {
          c.send("Retryable", { k: "a" });
          c.ack();
          c.tryAnswer("charge", { lost: true });
        }
        c.eq("one re-send left of three", [c.mem(KS)?.notRetryable, c.reqs("charge").length], [1, 4]);
      },
      // Rule 73 (a waiting deadline is in the record) and D1 (an end's stopped reads are heard as Interrupted at the return): a format 1 actor record
      // restores both.
      "a-format-1-actor-record-keeps-its-timers-and-stopped-reads"(c0) {
        const X = { actor: LifeId, id: "a" };
        const Y = { actor: LifeId, id: "b" };
        const c = new Ctx(c0.fresh([lifeFixture()]), X);
        c.namedIssues = c0.namedIssues;
        c.ensure(X);
        c.ensure(Y);
        c.to(X, "Look");
        c.to(Y, "Edit");
        c.detach(X);
        c.detach(Y);
        c.advance(100);
        c.eq("both ended: a read open, a deadline waiting", [c.r.state(X), c.r.state(Y)], [undefined, undefined]);
        c.do({ hide: true });
        c.fault({ corruptStored: { match: "actor/", edit: format1 } });
        c.reload();
        c.advance(5_000);
        c.ensure(X);
        c.ensure(Y);
        c.advance(0);
        const log = (a: typeof X) => (c.r.memory(a) as { log?: readonly string[] } | undefined)?.log ?? [];
        c.eq("the stopped read heard as Interrupted, the deadline fired once", [log(X), log(Y), issued(c, "RecordQuarantined")], [["lookFailed"], ["saveDue"], 0]);
      },
      // Round 2's ruling: `previous[i].retryable(k, { times })` "as on the current handle": three re-sends, then no.
      "previous-retryable-keeps-its-budget"(c0) {
        const c = holdAcross(c0, 2);
        for (let i = 0; i < 4; i++) {
          c.send("OldRetryable", { k: "a" });
          c.ack();
          c.tryAnswer("charge", { lost: true });
        }
        c.eq("three re-sends, then no", [c.mem(KS)?.notRetryable, c.reqs("charge").length], [1, 4]);
      },
      // Round 2's ruling: "a field a release stops declaring is dropped with FieldDropped"; a fragment's memory is memory (2.2.2 is for both).
      "a-fragment-field-a-release-stops-declaring-is-said"(c0) {
        const rel: Release = { v: 1 };
        const F = { actor: FragsId, id: "main" };
        const c = new Ctx(c0.fresh([fragsFixture(rel)], { captureMs: 0 }), F);
        c.namedIssues = c0.namedIssues;
        c.ensure(F);
        c.into(["c:x"], "Go");
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("said once", issued(c, "FieldDropped"), 1);
        c.ensure(F);
        c.eq("the rest restored", (c.inner(["c:x"])?.memory as { got?: number } | undefined)?.got, 1);
      },
      // Round 2 (the reviewer's, accepted): no FieldDropped for a record that is then quarantined (2.7.17: it is never restored). Release 5 only
      // drops `legacy` (a compatible change, Q1 A), so the record goes down the restore path and its unreadable stopped list quarantines it.
      "no-field-dropped-for-a-record-then-quarantined"(c0) {
        const rel: Release = { v: 1 };
        const c = memoHeld(c0, rel);
        c.h.release(() => void (rel.v = 5), () => void (rel.v = 1));
        c.fault({ corruptStored: { match: "actor/", edit: (raw: string) => raw.replace("{", '{"stopped":5,') } });
        c.reload();
        c.eq("quarantined, nothing dropped said", [issued(c, "RecordQuarantined"), issued(c, "FieldDropped")], [1, 0]);
      },
      // Round 2's ruling (HoldWithoutRecord), with 2.7.13's restore row ("an Attempt acknowledged once is delivered as `unknown { Restored }` ...
      // `Held`"): a head on the wire at the reload restores as a hold, so on a gone record it is said too.
      "an-in-flight-head-on-a-gone-record-is-said"(c0) {
        const rel: Release = { v: 1 };
        const c = new Ctx(c0.fresh([memoFixture(rel)], { captureMs: 0 }), M);
        c.namedIssues = c0.namedIssues;
        c.ensure(M);
        c.send("Body", { body: "x" });
        c.send("Save");
        c.ack();
        c.eq("sent, no answer", c.reqs("save").length, 1);
        c.fault({ corruptStored: { match: "actor/", edit: () => "{{{" } });
        c.reload();
        c.eq("a record the boot cannot read, its hold said", [issued(c, "RecordQuarantined"), issued(c, "HoldWithoutRecord")], [1, 1]);
        c.ensure(M);
        c.eq("an ensure starts fresh (rule 46) and the adopted hold is heard", [c.r.evidence("RecordUndecodable").length, c.mem().unsure], [1, 1]);
      },
      // 2.7.17: "An ensure over a record that no longer decodes starts fresh ... and creates from input"; a persisted identity's record is saved, so
      // the next boot restores the fresh actor and quarantines nothing again. The record is bytes the boot cannot read (not a shape change, which
      // Q1 A resets at the boot instead).
      "the-fresh-actor-over-a-quarantined-record-is-saved"(c0) {
        const c = memoHeld(c0);
        c.fault({ corruptStored: { match: "actor/", edit: () => "{{{" } });
        c.reload();
        c.ensure(M);
        c.send("Title", { title: "Fresh" });
        const onDisk = () => {
          try {
            return (c.record(M) as { root?: { memory?: { title?: unknown } } } | undefined)?.root?.memory?.title;
          } catch {
            return "the unreadable bytes";
          }
        };
        c.eq("the fresh actor's record is on disk", onDisk(), "Fresh");
        c.reload();
        c.ensure(M);
        c.eq("restored, no second quarantine", [c.mem().title, issued(c, "RecordQuarantined")], ["Fresh", 1]);
      },
      // Rule 74 / 2.7.15 (U17 B): a key field's version is its type side and its encoded side. `Number` to `NumberFromString` keeps the type side.
      "a-key-field-changing-only-its-encoded-side-is-a-new-version"(c0) {
        const c = probeAcross(c0, () => probeOps("pay", S.Number), () => probeOps("pay", S.NumberFromString), 1);
        c.eq("an old-version hold", issued(c, "OldVersionLane"), 1);
        c.ensure(PP);
        c.send("Go", { k: 1 });
        c.eq("declines OldVersion", c.mem(PP)?.why, "OldVersion");
      },
      // The same ruling, a release reverted (the reviewer's): release 3 is release 1 again, so the identity that minted the hold is current again and its
      // lane is its key's lane: the hold is heard by it and its own commit on that key meets it, never a second lane for one (identity, contract, key).
      "an-identity-current-again-takes-its-lane-back"(c0) {
        const rel: Release = { v: 1 };
        const A = valueMachine(1);
        const B = valueMachine(2);
        const r1 = actorRef(A, { t: "42" } as never);
        const r2 = actorRef(B, { t: 42 } as never);
        const a1 = { actor: r1.machine, id: r1.id };
        const c = new Ctx(c0.fresh([fixture(() => (rel.v === 2 ? B : A))], { captureMs: 0 }), a1);
        c.namedIssues = c0.namedIssues;
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Go");
        c.ack();
        c.answer("save", { lost: true });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.do(ensureStep(ensureArgs(r2)));
        c.eq("under release 2 the old hold is filed apart from the new identity's key", c.laneKeys().some((k) => k.includes("#")), true);
        c.h.release(() => void (rel.v = 3), () => void (rel.v = 2));
        c.reload();
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Go");
        c.ack();
        // Its saved record was replaced by release 2's identity (a fresh ensure over an old-version record overwrites it), so it starts fresh.
        c.eq("the hold is the identity's again: heard once, its key busy, one lane", [c.r.memory(a1)?.unsure, c.reqs("save").length, c.laneKeys().length], [1, 1, 1]);
      },
      // ── The closing batch (audit M2). Break 2, the runner's ruling: a rename never moves onto a lane already on disk. Release 1 holds `pay` over
      // `p1m/probe` and `charge` over `p1m/other` on `k: a`; release 2 has only `charge` over `p1m/probe`. `charge`'s old lane (its contract gone) and
      // `pay`'s (whose move would land on it) both stay quarantined with their holds (rule 46), and the collision is said.
      "a-rename-onto-a-lane-already-on-disk-keeps-both-quarantined-and-says-so"(c0) {
        const rel: Release = { v: 1 };
        const A = probeOps("pay", S.String, "charge");
        const B = probeOps("charge", S.String);
        const c = new Ctx(c0.fresh([fixture(() => (rel.v === 1 ? A : B) as never)], { captureMs: 0 }), PP);
        c.namedIssues = c0.namedIssues;
        c.ensure(PP);
        c.send("Go", { k: "a" });
        c.ack();
        c.answer("pay", { lost: true });
        c.send("GoOther", { k: "a" });
        c.ack();
        c.answer("charge", { lost: true });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("the collision said, both quarantined, both records kept", [issued(c, "LaneRekeyCollision"), issued(c, "RecordQuarantined"), c.laneKeys().length], [1, 2, 2]);
        c.ensure(PP);
        c.send("Go", { k: "a" });
        c.eq("the key stays held: nothing sent", [c.mem(PP)?.why, c.reqs("charge").length + c.reqs("pay").length], ["Rejected", 2]);
      },
      // Break 3, with Q1 A ("a saved state goes away"): a history target is a saved state. Leaving P from Y records Y; release 2 removes Y. The record
      // resets; nothing is quarantined.
      "a-removed-state-a-history-points-to-resets-the-record"(c0) {
        const rel: Release = { v: 1 };
        const H = { actor: HistId, id: "main" };
        const c = new Ctx(c0.fresh([histFixture(rel)], { captureMs: 0 }), H);
        c.namedIssues = c0.namedIssues;
        c.ensure(H);
        c.send("ToY");
        c.send("Leave");
        c.eq("in Q, P's history Y", c.r.state(H), "Q");
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("reset, not quarantined", [issued(c, "RecordShapeChanged"), issued(c, "RecordQuarantined")], [1, 0]);
      },
      // Survivor 5 (Q1 A; 2.2.2 "for fragments and machines alike"): a fragment's kept field under another Schema version resets the record that
      // places it (the record is the unit, the runner's Q19 ruling).
      "a-fragment-field-under-another-schema-resets-the-record"(c0) {
        const rel: Release = { v: 1 };
        const F = { actor: FragsId, id: "main" };
        const c = new Ctx(c0.fresh([fragsFixture(rel)], { captureMs: 0 }), F);
        c.namedIssues = c0.namedIssues;
        c.ensure(F);
        c.into(["c:x"], "Go");
        c.h.release(() => void (rel.v = 3), () => void (rel.v = 1));
        c.reload();
        c.eq("reset, not quarantined", [issued(c, "RecordShapeChanged"), issued(c, "RecordQuarantined")], [1, 0]);
        c.ensure(F);
        c.eq("the copy starts fresh", (c.inner(["c:x"])?.memory as { got?: unknown } | undefined)?.got, "0");
      },
      // The same for a fragment's saved state: the copy sits in B, which release 4 removes.
      "a-fragment-state-gone-resets-the-record"(c0) {
        const rel: Release = { v: 1 };
        const F = { actor: FragsId, id: "main" };
        const c = new Ctx(c0.fresh([fragsFixture(rel)], { captureMs: 0 }), F);
        c.namedIssues = c0.namedIssues;
        c.ensure(F);
        c.into(["c:x"], "Move");
        c.h.release(() => void (rel.v = 4), () => void (rel.v = 1));
        c.reload();
        c.eq("reset, not quarantined", [issued(c, "RecordShapeChanged"), issued(c, "RecordQuarantined")], [1, 0]);
      },
      // Survivor 6 (Q1 A "saved memory and state are discarded"; D99, rule 73): a retired record (an ended identity, kept for its return) resets too.
      "a-retired-record-resets-across-an-incompatible-change"(c0) {
        const rel: Release = { v: 1 };
        const c = new Ctx(c0.fresh([memoFixture(rel)], { captureMs: 0 }), M);
        c.namedIssues = c0.namedIssues;
        c.ensure(M);
        c.send("Title", { title: "Groceries" });
        c.detach(M);
        c.advance(100);
        c.eq("ended, its record kept", [c.r.state(M), c.record(M) !== undefined], [undefined, true]);
        c.h.release(() => void (rel.v = 4), () => void (rel.v = 1));
        c.reload();
        c.eq("reset, not quarantined", [issued(c, "RecordShapeChanged"), issued(c, "RecordQuarantined")], [1, 0]);
        c.ensure(M);
        c.eq("it returns fresh", c.mem().title, { text: "", lang: "en" });
      },
      // Q18 (the runner's): decide per record. Release 3 removes SENT: the record saved in SENT resets, the one saved in DRAFT keeps its data.
      "a-removed-state-resets-only-the-records-saved-in-it"(c0) {
        const rel: Release = { v: 1 };
        const M2 = { actor: MemoId, id: "other" };
        const c = new Ctx(c0.fresh([memoFixture(rel)], { captureMs: 0 }), M);
        c.namedIssues = c0.namedIssues;
        c.ensure(M);
        c.send("Save");
        c.ack();
        c.answer("save", { ok: {} });
        c.ensure(M2);
        c.to(M2, "Title", { title: "Kept" });
        c.eq("one in SENT, one in DRAFT", [c.r.state(M), c.r.state(M2)], ["SENT", "DRAFT"]);
        c.h.release(() => void (rel.v = 3), () => void (rel.v = 1));
        c.reload();
        c.eq("one issue for Memo, counting one record", c.r.issues().filter((i) => i.code === "RecordShapeChanged").map((i) => i.input), [{ definition: MemoId, actors: 1 }]);
        c.ensure(M2);
        c.eq("the DRAFT record restores", c.mem(M2)?.title, "Kept");
      },
      // Survivor 7 (Q1 A "an issue naming the definition"; Q18: report per definition): two records reset in one boot, one issue counting both.
      "two-records-of-one-definition-reset-under-one-issue"(c0) {
        const rel: Release = { v: 1 };
        const M2 = { actor: MemoId, id: "other" };
        const c = new Ctx(c0.fresh([memoFixture(rel)], { captureMs: 0 }), M);
        c.namedIssues = c0.namedIssues;
        c.ensure(M);
        c.send("Title", { title: "One" });
        c.ensure(M2);
        c.to(M2, "Title", { title: "Two" });
        c.h.release(() => void (rel.v = 4), () => void (rel.v = 1));
        c.reload();
        c.eq("one issue, two records", c.r.issues().filter((i) => i.code === "RecordShapeChanged").map((i) => i.input), [{ definition: MemoId, actors: 2 }]);
      },
      // Survivor 8 (Q1 A "lanes, holds and endings survive the reset"): a parked ending on the record's lane is heard at the adopting ensure. No step
      // parks an ending beside a live record of this fixture, so the lane record is edited to hold one (a stated limit, as LIFE-28's).
      "a-parked-ending-survives-a-reset-and-is-heard"(c0) {
        const rel: Release = { v: 1 };
        const c = memoHeld(c0, rel);
        c.fault({
          corruptStored: {
            match: "lane/",
            edit: (raw: string) => {
              const v = JSON.parse(raw) as { head: { id: string; owner: unknown; input: unknown }; parked: unknown[] };
              return JSON.stringify({ ...v, parked: [{ attempt: v.head.id, owner: v.head.owner, ending: { ch: "success", value: {} }, input: v.head.input }] });
            },
          },
        });
        c.h.release(() => void (rel.v = 4), () => void (rel.v = 1));
        c.reload();
        c.eq("reset", issued(c, "RecordShapeChanged"), 1);
        c.ensure(M);
        c.eq("the fresh actor hears the parked success, the head's own ending", c.mem().saved, 1);
      },
      // Survivor 9 (Q1 A: memory and state discarded; rule 73: "a waiting deadline is in the record"): a reset record's deadline never fires into
      // the fresh actor.
      "a-reset-records-waiting-deadline-does-not-fire"(c0) {
        const rel: Release = { v: 1 };
        const T = { actor: TimerId, id: "main" };
        const c = new Ctx(c0.fresh([timerFixture(rel)], { captureMs: 0 }), T);
        c.namedIssues = c0.namedIssues;
        c.ensure(T);
        c.send("Edit");
        c.detach(T);
        c.advance(100);
        c.eq("ended, its deadline waiting", c.r.state(T), undefined);
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("no deadline of the discarded record is armed", c.r.outside().timers.length, 0);
        c.ensure(T);
        c.advance(1_000);
        c.eq("reset; the fresh actor heard no deadline", [issued(c, "RecordShapeChanged"), c.r.state(T), (c.mem(T) as { log?: unknown } | undefined)?.log], [1, "IDLE", []]);
      },
      // Survivor 10 (Q1 A's stated limit, "a record written before format 4 has no shape and restores (or is quarantined) as before"): a format 1
      // record across release 2's incompatible title change is not reset; release 2's title Schema decodes its string.
      "a-record-with-no-shape-stamp-is-never-reset"(c0) {
        const rel: Release = { v: 1 };
        const c = memoHeld(c0, rel);
        c.fault({ corruptStored: { match: "Memo", edit: format1 } });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.ensure(M);
        c.eq("no reset; restored and decoded", [issued(c, "RecordShapeChanged"), c.mem().title, c.r.state(M)], [0, { text: "Groceries", lang: "en" }, "SENT"]);
      },
      // Survivor 11 (2.7.15; "the one write op over its contract"): release 2 renames `pay` to `charge` and also reads over `p1m/probe` with `peek`.
      // The lane moves to `charge`, the write op; a read is not a lane's owner.
      "a-rename-moves-to-the-write-op-not-a-read-over-its-contract"(c0) {
        const c = probeAcross(c0, () => probeOps("pay", S.String), () => probeOps("charge", S.String, undefined, "peek"), "a");
        c.eq("nothing quarantined", issued(c, "RecordQuarantined"), 0);
        c.ensure(PP);
        c.send("Go", { k: "a" });
        c.eq("the hold heard again and still holding its key", [c.mem(PP)?.unsure, c.mem(PP)?.why], [2, "Rejected"]);
      },
      // Q20 (the runner's): a release that drops a field applies the drop at its boot, so a later re-add starts empty. Release 5 drops `legacy`
      // (1 on disk); release 1 declares it again: it reads its default, 0, never the old 1.
      "a-field-dropped-then-declared-again-starts-empty"(c0) {
        const rel: Release = { v: 1 };
        const c = new Ctx(c0.fresh([memoFixture(rel)], { captureMs: 0 }), M);
        c.namedIssues = c0.namedIssues;
        c.ensure(M);
        c.send("Title", { title: "Groceries" });
        c.send("Body", { body: "milk" });
        c.eq("legacy counted", c.mem().legacy, 1);
        c.h.release(() => void (rel.v = 5), () => void (rel.v = 1));
        c.reload();
        c.eq("dropped, said", issued(c, "FieldDropped"), 1);
        c.h.release(() => void (rel.v = 1), () => void (rel.v = 5));
        c.reload();
        c.ensure(M);
        c.eq("declared again: its default, not the old value", [c.mem().legacy, c.mem().title], [0, "Groceries"]);
      },
      // 2.7.15 declares earlier keys; one equal to the current key names no old lane and would let `previous[i]` name current ones (the
      // runner's call, proposed name `PreviousIsCurrent`).
      "a-previous-key-equal-to-the-current-key-is-refused"(c0) {
        const op = transaction({ id: "t/p1mSame", input: { k: S.String }, key: ["k"], previous: [{ key: { k: S.String } }], concurrency: "reject", services: [FakeApi], commit: write("same") });
        const build = () => machine(definition({ id: "T/P1MSame", states: ["A"], events: {}, internalEvents: { Ok: {} }, memory: {}, operations: ({ E }) => ({ op: op.outcomes({ success: E.Ok, failure: {} }) }) }), ({ S: St }) => ({ default: St.A, on: { Ok: {} } }));
        c0.eq("refused", refusal(build), "PreviousIsCurrent");
        const c = new Ctx(c0.fresh([memoFixture({ v: 2 })]), M);
        c.ensure(M);
        c.eq("and the Runtime starts a machine whose contract declares a distinct earlier key", c.r.state(M), "DRAFT");
      },
    },
  },
];
