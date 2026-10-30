// The spike's entry: (a) conditions record and evaluate three-valued (the conformance table), (b) the join
// rule: existence, nested paths, defaults, ED 2.3's kinds, (c) predictions: runtime functions recorded for
// structure, replayed, skipped, settled per record, with development checks and defects, (d) the allowlist
// lint over the reference domains and review 3's probes.
// Types are checked separately by `tsc -p .` (types.ts). Run: tsc -p . && bun main.ts
import { and as andF, eq as eqF, isNull as isNullF, or as orF, read as readF, serverMatches as smF } from "./flow.ts";
import { app, checkOrder, condition, contradicts, DECODE_FAILED, describe, entity, evaluate, fromEncoded, impact, joins, laneKey, mayRepair, op, queueKeys, RecordingError, replay, settle, start, write } from "./flow.ts";
import type { ChangeIR, Domain, IR, Live, Replayed } from "./flow.ts";
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
import { P as probes2 } from "./domains/p.ts";
import { Ticket } from "./domains/tickets.ts";
import type { AccountRow, IssueRow, MessageRow, OccurrenceRow, TicketRow, UserRow } from "./domains/ops.ts";
import { lint } from "./source.ts";

type MsgRowLike = { id: string; subject: string };
const MsgE = entity<MsgRowLike>()({ id: "t/Msg", primaryKey: ["id"] });
const MetaE = entity<{ id: string; meta: { owner: string; color: string } }>()({ id: "t/Meta", primaryKey: ["id"] });
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
console.log("\n(b) the join: existence, carried fields, paths, inputs, ED 2.3's kinds, static explain");
const where = condition(({ input, record }) => orF(eqF(record.team, input.t), eqF(record.status, "open")));
const j1 = joins(where, { t: "red" }, { record: { status: "open" }, carried: ["status"] }, { record: { status: "closed" }, carried: ["status"] }, ["status"]);
check(j1.repair && j1.why === "notCarried", "the team/status counterexample, sides as the store's merged base with its carried fields (team never held): repair, why not carried");
check(!joins(where, { t: "red" }, { team: "red", status: "open" }, { team: "red", status: "closed" }, ["status"]).repair, "both sides definite and equal: no repair");
const j4 = joins(where, { t: "red" }, { team: "blue", status: "open" }, { team: "blue", status: "closed" }, ["status"]);
check(j4.repair && j4.why === "left", "a definite transition is evidence: left");
const sm = condition(({ input, record }) => andF(eqF(record.workspaceId, input.w), smF(input.q, record.title)));
check(!joins(sm, { w: "w1", q: "q" }, { workspaceId: "w1", title: "a", status: "x" }, { workspaceId: "w1", title: "a", status: "y" }, ["status"]).repair, "server-maybe before and after, on a field the condition does not read: no repair (the bound on maybe)");
check(joins(sm, { w: "w1", q: "q" }, { workspaceId: "w1", title: "a" }, { workspaceId: "w1", title: "b" }, ["title"]).repair, "…and a change to the field serverMatches names repairs");
const nick = condition(({ record }) => eqF(record.nick, "x"));
check(show(evaluate(nick, { record: {}, carried: new Set(["nick"]) })) === "no" && show(evaluate(nick, { record: {} })) === "maybe: not carried", "a carried optional field that is absent is a value (eq: no); a field the store does not hold is not carried (maybe)");

// Existence.
const issues = describe(Issues as Domain);
const listW = issues.list!.where!;
const issue = { id: "i9", projectId: "p", number: 9, title: "t", liked: false, likes: 0 };
const cr = joins(listW, {}, "none", issue, []);
check(cr.repair && cr.why === "entered", "a create into \"all issues\" (projectId absent, every leaf drops): none → yes, entered");
check(!joins(listW, { projectId: "q" }, "none", issue, []).repair, "a create outside the condition: none → no, no repair");
const dl = joins(listW, { projectId: "p" }, issue, "none", []);
check(dl.repair && dl.why === "left", "a delete: yes → none, left");
check(joins(undefined, {}, "none", issue, []).repair && !joins(undefined, {}, issue, { ...issue, title: "u" }, ["title"]).repair, "no .where: a create repairs, an update does not (membership)");
check(joins(listW, { projectId: "p" }, "unknown", issue, []).repair && !joins(listW, { projectId: "q" }, "unknown", issue, []).repair, "a first sighting for a list: no before (ED:523-524)");
const fs1 = joins(listW, { projectId: "q" }, "unknown", issue, [], true);
check(fs1.repair && fs1.why === "notCarried", "a first sighting for a derived answer: maybe before, so it refetches once (ED:525-526)");

