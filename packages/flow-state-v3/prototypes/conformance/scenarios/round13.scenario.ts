// Round 13: an op's key fields across releases (D221) and one default per field (D222), from round 12's final review (H1, M1, M2) and round 13's mid
// review (H1, M1, M2, M4). Each says what it would see without its fix.
import { ctorInputFixture, decodeInputFixture, keyStampFixture } from "../typed/round13.ts";
import type { Op } from "../fixtures/compiled.ts";
import type { Release } from "../fixtures/round6.compiled.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const A = { actor: "Lab/KeyStamp", id: "a" };
// Under release `from`, hold each of `keys` unsure; then release `to`, and the page boots again.
const holdThen = (c0: Ctx, from: number, to: number, keys: ReadonlyArray<Readonly<Record<string, string>>>, policy: Op["concurrency"] = "reject") => {
  const rel: Release = { v: from };
  const c = new Ctx(c0.fresh([keyStampFixture(rel, policy)], { captureMs: 0 }), A);
  c.ensure();
  for (const k of keys) {
    c.send("Go", k);
    c.ack();
    c.answer("charge", { lost: true });
  }
  c.eq("held", c.mem().unsure, keys.length);
  c.h.release(() => void (rel.v = to), () => void (rel.v = from));
  c.reload();
  return c;
};
const sent = (c: Ctx) => c.reqs("charge").length;

