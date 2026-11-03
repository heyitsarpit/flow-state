// SEARCH-ODD (D57, review H3, H4): every crossing of a value from outside, fed odd values, on a persisted host with `.each` by a
// field, a `resetOn`, lanes and the store. One oracle above the usual: no value may name, shape or stop the core. So no Fatal and
// no ModuleDefect, whatever is fed. A new call site that trusts a value fails here, rather than waiting for a review.
import { attachDomainFixture } from "../fixtures/real.compiled.ts";
import type { Answer, Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const E = { actor: "Desk/Attach", id: "a" };
const send = (event: string, payload: unknown = {}, to?: readonly string[]): Step => ({
  send: E,
  event,
  payload,
  ...(to ? { to } : {}),
});
const open = (op: string) => (h: Harness) =>
  h.read.outside().open.some((o) => o.op === op && !o.never);
const storage = (h: Harness) =>
  h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush");
const cycle: any = { a: 1 };
cycle.self = cycle;
const ODD_LISTS: ReadonlyArray<readonly [string, unknown]> = [
  ["null", null],
  ["sym", Symbol("odd")], // D139
  ["date", new Date(5)],
  ["nan", Number.NaN],
  ["five", 5],
  ["nullItem", [null]],
  ["emptyItem", [{}]],
  ["bigRef", [{ ref: 10n }]],
  ["objRef", [{ ref: { a: 1 } }]],
  [
    "dup",
    [
      { ref: "a", name: "n" },
      { ref: "a", name: "n" },
    ],
  ],
  ["colon", [{ ref: "user:1", name: "n" }]],
  ["slash", [{ ref: "gid://shop/Product/1", name: "n" }]],
];
const ODD_ANSWERS: ReadonlyArray<readonly [string, Answer]> = [
  ["ok", { apply: true }],
  ["big", { ok: 10n }],
  ["nul", { ok: null }],
  ["lost", { lost: true }],
  ["die", { die: "odd" }],
];
const edit = (f: (r: any) => void) => (raw: string) => {
  try {
    const r = JSON.parse(raw);
    f(r);
    return JSON.stringify(r);
  } catch {
    return raw; // already junk
  }
};
const CORRUPTIONS: ReadonlyArray<readonly [string, string, (raw: string) => string]> = [
  ["leaf", "actor/", edit((r) => (r.root.leaf = "REMOVED"))],
  [
    "frag",
    "actor/",
    edit((r) => {
      const k = Object.keys(r.root.kids)[0];
      if (k) r.root.kids[k].frag = "REMOVED";
    }),
  ],
  ["timers", "actor/", edit((r) => delete r.timers)],
  ["w", "lane/", edit((r) => delete r.w)],
  ["junk", "lane/", () => "{{{"],
];
const ACTIONS: readonly Action[] = [
  ...ODD_LISTS.map(([n, v]): Action => ({
    name: `list.${n}`,
    step: send("SetFiles", { attachments: v }),
  })),
  { name: "list.good", step: send("SetFiles", { attachments: [{ ref: "r1", name: "n" }] }) },
  { name: "subject.big", step: send("SetSubject", { subject: 10n }) },
  { name: "subject.cycle", step: send("SetSubject", { subject: cycle }) },
  { name: "subject.obj", step: send("SetSubject", { subject: { b: 1, a: 2 } }) },
  { name: "tick", step: { advance: 0 } },
  { name: "advance", step: { advance: 3000 } },
  { name: "ack", step: { storage: "ack" }, on: storage },
  { name: "reload", step: { reload: true } },
  { name: "dispose", step: { dispose: E } },
  { name: "ensure", step: { ensure: E } },
  { name: "repair", step: { answer: "repair", with: { truth: true } }, on: open("repair") },
  ...ODD_ANSWERS.map(([n, a]): Action => ({
    name: `put.${n}`,
    step: { answer: "put", with: a },
    on: open("put"),
  })),
  ...CORRUPTIONS.map(([n, match, f]): Action => ({
    name: `corrupt.${n}`,
    step: { fault: { corruptStored: { match, edit: f } } },
  })),
];
export const searchOdd = (
  make: () => Harness,
  o: { depth: number; maxStates: number; deadlineMs: number },
): Report =>
  bfs({
    make: () => {
      const h = make();
      h.start({ machines: [attachDomainFixture], seed: 1 });
      h.do({ ensure: E });
      return h;
    },
    actions: ACTIONS,
    depth: o.depth,
    maxStates: o.maxStates,
    deadlineMs: o.deadlineMs,
    edge(_pre, post) {
      if (post.read.quiet().fatal) throw new Oracle("D57: a value stopped the Runtime");
      const i = post.read.issues().find((x) => x.code === "Fatal" || x.code === "ModuleDefect");
      if (i) throw new Oracle(`D57: ${i.code} ${i.origin ?? ""} ${String(i.input ?? "")}`);
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
    },
  });