// Paths.
const kanban = describe(Kanban as Domain);
const owner = kanban.mineByOwner!.where!;
const card = (o: Partial<CardRow>): CardRow => ({ id: "c1", boardId: "b", columnId: "todo", assigneeId: null, position: 1, title: "t", labels: [], archived: false, meta: { owner: "ana" }, revision: 1, ...o });
check(joins(owner, { boardId: "b", me: "ana" }, card({}), card({ meta: { owner: "bo" } }), ["meta"]).repair, "a condition reading [meta, owner] repairs on a change reported as [meta]");
check(joins(owner, { boardId: "b", me: "ana" }, card({}), card({ meta: { owner: "bo" } }), [["meta", "owner"]]).repair, "…and on one reported as [meta, owner]");
const smMeta = condition(({ input, record }) => smF(input.q, record.meta));
check(!joins(smMeta, { q: "x" }, { meta: 1, metadata: 1 }, { meta: 1, metadata: 2 }, ["metadata"]).repair && joins(smMeta, { q: "x" }, { meta: 1 }, { meta: 2 }, ["meta"]).repair, "[metadata] is not [meta]: a maybe → maybe condition on meta ignores a metadata change and repairs on a meta change");
const tag0 = condition(({ record }) => eqF(record.tags[0], "x"));
check(joins(tag0, {}, { tags: ["x"] }, { tags: ["y", "x"] }, [["tags", "1"]]).repair, "arrays are atomic: an insert at the front reported at [tags, 1] still repairs a condition on tags[0] (both normalise to [tags])");
check(!joins(condition(({ record }) => eqF(record["a.b"], 1)), {}, { "a.b": 1, a: { b: 1 } }, { "a.b": 1, a: { b: 2 } }, [["a", "b"]]).repair, "segments, not dotted strings: a field named \"a.b\" is not the path [a, b]");

// Inputs: the Type side, and a decode once at the Encoded boundary.
const column = kanban.column!;
const typeSide = { boardId: "b", columnId: "todo", me: "ana", mineOnly: false, includeArchived: false };
const archiving: [CardRow, CardRow, string[]] = [card({}), card({ archived: true }), ["archived"]];
const ar = joins(column.where!, typeSide, ...archiving);
check(ar.repair && ar.why === "left", "the Type side carries includeArchived (required, since its Schema has a decoding default): archiving repairs");
const enc = fromEncoded(column, { boardId: "b", columnId: "todo", me: "ana" });
check("input" in enc && enc.input !== DECODE_FAILED && joins(column.where!, enc.input, ...archiving).repair, "an Encoded input (a route parameter) is decoded once, the default fills the missing key, and archiving repairs");
check(!joins(column.where!, { boardId: "b", columnId: "todo", me: "ana" }, ...archiving).repair, "had the field been Schema.optional with no default, absent drops it, and the server's own default is an undeclared claim (no repair): the input Schema is the contract");
const badEnc = fromEncoded(column, { boardId: "b", columnId: "todo", me: "ana", includeArchived: "yes" }, { includeArchived: "boolean" });
check("diagnostic" in badEnc && joins(column.where!, badEnc.input, card({}), card({ title: "x" }), ["title"]).repair === false && joins(column.where!, badEnc.input, ...archiving).repair, "a decode failure is a diagnostic and makes the answer maybe (server), never a throw");
check(!joins(column.where!, typeSide, card({ assigneeId: "ana" }), card({ assigneeId: "bo" }), ["assigneeId"]).repair && joins(column.where!, { ...typeSide, mineOnly: true }, card({ assigneeId: "ana" }), card({ assigneeId: "bo" }), ["assigneeId"]).repair, "mineOnly false keeps a reassigned card; mineOnly true repairs");