export const round13Scenarios: readonly Scenario[] = [
  {
    // D221: a release that changes an op's key fields makes a new version of it. An old-version hold is never renamed and never matched against a new key;
    // until it ends, every commit of the op declines (rule 16's busy, `NotSent { Rejected }`); its own old key reaches it. Round 12's D217 matched by key
    // shape (a decline with no release; a stranded hold); round 13's first D221 matched by projection, and its restore could drop a hold.
    id: "R13-KEYS",
    kind: "fault",
    fixtures: [keyStampFixture({ v: 1 })],
    actor: A,
    cites: ["D221", "D217", "D78", "rule:39", "rule:46", "rule:16"],
    variants: {
      // A field added. Without D221: the new key names a new lane, and a second charge goes beside the unsure one.
      "a-release-that-adds-a-key-field-declines-every-commit-until-the-old-hold-ends"(c0) {
        const c = holdThen(c0, 1, 2, [{ k: "a" }]);
        c.eq("said once", c.r.evidence("OldVersionLane").length, 1);
        c.send("Go", { k: "a", region: "eu" });
        c.send("Go", { k: "b", region: "eu" });
        c.eq("both declined, whatever their key", [c.mem().declined, c.r.evidence("BesideOldVersion").length, sent(c)], [2, 2, 1]);
        c.send("Retry", { k: "a" }); // its own old key
        c.ack();
        c.eq("the old hold is resent, as the same Attempt", [sent(c), c.keys("charge").length], [2, 1]);
        c.answer("charge", { ok: {} });
        c.send("Go", { k: "a", region: "eu" });
        c.ack();
        c.eq("then a commit sends", [sent(c), c.mem().declined], [3, 2]);
      },
      // A field removed, two old holds that would share the new key `{ k: a }`. Round 13's first D221 renamed one onto the other's id and dropped it
      // silently in one mint order (mid review H1); now neither moves, so no collision can occur, in either order.
      "a-release-that-removes-a-key-field-keeps-every-old-hold-eu-first"(c0) {
        const c = holdThen(c0, 2, 3, [{ k: "a", region: "eu" }, { k: "a", region: "us" }]);
        c.eq("both kept, both said", [c.r.evidence("OldVersionLane").length, c.r.evidence("LaneRekeyed").length, c.r.issues().filter((i) => i.code === "LaneRekeyCollision").length], [2, 0, 0]);
        c.eq("two lanes on disk", c.laneKeys().length, 2);
        c.send("Go", { k: "a" });
        c.eq("declined", [c.mem().declined, sent(c)], [1, 2]);
        c.send("Cancel", { k: "a", region: "eu" });
        c.send("Go", { k: "a" });
        c.eq("one old hold left: still declined", [c.mem().declined, sent(c)], [2, 2]);
        c.send("Cancel", { k: "a", region: "us" });
        c.send("Go", { k: "a" });
        c.ack();
        c.eq("both gone: it sends", [sent(c), c.mem().declined], [3, 2]);
      },
      "a-release-that-removes-a-key-field-keeps-every-old-hold-us-first"(c0) {
        const c = holdThen(c0, 2, 3, [{ k: "a", region: "us" }, { k: "a", region: "eu" }]);
        c.eq("both kept, both said", [c.r.evidence("OldVersionLane").length, c.r.issues().filter((i) => i.code === "LaneRekeyCollision").length, c.laneKeys().length], [2, 0, 2]);
        c.send("Go", { k: "a" });
        c.eq("declined", [c.mem().declined, sent(c)], [1, 2]);
      },
      // A keyed `idle` says what its commit would meet.
      "a-keyed-idle-sees-an-old-version-hold"(c0) {
        const c = holdThen(c0, 1, 2, [{ k: "a" }]);
        c.send("Guarded", { k: "z", region: "eu" });
        c.eq("the guard said no, so nothing met the hold", [c.mem().guardedOut, c.r.evidence("BesideOldVersion").length, sent(c)], [1, 0, 1]);
      },
      // `serialize` does not queue beside an old-version hold: it declines, as `reject` does.
      "serialize-declines-beside-an-old-version-hold-and-queues-nothing"(c0) {
        const c = holdThen(c0, 1, 2, [{ k: "a" }], "serialize");
        c.send("Go", { k: "a", region: "eu" });
        c.ack();
        c.eq("declined, not queued", [c.mem().declined, sent(c)], [1, 1]);
        c.send("Cancel", { k: "a" });
        c.send("Go", { k: "a", region: "eu" });
        c.ack();
        c.eq("then it sends", sent(c), 2);
      },
      // A reload in between keeps it an old-version hold: the stamp is on disk.
      "a-reload-in-between-keeps-the-old-version-hold"(c0) {
        const c = holdThen(c0, 1, 2, [{ k: "a" }]);
        c.reload();
        c.send("Go", { k: "a", region: "eu" });
        c.eq("still declined", [c.mem().declined, sent(c)], [1, 1]);
        c.eq("said at each boot", c.r.evidence("OldVersionLane").length, 2);
      },
      // Another actor's lanes are its own.
      "another-actor-is-not-held"(c0) {
        const c = holdThen(c0, 1, 2, [{ k: "a" }]);
        const b = { actor: "Lab/KeyStamp", id: "b" };
        c.ensure(b);
        c.to(b, "Go", { k: "a", region: "eu" });
        c.ack();
        c.eq("it sends", [sent(c), c.r.evidence("BesideOldVersion").length], [2, 0]);
      },
      // With no release, nothing is old: two keys are two lanes (rule 39).
      "with-no-release-two-keys-are-two-lanes"(c0) {
        const rel: Release = { v: 2 };
        const c = new Ctx(c0.fresh([keyStampFixture(rel)], { captureMs: 0 }), A);
        c.ensure();
        c.send("Go", { k: "a", region: "eu" });
        c.ack();
        c.send("Go", { k: "a", region: "us" });
        c.ack();
        c.reload();
        c.eq("two requests, nothing old", [sent(c), c.r.evidence("OldVersionLane").length, c.r.evidence("BesideOldVersion").length], [2, 0, 0]);
      },
    },
  },
  {
    // D222: one default per field, at creation and at restore alike. Round 13's first D222 split them: a release-added input with only a constructor default
    // quarantined every old actor; one with only a decoding default refused every creation (mid review M2).
    id: "R13-DEFAULTS",
    kind: "fault",
    fixtures: [ctorInputFixture({ v: 1 })],
    actor: { actor: "Lab/CtorInput", id: "a" },
    cites: ["D222", "D219", "D214", "D46"],
    variants: {
      "a-constructor-default-applies-at-creation-and-at-restore"(c0) {
        const rel: Release = { v: 1 };
        const a = { actor: "Lab/CtorInput", id: "a" };
        const c = new Ctx(c0.fresh([ctorInputFixture(rel)], { captureMs: 0 }), a);
        c.ensure();
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("an old actor restores with it", c.mem(), { seen: 1, n: 7 });
        c.ensure({ actor: "Lab/CtorInput", id: "b" });
        c.eq("a new one starts with it", c.mem({ actor: "Lab/CtorInput", id: "b" }), { seen: 1, n: 7 });
        c.eq("nothing quarantined", c.r.issues().filter((i) => i.code === "RecordQuarantined").length, 0);
      },
      "a-decoding-default-applies-at-creation-and-at-restore"(c0) {
        const rel: Release = { v: 1 };
        const a = { actor: "Lab/DecodeInput", id: "a" };
        const c = new Ctx(c0.fresh([decodeInputFixture(rel)], { captureMs: 0 }), a);
        c.ensure();
        c.h.release(() => void (rel.v = 2), () => void (rel.v = 1));
        c.reload();
        c.eq("an old actor restores with it", c.mem(), { seen: 1, n: 4 });
        c.ensure({ actor: "Lab/DecodeInput", id: "b" });
        c.eq("a new one starts with it", c.mem({ actor: "Lab/DecodeInput", id: "b" }), { seen: 1, n: 4 });
      },
    },
  },
];
