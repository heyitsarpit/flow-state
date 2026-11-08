// Phase 1, record migration: what a persisted record becomes when the app ships a new release. Every expectation is the design's text (rule 46,
// rule 74, 2.2.2, 2.7.15, 2.7.17), worked out by hand before the runtime was changed; each variant names its rule.
import { Schema as S } from "effect";
import { definition, machine, transaction } from "../compile/index.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import { FakeApi, write } from "../typed/lab.ts";
import { keyStampFixture } from "../typed/round13.ts";
import { MemoId, memoFixture } from "../typed/phase1m.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const M = { actor: MemoId, id: "main" };
const KS = { actor: "Lab/KeyStamp", id: "a" };
const issued = (c: Ctx, code: string) => c.r.issues().filter((i) => i.code === code).length;
// Under Memo's release 1, a titled memo is saved and its answer is lost: the hold `{ memoId: m1 }`. Then release `to`, and the page boots again.
const memoAcross = (c0: Ctx, to: number) => {
  const rel: Release = { v: 1 };
  const c = new Ctx(c0.fresh([memoFixture(rel)], { captureMs: 0 }), M);
  c.namedIssues = c0.namedIssues;
  c.ensure(M);
  c.send("Title", { title: "Groceries" });
  c.send("Body", { body: "milk eggs bread" });
  c.send("Save");
  c.ack();
  c.answer("save", { lost: true });
  c.eq("release 1: sent, its answer lost, the hold heard", [c.r.state(M), c.mem().unsure, c.reqs("save").length], ["SENT", 1, 1]);
  c.h.release(() => void (rel.v = to), () => void (rel.v = 1));
  c.reload();
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
    namedIssues: ["OldVersionLane", "RecordQuarantined"],
    variants: {
      // The real path, release 1's records restored by release 2 across a reload, with the fake storage:
      // - 2.2.2: "a stored field decodes by its codec" (here the field's own Schema maps release 1's string into the new shape); "a field the record
      //   lacks ... runs its computed initial over the restored fields"; a field release 2 does not declare is not part of its memory.
      // - 2.7.15: release 2 keys `save` by `memoId` and `rev`, so the saved lane is an old-version hold, "reported at each boot (`OldVersionLane`, an
      //   issue)"; "every commit of that operation for that actor declines `NotSent { OldVersion }`"; `previous[0].cancel(k)` names it by its own key.
      // - 2.7.13's restore row: the hold is heard once more, as `unknown { Restored }`.
      "release-1-records-restore-under-release-2-across-a-reload"(c0) {
        const c = memoAcross(c0, 2);
        c.eq("the old hold is an issue at the boot", issued(c, "OldVersionLane"), 1);
        c.ensure(M);
        c.eq("memory migrated: the title reshaped, `legacy` gone, `words` computed over the restored body, the hold heard again", c.mem(), {
          title: { text: "Groceries", lang: "en" },
          body: "milk eggs bread",
          words: 3,
          unsure: 2,
          why: "",
          saved: 0,
        });
        c.eq("in its saved leaf", c.r.state(M), "SENT");
        c.send("Save");
        c.eq("a commit under the new key declines beside the old hold", [c.mem().why, c.reqs("save").length], ["OldVersion", 1]);
        c.send("Abandon");
        c.send("Save");
        c.ack();
        c.eq("previous[0].cancel lets the old hold go; the new key sends", [c.reqs("save").length, c.reqs("save").at(-1)?.input], [2, { memoId: "m1", rev: "1", body: "milk eggs bread" }]);
        c.answer("save", { ok: {} });
        c.reload();
        c.ensure(M);
        c.eq("the next boot: no old hold, and the migrated memory restores as release 2 wrote it", [issued(c, "OldVersionLane"), c.mem().title, c.mem().saved], [1, { text: "Groceries", lang: "en" }, 1]);
      },
      // 2.7.15: "`O.x.previous[i].retry(k)` ... naming the old lanes by their own keys". The old hold goes out again, as the same Attempt.
      "previous-retry-re-sends-the-old-hold-as-the-same-attempt"(c0) {
        const c = memoAcross(c0, 2);
        c.ensure(M);
        c.send("Resend");
        c.ack();
        c.eq("re-sent with its own id and body", [c.reqs("save").length, c.keys("save").length, c.reqs("save").at(-1)?.input], [2, 1, { memoId: "m1", body: "milk eggs bread" }]);
      },
      // No migration, a state removed: "a record that does not decode" (2.7.17) is quarantined at the boot; "an ensure over a record that no longer
      // decodes starts fresh and reports `RecordUndecodable`, adopts the identity's lanes (rule 46) and creates from input". Rule 46: "a fresh
      // incarnation adopts it even when the actor record no longer decodes", so the hold is heard by the new incarnation and still holds its key.
      "a-state-a-release-removed-quarantines-the-record-and-an-ensure-starts-fresh-and-adopts-the-hold"(c0) {
        const c = memoAcross(c0, 3);
        c.eq("quarantined at the boot", issued(c, "RecordQuarantined"), 1);
        c.ensure(M);
        c.eq("fresh, said, the hold heard", [c.r.evidence("RecordUndecodable").length, c.r.state(M), c.mem().title, c.mem().unsure], [1, "DRAFT", "", 1]);
        c.send("Save");
        c.eq("the adopted hold still holds its key", [c.mem().why, c.reqs("save").length], ["Rejected", 1]);
      },
      // No migration, a memory field reshaped (release 4's title is a struct, its Schema reads no string): the same as a state removed.
      "a-memory-field-reshaped-with-no-migration-quarantines-the-record-and-an-ensure-starts-fresh"(c0) {
        const c = memoAcross(c0, 4);
        c.eq("quarantined at the boot", issued(c, "RecordQuarantined"), 1);
        c.ensure(M);
        c.eq("fresh, said, the hold heard", [c.r.evidence("RecordUndecodable").length, c.r.state(M), c.mem().title, c.mem().unsure], [1, "DRAFT", { text: "", lang: "en" }, 1]);
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