// serverMatches claim, ED 2.3's reasons, precedence.
const docs = describe(Docs as Domain);
const doc = { id: "d", orgId: "o", title: "t", ownerId: "x", visibility: "org", sharedWith: [], acl: "a", revision: 1 };
check(!joins(docs.visible!.where!, { orgId: "o", viewer: "v" }, doc, { ...doc, visibility: "private" }, ["visibility"]).repair, "serverMatches(viewer, acl) claims acl is all it reads: a visibility change does not repair (a claim, checked by audit mode and propertyTest)");
const m = { workspaceId: "w1", ticketId: "t1", title: "a", status: "open", assignee: null, updatedAt: 1, revision: 1 };
check(impact({ kind: "ordered", where: tickets.list!.where!, orderBy: [["updatedAt"], ["workspaceId"], ["ticketId"]] }, { workspaceId: "w1" }, m, { ...m, updatedAt: 2 }, ["updatedAt"]).repair, "an ordered list: an order field of a record in it repairs");
check(!impact({ kind: "ordered", where: tickets.list!.where!, orderBy: [["updatedAt"]] }, { workspaceId: "w2" }, m, { ...m, updatedAt: 2 }, ["updatedAt"]).repair, "…not for a record definitely outside it");
check(impact({ kind: "ranked", where: listW }, { projectId: "p" }, issue, { ...issue, likes: 3 }, ["likes"]).repair, "a server-ranked list: any field of a record in it repairs");
const mail = describe(Mail as Domain);
const unread = mail.unreadCount!;
const msgD = { id: "m", accountId: "a", folder: "inbox", labels: [], read: false, receivedAt: new Date(0), subject: "s", revision: 1 };
const derived = (changed: string[], after: object) => impact({ kind: "derived", where: unread.where!, fields: [["read"]] }, { accountId: "a" }, msgD, after, changed).repair;
check(derived(["folder"], { ...msgD, folder: "archive" }) && derived(["read"], { ...msgD, read: true }) && !derived(["subject"], { ...msgD, subject: "z" }), "a derived count: its condition fields and declared fields repair (the union); the subject does not");
const p1 = joins(condition(({ record }) => orF(smF(record.q), eqF(record.a, 1))), {}, { q: "x" }, { q: "y" }, ["q"]);
const p2 = joins(condition(({ record }) => orF(eqF(record.a, 1), smF(record.q))), {}, { q: "x" }, { q: "y" }, ["q"]);
check(p1.repair && p2.repair && p1.why === p2.why, "both maybe: the cause follows a fixed precedence, independent of argument order");

// Static explain (no record, no input): predicted fields alone would say "no"; the response shape says "maybe".
const listAnswer = { kind: "ordered" as const, where: listW, orderBy: [["number"], ["id"]] as string[][] };
check(!mayRepair(listAnswer, ["liked", "likes"]) && mayRepair(listAnswer, ["liked", "likes", "id", "projectId", "number", "title"]), "static explain: setLike's predicted fields cannot repair Issues.list, but its .one(Issue) response can reveal projectId or number, so the answer is \"may repair\", not \"no\"");

