// Round 4: the review's findings as scenarios, and the real shapes it asked for (review H7). Each expected result is worked out by
// hand from the rule it cites, or from the real file its fixture copies. D57-D64 are convergence-4's: proposed.
import { commentRef, editorFixture } from "../typed/comments.ts";
import { issueRef, issuesFixture } from "../typed/issues.ts";
import {
  feedFixture,
  formFixture,
  issuesPersisted,
  issuesThrowing,
  notesFixture,
} from "../typed/lab-machines.ts";
import {
  addressFixture,
  attachDomainFixture,
  attachFixture,
  attachMissingReason,
  deepAt,
  emptyAddress,
  panelsFixture,
  ticketFixture,
} from "../typed/real.ts";
import type { Fixture } from "../harness.ts";
import { searchOdd } from "../search/odd.search.ts";
import type { Scenario } from "./ctx.ts";
import { Ctx } from "./ctx.ts";

const A = { actor: "Issues/List", id: "a" };
const I1 = issueRef("i1");
const k = { id: "i1" };
const N = { actor: "Notes", id: "a" };
const F = { actor: "Form", id: "a" };
const AD = { actor: "Checkout/Addr", id: "a" };
const TK = { actor: "Desk/Ticket", id: "a" };
const AT = { actor: "Desk/Attach", id: "a" };
const PN = { actor: "Desk/Panels", id: "a" };
const DP = { actor: "Deep", id: "a" };
const opened = (c: Ctx) => {
  c.ensure(A);
  c.to(A, "Load");
  c.answer("list", { truth: true });
};
const server = (c: Ctx) => c.r.truth().server.issues;
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
const edit = (f: (r: any) => void) => (raw: string) => {
  const r = JSON.parse(raw);
  f(r);
  return JSON.stringify(r);
};
const corrupt = (c: Ctx, match: string, f: (r: any) => void) =>
  c.fault({ corruptStored: { match, edit: edit(f) } });
const file = (ref: string) => ({ ref, name: `${ref}.png` });
const files = (c: Ctx, ...refs: string[]) => {
  c.send("SetFiles", { attachments: refs.map(file) });
  c.advance(0); // AttachmentUpload's 0 ms start schedule
};
const upload = (c: Ctx, ref: string) => c.inner([`uploads:${ref}`])?.memory;
const addr = (over: object) => ({ ...emptyAddress, ...over });

