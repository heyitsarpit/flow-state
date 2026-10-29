// The spike's entry: (a) operators type, record and evaluate (the conformance table), (b) source reading
// agrees with recording, and disagrees when the running code is not the source, (c) recorded predicted
// values start, replay and settle, (d) the source reader flags JavaScript logic with a fix-it.
// Types are checked separately by `tsc -p .` (types.ts). Run: tsc -p . && bun main.ts
import { checkOrder, describe, laneKey, matches, queueKeys, RecordingError, replay, settle, start, value } from "./flow.ts";
import type { ChangeIR, Domain, EntryDescription, IR, Live } from "./flow.ts";
import { conformance } from "./conformance.ts";
import { TicketsDomain } from "./domains/tickets.ts";
import { Issues } from "./domains/issues.ts";
import { Extras } from "./domains/extras.ts";
import { Variants } from "./domains/variants.ts";
import { Stale as StaleRunning } from "./domains/stale.previous-build.ts";
import { legacyChat, legacyIssues, legacyTickets, makeIssues } from "./domains/legacy.ts";
import type { AccountRow, IssueRow, MessageRow, OccurrenceRow, TicketRow, UserRow } from "./domains/ops.ts";
import { canon, firstDifference, readSources } from "./source.ts";

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
  if ("opaque" in ir) return `opaque(${ir.opaque.map(render).join(", ")})`;
  return `${ir.op}(${ir.args.map(render).join(", ")})`;
};
const dir = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const fileText = async (f: string) => (await fetch(new URL(f, import.meta.url))).text();
const holds = (ir: IR, env: { input?: unknown; record?: unknown }) => matches(ir, env).matches;

// ───────────────────────────────────────────────────────────── (a)
console.log("(a) the operator set records and evaluates; both branches of `when` are recorded");
const issues = describe(Issues as Domain);
const likesIR = issues.setLike!.predicts![0]!.fields!.likes!;
console.log(`   Issues.setLike predicts likes = ${render(likesIR)}`);
check(render(likesIR) === "add(prior.likes, when(eq(input.liked, prior.liked), 0, when(input.liked, 1, -1)))", "the whole expression is recorded, the outer and the inner `when`, all three outcomes 0, 1, -1");
for (const [lk, prior, want] of [[true, false, 1], [false, true, -1], [true, true, 0], [false, false, 0]] as const) {
  const got = value(likesIR, { input: { key: { id: "i1" }, liked: lk }, prior: { liked: prior, likes: 5 } });
  check(got === 5 + want, `liked ${lk} over liked ${prior}: likes 5 → ${String(got)} (branch ${want})`);
}

console.log("\n   the conformance table (M5-D3), every row run by the evaluator:");
console.log("   | operator | written | given | result |");
console.log("   | --- | --- | --- | --- |");
let rowsOk = 0;
for (const row of conformance) {
  let got: string;
  if (row.kind === "condition") {
    const m = matches(row.expr, row.env);
    got = m.why === "evaluated" ? String(m.matches) : `matches: ${m.why === "notCarried" ? "not carried" : "failed"}`;
  } else {
    try {
      got = `value ${JSON.stringify(value(row.expr, row.env))}`;
    } catch {
      got = "fails (skipped, rule A7)";
    }
  }
  const want =
    typeof row.expect === "boolean" ? String(row.expect)
    : typeof row.expect === "string" ? row.expect
    : "value" in row.expect ? `value ${JSON.stringify(row.expect.value)}`
    : "fails (skipped, rule A7)";
  if (got === want) rowsOk++;
  console.log(`   | \`${row.op}\` | \`${row.written}\` | ${row.given} | ${got}${got === want ? "" : `  ✗ expected ${want}`} |`);
}
check(rowsOk === conformance.length, `${rowsOk}/${conformance.length} conformance rows give their expected result`);

const tickets = describe(TicketsDomain as Domain);
const rows: TicketRow[] = [
  { workspaceId: "w1", ticketId: "t1", title: "Lobby", status: "open", assignee: null, updatedAt: 10, revision: 1 },
  { workspaceId: "w1", ticketId: "t2", title: "Roof", status: "assigned", assignee: "ana", updatedAt: 20, revision: 1 },
  { workspaceId: "w2", ticketId: "t3", title: "Door", status: "open", assignee: "bo", updatedAt: 30, revision: 1 },
];
const members = (where: IR, input: unknown, list: readonly object[] = rows) =>
  list.filter((r) => holds(where, { input, record: r })).map((r: any) => r.ticketId ?? r.occurrenceId).join(",");