// ───────────────────────────────────────────────────────────── (c)
console.log("\n(c) predictions: frozen inputs and records, faults, per-record settlement");
const setLike = issues.setLike!.predicts! as ChangeIR[];
check(canon(setLike[0]!.fields) === canon({ liked: { ref: ["input", "liked"] }, likes: { runtime: true } }), "the Model holds the entity, key and field names; likes is `runtime`");
const at = (base: IssueRow | undefined, lives: Live[], options = { checkReplays: true }) => replay(base, lives, "issues/Issue", { id: "i1" }, options);
const a1 = start(setLike, { key: { id: "i1" }, liked: true }, "a1");
check(canon(laneKey(a1)) === canon({ id: "i1" }), "one record by a single key: merge 4 rule 34's lane key");
const a2 = start(setLike, { key: { id: "i1" }, liked: false }, "a2");
const base0: IssueRow = { id: "i1", projectId: "p", number: 1, title: "x", liked: false, likes: 5 };
const showR = (r: unknown) => (r && typeof r === "object" ? `liked ${(r as IssueRow).liked}, likes ${(r as IssueRow).likes}` : String(r));
const step = (label: string, base: IssueRow, lives: Live[], want: string) => check(showR(at(base, lives).visible) === want, `${label}: ${showR(at(base, lives).visible)}`);
step("A like over liked false, likes 5", base0, a1, "liked true, likes 6");
step("B unlike behind A", base0, [...a1, ...a2], "liked false, likes 5");
step("a push to liked true, likes 9; A and B replay", { ...base0, liked: true, likes: 9 }, [...a1, ...a2], "liked false, likes 8");
check(Object.isFrozen(at(base0, a1).visible) && Object.isFrozen(base0), "the record beneath and the visible record are frozen, in every environment");
check(at(base0, start(issues.remove!.predicts! as ChangeIR[], { key: { id: "i1" } }, "d")).visible === "deleted", "a predicted delete hides the record");
const notHeld = at(undefined, a1);
check(notHeld.visible === undefined && notHeld.slots.every((x) => x.state === "uncomputed") && showR(at({ ...base0 }, a1).visible) === "liked true, likes 6", "a patch over a record the store does not hold shows nothing (undefined), stays with its Attempt, and is computed when a base arrives (audit F12)");
const bumps = start(extras.bumpTwice!.predicts! as ChangeIR[], { key: { id: "i1" } }, "b");
check((at({ ...base0 }, bumps).visible as IssueRow).likes === 7 && queueKeys(bumps).length === 1, "two patches to one record apply in written order (5 → 6 → 7), one queue");
const react = extras.react!.predicts! as ChangeIR[];
const msgOf = (count: number): MessageRow => ({ messageId: "m", body: "", reactions: count ? [{ emoji: "+1", count }] : [] });
const rr = [...start(react, { key: { messageId: "m" }, emoji: "+1" }, "r1"), ...start(react, { key: { messageId: "m" }, emoji: "+1" }, "r2")];
const rx = (b: MessageRow) => replay(b, rr, "chat/Message", { messageId: "m" });
check(canon((rx(msgOf(4)).visible as MessageRow).reactions) === canon([{ emoji: "+1", count: 6 }]) && rx(msgOf(4)).faults.length === 0 && rx(msgOf(4)).slots.every((x) => x.state === "shown"), "a pure list edit over a moved base: 4 → 6, every slot shown, no fault");