export const round4Scenarios: readonly Scenario[] = [
  // ── H1, H2: D58, D59.
  {
    id: "REV4-H1",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D58", "rule:31", "sec:2.8.6"],
    variants: {
      "a-read-started-during-a-write-does-not-overwrite-it"(c) {
        opened(c);
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.to(A, "Load");
        c.answer("like", { apply: true });
        c.answer("list", {
          ok: [{ id: "i1", title: "title i1", slug: "title i1", liked: false, likes: 0 }],
        });
        c.eq("the confirmed write stands", c.rec(I1)?.data.liked, true);
        c.eq("marked: a read differed", c.rec(I1)?.uncertain, true);
        c.eq("repair asked", c.reqs("repair").length, 1);
        c.answer("repair", { truth: true });
        c.eq(
          "a later read settles it",
          [c.rec(I1)?.data, c.rec(I1)?.uncertain],
          [server(c).i1, false],
        );
      },
      "a-read-started-after-the-write-applies-with-no-extra-read"(c) {
        opened(c);
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.answer("like", { apply: true });
        c.to(A, "Load");
        c.answer("list", {
          ok: [{ id: "i1", title: "title i1", slug: "title i1", liked: false, likes: 0 }],
        });
        c.eq("believed: it started after", c.rec(I1)?.data.liked, false);
        c.eq("no repair", c.reqs("repair").length, 0);
      },
      "the-doubt-outlives-a-failed-repair"(c) {
        opened(c);
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.to(A, "Load");
        c.answer("like", { apply: true });
        c.answer("list", {
          ok: [{ id: "i1", title: "title i1", slug: "title i1", liked: false, likes: 0 }],
        });
        c.answer("repair", { fail: { tag: "NoResponse" } });
        c.advance(3_600_000);
        c.eq(
          "still marked, the write still shown",
          [c.rec(I1)?.uncertain, c.rec(I1)?.data.liked],
          [true, true],
        );
        c.to(A, "Load");
        c.answer("list", { truth: true });
        c.eq("a read after it clears it", c.rec(I1)?.uncertain, false);
      },
    },
  },
  {
    id: "REV4-H2",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D59", "rule:32", "sec:2.8.6"],
    variants: {
      "a-confirmed-write-is-shown-during-the-repair-and-stays-marked"(c) {
        opened(c);
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.eq("not there", [c.rec(I1)?.data.liked, c.rec(I1)?.uncertain], [false, true]);
        c.to(A, "ReconcileLike", k);
        c.answer("like", { apply: true });
        c.eq("the answer shows", c.rec(I1)?.data.liked, true);
        c.eq("marked until a read", c.rec(I1)?.uncertain, true);
        c.answer("repair", { truth: true });
        c.eq("settled", [c.rec(I1)?.data.liked, c.rec(I1)?.uncertain], [true, false]);
      },
      "one-failed-repair-does-not-leave-the-screen-wrong-and-clean"(c) {
        opened(c);
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(A, "ReconcileLike", k);
        c.answer("like", { apply: true });
        c.answer("repair", { fail: { tag: "NoResponse" } });
        c.advance(3_600_000);
        c.eq(
          "true to the server, and marked",
          [c.rec(I1)?.data.liked, c.rec(I1)?.uncertain],
          [true, true],
        );
        c.eq("server", server(c).i1.liked, true);
      },
      "a-read-that-started-before-the-doubt-does-not-clear-it"(c) {
        opened(c);
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.answer("like", { lost: true });
        c.answer("repair", { truth: true });
        c.to(A, "Load");
        c.to(A, "ReconcileLike", k);
        c.answer("like", { apply: true });
        c.answer("list", { truth: true }); // says the same, and started before the doubt
        c.eq("still marked", c.rec(I1)?.uncertain, true);
        c.answer("repair", { truth: true });
        c.eq("a read after it clears it", c.rec(I1)?.uncertain, false);
      },
      "a-confirms-mapper-that-throws-keeps-the-mark"(c0) {
        const c = at(
          c0,
          {
            ...issuesThrowing,
            make: (api) => {
              const m = issuesThrowing.make(api);
              return {
                ...m,
                domain: {
                  ...m.domain!,
                  writes: {
                    ...m.domain!.writes,
                    like: {
                      ...m.domain!.writes["like"]!,
                      confirms: () => {
                        throw new Error("odd shape");
                      },
                    },
                  },
                },
              };
            },
          },
          A,
        );
        c0.namedIssues.push("UserClosure");
        c.to(A, "Load");
        c.answer("list", { truth: true });
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.answer("like", { apply: true });
        c.eq("nothing believed: marked", c.rec(I1)?.uncertain, true);
        c.answer("repair", { fail: { tag: "NoResponse" } });
        c.eq("still", c.rec(I1)?.uncertain, true);
      },
    },
  },
  // ── H3: D57, D61. A record this release cannot read.
  {
    id: "REV4-H3",
    kind: "fault",
    fixtures: [notesFixture],
    actor: N,
    namedIssues: ["RecordQuarantined", "HoldWithoutRecord"], // phase 1 migration round 2: a hold left by an unreadable record is said too
    cites: ["D57", "D61", "rule:46"],
    variants: {
      ...Object.fromEntries(
        (
          [
            ["leaf-this-release-removed", "actor/", (r: any) => (r.root.leaf = "REMOVED")],
            [
              "kid-frag-this-release-removed",
              "actor/",
              (r: any) => (r.root.kids["docs:d1"].frag = "REMOVED"),
            ],
            ["kid-leaf-removed", "actor/", (r: any) => (r.root.kids["docs:d1"].leaf = "REMOVED")],
            ["placement-removed", "actor/", (r: any) => (r.root.kids["docs:d1"].name = "nope")],
            ["no-timers", "actor/", (r: any) => delete r.timers],
            ["no-kids", "actor/", (r: any) => delete r.root.kids],
            ["activations-for-a-leaf-gone", "actor/", (r: any) => (r.root.activations = {})],
            ["timer-of-no-shape", "actor/", (r: any) => (r.timers = [{ kind: "schedule" }])],
            ["memory-not-an-object", "actor/", (r: any) => (r.root.memory = 5)],
            [
              "kid-frag-is-another-fragment",
              "actor/",
              (r: any) => (r.root.kids["docs:d1"].frag = "Upload"),
            ],
            [
              "history-names-a-removed-node",
              "actor/",
              (r: any) => (r.root.kids["docs:d1"].history = { root: "GONE" }),
            ],
            [
              "frozen-of-no-shape",
              "actor/",
              (r: any) => (r.root.kids["docs:d1"].frozen = { timers: 5 }),
            ],
          ] as const
        ).map(([name, match, f]) => [
          name,
          (c: Ctx) => {
            c.ensure();
            c.send("SetDocs", { docs: ["d1"] });
            c.into(["docs:d1"], "Edited", { body: "mine" });
            c.ack();
            corrupt(c, match, f);
            c.reload();
            c.eq("boot 1 alive", c.r.quiet().fatal, false);
            c.eq("named", c.r.issues().filter((i) => i.code !== "HoldWithoutRecord").at(-1)?.code, "RecordQuarantined");
            c.reload();
            c.eq("boot 2 alive", c.r.quiet().fatal, false);
            c.eq("no actor until asked", c.r.state(N), undefined);
            c.ensure();
            c.state("READY");
            c.send("SetDocs", { docs: ["d1"] });
            c.eq("the lane is adopted, once", c.inner(["docs:d1"])?.memory.reason, "Restored");
            c.into(["docs:d1"], "Resend");
            c.ack();
            c.eq(
              "a hold stays a hold across both boots: sent again, the same id",
              [c.reqs("save").length, c.keys("save").length],
              [2, 1],
            );
          },
        ]),
      ),
      "lane-without-w"(c) {
        c.ensure();
        c.send("SetDocs", { docs: ["d1"] });
        c.into(["docs:d1"], "Edited", { body: "mine" });
        c.ack();
        corrupt(c, "lane/", (r) => delete r.w);
        c.reload();
        c.eq("alive", c.r.quiet().fatal, false);
        c.eq("named", c.r.issues().at(-1)?.code, "RecordQuarantined");
        c.reload();
        c.eq("boot 2 alive", c.r.quiet().fatal, false);
        c.eq("the actor is fine", c.r.state(N), "READY");
      },
      "lane-head-of-no-shape"(c) {
        c.ensure();
        c.send("SetDocs", { docs: ["d1"] });
        c.into(["docs:d1"], "Edited", { body: "mine" });
        c.ack();
        corrupt(c, "lane/", (r) => (r.head = { id: 5 }));
        c.reload();
        c.eq("alive", c.r.quiet().fatal, false);
        c.eq("named", c.r.issues().at(-1)?.code, "RecordQuarantined");
      },
    },
  },
  // ── H4: D57. One odd value, one send.
  {
    id: "REV4-H4",
    kind: "fault",
    fixtures: [attachFixture],
    actor: AT,
    cites: ["D57", "D46", "rule:9"],
    variants: {
      ...Object.fromEntries(
        (
          [
            ["null", null],
            ["five", 5],
            ["string", "x"],
            ["nullItem", [null]],
            ["emptyItem", [{}]],
            ["objKey", [{ ref: { a: 1 } }]],
          ] as const
        ).map(([name, v]) => [
          `list-${name}-repairs-never-refuses`,
          (c: Ctx) => {
            c.ensure();
            c.send("SetFiles", { attachments: v });
            c.eq("alive", c.r.quiet().fatal, false);
            c.yes("evidence", c.r.evidence("listRepair").length >= 1);
            c.eq("no copies, and a list", c.mem().uploads, []);
            c.send("Touch");
            c.eq("the machine goes on", c.mem().touched, 1);
          },
        ]),
      ),
      "a-good-item-beside-a-bad-one-stays"(c) {
        c.ensure();
        c.send("SetFiles", { attachments: [null, file("r1")] });
        c.yes("the good one", upload(c, "r1"));
        c.eq("repaired once", c.r.evidence("listRepair").length, 1);
      },
      ...Object.fromEntries(
        (() => {
          const cycle: any = {};
          cycle.self = cycle;
          return [
            ["set", new Set()], // D119: a bigint has a name now, so it resets: REV9-NAMES
            ["cycle", cycle],
          ] as const;
        })().map(([name, v]) => [
          `reset-value-${name}-resets-nothing`,
          (c: Ctx) => {
            c.namedIssues.push("UnencodableValue");
            c.ensure();
            c.send("SetSubject", { subject: v });
            c.eq("alive", c.r.quiet().fatal, false);
            c.eq("named, not refused", c.r.issues().map((i) => i.code).includes("InvalidTurn"), false);
            c.yes("named", c.r.issues().some((i) => i.code === "UnencodableValue"));
            c.yes("the patch ran", c.mem().subject === v);
          },
        ]),
      ),
      "a-success-of-a-bigint-parked-on-a-persisted-lane"(c0) {
        const c = at(c0, notesFixture, N);
        c0.namedIssues.push("UnencodableValue");
        c.send("SetDocs", { docs: ["d1"] });
        c.into(["docs:d1"], "Edited", { body: "mine" });
        c.ack();
        c.send("SetDocs", { docs: [] });
        c.answer("save", { ok: 10n });
        c.eq("alive", c.r.quiet().fatal, false);
        c.eq("named", c.r.issues().at(-1)?.code, "UnencodableValue");
        c.send("SetDocs", { docs: ["d1"] });
        c.eq("the ending still arrives", c.inner(["docs:d1"])?.memory.saved, "mine");
        c.reload();
        c.eq("alive after a reload", c.r.quiet().fatal, false);
      },
      "memory-initial-of-a-bigint-on-a-persisted-machine"(c0) {
        const f: Fixture = {
          ...notesFixture,
          make: (api) => {
            const m = notesFixture.make(api);
            return {
              ...m,
              memory: { initial: { ...m.memory.initial, run: () => ({ big: 10n }) } },
            };
          },
        };
        const c = new Ctx(c0.fresh([f]), N);
        // Round 7, D89: the actor starts; its record does not reach disk, and that is named.
        c0.namedIssues.push("UnencodableValue");
        c.ensure();
        c.eq("alive", c.r.quiet().fatal, false);
        c.yes("an actor", c.r.state(N) !== undefined);
        c.eq("no record", c.record(N) !== undefined, false);
      },
      "a-schedule-of-no-length-refuses-the-turn"(c0) {
        const c = at(c0, deepAt("A"), DP);
        c0.namedIssues.push("InvalidTurn");
        c.send("OddEntry");
        c.eq("alive", c.r.quiet().fatal, false);
        c.state("B");
        c.eq("refused", c.r.issues().at(-1)?.code, "InvalidTurn");
      },
      "an-address-of-no-shape-is-unhandled"(c) {
        c.ensure();
        c.do({ send: AT, event: "Touch", payload: {}, to: 5 as never });
        c.eq("alive", c.r.quiet().fatal, false);
        c.eq("not delivered", c.mem().touched, 0);
      },
      "a-record-field-of-a-bigint-does-not-disable-the-store"(c0) {
        const c = new Ctx(c0.fresh([issuesFixture]), A);
        c.ensure();
        c.to(A, "Load");
        c.answer("list", { truth: true });
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.answer("like", { ok: { id: "i1", big: 10n } });
        c.eq(
          "no defect",
          c.r.issues().map((i) => i.code),
          [],
        );
        c.to(A, "Toggle", { id: "i2", liked: true });
        c.eq("the store goes on", c.reqs("like").length, 2);
      },
      "a-mapper-of-no-shape-does-not-disable-the-store"(c0) {
        const f: Fixture = {
          ...issuesFixture,
          make: (api) => {
            const m = issuesFixture.make(api);
            return { ...m, domain: { ...m.domain!, reads: { list: () => 5 as never } } };
          },
        };
        const c = new Ctx(c0.fresh([f]), A);
        c0.namedIssues.push("UserClosure");
        c.ensure();
        c.to(A, "Load");
        c.answer("list", { truth: true });
        c.eq(
          "named, not a defect",
          c.r.issues().map((i) => i.code),
          ["UserClosure"],
        );
        c.to(A, "Toggle", { id: "i1", liked: true });
        c.eq("the store goes on", c.reqs("like").length, 1);
      },
    },
  },
  // ── H5: D57. Keys that are not tiny tokens.
  {
    id: "REV4-H5",
    kind: "example",
    fixtures: [formFixture],
    actor: F,
    cites: ["D57", "rule:9", "rule:23"],
    variants: {
      "a-colon-keeps-its-copy"(c) {
        c.ensure();
        c.send("SetIds", { ids: ["user:1"] });
        c.into(["rows:user:1"], "Changed", { value: "typed" });
        c.send("SetSubject", { subject: "s1" });
        c.eq("typed stays", c.inner(["rows:user:1"])?.memory.value, "typed");
        c.eq("no abandon", c.mem().goneRows, []);
      },
      "removal-tells-the-real-key"(c) {
        c.ensure();
        c.send("SetIds", { ids: ["user:1"] });
        c.send("SetIds", { ids: [] });
        c.eq("the whole key", c.mem().goneRows, ["user:1"]);
      },
      ...Object.fromEntries(
        [
          "gid://shop/Product/1",
          "a/b",
          "2026-11-02T00:00:00Z",
          "with space",
          '"quoted"',
          "g1.2",
        ].map((key) => [
          `key ${key}: armed, sent, stored`,
          (c0: Ctx) => {
            const c = at(c0, attachFixture, AT);
            files(c, key);
            c.eq("the start schedule ran", upload(c, key)?.status, "sending");
            c.ack();
            c.answer("put", { apply: true });
            c.eq("stored", upload(c, key)?.status, "stored");
            c.eq("the host heard the whole key", c.mem().stored, [key]);
            c.reload();
            c.eq("and it survives a reload", upload(c, key)?.status, "stored");
          },
        ]),
      ),
      "one-lane-whatever-order-a-key-is-written"(c0) {
        const c = at(c0, panelsFixture, PN);
        c.into(["history"], "Pin", { entryId: "e1", pinned: true });
        c.ack();
        c.into(["history"], "Pin", { entryId: "e1", pinned: true });
        c.eq("the guard saw the lane: one request", c.reqs("pin").length, 1);
        c.eq("no second mint", c.r.evidence("mint").filter((e) => e["op"] === "pin").length, 1);
      },
      "a-reset-value-is-the-value-not-its-key-order"(c0) {
        const c = at(c0, attachFixture, AT);
        c.send("SetSubject", { subject: { a: 1, b: 2 } });
        const one = c.mem().resets;
        c.send("SetSubject", { subject: { b: 2, a: 1 } });
        c.eq("the same value resets nothing", c.mem().resets, one);
        c.send("SetSubject", { subject: { a: 1, b: 3 } });
        c.eq("a new one does", c.mem().resets, one + 1);
      },
    },
  },
  // ── M1-M7, L1-L5.
  {
    id: "REV4-M1",
    kind: "fault",
    fixtures: [issuesPersisted],
    actor: A,
    bounds: { queueMax: 1 },
    cites: ["D48", "rule:29", "rule:35"],
    run(c) {
      c.ensure(A);
      c.to(A, "Toggle", { id: "i1", liked: true });
      c.to(A, "Toggle", { id: "i1", liked: false });
      c.eq("the second is refused", c.endings("like").at(-1)?.reason, "Overloaded");
      c.ack();
      c.eq("the first was not superseded: it goes", c.reqs("like").length, 1);
      c.eq("no Superseded", c.r.evidence("Superseded").length, 0);
      c.answer("like", { apply: true });
      c.eq("row gone", c.r.row(A, "like", k), undefined);
    },
  },
  {
    id: "REV4-M2",
    kind: "example",
    fixtures: [deepAt("MID")],
    actor: DP,
    cites: ["rule:1", "rule:52"],
    variants: {
      "a-live-child-pauses-and-fires-once"(c) {
        c.ensure();
        c.send("Far");
        c.advance(10_000);
        c.eq("frozen, none fired", c.inner(["mid", "ch"])?.memory.due, 0);
        c.send("Mid");
        c.eq("overdue, once", c.inner(["mid", "ch"])?.memory.due, 1);
      },
      "a-frozen-child-keeps-its-timer-through-a-freeze-above"(c) {
        c.ensure();
        c.into(["mid"], "ToY");
        c.send("Far");
        c.send("Mid");
        c.advance(10_000);
        c.eq("its node is not active: still frozen", c.inner(["mid", "ch"])?.memory.due, 0);
        c.into(["mid"], "ToX");
        c.eq("its own return fires it", c.inner(["mid", "ch"])?.memory.due, 1);
      },
    },
  },
  {
    id: "REV4-M3",
    kind: "example",
    fixtures: [deepAt("HERE")],
    actor: DP,
    cites: ["rule:9", "rule:52", "rule:60"],
    variants: {
      "a-removed-frozen-copy-has-ended-now"(c) {
        c.ensure();
        c.send("SetRows", { rows: ["a"] });
        c.send("Away");
        c.yes("frozen, readable", c.inner(["rows:a"]));
        c.send("SetRows", { rows: [] });
        c.eq("gone at once", c.inner(["rows:a"]), undefined);
      },
      "its-release-runs-while-the-host-is-away"(c) {
        c.ensure();
        c.send("SetRows", { rows: ["a"] });
        c.into(["rows:a"], "Send");
        c.send("Away");
        c.eq("still on the wire", c.reqs("rowPut").length, 1);
        c.send("SetRows", { rows: [] });
        c.eq("interrupted, released", c.lastEnding("rowPut")?.reason, "Cancelled");
        c.eq(
          "evidence, no parked wait",
          c.r.quiet().waits.filter((w) => w.kind === "parked").length,
          0,
        );
        c.eq("row gone", c.r.row(DP, "rowPut", { key: "a" }), undefined);
      },
      "a-thaw-tells-its-own-hold-nothing-new"(c) {
        c.ensure();
        c.send("SetRows", { rows: ["a"] });
        c.into(["rows:a"], "Send");
        c.answer("rowPut", { lost: true });
        c.eq("heard once", c.r.evidence("delivered").length, 1);
        c.send("Away");
        c.send("Back");
        c.eq(
          "still once: no Restored for the life that owned it",
          c.r.evidence("delivered").length,
          1,
        );
        c.eq("still held", c.r.row(DP, "rowPut", { key: "a" })?.uncertain, true);
      },
      "r60-a-parked-ending-is-evidence-once-marked"(c) {
        c.ensure();
        c.send("SetRows", { rows: ["a"] });
        c.into(["rows:a"], "Send");
        c.send("Away");
        c.answer("rowPut", { apply: true });
        c.eq("parked while frozen", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 1);
        c.send("SetRows", { rows: [] });
        c.eq("gone with the copy", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 0);
        c.send("Back");
        c.send("SetRows", { rows: ["a"] });
        c.eq("a new copy never hears it", c.inner(["rows:a"])?.memory.put, false);
      },
    },
  },
  {
    id: "REV4-M4",
    kind: "fault",
    fixtures: [notesFixture],
    actor: N,
    bounds: { followUps: 1 },
    cites: ["D35", "rule:8", "rule:54"],
    run(c) {
      c.ensure();
      c.send("SetDocs", { docs: ["d1"] });
      c.into(["docs:d1"], "Edited", { body: "mine" });
      c.ack();
      c.send("SetDocs", { docs: [] });
      c.answer("save", { apply: true });
      c.eq("parked", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 1);
      c.send("SetDocsThen", { docs: ["d1"] });
      c.eq("adoption past the bound is not dropped", c.inner(["docs:d1"])?.memory.saved, "mine");
      c.eq("nothing parked", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 0);
    },
  },
  {
    id: "REV4-M5",
    kind: "fault",
    fixtures: [deepAt("WAIT")],
    actor: DP,
    namedIssues: ["InvalidTurn"],
    cites: ["D50", "rule:8"],
    variants: {
      "a-firing-that-throws-once-comes-again"(c) {
        c.ensure();
        c.fault({ throwIn: "states.WAIT.on.GiveUp[0].guard[0]" });
        c.advance(1000);
        c.state("FAR");
        c.eq("one issue", c.r.issues().length, 1);
      },
      "a-firing-that-always-throws-is-final-and-bounded"(c) {
        c.ensure();
        c.fault({ throwIn: "states.WAIT.on.GiveUp[0].guard[0]", times: 2 });
        c.advance(1000);
        c.state("WAIT");
        c.eq("two issues, no loop", c.r.issues().length, 2);
      },
    },
  },
  {
    id: "REV4-M7",
    kind: "example",
    fixtures: [attachFixture],
    actor: AT,
    cites: ["rule:9"],
    run(c) {
      c.ensure();
      c.eq("no copies reads as a list", c.mem().uploads, []);
      c.send("SetFiles", { attachments: [file("a"), file("b")] });
      const refs = () => c.mem().uploads.map((u: any) => u.ref);
      c.eq("field order", refs(), ["a", "b"]);
      c.send("SetFiles", { attachments: [file("b"), file("a")] });
      c.eq("follows the field", refs(), ["b", "a"]);
    },
  },
  {
    id: "REV4-L1",
    kind: "fault",
    fixtures: [issuesFixture],
    actor: A,
    namedIssues: ["ModuleDefect"],
    cites: ["D46"],
    run(c) {
      opened(c);
      c.to(A, "Toggle", { id: "i1", liked: true });
      const evidence = c.r.evidence().length;
      c.fault({ throwInModuleAfter: "ended" });
      c.answer("like", { lost: true }); // `ended` arms and commands a repair, then the module throws
      c.eq("no repair command went out", c.reqs("repair").length, 0);
      c.eq("no repair evidence", c.r.evidence("repair").slice(0).length, 0);
      c.yes("the rest ran", c.r.evidence().length > evidence);
      c.eq("no timer of the module", c.r.quiet().waits.filter((w) => w.kind === "timer").length, 0);
    },
  },
  {
    id: "REV4-L2",
    kind: "example",
    fixtures: [deepAt("HERE")],
    actor: DP,
    cites: ["rule:60"],
    run(c0) {
      const f: Fixture = {
        id: "Deep",
        ...(deepAt("HERE").services ? { services: deepAt("HERE").services! } : {}), // round 11, D211: an edited fixture carries its services
        make: (api) => {
          const m = deepAt("HERE").make(api);
          return {
            ...m,
            persisted: true,
            ops: { ...m.ops, rowPut: { ...m.ops["rowPut"]!, concurrency: "serialize" } },
          };
        },
      };
      const c = at(c0, f, DP);
      c.send("SetRows", { rows: ["a"] });
      c.into(["rows:a"], "Send");
      c.ack();
      c.answer("rowPut", { lost: true });
      c.into(["rows:a"], "Send"); // W behind a held head
      c.send("SetRows", { rows: [] });
      c.ack();
      c.eq("one request only", c.reqs("rowPut").length, 1);
      c.eq("one released", c.r.evidence("Released").length, 1);
      c.eq(
        "no record left",
        c.laneKeys(),
        [],
      );
    },
  },
  {
    id: "REV4-L4",
    kind: "example",
    fixtures: [issuesFixture],
    actor: A,
    cites: ["D58", "sec:2.8.6"],
    run(c) {
      opened(c);
      c.to(A, "Load");
      c.answer("list", { ok: [{ id: "i1", title: "from a thin row" }] });
      c.eq(
        "a thin read keeps the rest",
        [c.rec(I1)?.data.title, c.rec(I1)?.data.likes],
        ["from a thin row", 0],
      );
    },
  },
  // ── H7's survivors, one each.
  {
    id: "REV4-S1",
    kind: "example",
    fixtures: [feedFixture],
    actor: { actor: "Feed", id: "a" },
    cites: ["rule:1", "F12"],
    variants: {
      "r1-a-thaw-keeps-its-dueAt"(c) {
        c.ensure();
        c.into(["tail"], "Sync");
        c.advance(100);
        c.send("Away");
        c.advance(50);
        c.send("Live");
        c.advance(849);
        c.eq("not early", c.inner(["tail"])?.memory.ticks, 0);
        c.advance(1);
        c.eq("at its first due", c.inner(["tail"])?.memory.ticks, 1);
      },
      "r1-reentry-does-not-freeze-what-it-stays-in"(c) {
        c.ensure();
        c.into(["tail"], "Sync");
        c.send("Live"); // LIVE to LIVE
        c.advance(1000);
        c.eq("the schedule ran on", c.inner(["tail"])?.memory.ticks, 1);
      },
    },
  },
  {
    id: "REV4-S2",
    kind: "example",
    fixtures: [deepAt("A")],
    actor: DP,
    cites: ["rule:14", "rule:6", "rule:52"],
    variants: {
      "r14-a-late-ending-starts-at-the-nearest-live-ancestor"(c) {
        c.ensure();
        c.send("Run");
        c.send("ToC");
        c.answer("job", { apply: true });
        c.eq("A's handler, not root's", c.mem().at, "A");
      },
      "r14-with-no-live-ancestor-it-starts-at-the-root"(c) {
        c.ensure();
        c.send("Run");
        c.send("Far");
        c.answer("job", { apply: true });
        c.eq("root's", c.mem().at, "root");
      },
      "r6-whenAbandoned-reads-the-pre-turn-memory"(c0) {
        const c = at(c0, deepAt("FIELD"), DP);
        c.send("TypeAndLeave");
        c.state("FAR");
        c.eq("old, not what the raise wrote", c.mem().gone, "old");
      },
      "r52-an-ended-incarnation-aborts-its-lookup"(c0) {
        const c = at(c0, deepAt("HERE"), DP);
        c.into(["once"], "Sync");
        c.eq("open", c.r.outside().open.length, 1);
        c.send("Far");
        c.eq("aborted, not left running", c.r.outside().open.length, 0);
      },
    },
  },
  // ── Real shapes.
  {
    id: "REAL-01",
    kind: "example",
    fixtures: [addressFixture],
    actor: AD,
    cites: ["rule:6", "rule:1", "sec:2.9.2"],
    variants: {
      "own-exit-hands-no-draft-back"(c) {
        c.ensure();
        c.send("Go");
        const a = addr({ name: "Ann", street: "S", postcode: "AB123" });
        c.into(["ADDRESS"], "Changed", { address: a });
        c.into(["ADDRESS"], "Next");
        c.into(["ADDRESS"], "Next");
        c.into(["ADDRESS"], "Confirm");
        c.state("CARD");
        c.eq("the address", c.mem().address, a);
        c.eq("not on Done: the draft is empty", c.mem().addressDraft, emptyAddress);
      },
      "left-any-other-way-hands-it-back-and-the-next-entry-resumes"(c) {
        c.ensure();
        c.send("Go");
        const a = addr({ name: "Ann" });
        c.into(["ADDRESS"], "Changed", { address: a });
        c.send("Leave");
        c.state("LEFT");
        c.eq("draft", c.mem().addressDraft, a);
        c.send("Go");
        c.eq("resumes it", c.inner(["ADDRESS"])?.memory.address, a);
        c.eq(
          "at the first field: history is control, of one life",
          c.inner(["ADDRESS"])?.state,
          "NAME",
        );
      },
      "history-returns-to-the-exact-field-not-the-default"(c) {
        c.ensure();
        c.send("Go");
        c.into(["ADDRESS"], "Changed", { address: addr({ name: "Ann" }) });
        c.into(["ADDRESS"], "Next");
        c.eq("street", c.inner(["ADDRESS"])?.state, "STREET");
        c.into(["ADDRESS"], "Help");
        c.eq("help", c.inner(["ADDRESS"])?.state, "POSTCODE_HELP");
        c.into(["ADDRESS"], "CloseHelp");
        c.eq("STREET, and NAME is the default", c.inner(["ADDRESS"])?.state, "STREET");
      },
      "a-denied-guard-keeps-the-field"(c) {
        c.ensure();
        c.send("Go");
        c.into(["ADDRESS"], "Next");
        c.eq("NoName", c.r.evidence("Denied").at(-1)?.["reasons"], ["NoName"]);
        c.eq("stays", c.inner(["ADDRESS"])?.state, "NAME");
      },
      "a-callback-only-where-written"(c) {
        c.ensure();
        c.send("Go");
        c.into(["ADDRESS"], "Changed", { address: addr({ postcode: "AB" }) });
        c.eq("not quoted from NAME", c.mem().quotes, []);
        c.into(["ADDRESS"], "Changed", { address: addr({ name: "Ann" }) });
        c.into(["ADDRESS"], "Next");
        c.into(["ADDRESS"], "Next");
        c.into(["ADDRESS"], "Changed", { address: addr({ name: "Ann", postcode: "AB123" }) });
        c.eq("quoted from POSTCODE", c.mem().quotes, ["AB123"]);
      },
    },
  },
  {
    id: "REAL-02",
    kind: "example",
    fixtures: [ticketFixture],
    actor: TK,
    cites: ["rule:6", "rule:1", "sec:2.9.2"],
    variants: {
      "own-exit-no-draft"(c) {
        c.ensure();
        c.send("Resolve");
        c.into(["wizard"], "Next", { reason: "fixed" });
        c.into(["wizard"], "Submit");
        c.state("RESOLVED");
        c.eq("resolved", c.mem().resolved, "fixed");
        c.eq("no draft", c.mem().drafts, []);
        c.eq("a sibling on the node it left was abandoned", c.mem().sideGone, 1);
      },
      "kept-returns-to-the-exact-step-through-a-nested-exit"(c) {
        c.ensure();
        c.send("Resolve");
        c.into(["wizard"], "Next", { reason: "fixed" });
        c.into(["wizard"], "AskDiscard");
        c.eq("dialog", c.inner(["wizard"])?.state, "DISCARD");
        c.into(["wizard", "DISCARD"], "Keep");
        c.eq("PARTS, and REASON is the default", c.inner(["wizard"])?.state, "PARTS");
        c.eq("the dialog's own exit: not abandoned", c.inner(["wizard"])?.memory.dialogGone, 0);
      },
      "discarded-fills-the-wizards-own-exit-two-own-exits-in-one-turn"(c) {
        c.ensure();
        c.send("Resolve");
        c.into(["wizard"], "Next", { reason: "fixed" });
        c.into(["wizard"], "AskDiscard");
        c.into(["wizard", "DISCARD"], "Discard");
        c.state("OPEN");
        c.eq("exited", c.mem().discarded, "fixed");
        c.eq("no draft: its own exit", c.mem().drafts, []);
      },
      "left-from-outside-abandons-both-and-hands-the-draft-back"(c) {
        c.ensure();
        c.send("Resolve");
        c.into(["wizard"], "Next", { reason: "fixed" });
        c.into(["wizard"], "AskDiscard");
        c.send("Close");
        c.state("CLOSED");
        c.eq("draft", c.mem().drafts, ["fixed"]);
      },
    },
  },
  {
    id: "REAL-03",
    kind: "example",
    fixtures: [attachFixture],
    actor: AT,
    cites: ["rule:9", "rule:13", "rule:23", "rule:60", "rule:51"],
    variants: {
      "each-by-and-item"(c) {
        c.ensure();
        files(c, "r1");
        c.eq(
          "input from the item",
          [upload(c, "r1")?.ref, upload(c, "r1")?.name],
          ["r1", "r1.png"],
        );
        c.ack();
        c.eq("lane by the field", c.r.row(AT, "put", { ref: "r1" })?.pending, true);
        c.eq("key from `by`", c.reqs("put")[0]?.input, { ref: "r1" });
      },
      "unknown-maps-by-reason-and-resend-arms"(c) {
        c.ensure();
        files(c, "r1");
        c.ack();
        c.answer("put", { lost: true });
        c.eq("NoResponse maps to Unsure", upload(c, "r1")?.status, "unsure");
        c.advance(2999);
        c.eq("not yet", c.reqs("put").length, 1);
        c.advance(1);
        c.ack();
        c.eq("the same id", [c.reqs("put").length, c.keys("put").length], [2, 1]);
      },
      "r23-disarmOn-stops-the-resend"(c) {
        c.ensure();
        files(c, "r1");
        c.ack();
        c.answer("put", { lost: true });
        c.into(["uploads:r1"], "Cancel");
        c.eq(
          "stopped, released",
          [upload(c, "r1")?.status, c.r.evidence("Released").length],
          ["stopped", 1],
        );
        c.advance(60_000);
        c.eq("no resend, no give-up", [c.reqs("put").length, c.mem().failed], [1, []]);
      },
      "cancel-on-the-wire-maps-to-stopped-and-releases"(c) {
        c.ensure();
        files(c, "r1");
        c.ack();
        c.into(["uploads:r1"], "Cancel");
        c.eq("Cancelled by reason", c.lastEnding("put")?.reason, "Cancelled");
        c.eq("key-less cancel released it", c.r.row(AT, "put", { ref: "r1" }), undefined);
        c.eq("status", upload(c, "r1")?.status, "stopped");
      },
      "a-reload-is-lost-the-bytes-are-gone"(c) {
        c.ensure();
        files(c, "r1");
        c.ack();
        c.reload();
        c.eq(
          "failed, FileGone",
          [upload(c, "r1")?.status, upload(c, "r1")?.problem],
          ["failed", "FileGone"],
        );
        c.eq("told", c.mem().failed, [["r1", "FileGone"]]);
        c.eq("released", c.r.row(AT, "put", { ref: "r1" }), undefined);
      },
      "gives-up-after-three-resends"(c) {
        c.ensure();
        files(c, "r1");
        c.ack();
        c.answer("put", { lost: true });
        for (let i = 0; i < 3; i++) {
          c.advance(3000);
          c.ack();
          c.answer("put", { lost: true });
        }
        c.advance(3000);
        c.eq("told", c.mem().failed, [["r1", "GaveUp"]]);
        c.eq("released", c.r.row(AT, "put", { ref: "r1" }), undefined);
        c.eq("once on the wire per resend", c.reqs("put").length, 4);
      },
      "removed-copy-releases-not-delivers"(c) {
        c.ensure();
        files(c, "r1");
        c.ack();
        c.send("SetFiles", { attachments: [] });
        c.eq("gone", c.r.row(AT, "put", { ref: "r1" }), undefined);
        c.eq("not delivered", c.r.evidence("delivered").filter((e) => e["op"] === "put").length, 0);
      },
      "a-reason-the-map-does-not-list-is-named-not-lost"(c0) {
        const c = at(c0, attachMissingReason, AT);
        c0.namedIssues.push("UnmappedEnding");
        files(c, "r1");
        c.ack();
        c.answer("put", { lost: true });
        c.advance(3000);
        c.ack();
        c.answer("put", { fail: { tag: "FileGone" } });
        c.eq("StillUnknown", c.lastEnding("put")?.reason, "StillUnknown");
        c.eq("issue", c.r.issues().at(-1)?.code, "UnmappedEnding");
        c.eq("the hold stays visible", c.r.row(AT, "put", { ref: "r1" })?.uncertain, true);
      },
      "persisted-host-with-the-store"(c0) {
        const c = at(c0, attachDomainFixture, AT);
        files(c, "r1");
        c.ack();
        c.reload();
        c.eq("restored, repair asked", c.reqs("repair").length, 1);
        c.answer("repair", { truth: true });
        c.eq("no fatal", c.r.quiet().fatal, false);
        c.eq("told", c.mem().failed, [["r1", "FileGone"]]);
      },
    },
  },
  {
    id: "REAL-04",
    kind: "example",
    fixtures: [panelsFixture],
    actor: PN,
    cites: ["rule:1", "rule:52", "rule:53", "rule:54", "D64"],
    variants: {
      "same-ticket-thaws-and-the-cut-lookup-asks-again-first"(c) {
        c.ensure();
        c.into(["history"], "LoadEarlier");
        c.send("OpenTab", { tab: "customer" });
        c.eq("cut: no request open", c.r.outside().open.length, 0);
        c.send("OpenTab", { tab: "history" });
        c.eq("delivered at the thaw", c.inner(["history"])?.memory.cuts, 1);
        c.eq("asked again", c.reqs("earlier").length, 2);
      },
      "r53-a-write-that-ends-while-frozen-parks-and-the-thaw-adopts-it"(c) {
        c.ensure();
        c.into(["history"], "Pin", { entryId: "e1", pinned: true });
        c.ack();
        c.send("OpenTab", { tab: "customer" });
        c.answer("pin", { ok: {} });
        c.eq("parked: the frozen one binds nothing", c.r.evidence("parked").length, 1);
        c.eq("not delivered", c.inner(["history"])?.memory.pins, []);
        c.send("OpenTab", { tab: "history" });
        c.eq("adopted", c.inner(["history"])?.memory.pins, ["e1"]);
        c.eq("nothing waits", c.r.quiet().waits.filter((w) => w.kind === "parked").length, 0);
      },
      "r52-the-cut-lookup-comes-before-a-parked-write"(c) {
        c.ensure();
        c.into(["history"], "LoadEarlier");
        c.into(["history"], "Pin", { entryId: "e1", pinned: true });
        c.ack();
        c.send("OpenTab", { tab: "customer" });
        c.answer("pin", { ok: {} });
        const from = c.r.evidence("delivered").length;
        c.send("OpenTab", { tab: "history" });
        c.eq(
          "order",
          c.r
            .evidence("delivered")
            .slice(from)
            .map((e) => e["op"]),
          ["earlier", "pin"],
        );
      },
      "D64-a-changed-ticket-resets-on-return-with-no-frame-of-the-old-subject"(c) {
        c.ensure();
        c.into(["history"], "Highlight", { entryId: "e1" });
        c.into(["history"], "LoadEarlier");
        c.send("OpenTab", { tab: "customer" });
        c.send("ShowTicket", { ticketId: "T-2" });
        c.eq("frozen keeps the old until return", c.inner(["history"])?.memory.ticketId, "T-1");
        const from = c.r.frames().length;
        c.send("OpenTab", { tab: "history" });
        c.eq(
          "fresh",
          [c.inner(["history"])?.memory.ticketId, c.inner(["history"])?.memory.highlighted],
          ["T-2", null],
        );
        c.eq("the cut lookup is evidence: not delivered", c.inner(["history"])?.memory.cuts, 0);
        c.eq("told", c.mem().goneFor, ["T-1"]);
        for (const f of c.r.frames().slice(from)) {
          const m = f.view["Desk/Panels/a"]?.memory as any;
          c.eq("no frame shows T-1's slice under T-2", m.history.ticketId, m.ticketId);
        }
      },
      "a-b-a-the-old-subjects-write-goes-to-the-old-subject"(c) {
        c.ensure();
        c.into(["history"], "Pin", { entryId: "e1", pinned: true });
        c.ack();
        c.send("ShowTicket", { ticketId: "T-2" });
        c.answer("pin", { ok: {} });
        c.eq("not T-2's", c.inner(["history"])?.memory.pins, []);
        c.send("ShowTicket", { ticketId: "T-1" });
        c.eq("T-1's again", c.inner(["history"])?.memory.pins, ["e1"]);
      },
      "r51-a-reset-a-reload-lost-runs-at-boot"(c) {
        c.ensure();
        corrupt(c, "actor/", (r) => (r.root.memory.ticketId = "T-9"));
        c.reload();
        c.eq("reset", c.inner(["history"])?.memory.ticketId, "T-9");
        c.eq("told", c.mem().goneFor, ["T-1"]);
      },
      "r54-a-pending-reset-runs-before-adoption"(c) {
        c.ensure();
        c.into(["history"], "Pin", { entryId: "e1", pinned: true });
        c.ack();
        c.send("ShowTicket", { ticketId: "T-2" });
        c.answer("pin", { ok: {} });
        corrupt(c, "actor/", (r) => (r.root.memory.ticketId = "T-1"));
        c.reload();
        const seq = c.r
          .evidence()
          .filter(
            (e) =>
              e["kind"] === "delivered" || (e["kind"] === "turn" && e["event"] === "PendingReset"),
          )
          .map((e) => e["kind"]);
        c.eq("reset, then the ending it can now reach", seq.slice(-2), ["turn", "delivered"]);
        c.eq("adopted", c.inner(["history"])?.memory.pins, ["e1"]);
      },
      "a-raise-from-the-host-reaches-the-live-tab"(c) {
        c.ensure();
        c.send("ShowEntry", { entryId: "e7" });
        c.eq("highlighted", c.inner(["history"])?.memory.highlighted, "e7");
      },
    },
  },
  {
    id: "REAL-05",
    kind: "example",
    fixtures: [editorFixture],
    actor: { actor: "Desk/Editor", id: "t" },
    cites: ["rule:21", "rule:43", "sec:2.8.6"],
    variants: {
      "pin-predicts-confirms-and-an-idle-guard-holds"(c) {
        c.ensure();
        c.into(["comments"], "Load");
        c.answer("thread", { truth: true });
        const ref = commentRef("T-42", "c1");
        c.into(["comments"], "Pin", { commentId: "c1", pinned: true });
        c.eq("predicted", c.rec(ref)?.data.pinned, true);
        c.into(["comments"], "Pin", { commentId: "c1", pinned: false });
        c.eq("guard: one request", c.reqs("pin").length, 1);
        c.answer("pin", { apply: true });
        c.eq("confirmed", [c.rec(ref)?.data.pinned, c.rec(ref)?.predicted], [true, false]);
      },
      "pin-unsure-releases-and-the-look-stays-marked"(c) {
        c.ensure();
        c.into(["comments"], "Load");
        c.answer("thread", { truth: true });
        const ref = commentRef("T-42", "c1");
        c.into(["comments"], "Pin", { commentId: "c1", pinned: true });
        c.answer("pin", { lost: true });
        c.eq("released", c.r.evidence("Released").length, 1);
        c.eq("marked", c.rec(ref)?.uncertain, true);
        c.answer("repair", { truth: true });
      },
      "react-a-plain-write-in-a-store-machine"(c) {
        c.ensure();
        c.into(["comments"], "React", { commentId: "c1", emoji: "+1", on: true });
        c.answer("react", { lost: true });
        c.eq(
          "released, no repair: it names no record",
          [c.r.evidence("Released").length, c.reqs("repair").length],
          [1, 0],
        );
      },
    },
  },
  {
    id: "SEARCH-ODD-SMALL",
    kind: "bounded",
    fixtures: [attachFixture],
    actor: AT,
    cites: ["D57"],
    run(c) {
      const r = searchOdd(c.make, { depth: 2, maxStates: 800 });
      c.eq("no oracle failed", r.failure ?? "none", "none");
      c.eq("it ends on its state bound, not a clock: the verdict and the depth it completed", [r.verdict, r.depthCompleted], ["completed", 2]);
      c.yes("it searched", r.states > 30);
    },
  },
];
