// The spike's entry: (a) conditions record and evaluate three-valued (the conformance table), (b) the join
// rule: existence, nested paths, defaults, ED 2.3's kinds, (c) predictions: runtime functions recorded for
// structure, replayed, skipped, settled per record, with development checks and defects, (d) the allowlist
// lint over the reference domains and review 3's probes.
// Types are checked separately by `tsc -p .` (types.ts). Run: tsc -p . && bun main.ts
import { eq as eqF, isNull as isNullF, or as orF, read as readF, serverMatches as smF } from "./flow.ts";
import { app, checkOrder, condition, contradicts, decodeInput, describe, evaluate, impact, joins, laneKey, queueKeys, RecordingError, replay, settle, start } from "./flow.ts";
import type { ChangeIR, Domain, IR, Live } from "./flow.ts";
import { conformance } from "./conformance.ts";
import { TicketsDomain } from "./domains/tickets.ts";
import { Issues } from "./domains/issues.ts";
import { Extras } from "./domains/extras.ts";
import { issuesFor, Variants } from "./domains/variants.ts";
import { legacyIssues, legacyTickets } from "./domains/legacy.ts";
import { Card, Kanban } from "./domains/kanban.ts";
import type { CardRow } from "./domains/kanban.ts";
import { Mail, mailSpread } from "./domains/mail.ts";
import { Docs } from "./domains/docs.ts";
import { tenantDomain } from "./domains/tenant.ts";
import { H as holes } from "./domains/holes.ts";
import { ticketList } from "./domains/ops.ts";
import { Ticket } from "./domains/tickets.ts";
import type { AccountRow, IssueRow, MessageRow, OccurrenceRow, TicketRow, UserRow } from "./domains/ops.ts";
import { lint } from "./source.ts";

let failed = 0;
let passed = 0;
const check = (ok: boolean, what: string) => {
  if (ok) passed++;
  else failed++;
  console.log(`   ${ok ? "PASS" : "FAIL"} ${what}`);
};
const render = (ir: IR | null | undefined): string => {
  if (!ir) return "—";
  if ("ref" in ir) return ir.ref.join(".");
  if ("val" in ir) return typeof ir.val === "object" && ir.val !== null ? `Date(${ir.val.date})` : JSON.stringify(ir.val);
  if ("arr" in ir) return `[${ir.arr.map(render).join(", ")}]`;
  if ("obj" in ir) return `{ ${Object.entries(ir.obj).map(([k, v]) => `${k}: ${render(v)}`).join(", ")} }`;
  return `${ir.op}(${ir.args.map(render).join(", ")})`;
};
const canon = (x: unknown): string =>
  Array.isArray(x) ? `[${x.map(canon).join(",")}]`
  : x !== null && typeof x === "object" ? `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canon((x as any)[k])}`).join(",")}}`
  : JSON.stringify(x);
const dir = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const fileText = async (f: string) => (await fetch(new URL(f, import.meta.url))).text();
const show = (t: ReturnType<typeof evaluate>) => (t.v === "maybe" ? `maybe: ${t.why === "notCarried" ? "not carried" : t.why}` : t.v);

// ───────────────────────────────────────────────────────────── (a)
console.log("(a) conditions record and evaluate three-valued: the conformance table (M5-D3)");
console.log("   | operator | written | given | result |");
console.log("   | --- | --- | --- | --- |");
let rowsOk = 0;
for (const row of conformance) {
  const got = show(evaluate(row.expr, row.env));
  if (got === row.expect) rowsOk++;
  console.log(`   | \`${row.op}\` | \`${row.written}\` | ${row.given} | ${got}${got === row.expect ? "" : `  ✗ expected ${row.expect}`} |`);
}
check(rowsOk === conformance.length, `${rowsOk}/${conformance.length} conformance rows give their expected result`);