// Faults: reported, and treated as uncomputed for display and settlement.
const touch2 = mail.touch2!.predicts! as ChangeIR[];
const rd = replay({ ...msgD }, start(touch2, { key: { id: "m" } }, "r"), "mail/Msg", { id: "m" });
check(rd.faults[0]?.reason.includes("two results") === true && rd.slots[0]?.state === "fault", "checkReplays (on in Stories and propertyTest): Math.random gives two results, a fault");
check(replay({ ...msgD }, start(touch2, { key: { id: "m" } }, "r"), "mail/Msg", { id: "m" }, { checkReplays: false }).faults.length === 0, "with checkReplays off (production), impurity is not detected: the option is what finds it");
const mut = mail.addLabelMut!.predicts! as ChangeIR[];
const rm = replay({ ...msgD, labels: ["a"] }, start(mut, { key: { id: "m" }, label: "b" }, "mu"), "mail/Msg", { id: "m" }, { checkReplays: false });
check(rm.faults[0]?.reason.includes("wrote to the record beneath") === true && rm.slots[0]?.state === "fault", "a write to the frozen record (labels.push) is a fault in every environment, not an ordinary failure");
const sortW = write(op<{ key: { id: string }; xs: number[] }, MsgRowLike>()("t/sort")).predicts(({ input }) => MsgE.patch(input.key, { subject: (_m, i) => i.xs.sort().join() }));
const sortIn = { key: { id: "m" }, xs: [3, 1, 2] };
const rs = replay({ id: "m", subject: "" }, start(sortW.d.predicts!, sortIn, "s"), "t/Msg", { id: "m" }, { checkReplays: false });
check(rs.faults[0]?.reason.includes("wrote to the input") === true && canon(sortIn.xs) === canon([3, 1, 2]), "i.xs.sort() on the frozen input is a fault, and the request body is unchanged");
const missingNested = write(op<{ key: { id: string } }, MsgRowLike>()("t/nested")).predicts(({ input }) => MsgE.patch(input.key, { subject: (m: any) => m.meta.owner }));
const rn = replay({ id: "m", subject: "" }, start(missingNested.d.predicts!, { key: { id: "m" } }, "n"), "t/Msg", { id: "m" });
check(rn.faults.length === 0 && rn.slots[0]?.state === "uncomputed", "a TypeError from a missing nested field is uncomputed, not a fault: the copies did not change");
class R {
  n = 1;
  dbl() {
    return this.n * 2;
  }
}
const cls = write(op<{ key: { id: string } }, MsgRowLike>()("t/cls")).predicts(({ input }) => MsgE.patch(input.key, { subject: (b: any) => String(b.dbl()) }));
const rc = replay(Object.assign(new R(), { id: "m", subject: "" }) as any, start(cls.d.predicts!, { key: { id: "m" } }, "c"), "t/Msg", { id: "m" });
check(rc.faults.length === 0 && (rc.visible as any).subject === "2", "a class instance beneath keeps its prototype: its method works, and the comparison does not fail");
const big = write(op<{ key: { id: string } }, MsgRowLike>()("t/big")).predicts(({ input }) => MsgE.patch(input.key, { subject: (b: any) => String(b.big + 1n) }));
const rb = replay({ id: "m", subject: "", big: 1n } as any, start(big.d.predicts!, { key: { id: "m" } }, "g"), "t/Msg", { id: "m" });
check(rb.faults.length === 0 && (rb.visible as any).subject === "2", "a bigint field: compared structurally, no harness failure");
let cached = 1;
const clock = write(op<{ key: { id: string } }, MsgRowLike>()("t/clock")).predicts(({ input }) => MsgE.patch(input.key, { subject: () => String(cached) }));
check(replay({ id: "m", subject: "" }, start(clock.d.predicts!, { key: { id: "m" } }, "k"), "t/Msg", { id: "m" }).faults.length === 0, "documented limit: a cached clock read gives the same value twice, so the double call cannot see it; settlement corrects it");
void (cached = 2);
const legacy = describe(legacyIssues() as Domain).setLike!.predicts! as ChangeIR[];
const lr = at(base0, start(legacy, { key: { id: "i1" }, liked: true }, "l"));
check(lr.faults[0]?.reason.includes("after its `.predicts` callback returned") === true && lr.slots.find((x) => x.field === "likes")?.state === "fault", "the sealed session's error is a fault: reported, and the slot is shown as uncomputed");

// Keys.
const bigKey = replay({ x: 0 } as any, [{ attempt: "a", kind: "patch", entity: "E", keys: [1n], many: false, fields: { x: { val: 1 } }, fns: {}, input: {}, retired: new Set() }], "E", 1n);
check((bigKey.visible as any).x === 1, "a bigint key is compared, not thrown");
const cyc: any = { id: "c" };
cyc.self = cyc;
check(replay({ x: 0 } as any, [{ attempt: "a", kind: "patch", entity: "E", keys: [cyc], many: false, fields: { x: { val: 1 } }, fns: {}, input: {}, retired: new Set() }], "E", { id: "d" }).faults.length === 0, "a circular key cannot crash the replay");
const NumE = entity<{ id: number; n: number }>()({ id: "t/Num", primaryKey: ["id"], keyTypes: { id: "number" } });
const numW = write(op<{ key: { id: number } }, {}>()("t/num")).predicts(({ input }) => NumE.patch(input.key, { n: 1 }));
const nk = [...start(numW.d.predicts!, { key: { id: 12 } }, "n1"), ...start(numW.d.predicts!, { key: { id: "12" as unknown as number } }, "n2")];
check(queueKeys(nk).length === 1, "keys are decoded through the primary key's Schema: \"12\" and 12 are one record");
const k1 = start(issues.rename!.predicts! as ChangeIR[], { key: { b: 1, a: 2 }, title: "t" }, "k1");
const k2 = start(issues.rename!.predicts! as ChangeIR[], { key: { a: 2, b: 1 }, title: "t" }, "k2");
check(queueKeys([...k1, ...k2]).length === 1, "keys are canonical: { b, a } and { a, b } are one record");