const listWhere = tickets.list!.where!;
console.log(`\n   tickets.list where ${render(listWhere)}`);
check(members(listWhere, { workspaceId: "w1" }) === "t1,t2", "absent status, assignee and search drop their constraints (and serverMatches may hold for any record)");
check(members(listWhere, { workspaceId: "w1", status: "open" }) === "t1", "status open keeps the open ticket");
check(members(listWhere, { workspaceId: "w1", assignee: "ana" }) === "t2", "assignee ana: a null assignee is not equal to ana");
check(members(tickets.openCount!.where!, { workspaceId: "w1" }) === "t1", "openCount: workspace and the constant \"open\"");
const extras = describe(Extras as Domain);
const queueWhere = extras.myQueue!.where!;
console.log(`   extras.myQueue where ${render(queueWhere)}`);
check(render(queueWhere).startsWith("and(eq(record.workspaceId, input.workspaceId), and(or("), "two `.where` calls are recorded as and(first, second), in call order");
check(members(queueWhere, { workspaceId: "w1", me: "ana", before: 25 }) === "t1,t2", "or(isNull, eq) keeps unassigned and mine; lt on a number");
check(members(queueWhere, { workspaceId: "w1", me: "ana", before: 15 }) === "t1", "lt(updatedAt, 15) drops the ticket updated at 20");
const D = (s: string) => new Date(`2026-01-${s}T00:00Z`);
const occs: OccurrenceRow[] = [
  { occurrenceId: "o1", calendarId: "c", title: "a", startsAt: D("05"), endsAt: D("06") },
  { occurrenceId: "o2", calendarId: "c", title: "b", startsAt: D("10"), endsAt: null },
  { occurrenceId: "o3", calendarId: "c", title: "c", startsAt: D("20"), endsAt: D("25") },
];
const ow = extras.occurrences!.where!;
check(members(ow, { calendarId: "c", from: D("04"), to: D("21") }, occs) === "o1,o3", "overlaps over Dates: [5,6) and [20,25) meet [4,21); a null end never overlaps");
check(members(ow, { calendarId: "c", from: D("22") }, occs) === "o3", "overlaps with `to` absent: only the lower bound applies");
check(members(extras.starting!.where!, { calendarId: "c", to: D("10") }, occs) === "o1", "between with `from` absent: the upper bound stays (half-open: the 10th is out)");

const ord = tickets.list!.orderBy!; // desc(updatedAt), asc(workspaceId), asc(ticketId)
const tk = (updatedAt: number | null, ticketId: string) => ({ workspaceId: "w1", ticketId, updatedAt });
check("ok" in checkOrder([tk(30, "a"), tk(20, "b"), tk(20, "c")], ord), "order check: updatedAt descending, then the key (Order.Number)");
const hid = checkOrder([tk(20, "a"), tk(30, "b")], ord);
check("hiddenOrder" in hid && hid.hiddenOrder.key === "updatedAt", "an ascending pair under desc(updatedAt) is HiddenOrder, naming the key");
const sk = checkOrder([tk(30, "a"), tk(null, "b"), tk(40, "c")], ord);
check("ok" in sk && sk.skipped === 2, "a pair with a null sort key is skipped, not HiddenOrder (M5-D4): both pairs touching the null");
check("ok" in checkOrder([tk(Number.NaN, "a"), tk(5, "b")], ord), "a non-finite sort key is skipped too (Order.Number would rank NaN first)");

console.log("   recording without the source reader (the gap this proposal closes):");
const lt = describe(legacyTickets() as Domain);
check(render(lt.either!.where) === 'eq(record.status, "open")', "`||` silently records its first operand");
check(render(lt.status!.where) === "eq(record.status, input.status)", "`?:` silently records one branch");
check(render(lt.both!.where) === 'eq(record.status, "open")', "`&&` silently records its second operand");
check(/eq\(record\.updatedAt, \d{10,}\)/.test(render(lt.recent!.where)), "Date.now() is recorded as a constant");
let thrown = "";
try {
  legacyIssues();
} catch (e) {
  thrown = e instanceof RecordingError ? e.message : String(e);
}
check(thrown.includes("prior.likes was converted to a primitive"), `JavaScript arithmetic fails at construction, naming the value: "${thrown.slice(0, 60)}…"`);