const tickets = describe(TicketsDomain as Domain);
const rows: TicketRow[] = [
  { workspaceId: "w1", ticketId: "t1", title: "Lobby", status: "open", assignee: null, updatedAt: 10, revision: 1 },
  { workspaceId: "w1", ticketId: "t2", title: "Roof", status: "assigned", assignee: "ana", updatedAt: 20, revision: 1 },
  { workspaceId: "w2", ticketId: "t3", title: "Door", status: "open", assignee: "bo", updatedAt: 30, revision: 1 },
];
const verdicts = (where: IR, input: unknown, list: readonly object[] = rows) => list.map((r) => show(evaluate(where, { input, record: r }))).join(", ");
const listWhere = tickets.list!.where!;
console.log(`\n   tickets.list where ${render(listWhere)}`);
check(verdicts(listWhere, { workspaceId: "w1" }) === "maybe: server, maybe: server, no", "w1, absent filters dropped: the two w1 tickets are maybe (serverMatches), the w2 ticket no");
check(verdicts(listWhere, { workspaceId: "w1", status: "open" }) === "maybe: server, no, no", "status open: only t1 can be in");
check(!contradicts(listWhere, { workspaceId: "w1" }, rows[0]!) && contradicts(listWhere, { workspaceId: "w1" }, rows[2]!), "the response check: a maybe never contradicts; a no does");
const extras = describe(Extras as Domain);
check(render(extras.myQueue!.where!).startsWith("and(eq(record.workspaceId, input.workspaceId), and(or("), "two `.where` calls are recorded as and(first, second), in call order");
check(verdicts(extras.myQueue!.where!, { workspaceId: "w1", me: "ana", before: 25 }) === "yes, yes, no", "or(isNull, eq) keeps unassigned and mine; lt on a number");
const D = (s: string) => new Date(`2026-01-${s}T00:00Z`);
const occs: OccurrenceRow[] = [
  { occurrenceId: "o1", calendarId: "c", title: "a", startsAt: D("05"), endsAt: D("06") },
  { occurrenceId: "o2", calendarId: "c", title: "b", startsAt: D("10"), endsAt: null },
  { occurrenceId: "o3", calendarId: "c", title: "c", startsAt: D("20"), endsAt: D("25") },
];
check(verdicts(extras.occurrences!.where!, { calendarId: "c", from: D("04"), to: D("21") }, occs) === "yes, maybe: server, yes", "overlaps over Dates: the open-ended occurrence is maybe (its end term only)");
check(verdicts(extras.occurrences!.where!, { calendarId: "c", to: D("08") }, occs) === "yes, no, no", "overlaps with `from` absent: a null end does not matter, the start term decides");
check(verdicts(extras.starting!.where!, { calendarId: "c", to: D("10") }, occs) === "yes, maybe: server, no", "between with `from` absent: the upper bound stays; a start equal to `to` at the millisecond is maybe");

const ord = tickets.list!.orderBy!;
const tk = (updatedAt: number | null, ticketId: string) => ({ workspaceId: "w1", ticketId, updatedAt });
check("ok" in checkOrder([tk(30, "a"), tk(20, "b"), tk(20, "c")], ord), "order check: updatedAt descending, then the key (Order.Number)");
const hid = checkOrder([tk(20, "a"), tk(30, "b")], ord);
check("hiddenOrder" in hid && hid.hiddenOrder.key === "updatedAt", "an ascending pair under desc(updatedAt) is HiddenOrder, naming the key");
const sk = checkOrder([tk(30, "a"), tk(null, "b"), tk(40, "c")], ord);
check("ok" in sk && sk.skipped === 2, "a pair with a null sort key is maybe: skipped, not HiddenOrder (M5-D4)");

console.log("   recording alone (the gap the lint closes):");
const lt = describe(legacyTickets() as Domain);
check(render(lt.either!.where) === 'eq(record.status, "open")', "`||` silently records its first operand");
check(render(lt.status!.where) === "eq(record.status, input.status)", "`?:` silently records one branch");
check(render(lt.both!.where) === 'eq(record.status, "open")', "`&&` silently records its second operand");
check(/eq\(record\.updatedAt, \d{10,}\)/.test(render(lt.recent!.where)), "Date.now() is recorded as a constant");