// Settlement, fed by the replay.
const xfer = extras.transfer!.predicts! as ChangeIR[];
const older = start(xfer, { from: { accountId: "A" }, to: { accountId: "B" }, amount: 5 }, "o");
const t = start(xfer, { from: { accountId: "A" }, to: { accountId: "B" }, amount: 30 }, "t");
const acct = (id: string, b: number): AccountRow => ({ accountId: id, balance: b, revision: 1 });
const rA = replay(acct("A", 100), [...older, ...t], "bank/Account", { accountId: "A" });
const rB = replay(acct("B", 100), [...older, ...t], "bank/Account", { accountId: "B" });
const st = settle([...older, ...t], "t", [{ entity: "bank/Account", key: { accountId: "A" }, fields: ["balance"] }], [rA, rB]);
check(canon(st.unconfirmed) === canon(['bank/Account:{"accountId":"B"}:balance']), "a transfer whose response carries only A: B's balance is unconfirmed");
check(replay(acct("A", 100), st.remaining, "bank/Account", { accountId: "A" }).slots.length === 0 && (replay(acct("B", 100), st.remaining, "bank/Account", { accountId: "B" }).visible as AccountRow).balance === 105, "A's confirmation retires the older prediction on A only; B still shows 105");
const archive = extras.archive!.predicts! as ChangeIR[];
const arch = start(archive, { keys: [{ userId: "u1" }, { userId: "u2" }, { userId: "u1" }] }, "ar");
const user = (id: string): UserRow => ({ userId: id, status: "active", revision: 1 });
const archReplays = ["u1", "u2"].map((u) => replay(user(u), arch, "admin/User", { userId: u }));
check(canon(settle(arch, "ar", [{ entity: "admin/User", key: { userId: "u1" }, fields: ["status"] }], archReplays).unconfirmed) === canon(['admin/User:{"userId":"u2"}:status']), "a bulk (many) write whose response carries u1 only: u2 is unconfirmed");
check(archive[0]!.many === true && queueKeys(arch).length === 2 && laneKey(arch) === undefined && laneKey(start(archive, { keys: [{ userId: "u1" }] }, "x")) === undefined, "an array key: many, deduplicated, never rule 34's lane key");
const noLikes = { id: "i1", projectId: "p", number: 1, title: "x", liked: false } as unknown as IssueRow;
const bad = start(setLike, { key: { id: "i1" }, liked: true }, "bad");
const r9: Replayed<object> = at(noLikes, bad);
check(r9.slots.find((x) => x.field === "likes")?.state === "uncomputed", `A9: likes is not held, its function gives NaN: uncomputed (${r9.slots.find((x) => x.field === "likes")?.reason})`);
check(canon(settle(bad, "bad", [{ entity: "issues/Issue", key: { id: "i1" }, fields: ["liked"] }], [r9]).unconfirmed) === canon(['issues/Issue:{"id":"i1"}:likes']), "A9: settlement reads the replay: the uncomputed likes is unconfirmed and gets its confirming read");
const metaW = write(op<{ key: { id: string } }, {}>()("t/meta")).predicts(({ input }) => MetaE.patch(input.key, { meta: () => ({ owner: "bo", color: "red" }) }));
const ml = start(metaW.d.predicts!, { key: { id: "c1" } }, "mt");
const mr = replay({ id: "c1", meta: { owner: "ana", color: "blue" } }, ml, "t/Meta", { id: "c1" });
check(canon(settle(ml, "mt", [{ entity: "t/Meta", key: { id: "c1" }, fields: [["meta", "color"]] }], [mr]).unconfirmed) === canon(['t/Meta:{"id":"c1"}:meta']) && settle(ml, "mt", [{ entity: "t/Meta", key: { id: "c1" }, fields: ["meta"] }], [mr]).unconfirmed.length === 0, "a response carrying only meta.color does not confirm a predicted meta; one carrying meta whole does");