// ───────────────────────────────────────────────────────────── (b)
console.log("\n(b) source reading equals recording, and a stale build is a DomainSourceMismatch");
const files = ["domains/ops.ts", "domains/tickets.ts", "domains/issues.ts", "domains/extras.ts", "domains/variants.ts", "domains/stale.ts", "domains/legacy.ts"];
const t0 = performance.now();
const fromSource = await readSources(dir, files);
console.log(`   read ${files.length} files through typescript/unstable/async in ${Math.round(performance.now() - t0)} ms`);
const recorded: Record<string, Record<string, EntryDescription>> = { tickets, issues, extras, variants: describe(Variants as Domain) };
for (const [id, entries] of Object.entries(recorded)) {
  const d = firstDifference(entries, fromSource.domains[id]);
  check(d === undefined, `${id}: ${Object.keys(entries).length} entries, source and recording identical${d ? ` (first difference at ${d.path}: recorded ${d.recorded}, source ${d.source})` : ""}`);
}
console.log(`   variants as read: constants ${render(fromSource.domains.variants!.constants!.where)}`);
const clean = fromSource.findings.filter((f) => !f.file.endsWith("legacy.ts"));
check(clean.length === 0, `no findings on the reference domains, the extras, the variants or stale.ts (${clean.length}${clean.length ? `: ${clean.map((f) => `${f.file}:${f.line} ${f.message}`).join("; ")}` : ""})`);
const stale = firstDifference(describe(StaleRunning as Domain), fromSource.domains.stale);
console.log(`   DomainSourceMismatch stale.list at ${stale?.path}: recorded ${stale?.recorded}, source ${stale?.source}`);
check(stale?.path === "list.orderBy.0.op", "a lint-clean declaration whose running build is older: the mismatch names the entry and the first differing node (desc in source, asc running)");
const legacySrc = fromSource.domains["legacy-tickets"]!;
const disagree = Object.keys(lt).filter((n) => canon(lt[n]) !== canon(legacySrc[n]));
check(disagree.join(",") === "either,status,both,recent", `on linted legacy declarations the two disagree wherever recording was silently wrong: ${disagree.join(", ")}`);
const factory = fromSource.findings.find((f) => f.rule === "unreadable-domain");
check(factory !== undefined && !(describe(makeIssues("x") as Domain).list === undefined) && fromSource.domains.x === undefined, "a domain factory is reported unreadable (an error), not compared, so correct code never gets a false mismatch");

// ───────────────────────────────────────────────────────────── (c)
console.log("\n(c) recorded predicted values: start, replay over a changed base, skip, settle");
const setLike = issues.setLike!.predicts! as ChangeIR[];
const at = (base: IssueRow | undefined, lives: Live[]) => replay(base, lives, "issues/Issue", { id: "i1" });
const a1 = start(setLike, { key: { id: "i1" }, liked: true }, "a1");
check(canon(laneKey(a1)) === canon({ id: "i1" }), `at start the key evaluates to {"id":"i1"}: one record, so merge 4 rule 34's lane key`);
const a2 = start(setLike, { key: { id: "i1" }, liked: false }, "a2");
const base0: IssueRow = { id: "i1", projectId: "p", number: 1, title: "x", liked: false, likes: 5 };
const show = (r: unknown) => (r && typeof r === "object" ? `liked ${(r as IssueRow).liked}, likes ${(r as IssueRow).likes}` : String(r));
const step = (label: string, base: IssueRow, lives: Live[], want: string) => check(show(at(base, lives).visible) === want, `${label}: ${show(at(base, lives).visible)}`);
step("base liked false, likes 5; A like starts", base0, a1, "liked true, likes 6");
step("B unlike starts behind A", base0, [...a1, ...a2], "liked false, likes 5");
const base1 = { ...base0, liked: true, likes: 9 };
step("base changes to liked true, likes 9 (a push); A and B replay", base1, [...a1, ...a2], "liked false, likes 8");
step("A fails and is retracted; B replays alone", base1, a2, "liked false, likes 8");
step("B fails too: the base shows", base1, [], "liked true, likes 9");

const oldLikes = (i: IssueRow, input: { liked: boolean }) => i.likes + (input.liked === i.liked ? 0 : input.liked ? 1 : -1);
const replayOld = (base: IssueRow, seq: boolean[]) => seq.reduce((r, liked) => ({ ...r, liked, likes: oldLikes(r, { liked }) }), base);
let cases = 0;
let same = 0;
const seqs: boolean[][] = [[]];
for (let n = 0; n < 4; n++) for (const s of [...seqs]) if (s.length === n) seqs.push([...s, true], [...s, false]);
for (const liked of [true, false])
  for (const likes of [0, 1, 7])
    for (const seq of seqs) {
      const base = { ...base0, liked, likes };
      const lives = seq.flatMap((l, i) => start(setLike, { key: { id: "i1" }, liked: l }, `x${i}`));
      cases++;
      if (canon(at(base, lives).visible) === canon(replayOld(base, seq))) same++;
    }
