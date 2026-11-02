// Round 7: the persistence edge. Worked out by hand from the review's traces and convergence-7's decisions. D83-D89 are proposed; D80's 5 s is accepted.
import { bareFixture, BareId } from "../fixtures/round7.compiled.ts";
import { chatFixture } from "../fixtures/chat.compiled.ts";
import { Ctx, type Scenario } from "./ctx.ts";

const A = { actor: BareId, id: "a" };
const KEY = `lane/${A.actor}/${A.id}|charge|{}`;
const ACTOR = `actor/${A.actor}/${A.id}`;
const fresh = (c0: Ctx, bounds?: Record<string, number>) => {
  const c = new Ctx(c0.fresh([bareFixture()], bounds), A);
  c.namedIssues = c0.namedIssues;
  c.ensure();
  return c;
};
const disk = (c: Ctx, k: string) => c.r.stored().get(k) as any;
const noteOn = (c: Ctx) => disk(c, ACTOR)?.root.memory.note ?? "";
const heldBy = (c: Ctx) => c.r.row(A, "charge", {})?.uncertain;
const C = { actor: "Lab/Chat", id: "a" };

export const round7Scenarios: readonly Scenario[] = [
  {
    id: "REV7-H1",
    kind: "fault",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D83", "O3", "O5", "O6"],
    namedIssues: ["StorageFailure"],
    variants: {
      // The review's shape: plain batch fails, reported on the next tick, after the awaited write was issued.
      "a-late-failure-does-not-unsay-an-acknowledgement"(c0) {
        const c = fresh(c0);
        c.fault({ storageFailsLate: 1 });
        c.send("Go");
        c.ack();
        c.eq("sent", c.reqs("charge").length, 1);
        c.eq("said", c.r.issues().filter((i) => i.code === "StorageFailure").length, 1);
        c.advance(5_000); // the retry fires
        c.eq("still acknowledged on disk", disk(c, KEY)?.head?.acked, true);
        c.reload();
        c.eq("no second Attempt can be minted", c.r.row(A, "charge", {})?.uncertain, true);
        c.eq("a hold, not NotSent", c.lastEnding("charge")?.["reason"], "Restored");
        c.eq("unknown", c.lastEnding("charge")?.["channel"], "unknown");
        c.send("Go");
        c.eq("one request ever", c.reqs("charge").length, 1);
      },
      // O3: a batch in flight fails after a newer one succeeded.
      "a-batch-that-fails-after-a-newer-one-landed-stays-dead"(c0) {
        const c = fresh(c0);
        c.fault({ storageFailsHeld: 1 });
        c.send("Note", { text: "old" }); // issued, unanswered
        c.send("Note", { text: "new" }); // D95: held until the older one answers
        c.eq("held, not ahead of it", noteOn(c), "");
        c.do({ storage: "failLate" });
        c.eq("then the newest, and only the newest", noteOn(c), "new");
        c.advance(60_000);
        c.eq("the failed older write did not come back", noteOn(c), "new");
      },
      "a-failed-batch-re-enters-only-keys-it-was-newest-of"(c0) {
        const c = fresh(c0);
        c.fault({ storageFailsHeld: 1 });
        c.send("Go"); // actor + lane: fail later. The awaited write is newer for the lane; the actor is newest here
        c.eq("D94: the ack is not out yet", c.r.outside().storage.length, 0);
        c.do({ storage: "failLate" }); // D94: only now does the ack go out, with what the batch owed
        c.ack();
        c.advance(5_000);
        c.eq("the actor came back", disk(c, ACTOR).root.leaf, "W");
        c.eq("the lane did not", disk(c, KEY)?.head?.acked, true);
      },
      // The same on a later plain batch: a hold's record fails, said only after a re-send's capture was issued and landed.
      "a-re-send-capture-is-not-undone-by-an-older-hold-record"(c0) {
        const c = fresh(c0);
        c.send("Go");
        c.ack();
        c.fault({ storageFailsHeld: 1 });
        c.answer("charge", { lost: true }); // plain: { held: true }. Fails, nobody says so yet
        c.send("Retry");
        c.do({ storage: "failLate" }); // D94: the capture waits for this answer
        c.ack(); // the re-send's capture, retryCount 1
        c.advance(5_000);
        c.eq("the newer record stands", disk(c, KEY)?.head?.retryCount, 1);
      },
      // D94, E1: Pay's trace on the bare machine. The next write's ack does not land ahead of a failed batch that removed a lane.
      "E1-a-failed-batch-goes-with-the-next-ack"(c0) {
        const c = fresh(c0);
        c.send("Go");
        c.ack();
        c.fault({ storageFailsLate: 1 });
        c.answer("charge", { ok: {} }); // B, and the lane's removal: this batch fails
        c.send("Go"); // the next Attempt's ack carries what that batch owed
        c.ack();
        c.reload();
        c.eq("no ending says the finished write is unknown", c.endings("charge").filter((e) => e["channel"] === "unknown").length <= 1, true);
        c.eq("one lane on disk, the new one", [...c.r.stored().keys()].filter((k) => k.startsWith("lane/")).length, 1);
      },
      "E1-what-the-failed-batch-owed-goes-in-the-ack"(c0) {
        const c = fresh(c0);
        c.send("Go");
        c.ack();
        c.fault({ storageFailsHeld: 1 });
        c.answer("charge", { ok: {} }); // B and the lane's removal: fails, unsaid
        c.send("Go"); // the next ack waits
        c.do({ storage: "failLate" });
        c.ack();
        c.eq("the actor came with the ack, no retry needed", disk(c, ACTOR).root.leaf, "W");
      },
      "E2-a-later-batch-does-not-land-ahead-of-an-unanswered-one"(c0) {
        const c = fresh(c0);
        c.fault({ storageFailsHeld: 1 });
        c.send("Go"); // actor W + lane: fails, unsaid
        c.send("Note", { text: "t" }); // a later batch for the same actor
        c.eq("actor not on disk ahead of its lane", disk(c, ACTOR)?.root.leaf, "A");
        c.do({ storage: "failLate" });
        c.ack();
        c.eq("then all of it", disk(c, ACTOR).root.memory.note, "t");
      },
      "a-newer-value-is-not-replaced-by-a-retry-of-an-older-one"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        c.do({ hide: true });
        c.fault({ storageFailsHeld: 1 });
        c.send("Note", { text: "old" });
        c.do({ hide: true });
        c.send("Note", { text: "new" });
        c.do({ storage: "failLate" });
        c.do({ hide: true });
        c.eq("newest", noteOn(c), "new");
      },
      "L2-a-landing-resets-backoff-and-says-once"(c0) {
        const c = fresh(c0);
        c.fault({ storageFailsLate: 2 });
        c.send("Note", { text: "x" });
        c.advance(3_000); // 1 s, 2 s: lands
        c.eq("landed", noteOn(c), "x");
        c.eq("said once", c.r.issues().filter((i) => i.code === "StorageFailure").length, 1);
        c.fault({ storageFailsLate: 1 });
        c.send("Note", { text: "y" });
        c.advance(1_000);
        c.eq("1 s again: the landing reset it", noteOn(c), "y");
      },
      // The sync failure: a re-entry happens before the awaited write exists. The awaited write must take its keys out of `dirty`.
      "a-sync-failure-too"(c0) {
        const c = fresh(c0);
        c.fault({ storageFails: 1 });
        c.send("Go");
        c.ack();
        c.advance(5_000);
        c.eq("acknowledged", disk(c, KEY)?.head?.acked, true);
      },
      // `saved` had the refused value: a later identical record must still be written.
      "a-refused-ack-does-not-leave-saved-believing-it"(c0) {
        const c = fresh(c0);
        c.send("Go");
        c.do({ storage: "refuse" });
        c.state("A");
        c.eq("nothing was sent", c.reqs("charge").length, 0);
        c.send("Go");
        c.ack();
        c.eq("the second try is on disk", disk(c, KEY)?.head?.acked, true);
        c.eq("and sent", c.reqs("charge").length, 1);
      },
      // L2: backoff grows on a store that says so later, and resets on a landing.
      "backoff-grows-on-a-late-failure"(c0) {
        const c = fresh(c0);
        c.fault({ storageFailsLate: 3 });
        c.send("Note", { text: "x" });
        c.advance(1_000); // 1st retry, fails
        c.eq("not yet", noteOn(c), "");
        c.advance(1_000); // waiting: 2 s
        c.eq("2 s, not 1", c.r.outside().timers.length, 1);
        c.advance(1_000); // 2nd retry fails, 4 s next
        c.advance(3_000);
        c.eq("still waiting at 6 s", noteOn(c), "");
        c.advance(1_000);
        c.eq("landed at 7 s", noteOn(c), "x");
      },
    },
  },
  {
    id: "REV7-M1",
    kind: "example",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D84", "D80", "O3"],
    variants: {
      "a-success-does-not-come-back-as-a-hold"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        c.send("Go");
        c.ack();
        c.answer("charge", { ok: { n: 1 } });
        c.state("B");
        c.reload(); // at once: nothing coalesced can be lost
        c.state("B");
        c.eq("no lane", c.r.row(A, "charge", {})?.uncertain ?? false, false);
        c.eq("nothing restored", c.lastEnding("charge")?.["channel"], "success");
      },
      "only-lane-free-memory-waits"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        c.send("Note", { text: "t" });
        c.eq("waits", noteOn(c), "");
        c.send("Go");
        c.eq("a lane flushed it: memory and lane together", noteOn(c), "t");
        c.eq("the lane is on disk, whole", disk(c, ACTOR).root.leaf, "W");
      },
    },
  },
  {
    id: "REV7-D80",
    kind: "example",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D80", "O3"],
    variants: {
      "the-default-is-five-seconds"(c0) {
        const c = fresh(c0, { runtimeDefault: 1 });
        c.send("Note", { text: "t" });
        c.advance(4_999);
        c.eq("not yet", noteOn(c), "");
        c.advance(1);
        c.eq("now", noteOn(c), "t");
      },
      "many-values-one-write"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        for (const t of ["a", "b", "c"]) c.send("Note", { text: t });
        c.do({ hide: true });
        c.eq("the newest", noteOn(c), "c");
      },
      "hidden-flushes-at-once"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        c.send("Note", { text: "t" });
        c.do({ hide: true });
        c.eq("on disk", noteOn(c), "t");
        c.reload();
        c.eq("survives", c.mem().note, "t");
      },
      "a-kill-before-any-flush-loses-only-plain-memory"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        c.do({ hide: true }); // the actor's first record
        c.send("Note", { text: "t" });
        c.reload();
        c.eq("lost: stated by D80", c.mem().note, "");
        c.eq("not stopped", c.r.quiet().fatal, false);
      },
      // The sweep at 5 s (RESULTS): a dispose lost to a kill woke the actor. A retired identity is not plain memory.
      "D93-a-dispose-is-not-lost-to-a-kill"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        c.do({ hide: true }); // its record exists, so only the dispose can be lost
        c.dispose();
        c.reload();
        c.eq("not woken", c.r.state(A), undefined);
      },
      "dispose-runtime-flushes"(c0) {
        const c = fresh(c0, { captureMs: 5_000 });
        c.send("Note", { text: "t" });
        c.do({ disposeRuntime: true });
        c.eq("L3: disposal flushes", noteOn(c), "t");
      },
    },
  },
  {
    id: "REV7-M2",
    kind: "fault",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D87", "O5", "O4"],
    namedIssues: ["StorageFailure"],
    variants: {
      "a-slow-read-queues-a-click-in-order"(c0) {
        const c = fresh(c0);
        c.do({ reload: true, load: "hang" });
        c.h.do({ ensure: A });
        c.h.do({ send: A, event: "Note", payload: { text: "t" } });
        c.eq("nothing yet", c.r.state(A), undefined);
        c.do({ storage: "loadOk" });
        c.eq("ran after boot", c.mem().note, "t");
      },
      "a-read-that-never-answers-gets-an-issue-and-the-queue-runs"(c0) {
        const c = fresh(c0, { bootMs: 10_000 });
        c.do({ reload: true, load: "hang" });
        c.h.do({ ensure: A });
        c.h.do({ send: A, event: "Note", payload: { text: "t" } });
        c.eq("no issue yet", c.r.issues().length, 0);
        c.advance(10_000);
        c.eq("named", c.r.issues().filter((i) => i.code === "StorageFailure").length, 1);
        c.eq("the queue ran, unpersisted", c.mem().note, "t");
        c.do({ storage: "loadOk" }); // too late: ignored
        c.eq("still the same life", c.mem().note, "t");
      },
      "a-failed-read-runs-empty-and-writes-nothing"(c0) {
        const c = fresh(c0);
        c.send("Note", { text: "old" });
        c.do({ reload: true, load: "fail" });
        c.eq("named", c.r.issues().filter((i) => i.code === "StorageFailure").length, 1);
        c.ensure();
        c.send("Note", { text: "new" });
        c.eq("unread data not overwritten", noteOn(c), "old");
      },
      "two-machines-under-one-id-is-an-error"(c0) {
        let threw = "";
        try {
          c0.fresh([bareFixture(), bareFixture()]);
        } catch (e) {
          threw = String(e);
        }
        c0.yes("L4", threw.includes("DuplicateMachine"));
      },
      "the-queue-has-a-bound"(c0) {
        const c = fresh(c0, { bootQueue: 2 });
        c.do({ reload: true, load: "hang" });
        c.h.do({ ensure: A });
        c.h.do({ send: A, event: "Note", payload: { text: "1" } });
        c.h.do({ send: A, event: "Note", payload: { text: "2" } });
        c.eq("said once", c.r.evidence("dropped").length, 1);
        c.do({ storage: "loadOk" });
        c.eq("the first ones ran", c.mem().note, "1");
      },
    },
  },
  {
    id: "REV7-M8",
    kind: "fault",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D88", "rule:46", "rule:17"],
    namedIssues: ["RecordQuarantined"],
    variants: {
      "a-quarantined-lane-refuses-a-second-attempt"(c0) {
        const c = fresh(c0);
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.state("U");
        c.fault({ corruptStored: { match: "lane/", edit: () => '{"head":"junk"}' } });
        c.reload();
        c.eq("named", c.r.issues().filter((i) => i.code === "RecordQuarantined").length, 1);
        c.eq("the row says uncertain", c.r.row(A, "charge", {})?.uncertain, true);
        const p = c.mem().peeks;
        c.send("IfIdle");
        c.eq("idle denies", c.mem().peeks, p);
        c.send("Go");
        c.eq("a commit declines", c.lastEnding("charge")?.["reason"], "Rejected");
        c.send("Forget"); // U's owner: clears it, and the record goes
        c.eq("the row says", c.r.row(A, "charge", {})?.uncertain ?? false, false);
        c.reload();
        c.eq("gone for good: not named again", c.r.issues().filter((i) => i.code === "RecordQuarantined").length, 1);
      },
      "commit-declines-while-it-stands-and-the-record-stays"(c0) {
        const c = fresh(c0);
        c.send("Note", { text: "t" });
        c.send("Go");
        c.ack();
        c.answer("charge", { lost: true });
        c.fault({ corruptStored: { match: "lane/", edit: () => "{not json" } });
        c.reload();
        const before = c.reqs("charge").length;
        c.do({ send: A, event: "Go", payload: {} });
        c.eq("no new request", c.reqs("charge").length, before);
        c.eq("it declined as NotSent", c.lastEnding("charge")?.["reason"], "Rejected");
        c.reload();
        c.eq("the record stayed: named again", c.r.issues().filter((i) => i.code === "RecordQuarantined").length, 2);
      },
    },
  },
  {
    id: "REV7-M9",
    kind: "fault",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D89", "O5", "D57"],
    namedIssues: ["UnencodableValue"],
    variants: {
      "an-ending-with-a-bad-value-is-not-lost"(c0) {
        const c = fresh(c0);
        c.send("Go");
        c.ack();
        c.answer("charge", { ok: { big: 10n } });
        c.state("B");
        c.eq("named", c.r.issues().some((i) => i.code === "UnencodableValue"), true);
        c.eq("the whole batch skipped: lane still on disk", disk(c, KEY)?.head?.acked, true);
        c.reload();
        c.eq("honest: a hold, not a second Attempt", c.lastEnding("charge")?.["channel"], "unknown");
        const n = c.reqs("charge").length;
        c.send("Go");
        c.eq("no mint beside it", c.reqs("charge").length, n);
      },
      "a-skipped-batch-waits-for-an-encodable-state"(c0) {
        const c = fresh(c0);
        c.send("Go");
        c.ack();
        c.answer("charge", { ok: { big: 10n } });
        c.send("NoteBad");
        c.eq("named once", c.r.issues().filter((i) => i.code === "UnencodableValue").length, 1);
        c.yes("the lane is still there", !!disk(c, KEY));
        c.do({ fault: { storageFails: 0 } });
        c.yes("unchanged", !!disk(c, KEY));
      },
      "M11-a-throwing-getter-from-a-patch-is-a-refusal-not-fatal"(c0) {
        c0.namedIssues.push("InvalidTurn");
        const c = fresh(c0);
        c.send("Note", { text: "good" });
        c.send("NoteGetter");
        c.eq("not fatal", c.r.quiet().fatal, false);
        c.eq("refused", c.mem().note, "good");
      },
      "a-commit-that-cannot-be-written-ahead-declines-and-the-transition-runs"(c0) {
        const c = fresh(c0);
        c.send("GoBad");
        c.eq("nothing sent", c.reqs("charge").length, 0);
        c.eq("the ending", c.lastEnding("charge")?.["reason"], "StorageRefused");
        c.state("A"); // moved to W, then NotSent moved it back
        c.eq("named", c.r.issues().some((i) => i.code === "UnencodableValue"), true);
      },
      "memory-that-cannot-encode-does-not-refuse-the-turn"(c0) {
        const c = fresh(c0);
        c.send("Note", { text: "good" });
        c.send("NoteBad");
        c.eq("the turn committed", String(c.mem().note), "1");
        c.eq("the last good capture", noteOn(c), "good");
        c.send("Note", { text: "better" });
        c.eq("an encodable state captures again", noteOn(c), "better");
      },
    },
  },
  {
    id: "REV7-SEARCH-FAKE",
    kind: "example",
    fixtures: [bareFixture()],
    actor: A,
    cites: ["D83"],
    variants: {
      "the-fake-really-says-it-late"(c0) {
        const c = fresh(c0);
        c.namedIssues.push("StorageFailure");
        c.fault({ storageFailsHeld: 1 });
        c.send("Note", { text: "x" });
        c.eq("nothing said yet", c.r.issues().length, 0);
        c.eq("one report owed", c.r.outside().failing, 1);
        c.do({ storage: "failLate" });
        c.eq("said", c.r.issues().length, 1);
      },
    },
  },
  {
    id: "REV7-CHAT",
    kind: "example",
    fixtures: [chatFixture()],
    actor: C,
    cites: ["D80", "D84"],
    variants: {
      "a-chat-stream-still-coalesces"(c0) {
        const c = new Ctx(c0.fresh([chatFixture()], { captureMs: 5_000 }), C);
        c.ensure();
        c.send("Mute");
        const disk0 = () => (c.r.stored().get(`actor/${C.actor}/${C.id}`) as any)?.root.memory.muted;
        c.eq("waits", disk0() ?? false, false);
        c.advance(5_000);
        c.eq("then lands", disk0(), true);
      },
    },
  },
];