// Enumeration, identities.
const throws = (f: () => unknown) => {
  try {
    f();
    return "";
  } catch (e) {
    return e instanceof RecordingError ? e.message : `other: ${String(e)}`;
  }
};
const tl = () => readF(ticketList).list(Ticket, ({ result }) => result.tickets);
check(throws(() => mailSpread()).includes("was enumerated"), "spreading the recording input throws at construction");
check(throws(() => tl().where(({ input, record }) => eqF(record.title, JSON.stringify(input) as any))).includes("was enumerated"), "JSON.stringify(input) throws at construction");
check(throws(() => tl().where(({ input, record }) => ("status" in input ? eqF(record.status, "open") : eqF(record.status, "closed")))).includes("was enumerated"), "`in` on the recording input throws at construction");
check(throws(() => app([tenantDomain("a", { strict: true }) as Domain, tenantDomain("a", { strict: true }) as Domain])).includes("two domains named a-kanban"), "a factory called twice for one tenant: duplicate domain ids");
check(throws(() => app([Issues as Domain, { id: "other", entries: { x: Issues.entries.list } } as Domain])).includes("is registered in issues.list and other.x"), "one operation in two domains");
check(throws(() => app([{ id: "dup", entries: { a: Issues.entries.list, b: Issues.entries.list } } as Domain])).includes("is registered in dup.a and dup.b"), "one operation in two entries of one domain (9.10)");
check(throws(() => app([], [Card, { id: "kb/Card" }])).includes("two entities with id kb/Card"), "two entity objects with one id");
check(throws(() => app([tenantDomain("x", { strict: true }) as Domain, tenantDomain("y", { strict: true }) as Domain])).includes("is registered in x-kanban.column and y-kanban.column"), "two tenants sharing operations: an error, so a factory parameterises its operations too");
void probes2;

// ───────────────────────────────────────────────────────────── (d)
console.log("\n(d) the lint: an allowlist grammar, with type facts");
const t0 = performance.now();
const findings = await lint(dir); // the project's tsconfig program, not a list
console.log(`   linted the project's program with type facts from typescript/unstable/async in ${Math.round(performance.now() - t0)} ms`);
for (const f of findings.filter((f) => f.severity === "error"))
  console.log(`   ${f.file}:${f.line} [${f.rule}] ${f.message.slice(0, 120)}${f.fix ? `\n      ${"code" in f.fix ? `fix-it: ${f.fix.code}` : `instruction: ${f.fix.instruction.slice(0, 110)}`}` : ""}`);
const errors = (file: string) => findings.filter((f) => f.file === file && f.severity === "error");
for (const f of ["domains/tickets.ts", "domains/issues.ts", "domains/extras.ts", "domains/variants.ts", "domains/kanban.ts", "domains/docs.ts"]) check(errors(f).length === 0, `${f}: no errors`);
check(findings.filter((f) => f.rule === "claim").length >= 4, "every serverMatches with a field list gets an info finding: the list is a claim only audit mode and propertyTest check");
const holesSrc = await fileText("domains/holes.ts");
const entryLines = holesSrc.split("\n").flatMap((l, i) => (/^  e\d+:/.test(l) ? [{ name: l.trim().split(":")[0]!, line: i + 1 }] : []));
const flagged = (from: number, to: number) => errors("domains/holes.ts").some((f) => f.line >= from && f.line < to);
const missed = entryLines.filter((e, i) => !flagged(e.line, entryLines[i + 1]?.line ?? e.line + 10)).map((e) => e.name);
check(canon(missed) === canon(["e22"]), `review 3's ${entryLines.length} holes (with review 4's bare computed constants e24, e25) are all errors except e22 (impurity inside a field function: checkReplays' job): missed ${missed.join(", ")}`);
const pSrc = await fileText("domains/p.ts");
const pLine = (needle: string) => pSrc.split("\n").findIndex((l) => l.includes(needle)) + 1;
const pErr = (needle: string) => errors("domains/p.ts").some((f) => f.line === pLine(needle));
check(pErr("r1:") && pErr("r5:") && pErr("r6:") && pErr("const wAny"), "review 4's probes: a branch in a receiver, a computed field name, a zero-parameter callback and an any-typed callback passed by name are all errors (callbacks found by position)");
check(errors("domains/legacy.ts").some((f) => f.line === 1 && f.message.includes("not type-checked")), "a file with @ts-nocheck that holds recorded positions is an error, not a pass");
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