check(same === cases, `the operator form equals the JavaScript function it replaces in ${same}/${cases} base × sequence cases`);

// Settlement and retirement.
const s1 = settle([...a1, ...a2], "a1", { liked: true, likes: 6 });
check(s1.unconfirmed.length === 0 && s1.remaining.length === 1, "A succeeds and its response carries both fields: nothing unconfirmed, B stays live");
const s2 = settle([...a1, ...a2], "a2", { likes: 4 });
check(canon(Object.keys(s2.remaining[0]!.fields)) === canon(["liked"]) && canon(s2.unconfirmed) === canon(["liked"]), "B's confirmed likes retires A's older likes prediction; B's omitted liked is unconfirmed (a confirming read)");

// Rule A7: a value that cannot be evaluated is skipped, still predicted, and confirmed by a read.
const bad = start(setLike, { key: { id: "i1" }, liked: true }, "bad");
const noLikes = { id: "i1", projectId: "p", number: 1, title: "x", liked: false } as unknown as IssueRow;
const r7 = at(noLikes, bad);
check(
  (r7.visible as IssueRow).liked === true && (r7.visible as IssueRow).likes === undefined && canon(r7.predicted.sort()) === canon(["liked", "likes"]) && r7.skipped[0]?.field === "likes",
  `the store does not hold likes: liked is still shown, likes is skipped (${r7.skipped[0]?.reason}) but counts as predicted`,
);
check(canon(settle(bad, "bad", { liked: true }).unconfirmed) === canon(["likes"]), "the response omits likes: the skipped field is unconfirmed, so a confirming read is scheduled (no stale field)");
const react = extras.react!.predicts! as ChangeIR[];
const msg = (count: number): MessageRow => ({ messageId: "m", body: "", reactions: count ? [{ emoji: "+1", count }] : [] });
const broken = { ...msg(1), reactions: "not a list" } as unknown as MessageRow;
const rb = replay(broken, start(react, { key: { messageId: "m" }, emoji: "+1" }, "rb"), "chat/Message", { messageId: "m" });
check(rb.skipped[0]?.reason.startsWith("opaque function threw") === true && (rb.visible as MessageRow).reactions === broken.reactions, "an opaque body that throws is skipped, the field keeps the value beneath, the replay goes on");
const huge = start(extras.transfer!.predicts! as ChangeIR[], { from: { accountId: "A" }, to: { accountId: "B" }, amount: -1.7e308 }, "h");
const rh = replay<AccountRow>({ accountId: "A", balance: 1.7e308, revision: 1 }, huge, "bank/Account", { accountId: "A" });
check(rh.skipped[0]?.field === "balance" && (rh.visible as AccountRow).balance === 1.7e308, "a non-finite sum is skipped, not shown as Infinity");

