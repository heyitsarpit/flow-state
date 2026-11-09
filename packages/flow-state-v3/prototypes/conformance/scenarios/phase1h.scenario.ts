// Phase 1, area H: round 13's H1, H2 and M2, and the runner's rulings R5-R12 on round 15b. Every expectation is the design's text, worked out by
// hand before the runtime was changed; each variant names its rule.
import { Effect, Schema as S } from "effect";
import { definition, ensureArgs, Flow, machine } from "../compile/index.ts";
import { KeyCollideId, keyCollideFixture } from "../fixtures/phase1h.compiled.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import type { Step } from "../harness.ts";
import { editor1Format1, editorFixture, editorRef } from "../typed/identity.ts";
import { A1KeyedId, a1KeyedFixture } from "../typed/audit1.ts";
import { editorFormat1Of, keyStampFormat1Fixture, P1AllId, p1AllFixture, P1GoneId, p1GoneFixture, P1LatestId, p1LatestFixture, P1RelId, p1RelFixture } from "../typed/phase1h.ts";
import { ctorInputFixture, keyStampFixture } from "../typed/round13.ts";
import { preVersionStampFixture, r15StayFixture, r15SwitchFixture, R15StayId, R15SwitchId } from "../typed/round15.ts";
import { Ctx, type Scenario } from "./ctx.ts";
import { GRACE } from "./lifetime.scenario.ts";

const SW = { actor: R15SwitchId, id: "a" };
const AK = { actor: A1KeyedId, id: "a" };
const RS = { actor: R15StayId, id: "a" };
const KS = { actor: "Lab/KeyStamp", id: "a" };
const PA = { actor: P1AllId, id: "a" };
const PR = { actor: P1RelId, id: "a" };
const PG = { actor: P1GoneId, id: "a" };
const PL = { actor: P1LatestId, id: "a" };
const CI = { actor: "Lab/CtorInput", id: "a" };
const heard = (c: Ctx) => c.r.evidence("delivered").map((d) => d["event"]);
const ensureStep = (a: ReturnType<typeof ensureArgs>): Step => ({ ensure: { actor: a.machine, id: a.id }, ...(a.input === undefined ? {} : { input: a.input }), ...(a.identity ? { identity: a.identity } : {}) });
// Under KeyStamp's release `from` (made by `fx`), hold `{ k }` unsure; then release `to`, and the page boots again.
const holdAcross = (c0: Ctx, fx: (rel: Release) => import("../harness.ts").Fixture, from: number, to: number, k = "a") => {
  const rel: Release = { v: from };
  const c = new Ctx(c0.fresh([fx(rel)], { captureMs: 0 }), KS);
  c.ensure(KS);
  c.send("Go", { k });
  c.ack();
  c.answer("charge", { lost: true });
  c.h.release(() => void (rel.v = to), () => void (rel.v = from));
  c.reload();
  return c;
};
// A ticket editor saved under Editor release `from` (made by `editorFormat1Of`), then release `to` and a boot.
const editorAcross = (c0: Ctx, from: number, to: number) => {
  const rel: Release = { v: from };
  const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
  const c = new Ctx(c0.fresh([editorFormat1Of(rel)], { captureMs: 0 }), { actor: r1.machine, id: r1.id });
  c.do(ensureStep(ensureArgs(from === 0 ? { ...r1, fields: editor1Format1 } : r1)));
  c.send("Title", { title: "Foyer" });
  c.ack();
  c.answer("save", { ok: {} });
  c.h.release(() => void (rel.v = to), () => void (rel.v = from));
  c.reload();
  return c;
};

