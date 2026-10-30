// The spike's entry: (a) conditions record and evaluate three-valued (the conformance table), (b) the join
// rule repairs where the two-valued rule missed, without refetching on every change, (c) predictions are
// runtime functions recorded for structure, replayed, skipped and settled, (d) the type-aware lint flags
// JavaScript logic with a fix-it that never fails to type-check.
// Types are checked separately by `tsc -p .` (types.ts). Run: tsc -p . && bun main.ts
import { eq as eqF, isNull as isNullF, or as orF, serverMatches as smF } from "./flow.ts";
import { checkOrder, condition, contradicts, describe, evaluate, joins, laneKey, queueKeys, RecordingError, replay, settle, start } from "./flow.ts";
import type { ChangeIR, Domain, IR, Live } from "./flow.ts";
import { conformance } from "./conformance.ts";
import { TicketsDomain } from "./domains/tickets.ts";
import { Issues } from "./domains/issues.ts";
import { Extras } from "./domains/extras.ts";
import { issuesFor, Variants } from "./domains/variants.ts";
import { legacyFlags, legacyIssues, legacyTickets } from "./domains/legacy.ts";
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
console.log("\n(b) the join rule: repair unless a read field is unchanged or both sides are the same definite answer");
const where = condition(({ input, record }) => orF(eqF(record.team, input.t), eqF(record.status, "open")));
const input = { t: "red" };
// The delta carries only status: team is not carried. The ticket is on the blue team, so it really leaves.
const before = { status: "open" };
const after = { status: "closed" };
const twoValued = (w: IR, rec: object) => { const t = evaluate(w, { input, record: rec }); return t.v !== "no"; }; // rev 1: not carried counts as met
check(twoValued(where, before) === twoValued(where, after), "rev 1's two-valued rule: true before and true after, so no transition fires (the verified missed refetch)");
const j1 = joins(where, input, before, after, ["status"]);
check(j1.repair && j1.why === "notCarried", `the three-valued rule: yes before, maybe after, on a changed read field: repair (evidence: ${j1.repair ? j1.why : "-"})`);
const j2 = joins(where, input, { status: "open", title: "a" }, { status: "open", title: "b" }, ["title"]);
check(!j2.repair, "a change to a field the condition does not read never repairs it (no refetch-on-every-change cliff)");
const j3 = joins(where, input, { team: "red", status: "open" }, { team: "red", status: "closed" }, ["status"]);
check(!j3.repair, "both sides definite and equal (yes, yes: still on red): no repair");
const j4 = joins(where, input, { team: "blue", status: "open" }, { team: "blue", status: "closed" }, ["status"]);
check(j4.repair && j4.why === "left", "a definite transition: left, as evidence");
const sm = condition(({ input, record }) => orF(eqF(record.assignee, input.me), smF(input.q, record.title)));
const j5 = joins(sm, { me: "ana", q: "lobby" }, { assignee: "bo", title: "a" }, { assignee: "bo", title: "b" }, ["title"]);
check(j5.repair && j5.why === "server", "serverMatches under `or` is legal and maybe: a title change repairs, with `server` as the reason");
const j6 = joins(sm, { me: "ana", q: "lobby" }, { assignee: "bo", title: "a", status: "x" }, { assignee: "bo", title: "a", status: "y" }, ["status"]);
check(!j6.repair, "…and a change to a field it does not name does not");
const fieldless = condition(({ input }) => smF(input.q));
check(joins(fieldless, { q: "x" }, { a: 1 }, { a: 2 }, ["a"]).repair, "serverMatches with no record fields reads every field: any change repairs (ED:144)");
const nul = condition(({ record }) => isNullF(record.assignee));
check(joins(nul, {}, { assignee: null }, { assignee: "ana" }, ["assignee"]).repair, "isNull: assigning a ticket is a definite leave");