// ───────────────────────────────────────────────────────────── (b)
console.log("\n(b) the join: existence, nested paths, input defaults, ED 2.3's kinds");
const where = condition(({ input, record }) => orF(eqF(record.team, input.t), eqF(record.status, "open")));
const j1 = joins(where, { t: "red" }, { status: "open" }, { status: "closed" }, ["status"]);
check(j1.repair && j1.why === "notCarried", "the team/status counterexample (team not carried): yes before, maybe after, status read and changed: repair, why not carried");
check(!joins(where, { t: "red" }, { team: "red", status: "open" }, { team: "red", status: "closed" }, ["status"]).repair, "both sides definite and equal (still on red): no repair");
const j4 = joins(where, { t: "red" }, { team: "blue", status: "open" }, { team: "blue", status: "closed" }, ["status"]);
check(j4.repair && j4.why === "left", "a definite transition is evidence: left");
check(!joins(where, { t: "red" }, { status: "open", title: "a" }, { status: "open", title: "b" }, ["title"]).repair, "membership: a change to a field the condition does not read never changes membership");

// Existence.
const issues = describe(Issues as Domain);
const listW = issues.list!.where!; // eq(record.projectId, input.projectId)
const issue = { id: "i9", projectId: "p", number: 9, title: "t", liked: false, likes: 0 };
const all = decodeInput(issues.list!, {}); // "all issues": the input is absent
const cr = joins(listW, all, "none", issue, []);
check(cr.repair && cr.why === "entered", "a create into \"all issues\" (a condition of only droppable leaves): none → yes, repair, entered");
check(!joins(listW, { projectId: "q" }, "none", issue, []).repair, "a create outside the condition: none → no, no repair");
const dl = joins(listW, { projectId: "p" }, issue, "none", []);
check(dl.repair && dl.why === "left", "a delete: yes → none, repair, left");
check(joins(undefined, {}, "none", issue, []).repair && !joins(undefined, {}, issue, { ...issue, title: "u" }, ["title"]).repair, "no .where: a create repairs, an update does not (membership)");
check(joins(listW, { projectId: "p" }, "unknown", issue, []).repair && !joins(listW, { projectId: "q" }, "unknown", issue, []).repair, "a first sighting for a list: no before (ED:523-524), so only a record in the condition enters");
const fs1 = joins(listW, { projectId: "q" }, "unknown", issue, [], true);
check(fs1.repair && fs1.why === "notCarried", "a first sighting for a derived answer: before is maybe, so it refetches once (ED:525-526), even for a record outside the condition now");

// Nested paths.
const kanban = describe(Kanban as Domain);
const owner = kanban.mineByOwner!.where!; // eq(record.meta.owner, input.me)
const card = (o: Partial<CardRow>): CardRow => ({ id: "c1", boardId: "b", columnId: "todo", assigneeId: null, position: 1, title: "t", labels: [], archived: false, meta: { owner: "ana" }, revision: 1, ...o });
check(joins(owner, { boardId: "b", me: "ana" }, card({}), card({ meta: { owner: "bo" } }), ["meta"]).repair, "a condition reading meta.owner repairs on a change reported as meta (the object replaced)");
check(joins(owner, { boardId: "b", me: "ana" }, card({}), card({ meta: { owner: "bo" } }), ["meta.owner"]).repair, "…and on a change reported as meta.owner");
check(!joins(owner, { boardId: "b", me: "ana" }, card({}), card({}), ["metadata"]).repair, "paths match by segment: metadata is not meta");

// Input defaults from the input Schema.
const column = kanban.column!;
const raw = { boardId: "b", columnId: "todo", me: "ana" };
const archiving: [CardRow, CardRow, string[]] = [card({}), card({ archived: true }), ["archived"]];
check(!joins(column.where!, raw, ...archiving).repair, "without the Schema default, an absent includeArchived drops the constraint: archiving a card does not repair (the missed refetch)");
const decoded = decodeInput(column, raw);
const ar = joins(column.where!, decoded, ...archiving);
check(ar.repair && ar.why === "left", "decoded through the Schema (includeArchived defaults to false): archiving the card repairs, left");
check(!joins(column.where!, decoded, card({ assigneeId: "ana" }), card({ assigneeId: "bo" }), ["assigneeId"]).repair, "mineOnly defaults to false: reassigning a card keeps it in the column, no repair");
const mine = decodeInput(column, { ...raw, mineOnly: true });
check(joins(column.where!, mine, card({ assigneeId: "ana" }), card({ assigneeId: "bo" }), ["assigneeId"]).repair, "with mineOnly true, reassigning my card away repairs");