export const phase1hScenarios: readonly Scenario[] = [
  {
    id: "P1-H",
    kind: "fault",
    fixtures: [r15SwitchFixture(), r15StayFixture()],
    actor: SW,
    cites: ["rule:24", "sec:2.7.13", "D48"],
    namedIssues: ["OldVersionLane", "HoldWithoutRecord"], // 2.7.15 (Q2 A): an old-version hold is an issue at each boot; round 2: a hold without its record too
    variants: {
      // R6 (2.7.13's `cancel` and `latest` commit rows): a commit over a never-sent head whose acknowledgement is out waits for storage (D48); the
      // replaced head "ends `Superseded`" and the new commit becomes the addressable Attempt. A refused acknowledgement changes nothing in that:
      // the old head is evidence, never delivered, and the new one is acknowledged and sent.
      "under-cancel-a-refused-acknowledgement-of-a-replaced-head-is-superseded"(c0) {
        const c = new Ctx(c0.fresh([r15SwitchFixture()]), SW);
        c.ensure(SW);
        c.send("Go", { q: "a" });
        c.send("Go", { q: "ab" });
        c.do({ storage: "refuse" });
        c.eq("nothing heard", heard(c), []);
        c.eq("the old head is Superseded, its refusal evidence", [c.r.evidence("Superseded").length, c.r.evidence("StorageFailure").length], [1, 1]);
        c.ack();
        c.eq("the newer commit is sent", c.reqs("search").map((r) => r.input), [{ q: "ab" }]);
        c.answer("search", { ok: {} });
        c.eq("only its ending is heard", heard(c), ["Ok"]);
      },
      // H1 (round 13), as ruled by U12 B (OD48; 2.2.2): "a default is pure: a default that is an Effect to run rather than a plain value is a
      // construction error". Round 13's harm was one per-call default computed once and shared by every actor; now it cannot be written, and is never
      // run. Effect's `Effect.succeed(v)` is a value (a succeeded Exit).
      "a-default-that-runs-is-refused-at-construction-and-never-runs"(c0) {
        const c = new Ctx(c0.fresh([ctorInputFixture({ v: 2 })]), CI);
        let ran = 0;
        const memOf = (memory: Record<string, unknown>) => () => machine(definition({ id: "T/P1Def", states: ["A"], events: {}, internalEvents: {}, memory: memory as never, operations: () => ({}) }), ({ S: St }) => ({ default: St.A }));
        const code = (f: () => unknown) => {
          try {
            f();
            return "";
          } catch (e) {
            return String((e as Error).message).split(":")[0];
          }
        };
        c.eq("constructor, decoding, type-side decoding, nested: refused", [
          code(memOf({ at: Flow.input(S.Number.pipe(S.withConstructorDefault(Effect.sync(() => ++ran)))) })),
          code(memOf({ at: Flow.input(S.Number.pipe(S.withDecodingDefaultKey(Effect.sync(() => ++ran)))) })),
          code(memOf({ at: Flow.input(S.NumberFromString.pipe(S.withDecodingDefaultTypeKey(Effect.sync(() => ++ran)))) })),
          code(memOf({ at: Flow.input(S.Struct({ t: S.Number.pipe(S.withConstructorDefault(Effect.sync(() => ++ran))) })) })),
          code(memOf({ at: Flow.input(S.suspend(() => S.Struct({ t: S.Number.pipe(S.withConstructorDefault(Effect.sync(() => ++ran))) }))) })),
        ].map((x) => x !== ""), [true, true, true, true, true]); // Audit 1: refused; the name `ImpureDefault` is proposed, so the spelling is not pinned
        c.eq("never run", ran, 0);
        c.eq("a value is a default", code(memOf({ at: Flow.input(S.Number.pipe(S.withConstructorDefault(Effect.succeed(7)))) })), "");
        // Audit 1, C184: a failed Exit is an Effect too, not a value: refused, constructor and decoding alike.
        c.eq("a failing default is refused", [code(memOf({ at: Flow.input(S.Number.pipe(S.withConstructorDefault(Effect.fail("no") as never))) })), code(memOf({ at: Flow.input(S.Number.pipe(S.withDecodingDefaultKey(Effect.fail("no") as never))) }))].map((x) => x !== ""), [true, true]);
        c.ensure(CI);
        c.eq("and the Runtime starts an actor with it", c.mem(CI), { seen: 1, n: 7 });
      },
      // H2 (round 13's K1), done by U17 B: `k` keeps its name and changes from String to Number. The old hold `{ k: "1" }` is an old-version hold; a
      // commit of `{ k: 1 }` declines beside it, so no second charge goes out for the same order.
      "a-key-field-changed-from-string-to-number-under-its-name-is-a-new-version"(c0) {
        const c = holdAcross(c0, (rel) => keyStampFixture(rel), 1, 10, "1");
        c.eq("an old-version hold", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 1);
        c.send("Go", { k: "1" });
        c.ack();
        c.eq("declined, one send, one lane", [c.mem(KS)?.declined, c.reqs("charge").length, c.laneKeys().length], [1, 1, 1]);
      },
      // M2 (round 13, `old-held-only`; the mid review's W probe): an old-version hold re-sent by its own key is on the wire, and a commit still declines
      // beside it; once it ends, commits send.
      "an-old-version-hold-back-on-the-wire-still-declines-every-commit"(c0) {
        const c = holdAcross(c0, (rel) => keyStampFixture(rel), 1, 2);
        c.send("OldRetry", { k: "a" });
        c.ack();
        c.eq("re-sent, on the wire", c.reqs("charge").length, 2);
        c.send("Go", { k: "b", region: "eu" });
        c.ack();
        c.eq("declined beside it", [c.mem(KS)?.declined, c.reqs("charge").length], [1, 2]);
        c.answer("charge", { ok: {} });
        c.send("Go", { k: "b", region: "eu" });
        c.ack();
        c.eq("then it sends", c.reqs("charge").length, 3);
      },
      // M2 (`member-names-old`; D221's table: `retry({ k: a, region: eu })` "names nothing"): a keyed member with a new-version key does not reach the
      // old hold; the hold stays and commits still decline.
      "a-keyed-member-with-a-new-version-key-names-nothing"(c0) {
        const c = holdAcross(c0, (rel) => keyStampFixture(rel), 1, 2);
        c.send("Retry", { k: "a", region: "eu" });
        c.ack();
        c.send("Cancel", { k: "a", region: "eu" });
        c.eq("nothing re-sent, nothing released", [c.reqs("charge").length, c.r.evidence("Released").length], [1, 0]);
        c.send("Go", { k: "b", region: "eu" });
        c.eq("the hold stands", c.mem(KS)?.declined, 1);
      },
      // M2 (`retryable-sees-old`; rule 77 of the assumptions: "`retryable(k)` sees its own lane only, by design"): with a new-version key it says no.
      // Phase 1 migration (2.7.15: an old-version hold is "never matched against a new key"; `previous[i]` names it by its own key): the current
      // handle given the old key's spelling says no too, and `previous[0].retry` re-sends the hold.
      "a-keyed-retryable-sees-its-own-lane-only"(c0) {
        const c = holdAcross(c0, (rel) => keyStampFixture(rel), 1, 2);
        c.send("Retryable", { k: "a", region: "eu" });
        c.eq("no, and nothing sent", [c.mem(KS)?.notRetryable, c.reqs("charge").length], [1, 1]);
        c.send("Retryable", { k: "a" });
        c.eq("the old key's spelling on the current handle: no", [c.mem(KS)?.notRetryable, c.reqs("charge").length], [2, 1]);
        c.send("OldRetry", { k: "a" });
        c.ack();
        c.eq("previous[0].retry: re-sent", c.reqs("charge").length, 2);
      },
      // M2 (`decline-why`; 2.7.15 and the NotSent table: "every commit of that operation for that actor declines `NotSent { why: "OldVersion" }`").
      "the-decline-beside-an-old-version-hold-is-not-sent-old-version"(c0) {
        const c = holdAcross(c0, (rel) => keyStampFixture(rel), 1, 2);
        c.send("Go", { k: "b", region: "eu" });
        c.eq("NotSent { OldVersion }", [c.mem(KS)?.why, c.lastEnding("charge")?.["reason"]], ["OldVersion", "OldVersion"]);
      },
      // M2 (`samefields-ordered`; 2.7.15: "reordering key fields changes nothing"): release 11 is release 2's key `[k, region]` as `[region, k]`. The
      // hold is current: no old-version hold; its own key meets it as a busy lane, and another key sends.
      "a-release-that-only-reorders-key-fields-is-the-same-version"(c0) {
        const rel: Release = { v: 2 };
        const c = new Ctx(c0.fresh([keyStampFixture(rel)], { captureMs: 0 }), KS);
        c.ensure(KS);
        c.send("Go", { k: "a", region: "eu" });
        c.ack();
        c.answer("charge", { lost: true });
        c.h.release(() => void (rel.v = 11), () => void (rel.v = 2));
        c.reload();
        c.eq("no old-version hold", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 0);
        c.send("Go", { k: "a", region: "eu" });
        c.eq("its own key meets the hold: busy, not sent", [c.mem(KS)?.why, c.reqs("charge").length], ["Rejected", 1]);
        c.send("Go", { k: "b", region: "eu" });
        c.ack();
        c.eq("another key sends", c.reqs("charge").length, 2);
      },
      // M2 (`unstamped-collision-unchecked`, `unstamped-one-pass`; convergence 13's D221 table, the hand-closure row: "D78's rename in two passes; a
      // collision is `LaneRekeyCollision`, loud, the mover keeps its name"). `{ k: a, region: eu }` keeps its name under release 2; `{ k: a }` would
      // move onto it. Both mint orders: the collision is said, both holds stay on disk under their own names, and nothing is sent beside them.
      ...Object.fromEntries(
        (["keeper-first", "mover-first"] as const).map((order) => [
          `a-hand-key-rename-onto-a-kept-name-is-refused-loudly-${order}`,
          (c0: Ctx) => {
            const rel: Release = { v: 1 };
            const KC = { actor: KeyCollideId, id: "a" };
            const c = new Ctx(c0.fresh([keyCollideFixture(rel)], { captureMs: 0 }), KC);
            c.ensure(KC);
            const keeper = { k: "a", region: "eu" };
            const mover = { k: "a" };
            for (const p of order === "keeper-first" ? [keeper, mover] : [mover, keeper]) {
              c.send("Go", p);
              c.ack();
              c.answer("charge", { lost: true });
            }
            c.eq("two holds", c.mem(KC)?.unsure, 2);
            const lanes = c.laneKeys();
            const issued = c.r.issues().length;
            c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
            c.reload();
            c.eq("the collision is loud (one issue), nothing renamed", [c.r.issues().length - issued, c.laneKeys().sort()], [1, [...lanes].sort()]);
            c.send("Go", keeper);
            c.eq("nothing sent beside them", c.reqs("charge").length, 2);
            c0.namedIssues = ["LaneRekeyCollision"];
          },
        ]),
      ),
      // R6 under `latest` (2.7.13's `commit` row: "an addressable Attempt never sent and not yet invoked is replaced too: it ends `Superseded`").
      "under-latest-a-refused-acknowledgement-of-a-replaced-head-is-superseded"(c0) {
        const c = new Ctx(c0.fresh([keyStampFixture({ v: 1 }, "latest")]), KS);
        c.ensure(KS);
        c.send("Go", { k: "a" });
        c.send("Go", { k: "a" });
        c.do({ storage: "refuse" });
        c.eq("nothing declined, nothing heard", [c.mem(KS)?.declined, heard(c)], [0, []]);
        c.eq("the old head is Superseded", c.r.evidence("Superseded").length, 1);
        c.ack();
        const minted = c.r.evidence("mint").filter((m) => m["op"] === "charge").map((m) => m["attempt"]);
        c.eq("one send, the newer Attempt", [minted.length, c.keys("charge")], [2, [minted[1]]]);
      },
      // R5 (the runner, reversed after the 15b review; D107's rule "an ending that leaves a hold comes last"): a live `cancelAll` with its head on
      // the wire interrupts the head and ends each queued commit NotSent { Cancelled }, in mint order; the head's own ending, unknown { Cancelled },
      // which leaves the lane Held, is heard last.
      "a-cancel-all-with-its-head-on-the-wire-hears-the-queue-first-and-the-held-head-last"(c0) {
        const c = new Ctx(c0.fresh([p1AllFixture()]), PA);
        c.ensure(PA);
        c.send("Go", { n: 1 });
        c.ack();
        c.send("Go", { n: 2 });
        c.send("Go", { n: 3 });
        c.send("All");
        c.eq("the queue in mint order, then the head", c.r.evidence("delivered").filter((d) => d["op"] === "put").map((d) => [d["event"], c.endings("put").find((e) => e["attempt"] === d["attempt"])?.["reason"]]), [["No", "Cancelled"], ["No", "Cancelled"], ["Unsure", "Cancelled"]]);
        const [head, q1, q2] = c.r.evidence("mint").filter((m) => m["op"] === "put").map((m) => m["attempt"]);
        c.eq("by Attempt: the queue in mint order, the head last", c.r.evidence("delivered").filter((d) => d["op"] === "put").map((d) => d["attempt"]), [q1, q2, head]);
        c.eq("one send; the head held", [c.reqs("put").length, c.r.quiet().waits.filter((w) => "op" in w && w.op === "put").length > 0], [1, true]);
      },
      // R5: on an Idle lane, `cancelAll` is `cancel`'s Idle cell: nothing.
      "a-cancel-all-on-an-idle-lane-does-nothing"(c0) {
        const c = new Ctx(c0.fresh([p1AllFixture()]), PA);
        c.ensure(PA);
        c.send("All");
        c.eq("no ending, no issue, no lane", [c.endings("put").length, c.r.issues().length, c.laneKeys().length], [0, 0, 0]);
        c.yes("cancel's Idle cell", c.hitCell("lane.cancel.Idle"));
      },
      // R10 (the runner, after the 15b review; rule 60, 2.9.3): a transition that both cancels the whole lane (`cancelAll`, in the raised `Drop`) and
      // releases it (the trait's abandonment) is a release: the queued commits end NotSent { Cancelled } as evidence, heard by no one, since their
      // owner is gone; the head on the wire is interrupted and its ending is evidence too.
      "a-cancel-all-in-a-turn-that-releases-the-lane-ends-the-queue-as-evidence"(c0) {
        const c = new Ctx(c0.fresh([p1RelFixture()]), PR);
        c.ensure(PR);
        c.into(["t"], "Go", { n: 1 });
        c.ack();
        c.into(["t"], "Go", { n: 2 });
        c.into(["t"], "Go", { n: 3 });
        c.send("Leave");
        c.state("AWAY", PR);
        const [head, q1, q2] = c.r.evidence("mint").filter((m) => m["op"] === "q").map((m) => m["attempt"]);
        c.eq("nothing heard", c.r.evidence("delivered").filter((d) => d["op"] === "q").length, 0);
        c.eq("the queue ends as evidence", [q1, q2].map((a) => c.r.evidence("evidenceOnly").some((e) => e["attempt"] === a)), [true, true]);
        c.eq("only the head was sent", [c.reqs("q").length, c.keys("q")], [1, [head]]);
      },
      // R9 (the runner's call under amendment 9; C152, C173): a hold on a lane whose operation the release no longer has is quarantined, and no owner
      // can cancel it, since no handle names it. `forget` drops it, with evidence, and its record goes; a later boot does not name it again.
      "forget-drops-a-hold-whose-operation-is-gone-with-evidence"(c0) {
        const rel: Release = { v: 1 };
        const c = new Ctx(c0.fresh([p1GoneFixture(rel)], { captureMs: 0 }), PG);
        c0.namedIssues = ["RecordQuarantined"];
        c.ensure(PG);
        c.send("Go");
        c.ack();
        c.answer("gone", { lost: true });
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("quarantined at the boot", [c.r.issues().filter((i) => i.code === "RecordQuarantined").length, c.r.inspect(PG)?.quarantined?.length], [1, 1]);
        const from = c.r.evidence().length;
        c.do({ forget: PG });
        // Audit 1b: `HoldForgotten` is a proposed name, and the design says only "with evidence": asserted as evidence beyond the identity's own
        // dispose and forget, whatever it is called.
        const said = c.r.evidence().slice(from).filter((e) => !["disposed", "forgotten", "lane"].includes(String(e["kind"]))).length;
        c.eq("dropped, with evidence", [said > 0, c.r.inspect(PG)?.quarantined?.length], [true, 0]);
        c.eq("its record is gone", c.laneKeys().length, 0);
        c.reload();
        c.eq("not named again", c.r.issues().filter((i) => i.code === "RecordQuarantined").length, 1);
      },
      // R11's control: under `latest` a commit over a head on the wire queues (2.7.13): the head is not replaced, so both may be at the server and
      // both reach the wire. Loaded beside R15Switch, whose op of the same name is under `cancel`, so the oracles read each Attempt's own policy.
      "under-latest-beside-a-same-named-cancel-op-a-commit-over-the-wire-queues"(c0) {
        const c = new Ctx(c0.fresh([r15SwitchFixture(), p1LatestFixture()]), PL);
        c.ensure(PL);
        c.send("Go", { q: "a" });
        c.ack();
        c.send("Go", { q: "ab" });
        c.answer("search", { lost: true });
        c.eq("the head is held, the newer one waits", [c.reqs("search").length, c.r.evidence("interruptedBy").length], [1, 0]);
        c.eq("one ending heard, unknown", heard(c), ["Unsure"]);
      },
      // R7 (2.7.15, rule 74; the format tag, R3, OD50): a stamp written in an older format is compared with the current Schema written in that format.
      // Release 0 is KeyStamp's release 1 (`k: String`) under the untagged format 1; release 4 makes `k` a `Trim` (the type side changes) under format 2,
      // the Flow upgrade and the Schema change in one release. Format 1 hashed both sides, so the change is seen: an old-version hold, a decline.
      "a-type-change-in-the-release-that-upgrades-the-format-is-a-new-version-of-the-op"(c0) {
        const c = holdAcross(c0, keyStampFormat1Fixture, 0, 4);
        c.eq("an old-version hold, said at the boot", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 1);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("declined beside it, nothing sent", [c.mem(KS)?.declined, c.reqs("charge").length], [1, 1]);
      },
      // R7: with no Schema change across the upgrade, the format 1 stamp is the current version.
      "a-format-1-stamp-of-an-unchanged-key-is-the-current-version"(c0) {
        const c = holdAcross(c0, keyStampFormat1Fixture, 0, 1);
        c.eq("no old-version hold", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 0);
        c.send("Go", { k: "b" });
        c.ack();
        c.eq("another key sends", [c.mem(KS)?.declined, c.reqs("charge").length], [0, 2]);
      },
      // R7's stated limit: format 0 (bare names, before Schemas joined the stamp) has no Schema to compare, so across it only names are compared; a
      // type change in the upgrading release is not seen. This case documents the limit; it is not a guarantee.
      "a-bare-stamp-across-a-type-change-is-compared-by-name-a-stated-limit"(c0) {
        const c = holdAcross(c0, preVersionStampFixture, 0, 4);
        c.eq("no old-version hold", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 0);
      },
      // R7 for actors (rule 74): Editor release 0 is release 1 under format 1; release 3 makes `ticketId` a NumberFromString (encoded side a string
      // still, the type side a number). Before R7 the cross-format compare read only `ticketId:string` and restored the record into the new Schema.
      "an-actor-record-in-format-1-across-a-type-change-is-an-old-version-record"(c0) {
        const c = editorAcross(c0, 0, 3);
        c.eq("listed at ready", c.r.evidence("OldVersionActor").length, 1);
      },
      "an-actor-record-in-format-1-of-an-unchanged-schema-restores"(c0) {
        const c = editorAcross(c0, 0, 1);
        c.eq("not listed", c.r.evidence("OldVersionActor").length, 0);
      },
      // Audit 1, R10 (OD51; rule 24): beside a release, `cancelAll` ends the queue and "the head is left to the release": the release's own cancel
      // (the trait's `whenAbandoned`) is the one cancel the head gets, so it is interrupted once, and its ending is evidence when it lands.
      "audit-a-cancel-all-beside-a-release-leaves-the-head-to-the-release"(c0) {
        const c = new Ctx(c0.fresh([p1RelFixture()]), PR);
        c.ensure(PR);
        c.into(["t"], "Go", { n: 1 });
        c.ack();
        c.into(["t"], "Go", { n: 2 });
        c.send("Leave");
        c.eq("one cancel for the head: the release's", c.cells("q").filter((x) => String(x).startsWith("lane.cancel.")).length, 1);
        c.answer("q", { ok: {} });
        c.eq("its ending is evidence, heard by nobody", [c.r.evidence("delivered").filter((d) => d["op"] === "q").length], [0]);
      },
      // Audit 1, Q3 A (rule 24): `cancelAll(k)` takes its key as `cancel` does: outside an ending it ends that key's lane and no other.
      "audit-a-keyed-cancel-all-ends-only-its-keys-lane"(c0) {
        const c = new Ctx(c0.fresh([a1KeyedFixture()]), AK);
        c.ensure(AK);
        for (const [k, n] of [["a", 1], ["a", 2], ["b", 1], ["b", 2]] as const) c.send("Go", { k, n });
        c.send("AllOf", { k: "a" });
        const cancelled = c.endings("put").filter((e) => e["reason"] === "Cancelled").length;
        c.eq("a's queued commit ends Cancelled, and its head is cancelled; b's lane is untouched", [cancelled > 0, c.r.row(AK, "put", { k: "b" })?.waiting], [true, true]);
      },
      // Audit 1, rule 74 (2.7.13 Unbound): an old-version record's held lane stays unbound: listed under the identity and reported at each boot.
      "audit-an-old-version-records-held-lane-is-unbound-listed-and-reported"(c0) {
        const rel: Release = { v: 1 };
        const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
        const at = { actor: r1.machine, id: r1.id };
        const c = new Ctx(c0.fresh([editorFixture(rel)], { captureMs: 0 }), at);
        c.do(ensureStep(ensureArgs(r1)));
        c.send("Title", { title: "Foyer" });
        c.ack();
        c.answer("save", { lost: true });
        c.detach(at); // rule 73: its use ends, so after the grace its record is kept (retired) with the hold's lane
        c.advance(GRACE);
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        // Migration round 3 (rule 74: an old-version record's lanes are unbound, `UnboundLane`): not `HoldWithoutRecord`, which is a record unread.
        c.eq("an old-version record, its hold not called a hold without a record", [c.r.evidence("OldVersionActor").length, c.r.issues().filter((i) => i.code === "HoldWithoutRecord").length], [1, 0]);
        c.eq("its held lane is unbound, listed and reported", [c.r.inspect(at)?.unbound?.length, c.reportsOf("save", at).length], [1, 1]);
      },
      // Audit 1, C173 (R9): `forget` removes an old-version record, as it does a retired or undecodable one.
      "audit-forget-removes-an-old-version-record"(c0) {
        const c = editorAcross(c0, 1, 2);
        const r1 = editorRef({ workspaceId: "north", ticketId: "42" });
        const at = { actor: r1.machine, id: r1.id };
        c.eq("an old-version record on disk", [c.r.evidence("OldVersionActor").length, c.record(at) !== undefined], [1, true]);
        c.do({ forget: at });
        c.eq("forget removed it", c.record(at), undefined);
        c.reload();
        c.eq("no boot lists it again", c.r.evidence("OldVersionActor").length, 1);
      },
      // Audit 1, C181 (R7): a stamp saved in a format newer than the running Flow's (a downgrade) reads as an old version.
      "audit-a-key-stamp-in-a-newer-format-is-an-old-version"(c0) {
        const c = new Ctx(c0.fresh([keyStampFixture({ v: 1 })], { captureMs: 0 }), KS);
        c.ensure(KS);
        c.send("Go", { k: "a" });
        c.ack();
        c.answer("charge", { lost: true });
        c.fault({ corruptStored: { match: "lane/", edit: (raw: string) => raw.replaceAll("#2:", "#9:") } });
        c.reload();
        c.eq("an old-version hold", c.r.issues().filter((i) => i.code === "OldVersionLane").length, 1);
      },
      // Audit 1b, 2.7.15 (Q2 A, M2): beside an old-version hold a commit "ends NotSent { why: "OldVersion" } and its transition runs, under every
      // policy". `latest` and `cancel` too: nothing sent, the decline heard.
      "audit-under-latest-a-commit-beside-an-old-version-hold-declines-old-version"(c0) {
        const c = holdAcross(c0, (rel) => keyStampFixture(rel, "latest"), 1, 2);
        c.send("Go", { k: "b", region: "eu" });
        c.ack();
        c.eq("NotSent { OldVersion }, nothing sent", [c.mem(KS)?.why, c.lastEnding("charge")?.["reason"], c.reqs("charge").length], ["OldVersion", "OldVersion", 1]);
      },
      // Under `cancel` an unknown is held only for its own turn (R15-01), so the old-version hold lives through the restored unknown's turn; its
      // handler's commit of key b meets it there.
      "audit-under-cancel-a-commit-beside-an-old-version-hold-declines-old-version"(c0) {
        const rel: Release = { v: 1 };
        const c = new Ctx(c0.fresh([keyStampFixture(rel, "cancel", true)], { captureMs: 0 }), KS);
        c.ensure(KS);
        c.send("Go", { k: "a" });
        c.ack();
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("an old-version hold, its unknown heard", [c.r.issues().filter((i) => i.code === "OldVersionLane").length, c.mem(KS)?.unsure], [1, 1]);
        c.eq("the handler's commit: NotSent { OldVersion }, nothing sent", [c.mem(KS)?.why, c.lastEnding("charge")?.["reason"], c.reqs("charge").length], ["OldVersion", "OldVersion", 1]);
      },
    },
  },
];