// ───────────────────────────────────────────────────────────── (c)
console.log("\n(c) predictions: runtime functions, recorded for structure, called with the real input");
const issues = describe(Issues as Domain);
const setLike = issues.setLike!.predicts! as ChangeIR[];
console.log(`   Issues.setLike records ${canon(setLike[0])}`);
check(canon(setLike[0]!.fields) === canon({ liked: { ref: ["input", "liked"] }, likes: { runtime: true } }), "the Model holds the entity, key and field names; likes is `runtime` (flow explain: likes ← <runtime>)");
const at = (base: IssueRow | undefined, lives: Live[]) => replay(base, lives, "issues/Issue", { id: "i1" });
const a1 = start(setLike, { key: { id: "i1" }, liked: true }, "a1");
check(canon(laneKey(a1)) === canon({ id: "i1" }), "at start the key is read from the input: one record, so merge 4 rule 34's lane key");
const a2 = start(setLike, { key: { id: "i1" }, liked: false }, "a2");
const base0: IssueRow = { id: "i1", projectId: "p", number: 1, title: "x", liked: false, likes: 5 };
const showR = (r: unknown) => (r && typeof r === "object" ? `liked ${(r as IssueRow).liked}, likes ${(r as IssueRow).likes}` : String(r));
const step = (label: string, base: IssueRow, lives: Live[], want: string) => check(showR(at(base, lives).visible) === want, `${label}: ${showR(at(base, lives).visible)}`);
step("base liked false, likes 5; A like starts", base0, a1, "liked true, likes 6");
step("B unlike starts behind A", base0, [...a1, ...a2], "liked false, likes 5");
const base1 = { ...base0, liked: true, likes: 9 };
step("a push sets liked true, likes 9; A and B replay", base1, [...a1, ...a2], "liked false, likes 8");
step("A fails and is retracted; B replays alone", base1, a2, "liked false, likes 8");
const s2 = settle([...a1, ...a2], "a2", { likes: 4 });
check(canon(Object.keys(s2.remaining[0]!.fields)) === canon(["liked"]) && canon(s2.unconfirmed) === canon(["liked"]), "B's confirmed likes retires A's older likes; B's omitted liked is unconfirmed (a confirming read)");

// Rule A6: a skipped value.
const bad = start(setLike, { key: { id: "i1" }, liked: true }, "bad");
const noLikes = { id: "i1", projectId: "p", number: 1, title: "x", liked: false } as unknown as IssueRow;
const r7 = at(noLikes, bad);
check((r7.visible as IssueRow).liked === true && (r7.visible as IssueRow).likes === undefined && r7.skipped[0]?.field === "likes" && r7.predicted.includes("likes"), `likes is not held: its function gives NaN, the Schema rejects it, it is skipped but still predicted (${r7.skipped[0]?.reason})`);
check(canon(settle(bad, "bad", { liked: true }).unconfirmed) === canon(["likes"]), "the response omits likes: the skipped field is unconfirmed, so it gets a confirming read (no stale field)");
const react = extras.react!.predicts! as ChangeIR[];
const broken = { messageId: "m", body: "", reactions: "not a list" } as unknown as MessageRow;
const rb = replay(broken, start(react, { key: { messageId: "m" }, emoji: "+1" }, "rb"), "chat/Message", { messageId: "m" });
check(rb.skipped.length === 1 && (rb.visible as MessageRow).reactions === broken.reactions, "a function that throws is skipped; the field keeps its value beneath; the replay goes on");
const msg = (count: number): MessageRow => ({ messageId: "m", body: "", reactions: count ? [{ emoji: "+1", count }] : [] });
const r1 = start(react, { key: { messageId: "m" }, emoji: "+1" }, "r1");
const r2 = start(react, { key: { messageId: "m" }, emoji: "+1" }, "r2");
const vm = (base: MessageRow) => (replay(base, [...r1, ...r2], "chat/Message", { messageId: "m" }).visible as MessageRow).reactions;
check(canon(vm(msg(0))) === canon([{ emoji: "+1", count: 2 }]) && canon(vm(msg(4))) === canon([{ emoji: "+1", count: 6 }]), "a list edit is an ordinary function: two reactions over none give 2; over a moved base of 4, 6");
const tr = start(extras.transfer!.predicts! as ChangeIR[], { from: { accountId: "A" }, to: { accountId: "B" }, amount: 30 }, "x");
const bal = (id: string, b: number) => (replay<AccountRow>({ accountId: id, balance: b, revision: 1 }, tr, "bank/Account", { accountId: id }).visible as AccountRow).balance;
check(bal("A", 100) === 70 && bal("B", 5) === 35 && bal("A", 40) === 10 && queueKeys(tr).length === 2 && laneKey(tr) === undefined, "transfer: two records, replayed over a pushed base; two queues, no default lane key");
check(at(base0, start(issues.remove!.predicts! as ChangeIR[], { key: { id: "i1" } }, "d")).visible === "deleted", "a predicted delete hides the record");
const bumps = start(extras.bumpTwice!.predicts! as ChangeIR[], { key: { id: "i1" } }, "b");
check((at(base0, bumps).visible as IssueRow).likes === 7 && queueKeys(bumps).length === 1, "two patches to one record apply in written order (5 → 6 → 7) and join its queue once");
const archive = extras.archive!.predicts! as ChangeIR[];
check(archive[0]!.many === true, "an array key is recorded in the Model (`many`, from the input Schema)");
const arch = start(archive, { keys: [{ userId: "u1" }, { userId: "u2" }, { userId: "u1" }] }, "ar");
const user = (id: string): UserRow => ({ userId: id, status: "active", revision: 1 });
check(queueKeys(arch).length === 2 && laneKey(arch) === undefined && (replay(user("u2"), arch, "admin/User", { userId: "u2" }).visible as UserRow).status === "archived", "an array key predicts each listed record once and takes no rule-34 lane key");
check(laneKey(start(archive, { keys: [{ userId: "u1" }] }, "a1")) === undefined, "…not even with one element: the Model says many");

