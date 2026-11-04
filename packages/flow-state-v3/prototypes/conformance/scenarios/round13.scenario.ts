// Round 13: round 12's final review, pinned (round-12/review.md H1, M1). Each says what it would see without its fix.
import { ctorInputFixture, decodeOnlyInputFixture, keyShapeFixture, keyStampFixture } from "../typed/round13.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import type { Fixture } from "../harness.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const SHAPE = { actor: "Lab/KeyShape", id: "a" };
const STAMP = { actor: "Lab/KeyStamp", id: "a" };
const on = (c0: Ctx, fs: readonly Fixture[], a: { actor: string; id: string }) => {
  const c = new Ctx(c0.fresh(fs, { captureMs: 0 }), a);
  c.ensure();
  return c;
};
// Release 1: `Go { k: a }` held unsure. Then release 2 adds a required key field and the page boots again: the hold is stamped `["k"]`, an older-key lane.
const heldThenAdded = (c0: Ctx) => {
  const rel: Release = { v: 1 };
  const c = on(c0, [keyStampFixture(rel)], STAMP);
  c.send("Go", { k: "a" });
  c.ack();
  c.answer("charge", { lost: true });
  c.eq("held", c.mem().unsure, 1);
  c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
  c.reload();
  return c;
};

export const round13Scenarios: readonly Scenario[] = [
  {
    // Review H1, P1: with no release, an optional key field absent is a key value like any other. Round 12 decided "older" by the key's shape, so the second
    // commit declined in one order only: one request where rule 39 says two server things.
    id: "R13-STAMP-SHAPE",
    kind: "fault",
    fixtures: [keyShapeFixture],
    actor: SHAPE,
    cites: ["D221", "rule:39", "rule:16"],
    variants: {
      "the-key-without-the-field-first-then-with-it-both-send"(c0) {
        const c = on(c0, [keyShapeFixture], SHAPE);
        c.send("GoA");
        c.ack();
        c.send("GoEu");
        c.ack();
        c.eq("two requests", c.reqs("charge").length, 2);
        c.eq("no decline", c.mem().declined, 0);
        c.eq("nothing beside an older key", c.r.evidence("BesideOlderKey").length, 0);
      },
      "the-key-with-the-field-first-then-without-it-both-send"(c0) {
        const c = on(c0, [keyShapeFixture], SHAPE);
        c.send("GoEu");
        c.ack();
        c.send("GoA");
        c.ack();
        c.eq("two requests", c.reqs("charge").length, 2);
        c.eq("no decline", c.mem().declined, 0);
      },
      // Review M1: `retry(() => ({ k: "a" }))` type-checks (it did not in round 12) and names the lane `commit(() => ({ k: "a", id }))` made.
      "a-typed-retry-with-the-optional-field-absent-names-its-lane"(c0) {
        const c = on(c0, [keyShapeFixture], SHAPE);
        c.send("GoA");
        c.ack();
        c.answer("charge", { lost: true });
        c.eq("held", c.mem().unsure, 1);
        c.send("RetryA");
        c.ack(); // rule 46: a persisted re-send waits for its lane record's capture
        c.eq("resent", c.reqs("charge").length, 2);
        c.eq("the same Attempt", c.keys("charge").length, 1);
      },
    },
  },
  {
    // Review H1, P2, P3: after a release that adds a required key field, the older hold had no member that could reach it, and D217 declined every later
    // commit for that key, across reloads. D221: a keyed `retry` or `cancel` names it, a keyed `idle` sees it, and nothing else is caught.
    id: "R13-STAMP-RELEASE",
    kind: "fault",
    fixtures: [keyStampFixture({ v: 1 })],
    actor: STAMP,
    cites: ["D221", "D217", "D78", "rule:46", "rule:16"],
    variants: {
      // Without D221's member lookup: the retry names no lane, nothing is resent, and the last commit declines (round 12's stranding).
      "a-keyed-retry-names-the-older-hold-and-then-a-commit-sends"(c0) {
        const c = heldThenAdded(c0);
        c.send("Go", { k: "a" });
        c.eq("declined beside the older key", c.r.evidence("BesideOlderKey").length, 1);
        c.eq("one request", c.reqs("charge").length, 1);
        c.send("Retry", { k: "a" });
        c.ack(); // rule 46: a persisted re-send waits for its lane record's capture
        c.eq("the hold is resent", c.reqs("charge").length, 2);
        c.eq("as the same Attempt", c.keys("charge").length, 1);
        c.answer("charge", { ok: {} });
        c.eq("settled", c.mem().oks, 1);
        c.send("Go", { k: "a" });
        c.ack();
        c.eq("now a commit sends", c.reqs("charge").length, 3);
        c.eq("and declines no more", c.r.evidence("BesideOlderKey").length, 1);
      },
      // Without D221's member lookup the cancel names nothing, and the commit after it declines.
      "a-keyed-cancel-lets-the-older-hold-go-and-then-a-commit-sends"(c0) {
        const c = heldThenAdded(c0);
        c.send("Cancel", { k: "a" });
        c.send("Go", { k: "a" });
        c.ack();
        c.eq("a commit sends", c.reqs("charge").length, 2);
        c.eq("no decline", c.r.evidence("BesideOlderKey").length, 0);
      },
      // P3: without D221's guard lookup, `idle(k)` passes and the commit it guards declines.
      "a-keyed-idle-sees-the-older-hold"(c0) {
        const c = heldThenAdded(c0);
        c.send("Guarded", { k: "a" });
        c.eq("the guard said no", c.mem().guardedOut, 1);
        c.eq("so no commit met it", c.r.evidence("BesideOlderKey").length, 0);
        c.eq("one request", c.reqs("charge").length, 1);
      },
      // The match itself: another key value is another server thing (survivor `d217.any-value`).
      "another-key-value-is-not-the-older-hold"(c0) {
        const c = heldThenAdded(c0);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("it sends", c.reqs("charge").length, 2);
        c.eq("no decline", c.r.evidence("BesideOlderKey").length, 0);
      },
      // And another actor's lanes are its own (survivor `d217.any-actor`).
      "another-actor-is-not-the-older-hold"(c0) {
        const c = heldThenAdded(c0);
        const b = { actor: "Lab/KeyStamp", id: "b" };
        c.ensure(b);
        c.to(b, "Go", { k: "a" });
        c.ack();
        c.eq("it sends", c.reqs("charge").length, 2);
        c.eq("no decline", c.r.evidence("BesideOlderKey").length, 0);
      },
      // A lane minted under the current fields is never older: after the release and the hold's end, a new hold on `{ k: a, region: eu }` and a commit on
      // `{ k: a, region: eu }` meet as a hold on their own key (rule 16's busy), with no `BesideOlderKey`.
      "a-lane-minted-after-the-release-is-not-older"(c0) {
        const c = heldThenAdded(c0);
        c.send("Cancel", { k: "a" });
        c.send("Go", { k: "a" });
        c.ack();
        c.answer("charge", { lost: true });
        c.reload();
        c.send("Go", { k: "a" });
        c.eq("busy on its own lane", c.reqs("charge").length, 2);
        c.eq("not beside an older key", c.r.evidence("BesideOlderKey").length, 0);
      },
    },
  },
  {
    // Review M2, D222: creation reads one side of a field's Schema, the type side, so an absent input takes its constructor default. Round 12 took the
    // decoding default at creation and ignored a constructor default (`InputMissing`).
    id: "R13-CREATE",
    kind: "fault",
    fixtures: [ctorInputFixture, decodeOnlyInputFixture],
    actor: { actor: "Lab/CtorInput", id: "a" },
    cites: ["D222", "D219", "D214"],
    namedIssues: ["InvalidTurn"],
    run(c0) {
      const A = { actor: "Lab/CtorInput", id: "a" };
      const B = { actor: "Lab/DecodeOnlyInput", id: "b" };
      const c = new Ctx(c0.fresh([ctorInputFixture, decodeOnlyInputFixture], { captureMs: 0 }), A);
      c.ensure(A);
      c.eq("the constructor default", c.mem(A), { n: 7 });
      c.ensure(B);
      c.eq("a decoding default is restore's, not creation's", c.r.state(B), undefined);
      c.yes("said as missing", c.r.issues().some((i) => i.code === "InvalidTurn" && String((i as { cause?: unknown }).cause).includes("InputMissing")));
      c.ensure(B, { n: 2 });
      c.eq("given, it is made", c.mem(B), { n: 2 });
      c.reload();
      c.eq("and restores", c.mem(A), { n: 7 });
    },
  },
];