// The serverMatches field list is a claim.
const docs = describe(Docs as Domain);
const doc = { id: "d", orgId: "o", title: "t", ownerId: "x", visibility: "org", sharedWith: [], acl: "a", revision: 1 };
check(!joins(docs.visible!.where!, { orgId: "o", viewer: "v" }, doc, { ...doc, visibility: "private" }, ["visibility"]).repair, "serverMatches(viewer, acl) claims acl is all it reads: making a doc private does not repair; the claim is checked only by audit mode and propertyTest");
check(joins(docs.visibleNoFields!.where!, { orgId: "o", viewer: "v" }, doc, { ...doc, visibility: "private" }, ["visibility"]).repair, "serverMatches(viewer) with no fields claims nothing narrower: it repairs");

// ED 2.3's other reasons.
const m = { workspaceId: "w1", ticketId: "t1", title: "a", status: "open", assignee: null, updatedAt: 1, revision: 1 };
const listInput = { workspaceId: "w1" };
check(impact({ kind: "ordered", where: tickets.list!.where!, orderBy: ["updatedAt", "workspaceId", "ticketId"] }, listInput, m, { ...m, updatedAt: 2 }, ["updatedAt"]).repair, "an ordered list: an order field of a record in it repairs, though the condition does not read it");
check(!impact({ kind: "ordered", where: tickets.list!.where!, orderBy: ["updatedAt"] }, { workspaceId: "w2" }, m, { ...m, updatedAt: 2 }, ["updatedAt"]).repair, "…not for a record definitely outside it");
check(impact({ kind: "ranked", where: listW }, { projectId: "p" }, issue, { ...issue, likes: 3 }, ["likes"]).repair, "a server-ranked list: any field of a record in it repairs");
const mail = describe(Mail as Domain);
const unread = mail.unreadCount!; // derivedFrom(Msg, [read]) where folder = inbox
const msgD = { id: "m", accountId: "a", folder: "inbox", labels: [], read: false, receivedAt: new Date(0), subject: "s", revision: 1 };
const derived = (changed: string[], after: object) => impact({ kind: "derived", where: unread.where!, fields: ["read"] }, { accountId: "a" }, msgD, after, changed).repair;
check(derived(["folder"], { ...msgD, folder: "archive" }) && derived(["read"], { ...msgD, read: true }) && !derived(["subject"], { ...msgD, subject: "z" }), "a derived count: its condition fields and its declared fields repair (the union, so the lists cannot disagree); the subject does not");
const p1 = joins(condition(({ record }) => orF(smF(record.q), eqF(record.a, 1))), {}, { q: "x" }, { q: "y" }, ["q"]);
const p2 = joins(condition(({ record }) => orF(eqF(record.a, 1), smF(record.q))), {}, { q: "x" }, { q: "y" }, ["q"]);
check(p1.repair && p2.repair && p1.why === p2.why && p1.why === "notCarried", "both maybe: the cause follows a fixed precedence (failed, not carried, server), so argument order does not change it");

// ───────────────────────────────────────────────────────────── (c)
console.log("\n(c) predictions: runtime functions, recorded for structure, settled per record");
const setLike = issues.setLike!.predicts! as ChangeIR[];
check(canon(setLike[0]!.fields) === canon({ liked: { ref: ["input", "liked"] }, likes: { runtime: true } }), "the Model holds the entity, key and field names; likes is `runtime` (likes ← <runtime>)");
const at = (base: IssueRow | undefined, lives: Live[]) => replay(base, lives, "issues/Issue", { id: "i1" });
const a1 = start(setLike, { key: { id: "i1" }, liked: true }, "a1");
check(canon(laneKey(a1)) === canon({ id: "i1" }), "one record by a single key: merge 4 rule 34's lane key");
const a2 = start(setLike, { key: { id: "i1" }, liked: false }, "a2");
const base0: IssueRow = { id: "i1", projectId: "p", number: 1, title: "x", liked: false, likes: 5 };
const showR = (r: unknown) => (r && typeof r === "object" ? `liked ${(r as IssueRow).liked}, likes ${(r as IssueRow).likes}` : String(r));
const step = (label: string, base: IssueRow, lives: Live[], want: string) => check(showR(at(base, lives).visible) === want, `${label}: ${showR(at(base, lives).visible)}`);
step("A like starts over liked false, likes 5", base0, a1, "liked true, likes 6");
step("B unlike starts behind A", base0, [...a1, ...a2], "liked false, likes 5");
step("a push sets liked true, likes 9; A and B replay", { ...base0, liked: true, likes: 9 }, [...a1, ...a2], "liked false, likes 8");