// The recording `input` is sealed: a function that closed over it fails loudly, naming the fix.
const legacy = describe(legacyIssues() as Domain).setLike!.predicts! as ChangeIR[];
const lr = replay(base0, start(legacy, { key: { id: "i1" }, liked: true }, "l"), "issues/Issue", { id: "i1" });
check(lr.skipped[0]?.reason.includes("was read after construction") === true && lr.skipped[0]?.reason.includes("second parameter") === true, `merge 4's original setLike, which closes over the recording input: "${lr.skipped[0]?.reason.slice(0, 70)}…"`);
check(Object.keys(describe(issuesFor("x") as Domain)).length === 2, "a domain factory with a computed id records normally (allowed, M5-D6)");

// ───────────────────────────────────────────────────────────── (d)
console.log("\n(d) the type-aware lint: JavaScript logic and impure calls, with a fix-it that type-checks");
const files = ["domains/tickets.ts", "domains/issues.ts", "domains/extras.ts", "domains/variants.ts", "domains/legacy.ts"];
const t0 = performance.now();
const findings = await lint(dir, files);
console.log(`   linted ${files.length} files with type facts from typescript/unstable/async in ${Math.round(performance.now() - t0)} ms`);
for (const f of findings) console.log(`   ${f.file}:${f.line} [${f.rule}] ${f.message}\n      ${"code" in f.fix ? `fix-it: ${f.fix.code}` : `instruction: ${f.fix.instruction}`}`);
const clean = findings.filter((f) => !f.file.endsWith("legacy.ts"));
check(clean.length === 0, "no findings on the reference domains, the extras or the variants (a helper, a factory, consts, enums, casts, single-parameter and nested callbacks)");
const legacySrc = await fileText("domains/legacy.ts");
const lineOf = (needle: string) => legacySrc.split("\n").findIndex((l) => l.includes(needle)) + 1;
const at2 = (needle: string) => findings.filter((f) => f.file.endsWith("legacy.ts") && f.line === lineOf(needle));
const code = (fs: typeof findings) => fs.map((f) => ("code" in f.fix ? f.fix.code : "")).join("");
const typesSrc = await fileText("types.ts");
const either = at2("eq(record.status, \"open\") || eq");
check(either.length === 1 && code(either) !== "" && typesSrc.includes(code(either)), `\`||\`: or(…), and that exact text compiles in types.ts: ${code(either)}`);
const both = at2("&& eq(record.status");
check(both.length === 1 && code(both) !== "" && typesSrc.includes(code(both)), `\`&&\`: and(…), and that exact text compiles in types.ts`);
const status = at2("input.status ? eq");
check(status.length === 1 && "instruction" in status[0]!.fix, "`?:` in a condition: an instruction, never code (no operator branches, so any code would be a type error)");
check(at2("eq(record.updatedAt, Date.now())").some((f) => f.rule === "impure"), "Date.now() in a recorded position is impure");
const closure = at2("likes: (i) => i.likes +");
check(closure.length === 2 && closure.every((f) => f.message.startsWith("a recorded value inside a runtime function") && "instruction" in f.fix), "merge 4's setLike: both `===` and `?:` over the captured recording input are flagged as a closure, with the (beneath, input) instruction");
const helper = at2("const mineOrOpen");
check(helper.length === 1 && !helper[0]!.message.startsWith("a recorded value inside"), "a helper's `?:` over its own recorded parameter is found by type (not reported as a closure)");
check(at2("liked: input.liked ? true").length === 1, "`?:` in a recorded field value is flagged");
void legacyFlags;
void RecordingError;
void Variants;

console.log(`\n${failed === 0 ? `ALL PASS (${passed} checks)` : `${failed} FAILED`}`);
if (failed) throw new Error(`${failed} checks failed`);