// Opaque, transfer, delete, two patches, array keys, Dates.
const r1 = start(react, { key: { messageId: "m" }, emoji: "+1" }, "r1");
const r2 = start(react, { key: { messageId: "m" }, emoji: "+1" }, "r2");
const vm = (base: MessageRow, lives: Live[]) => (replay(base, lives, "chat/Message", { messageId: "m" }).visible as MessageRow).reactions;
check(canon(vm(msg(0), [...r1, ...r2])) === canon([{ emoji: "+1", count: 2 }]) && canon(vm(msg(4), [...r1, ...r2])) === canon([{ emoji: "+1", count: 6 }]), "opaque list edit: two reactions over none give 2; the base moves to 4 and the function replays: 6");
const tr = start(extras.transfer!.predicts! as ChangeIR[], { from: { accountId: "A" }, to: { accountId: "B" }, amount: 30 }, "x");
const acct = (id: string, balance: number): AccountRow => ({ accountId: id, balance, revision: 1 });
const bal = (base: AccountRow) => (replay(base, tr, "bank/Account", { accountId: base.accountId }).visible as AccountRow).balance;
check(bal(acct("A", 100)) === 70 && bal(acct("B", 5)) === 35 && bal(acct("A", 40)) === 10, "transfer: A 100 → 70, B 5 → 35; a push sets A to 40 and the replay shows 10");
check(queueKeys(tr).length === 2 && laneKey(tr) === undefined, "transfer joins two record queues and takes no default lane key");
const del = start(issues.remove!.predicts! as ChangeIR[], { key: { id: "i1" } }, "d");
check(at(base0, del).visible === "deleted" && show(at(base0, []).visible) === "liked false, likes 5", "a predicted delete hides the record; its retraction brings it back");
const bumps = start(extras.bumpTwice!.predicts! as ChangeIR[], { key: { id: "i1" } }, "b");
check((at(base0, bumps).visible as IssueRow).likes === 7 && queueKeys(bumps).length === 1, "two patches to one record apply in written order (5 → 6 → 7) and join its queue once");
const arch = start(extras.archive!.predicts! as ChangeIR[], { keys: [{ userId: "u1" }, { userId: "u2" }, { userId: "u1" }] }, "ar");
const user = (id: string): UserRow => ({ userId: id, status: "active", revision: 1 });
check(queueKeys(arch).length === 2 && laneKey(arch) === undefined && (replay(user("u2"), arch, "admin/User", { userId: "u2" }).visible as UserRow).status === "archived", "an array key predicts each listed record once (u1 twice is one), joins both queues and takes no rule-34 lane key");
const one = start(extras.archive!.predicts! as ChangeIR[], { keys: [{ userId: "u1" }] }, "ar1");
check(laneKey(one) === undefined, "an array key with one element still takes no default lane key (the Schema says many)");
check(laneKey(start(issues.rename!.predicts! as ChangeIR[], { key: { id: "i1" }, title: "t" }, "rn")) !== undefined, "a single-key write does");
const mv = start(extras.move!.predicts! as ChangeIR[], { key: { occurrenceId: "o1" }, startsAt: D("07") }, "mv");
check((replay(occs[0]!, mv, "cal/Occurrence", { occurrenceId: "o1" }).visible as OccurrenceRow).startsAt.getTime() === D("07").getTime(), "a predicted Date field");
const assign = tickets.assign!.predicts! as ChangeIR[];
const t1 = start(assign, { workspaceId: "w1", ticketId: "t1", assignee: "ana" }, "t1");
check(canon(replay(rows[0]!, t1, "DispatchDesk/Ticket", { workspaceId: "w1", ticketId: "t1" }).visible) === canon({ ...rows[0]!, assignee: "ana", status: "assigned" }), "tickets.assign predicts assignee ana and status assigned");

// ───────────────────────────────────────────────────────────── (d)
console.log("\n(d) the source reader flags JavaScript logic and impure calls, with a fix-it");
for (const f of fromSource.findings) {
  console.log(`   ${f.file}:${f.line} ${f.entry} [${f.rule}] ${f.message}`);
  if (f.fix) console.log(`      fix-it${f.fixKind ? ` (${f.fixKind})` : ""}: ${f.fix}`);
}
const finding = (entry: string, rule: string) => fromSource.findings.find((f) => f.entry === entry && f.rule === rule);
const fixIs = (entry: string, rule: string, test: (fix: string, kind?: string, message?: string) => boolean) => {
  const f = finding(entry, rule);
  return f !== undefined && test(f.fix ?? "", f.fixKind, f.message);
};
check(fixIs("legacy-flags.setLike", "logic", (fx, k, m) => m!.startsWith("`?:`") && fx === "when(input.liked, true, false)" && k === "starting point"), "`?:` in a predicted value: when(input.liked, true, false), a starting point");
check(fixIs("legacy-tickets.status", "logic", (fx, _k, m) => m!.startsWith("`?:`") && fx.startsWith("when(input.status, ")), "`?:` in a condition: when(…), which types.ts shows the types then reject");
check(fixIs("legacy-tickets.both", "logic", (fx, k) => fx === 'and(eq(record.workspaceId, input.workspaceId), eq(record.status, "open"))' && k === "mechanical"), "`&&`: and(...), mechanical");
check(fixIs("legacy-tickets.either", "logic", (fx, k) => fx === 'or(eq(record.status, "open"), eq(record.assignee, input.assignee))' && k === "starting point"), "`||`: or(...), a starting point (input.assignee is optional, so rule A3 rejects it)");
check(fixIs("legacy-tickets.recent", "impure", (_f, _k, m) => m!.includes("Date.now()")), "Date.now() is impure");
check(fixIs("legacy-chat.react", "opaque-closure", (fx) => fx === "opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji))"), "an opaque function closing over input: the extras form");
const ported = (await fileText("domains/issues.ts")).match(/likes: \(i\) => (.*),\n/)?.[1] ?? "<not found>";
check(fixIs("legacy-issues.setLike", "logic", (fx) => fx === ported), `merge 4's setLike: the fix-it is exactly the ported line`);
check(factory?.message.includes("factory") === true, "a domain factory: unreadable-domain");

console.log(`\n${failed === 0 ? `ALL PASS (${passed} checks)` : `${failed} FAILED`}`);
if (failed) throw new Error(`${failed} checks failed`);