step("A fails and is retracted; B replays alone", { ...base0, liked: true, likes: 9 }, a2, "liked false, likes 8");
check(at(base0, start(issues.remove!.predicts! as ChangeIR[], { key: { id: "i1" } }, "d")).visible === "deleted", "a predicted delete hides the record");
const bumps = start(extras.bumpTwice!.predicts! as ChangeIR[], { key: { id: "i1" } }, "b");
check((at(base0, bumps).visible as IssueRow).likes === 7 && queueKeys(bumps).length === 1, "two patches to one record apply in written order (5 → 6 → 7) and join its queue once");
const react = extras.react!.predicts! as ChangeIR[];
const msgOf = (count: number): MessageRow => ({ messageId: "m", body: "", reactions: count ? [{ emoji: "+1", count }] : [] });
const rr = [...start(react, { key: { messageId: "m" }, emoji: "+1" }, "r1"), ...start(react, { key: { messageId: "m" }, emoji: "+1" }, "r2")];
const vm = (b: MessageRow) => (replay(b, rr, "chat/Message", { messageId: "m" }).visible as MessageRow).reactions;
check(canon(vm(msgOf(0))) === canon([{ emoji: "+1", count: 2 }]) && canon(vm(msgOf(4))) === canon([{ emoji: "+1", count: 6 }]), "a list edit is an ordinary pure function: two reactions over none give 2; over a moved base of 4, 6 (and the double call finds no defect)");

// Settlement per (entity, key, field).
const xfer = extras.transfer!.predicts! as ChangeIR[];
const older = start(xfer, { from: { accountId: "A" }, to: { accountId: "B" }, amount: 5 }, "o");
const t = start(xfer, { from: { accountId: "A" }, to: { accountId: "B" }, amount: 30 }, "t");
const st = settle([...older, ...t], "t", [{ entity: "bank/Account", key: { accountId: "A" }, fields: ["balance"] }]);
check(canon(st.unconfirmed) === canon(['bank/Account:{"accountId":"B"}:balance']), "a transfer whose response carries only A: B's balance is unconfirmed and gets its confirming read (it used to be dropped)");
const acct = (id: string, b: number): AccountRow => ({ accountId: id, balance: b, revision: 1 });
check(
  replay(acct("A", 100), st.remaining, "bank/Account", { accountId: "A" }).predicted.length === 0 && (replay(acct("B", 100), st.remaining, "bank/Account", { accountId: "B" }).visible as AccountRow).balance === 105,
  "A's confirmation retires the older write's prediction on A only; its prediction on B still shows (B 100 → 105)",
);
const archive = extras.archive!.predicts! as ChangeIR[];
const arch = start(archive, { keys: [{ userId: "u1" }, { userId: "u2" }, { userId: "u1" }] }, "ar");
check(canon(settle(arch, "ar", [{ entity: "admin/User", key: { userId: "u1" }, fields: ["status"] }]).unconfirmed) === canon(['admin/User:{"userId":"u2"}:status']), "a bulk (many) write whose response carries u1 only: u2 is unconfirmed");
check(archive[0]!.many === true && queueKeys(arch).length === 2 && laneKey(arch) === undefined && laneKey(start(archive, { keys: [{ userId: "u1" }] }, "x")) === undefined, "an array key: recorded as many, deduplicated, never rule 34's lane key, even with one element");
const k1 = start(issues.rename!.predicts! as ChangeIR[], { key: { b: 1, a: 2 }, title: "t" }, "k1");
const k2 = start(issues.rename!.predicts! as ChangeIR[], { key: { a: 2, b: 1 }, title: "t" }, "k2");
check(queueKeys([...k1, ...k2]).length === 1, "keys are canonical: { b, a } and { a, b } are one record");

