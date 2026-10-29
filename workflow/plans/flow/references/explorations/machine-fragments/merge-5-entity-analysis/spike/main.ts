// The spike's entry: (a) operators type and record, (b) source reading agrees with recording, (c) recorded
// predicted values start and replay, (d) the source reader flags JavaScript logic with a fix-it.
// Types are checked separately by `tsc -p .` (types.ts). Run: tsc -p . && bun main.ts
import { describe, holds, RecordingError, start, value, visible } from "./flow.ts";
import type { ChangeIR, Domain, EntryDescription, IR, Live } from "./flow.ts";
import { TicketsDomain } from "./domains/tickets.ts";
import { Issues } from "./domains/issues.ts";
import { Extras } from "./domains/extras.ts";
import { legacyChat, legacyIssues, legacyTickets } from "./domains/legacy.ts";
import type { AccountRow, IssueRow, MessageRow, TicketRow } from "./domains/ops.ts";
import { readSources } from "./source.ts";

let failed = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) failed++;
  console.log(`   ${ok ? "PASS" : "FAIL"} ${what}`);
};
const render = (ir: IR | null | undefined): string => {
  if (!ir) return "—";
  if ("ref" in ir) return ir.ref.join(".");
  if ("val" in ir) return JSON.stringify(ir.val);
  if ("arr" in ir) return `[${ir.arr.map(render).join(", ")}]`;
  if ("obj" in ir) return `{ ${Object.entries(ir.obj).map(([k, v]) => `${k}: ${render(v)}`).join(", ")} }`;
  if ("opaque" in ir) return `opaque(${ir.opaque.map(render).join(", ")})`;
  return `${ir.op}(${ir.args.map(render).join(", ")})`;
};
const canon = (x: unknown): string =>
  Array.isArray(x) ? `[${x.map(canon).join(",")}]`
  : x !== null && typeof x === "object" ? `{${Object.keys(x).sort().filter((k) => (x as any)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((x as any)[k])}`).join(",")}}`
  : JSON.stringify(x);
const dir = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const fileText = async (f: string) => (await fetch(new URL(f, import.meta.url))).text();

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
const lazy = value({ op: "when", args: [{ val: true }, { val: 1 }, { op: "add", args: [{ ref: ["prior", "absent"] }, { val: 1 }] }] }, { prior: {} });
check(lazy === 1, "`when` is lazy: the branch not taken is never evaluated (it would fail here)");

const tickets = describe(TicketsDomain as Domain);
const rows: TicketRow[] = [
  { workspaceId: "w1", ticketId: "t1", title: "Lobby", status: "open", assignee: null, updatedAt: 10, revision: 1 },
  { workspaceId: "w1", ticketId: "t2", title: "Roof", status: "assigned", assignee: "ana", updatedAt: 20, revision: 1 },
  { workspaceId: "w2", ticketId: "t3", title: "Door", status: "open", assignee: "bo", updatedAt: 30, revision: 1 },
];
const members = (where: IR, input: unknown) => rows.filter((r) => holds(where, { input, record: r })).map((r) => r.ticketId).join(",");
const listWhere = tickets.list!.where!;
console.log(`   tickets.list where ${render(listWhere)}`);
check(members(listWhere, { workspaceId: "w1" }) === "t1,t2", "absent status, assignee and search drop their constraints (and serverMatches may hold for any record)");
check(members(listWhere, { workspaceId: "w1", status: "open" }) === "t1", "status open keeps the open ticket");
check(members(listWhere, { workspaceId: "w1", assignee: "ana" }) === "t2", "assignee ana: a null assignee is not equal to ana");
const openWhere = tickets.openCount!.where!;
check(members(openWhere, { workspaceId: "w1" }) === "t1", "openCount: workspace and the constant \"open\"");
const extras = describe(Extras as Domain);
const queueWhere = extras.myQueue!.where!;
console.log(`   extras.myQueue where ${render(queueWhere)}`);
check(members(queueWhere, { workspaceId: "w1", me: "ana", before: 25 }) === "t1,t2", "or(isNull, eq) keeps unassigned and mine; lt on a number");
check(members(queueWhere, { workspaceId: "w1", me: "ana", before: 15 }) === "t1", "lt(updatedAt, 15) drops the ticket updated at 20");
check(value({ op: "gt", args: [{ val: null }, { val: 1 }] }, {}) === false && value({ op: "not", args: [{ op: "gt", args: [{ val: null }, { val: 1 }] }] }, {}) === true, "two-valued: gt(null, 1) is false and not(gt(null, 1)) is true (TanStack DB's SQL logic gives UNKNOWN for both)");

console.log("   recording without the source reader (the gap this proposal closes):");
const lt = describe(legacyTickets() as Domain);
console.log(`     either  ${render(lt.either!.where)}   (source: eq(status, "open") || eq(assignee, input.assignee))`);
check(render(lt.either!.where) === 'eq(record.status, "open")', "`||` silently records its first operand");
console.log(`     status  ${render(lt.status!.where)}   (source: input.status ? … : eq(status, "open"))`);
check(render(lt.status!.where) === "eq(record.status, input.status)", "`?:` silently records one branch");
console.log(`     both    ${render(lt.both!.where)}   (source: eq(workspaceId, …) && eq(status, "open"))`);
check(render(lt.both!.where) === 'eq(record.status, "open")', "`&&` silently records its second operand");
const recent = render(lt.recent!.where);
console.log(`     recent  ${recent.replace(/\d{10,}/, "<construction time>")}`);
check(/eq\(record\.updatedAt, \d{10,}\)/.test(recent), "Date.now() is recorded as a constant");
let thrown = "";
try {
  legacyIssues();
} catch (e) {
  thrown = e instanceof RecordingError ? e.message : String(e);
}
console.log(`     legacy setLike: ${thrown}`);
check(thrown.includes("prior.likes was converted to a primitive"), "JavaScript arithmetic on a recorded value fails at construction, naming the value");

// ───────────────────────────────────────────────────────────── (b)
console.log("\n(b) the same declarations read from source give the same description as recording");
const files = ["domains/ops.ts", "domains/tickets.ts", "domains/issues.ts", "domains/extras.ts", "domains/legacy.ts"];
const t0 = performance.now();
const fromSource = await readSources(dir, files);
console.log(`   read ${files.length} files through typescript/unstable/async in ${Math.round(performance.now() - t0)} ms`);
const recorded: Record<string, Record<string, EntryDescription>> = { tickets, issues, extras };
for (const [id, entries] of Object.entries(recorded)) {
  const src = fromSource.domains[id] ?? {};
  const names = [...new Set([...Object.keys(entries), ...Object.keys(src)])];
  const differ = names.filter((n) => canon(entries[n]) !== canon(src[n]));
  check(differ.length === 0 && names.length === Object.keys(entries).length, `${id}: ${names.length} entries, source and recording identical${differ.length ? ` (differ: ${differ.join(", ")})` : ""}`);
  for (const n of differ) console.log(`     ${n}\n       recorded ${canon(entries[n])}\n       source   ${canon(src[n])}`);
}
const refFindings = fromSource.findings.filter((f) => !f.file.endsWith("legacy.ts"));
check(refFindings.length === 0, `no findings on the reference domains (${refFindings.length})`);
const legacySrc = fromSource.domains["legacy-tickets"]!;
const disagree = Object.keys(lt).filter((n) => canon(lt[n]) !== canon(legacySrc[n]));
check(disagree.join(",") === "either,status,both,recent", `on legacy declarations the two disagree wherever recording was silently wrong: ${disagree.join(", ")}`);
console.log(`   e.g. tickets.list as read: where ${render(fromSource.domains.tickets!.list!.where)}`);

// ───────────────────────────────────────────────────────────── (c)
console.log("\n(c) recorded predicted values: evaluated at write start, replayed over a changed base");
const setLikeChange = issues.setLike!.predicts![0]! as ChangeIR;
const a1 = start(setLikeChange, { key: { id: "i1" }, liked: true }, "a1");
check(canon(a1.key) === canon({ id: "i1" }), `at start the key evaluates to ${canon(a1.key)} (the lane key of merge 4 rule 34)`);
const a2 = start(setLikeChange, { key: { id: "i1" }, liked: false }, "a2");
const base0: IssueRow = { id: "i1", projectId: "p", number: 1, title: "x", liked: false, likes: 5 };
const show = (r: IssueRow) => `liked ${r.liked}, likes ${r.likes}`;
const step = (label: string, base: IssueRow, lives: Live[], want: string) => {
  const v = visible(base, lives);
  check(show(v) === want, `${label}: ${show(v)}`);
};
step("base liked false, likes 5; A like starts", base0, [a1], "liked true, likes 6");
step("B unlike starts behind A", base0, [a1, a2], "liked false, likes 5");
const base1 = { ...base0, liked: true, likes: 9 }; // another device liked; the push lands
step("base changes to liked true, likes 9 (a push); A and B replay", base1, [a1, a2], "liked false, likes 8");
step("A fails and is retracted; B replays alone", base1, [a2], "liked false, likes 8");
step("B fails too: the base shows", base1, [], "liked true, likes 9");

// The recorded expression against the JavaScript function it replaces, over every base and sequence.
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
      const lives = seq.map((l, i) => start(setLikeChange, { key: { id: "i1" }, liked: l }, `x${i}`));
      cases++;
      if (canon(visible(base, lives)) === canon(replayOld(base, seq))) same++;
    }
check(same === cases, `the operator form equals the JavaScript function it replaces in ${same}/${cases} base × sequence cases`);

const assignChange = tickets.assign!.predicts![0]! as ChangeIR;
const t1 = start(assignChange, { workspaceId: "w1", ticketId: "t1", assignee: "ana" }, "t1");
check(canon(t1.key) === canon({ workspaceId: "w1", ticketId: "t1" }) && canon(visible(rows[0]!, [t1])) === canon({ ...rows[0]!, assignee: "ana", status: "assigned" }), "tickets.assign: key {w1, t1}, predicts assignee ana and status assigned");

const [from, to] = extras.transfer!.predicts! as ChangeIR[];
const xin = { from: { accountId: "A" }, to: { accountId: "B" }, amount: 30 };
const tf = start(from!, xin, "x");
const tt = start(to!, xin, "x");
const acct = (id: string, balance: number): AccountRow => ({ accountId: id, balance, revision: 1 });
check(visible(acct("A", 100), [tf]).balance === 70 && visible(acct("B", 5), [tt]).balance === 35, "transfer: two records, A 100 → 70, B 5 → 35");
check(visible(acct("A", 40), [tf]).balance === 10, "a push sets A to 40: the replay shows 10, not 70");
const reactChange = extras.react!.predicts![0]! as ChangeIR;
const r1 = start(reactChange, { key: { messageId: "m" }, emoji: "+1" }, "r1");
const r2 = start(reactChange, { key: { messageId: "m" }, emoji: "+1" }, "r2");
const msg = (count: number): MessageRow => ({ messageId: "m", body: "", reactions: count ? [{ emoji: "+1", count }] : [] });
console.log(`   react predicts reactions = ${render(reactChange.fields!.reactions)}`);
check(canon(visible(msg(0), [r1, r2]).reactions) === canon([{ emoji: "+1", count: 2 }]), "opaque list edit: two reactions over none give count 2");
check(canon(visible(msg(4), [r1, r2]).reactions) === canon([{ emoji: "+1", count: 6 }]), "the base moves to 4: the opaque function replays over it, count 6");

// ───────────────────────────────────────────────────────────── (d)
console.log("\n(d) the source reader flags JavaScript logic and impure calls, with a fix-it");
for (const f of fromSource.findings) {
  console.log(`   ${f.file}:${f.line} ${f.entry} [${f.rule}] ${f.message}`);
  if (f.fix) console.log(`      fix-it: ${f.fix}`);
}
const has = (rule: string, entry: string, text?: string) =>
  fromSource.findings.some((f) => f.rule === rule && f.entry === entry && (!text || `${f.message} ${f.fix ?? ""}`.includes(text)));
check(has("logic", "legacy-issues.setLike", "when("), "`?:` in a predicted value is flagged");
check(has("logic", "legacy-tickets.status", "when("), "`?:` in a condition is flagged");
check(has("logic", "legacy-tickets.both", "and("), "`&&` is flagged with and(...)");
check(has("logic", "legacy-tickets.either", "or("), "`||` is flagged with or(...)");
check(has("impure", "legacy-tickets.recent", "Date.now()"), "Date.now() is flagged as impure");
check(has("opaque-closure", "legacy-chat.react", "input.emoji"), "an opaque function closing over input is flagged");
const fixLikes = fromSource.findings.find((f) => f.entry === "legacy-issues.setLike")?.fix ?? "";
const ported = (await fileText("domains/issues.ts")).match(/likes: \(i\) => (.*),\n/)?.[1] ?? "<not found>";
check(fixLikes === ported, `the fix-it for merge 4's setLike is exactly the ported line: ${fixLikes}`);
const fixReact = fromSource.findings.find((f) => f.rule === "opaque-closure")?.fix ?? "";
check(fixReact === "opaque([m.reactions, input.emoji], (rs, emoji) => addReaction(rs, emoji))", "the opaque fix-it is extras.ts's form");

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
if (failed) throw new Error(`${failed} checks failed`);