// A9: skipped, still predicted, confirmed.
const noLikes = { id: "i1", projectId: "p", number: 1, title: "x", liked: false } as unknown as IssueRow;
const bad = start(setLike, { key: { id: "i1" }, liked: true }, "bad");
const r9 = at(noLikes, bad);
check(r9.skipped[0]?.field === "likes" && r9.predicted.includes("likes") && r9.defects.length === 0, `A9: likes is not held, its function gives NaN, the Schema rejects it: skipped, still predicted (${r9.skipped[0]?.reason})`);
check(canon(settle(bad, "bad", [{ entity: "issues/Issue", key: { id: "i1" }, fields: ["liked"] }]).unconfirmed) === canon(['issues/Issue:{"id":"i1"}:likes']), "A9: the response omits likes: the skipped field gets its confirming read");

// Development checks and defects.
const touch2 = mail.touch2!.predicts! as ChangeIR[];
const msgBase = { ...msgD };
const rd = replay(msgBase, start(touch2, { key: { id: "m" } }, "r"), "mail/Msg", { id: "m" });
check(rd.defects[0]?.reason.includes("two results") === true && rd.skipped.length === 0, "development calls a field's function twice: Math.random gives two results, a defect, reported (not skipped)");
const mut = mail.addLabelMut!.predicts! as ChangeIR[];
const rm = replay({ ...msgD, labels: ["a"] }, start(mut, { key: { id: "m" }, label: "b" }, "mu"), "mail/Msg", { id: "m" });
check(rm.defects[0]?.reason.includes("changed the record beneath") === true, "a function that mutates the record beneath (labels.push) is a defect: each call gets a copy, and a changed copy is reported");
const legacy = describe(legacyIssues() as Domain).setLike!.predicts! as ChangeIR[];
const lr = replay(base0, start(legacy, { key: { id: "i1" }, liked: true }, "l"), "issues/Issue", { id: "i1" });
check(lr.defects[0]?.reason.includes("after its `.predicts` callback returned") === true && lr.skipped.length === 0, `the sealed session's error is a defect, never skipped: "${lr.defects[0]?.reason.slice(0, 60)}…"`);

// Enumerating a recorded value is a construction error.
const throws = (f: () => unknown) => {
  try {
    f();
    return "";
  } catch (e) {
    return e instanceof RecordingError ? e.message : `other: ${String(e)}`;
  }
};
const tl = () => readF(ticketList).list(Ticket, ({ result }) => result.tickets);
check(throws(() => mailSpread()).includes("was enumerated"), "spreading the recording input ({ ...input }) throws at construction");
check(throws(() => tl().where(({ input, record }) => eqF(record.title, JSON.stringify(input) as any))).includes("was enumerated"), "JSON.stringify(input) throws at construction");
check(throws(() => tl().where(({ input, record }) => ("status" in input ? eqF(record.status, "open") : eqF(record.status, "closed")))).includes("was enumerated"), "`in` on the recording input throws at construction");
check(throws(() => holes()).includes("was enumerated"), "review 3's probe file throws at construction on its first enumeration");

// One App: identities.
check(throws(() => app([tenantDomain("a", { strict: true }) as Domain, tenantDomain("a", { strict: true }) as Domain])).includes("two domains named a-kanban"), "a factory called twice with one tenant: duplicate domain ids are a construction error");
check(throws(() => app([Issues as Domain, { id: "other", entries: { x: Issues.entries.list } } as Domain])).includes("is registered in issues and other"), "one operation in two domains is a construction error");
check(throws(() => app([], [Card, { id: "kb/Card" }])).includes("two entities with id kb/Card"), "two entity objects with one id (a constant id inside a factory) is a construction error");
check(throws(() => app([tenantDomain("x", { strict: true }) as Domain, tenantDomain("y", { strict: true }) as Domain])).includes("is registered in x-kanban and y-kanban"), "two tenants with parameterised domain and entity ids still share their operations: an error, so a factory parameterises its operations too, or the tenant belongs in one domain's keys");

// ───────────────────────────────────────────────────────────── (d)
console.log("\n(d) the lint: an allowlist grammar, with type facts");
const files = ["domains/tickets.ts", "domains/issues.ts", "domains/extras.ts", "domains/variants.ts", "domains/kanban.ts", "domains/docs.ts", "domains/mail.ts", "domains/cal.ts", "domains/tenant.ts", "domains/holes.ts", "domains/legacy.ts"];
const t0 = performance.now();
const findings = await lint(dir, files);
console.log(`   linted ${files.length} files with type facts from typescript/unstable/async in ${Math.round(performance.now() - t0)} ms`);
for (const f of findings.filter((f) => f.severity === "error"))
  console.log(`   ${f.file}:${f.line} [${f.rule}] ${f.message.slice(0, 120)}${f.fix ? `\n      ${"code" in f.fix ? `fix-it: ${f.fix.code}` : `instruction: ${f.fix.instruction.slice(0, 110)}`}` : ""}`);
const errors = (file: string) => findings.filter((f) => f.file === file && f.severity === "error");
for (const f of ["domains/tickets.ts", "domains/issues.ts", "domains/extras.ts", "domains/variants.ts", "domains/kanban.ts", "domains/docs.ts"]) check(errors(f).length === 0, `${f}: no errors`);
check(findings.filter((f) => f.rule === "claim").length >= 4, "every serverMatches with a field list gets an info finding: the list is a claim only audit mode and propertyTest check");
const holesSrc = await fileText("domains/holes.ts");
const entryLines = holesSrc.split("\n").flatMap((l, i) => (/^  e\d+:/.test(l) ? [{ name: l.trim().split(":")[0]!, line: i + 1 }] : []));
const flagged = (from: number, to: number) => errors("domains/holes.ts").some((f) => f.line >= from && f.line < to);
const missed = entryLines.filter((e, i) => !flagged(e.line, entryLines[i + 1]?.line ?? e.line + 10)).map((e) => e.name);
check(canon(missed) === canon(["e22"]), `review 3's ${entryLines.length} holes are all errors except e22 (impurity inside a runtime function, the development double call's job): missed ${missed.join(", ")}`);
const calSrc = await fileText("domains/cal.ts");
const calLine = (needle: string) => calSrc.split("\n").findIndex((l) => l.includes(needle)) + 1;
check(["openOrFuture:", "openOrFutureConst:", "openOrFutureHelper:"].every((n) => errors("domains/cal.ts").some((f) => f.line === calLine(n) + 1)), "new Date(), new Date(NOW) (computed at load) and the startOfToday() helper are errors");
check(!errors("domains/cal.ts").some((f) => f.line === calLine("pureDate:") + 1) && errors("domains/variants.ts").length === 0, "new Date(\"2024-01-01…\") and Math.max(1, 2) are pure: no false positive");
check(errors("domains/tenant.ts").length === 2, "a factory: `opts.strict ? … : …` and `opts.archivedToo ?? false` are errors; the primitive parameter `tenant` is allowed");
check(errors("domains/mail.ts").some((f) => f.message.includes("a spread of fields")), "a spread of the input into patch fields is an error");
const legacySrc = await fileText("domains/legacy.ts");
const lineOf = (needle: string) => legacySrc.split("\n").findIndex((l) => l.includes(needle)) + 1;
const at2 = (needle: string) => errors("domains/legacy.ts").filter((f) => f.line === lineOf(needle));
const code = (fs: typeof findings) => fs.map((f) => (f.fix && "code" in f.fix ? f.fix.code : "")).join("");
const typesSrc = await fileText("types.ts");
const either = at2("eq(record.status, \"open\") || eq");
check(either.length === 1 && code(either) !== "" && typesSrc.includes(code(either)), `\`||\`: or(…), and that exact text compiles in types.ts`);
const both = at2("&& eq(record.status");
check(both.length === 1 && code(both) !== "" && typesSrc.includes(code(both)), "`&&`: and(…), and that exact text compiles in types.ts");
check(at2("input.status ? eq").every((f) => f.fix !== undefined && "instruction" in f.fix) && at2("input.status ? eq").length === 1, "`?:`: an instruction, never code");
check(at2("likes: (i) => i.likes +").every((f) => f.rule === "closure") && at2("likes: (i) => i.likes +").length >= 1, "merge 4's setLike: a closure over the recording input");
check(at2("const mineOrOpen").length === 1, "a helper's `?:` is found by checking the helper's body against the grammar");

console.log(`\n${failed === 0 ? `ALL PASS (${passed} checks)` : `${failed} FAILED`}`);
if (failed) throw new Error(`${failed} checks failed`);
