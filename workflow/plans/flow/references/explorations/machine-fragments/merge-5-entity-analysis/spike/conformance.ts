// @ts-nocheck: the rows use untyped proxies (r, i, p are any), so the phantom flags are lost; types.ts checks the types.
// The conformance table (M5-D3): the client evaluator's own test, CEL-style. Each row is an operator, the
// values it sees and the result. Conditions are evaluated as the join evaluates them (`matches`): a record
// field the record does not carry, or a failure to evaluate, counts as matching. main.ts runs every row and
// prints the table that proposal.md section 3.2 reproduces.
import { add, and, between, coalesce, contains, eq, gt, gte, isNull, lt, lte, not, oneOf, opaque, or, overlaps, record, serverMatches, sub, when } from "./flow.ts";
import type { Env, IR } from "./flow.ts";

export type Expect = boolean | "matches: not carried" | "matches: failed" | { value: unknown } | { fails: true };
export type Row = { op: string; written: string; given: string; env: Env; expr: IR; kind: "condition" | "value"; expect: Expect };

const d = (iso: string) => new Date(iso);
const rows: Row[] = [];
const c = (op: string, written: string, given: string, env: Env, f: (x: any) => unknown, expect: Expect) =>
  rows.push({ op, written, given, env, expr: record(f), kind: "condition", expect });
const v = (op: string, written: string, given: string, env: Env, f: (x: any) => unknown, expect: Expect) =>
  rows.push({ op, written, given, env, expr: record(f), kind: "value", expect });

// eq
c("eq", 'eq(r.s, "a")', 's = "a"', { record: { s: "a" } }, ({ record: r }) => eq(r.s, "a"), true);
c("eq", 'eq(r.s, "a")', 's = "A"', { record: { s: "A" } }, ({ record: r }) => eq(r.s, "a"), false);
c("eq", "eq(r.n, null)", "n = null", { record: { n: null } }, ({ record: r }) => eq(r.n, null), true);
c("eq", "eq(r.n, i.x)", "n = null, x = null (present)", { record: { n: null }, input: { x: null } }, ({ record: r, input: i }) => eq(r.n, i.x), true);
c("eq", "eq(r.n, i.x)", 'n = "a", x = null (present)', { record: { n: "a" }, input: { x: null } }, ({ record: r, input: i }) => eq(r.n, i.x), false);
c("eq", "eq(r.n, i.x)", 'n = "a", x absent', { record: { n: "a" }, input: {} }, ({ record: r, input: i }) => eq(r.n, i.x), true);
c("eq", 'eq(r.s, "a")', "s not carried", { record: {} }, ({ record: r }) => eq(r.s, "a"), "matches: not carried");
c("eq", "eq(r.n, 1)", "n = NaN", { record: { n: Number.NaN } }, ({ record: r }) => eq(r.n, 1), "matches: failed");
c("eq", "eq(r.t, i.t)", "equal times, two Date objects", { record: { t: d("2026-01-01T00:00Z") }, input: { t: d("2026-01-01T00:00Z") } }, ({ record: r, input: i }) => eq(r.t, i.t), true);
c("eq", "eq(r.t, i.t)", "t = invalid Date", { record: { t: d("nope") }, input: { t: d("2026-01-01T00:00Z") } }, ({ record: r, input: i }) => eq(r.t, i.t), "matches: failed");
c("eq", "eq(r.t, 0)", "t = a Date, against a number", { record: { t: d("1970-01-01T00:00Z") } }, ({ record: r }) => eq(r.t, 0), false);
// oneOf, contains
c("oneOf", "oneOf(r.s, i.xs)", 's = "b", xs = ["a", "b"]', { record: { s: "b" }, input: { xs: ["a", "b"] } }, ({ record: r, input: i }) => oneOf(r.s, i.xs), true);
c("oneOf", "oneOf(r.s, i.xs)", 's = "b", xs = []', { record: { s: "b" }, input: { xs: [] } }, ({ record: r, input: i }) => oneOf(r.s, i.xs), false);
c("oneOf", "oneOf(r.s, i.xs)", "xs absent", { record: { s: "b" }, input: {} }, ({ record: r, input: i }) => oneOf(r.s, i.xs), true);
c("oneOf", "oneOf(r.t, [i.t])", "t equal by time", { record: { t: d("2026-01-01T00:00Z") }, input: { t: d("2026-01-01T00:00Z") } }, ({ record: r, input: i }) => oneOf(r.t, [i.t]), true);
c("contains", 'contains(r.tags, "x")', 'tags = ["x"]', { record: { tags: ["x"] } }, ({ record: r }) => contains(r.tags, "x"), true);
c("contains", 'contains(r.tags, "x")', "tags = []", { record: { tags: [] } }, ({ record: r }) => contains(r.tags, "x"), false);
c("contains", "contains(r.tags, i.tag)", "tag absent", { record: { tags: [] }, input: {} }, ({ record: r, input: i }) => contains(r.tags, i.tag), true);
c("contains", 'contains(r.tags, "x")', "tags = null", { record: { tags: null } }, ({ record: r }) => contains(r.tags, "x"), "matches: failed");
// ordering
c("lt", "lt(r.n, 5)", "n = 3", { record: { n: 3 } }, ({ record: r }) => lt(r.n, 5), true);
c("lt", "lt(r.n, 5)", "n = null", { record: { n: null } }, ({ record: r }) => lt(r.n, 5), false);
c("gte", "gte(r.n, 5)", "n = 5", { record: { n: 5 } }, ({ record: r }) => gte(r.n, 5), true);
c("gte", "gte(r.n, 5)", "n = null", { record: { n: null } }, ({ record: r }) => gte(r.n, 5), false);
c("lte", "lte(r.n, 5)", "n = 6", { record: { n: 6 } }, ({ record: r }) => lte(r.n, 5), false);
c("gt", "gt(r.n, 5)", "n = Infinity", { record: { n: Number.POSITIVE_INFINITY } }, ({ record: r }) => gt(r.n, 5), "matches: failed");
c("gt", "gt(r.n, 5)", "n = {} (bad data)", { record: { n: {} } }, ({ record: r }) => gt(r.n, 5), "matches: failed");
c("lt", "lt(r.n, i.x)", "x absent", { record: { n: 9 }, input: {} }, ({ record: r, input: i }) => lt(r.n, i.x), true);
c("lt", "lt(r.t, i.t)", "t earlier (Dates)", { record: { t: d("2026-01-01T00:00Z") }, input: { t: d("2026-02-01T00:00Z") } }, ({ record: r, input: i }) => lt(r.t, i.t), true);
c("lt", "lt(r.t, i.t)", "t = invalid Date", { record: { t: d("nope") }, input: { t: d("2026-02-01T00:00Z") } }, ({ record: r, input: i }) => lt(r.t, i.t), "matches: failed");
c("lt", "lt(r.t, 5)", "a Date against a number", { record: { t: d("2026-01-01T00:00Z") } }, ({ record: r }) => lt(r.t, 5), "matches: failed");
// between, overlaps (half-open; an absent bound is no bound, the other bound stays)
c("between", "between(r.n, 1, 3)", "n = 1", { record: { n: 1 } }, ({ record: r }) => between(r.n, 1, 3), true);
c("between", "between(r.n, 1, 3)", "n = 3", { record: { n: 3 } }, ({ record: r }) => between(r.n, 1, 3), false);
c("between", "between(r.n, i.from, i.to)", "from absent, to = 3, n = -100", { record: { n: -100 }, input: { to: 3 } }, ({ record: r, input: i }) => between(r.n, i.from, i.to), true);
c("between", "between(r.n, i.from, i.to)", "from absent, to = 3, n = 5", { record: { n: 5 }, input: { to: 3 } }, ({ record: r, input: i }) => between(r.n, i.from, i.to), false);
c("between", "between(r.n, i.from, i.to)", "both absent, n = null", { record: { n: null }, input: {} }, ({ record: r, input: i }) => between(r.n, i.from, i.to), true);
c("between", "between(r.n, 1, 3)", "n = null", { record: { n: null } }, ({ record: r }) => between(r.n, 1, 3), false);
c("between", "between(r.t, i.from, i.to)", "Dates, inside", { record: { t: d("2026-01-15T00:00Z") }, input: { from: d("2026-01-01T00:00Z"), to: d("2026-02-01T00:00Z") } }, ({ record: r, input: i }) => between(r.t, i.from, i.to), true);
c("overlaps", "overlaps(r.s, r.e, 2, 5)", "[1, 3)", { record: { s: 1, e: 3 } }, ({ record: r }) => overlaps(r.s, r.e, 2, 5), true);
c("overlaps", "overlaps(r.s, r.e, 2, 5)", "[1, 2)", { record: { s: 1, e: 2 } }, ({ record: r }) => overlaps(r.s, r.e, 2, 5), false);
c("overlaps", "overlaps(r.s, r.e, i.from, i.to)", "to absent, from = 2, [10, 11)", { record: { s: 10, e: 11 }, input: { from: 2 } }, ({ record: r, input: i }) => overlaps(r.s, r.e, i.from, i.to), true);
c("overlaps", "overlaps(r.s, r.e, i.from, i.to)", "to absent, from = 2, [0, 1)", { record: { s: 0, e: 1 }, input: { from: 2 } }, ({ record: r, input: i }) => overlaps(r.s, r.e, i.from, i.to), false);
c("overlaps", "overlaps(r.s, r.e, 2, 5)", "e = null", { record: { s: 1, e: null } }, ({ record: r }) => overlaps(r.s, r.e, 2, 5), false);
// isNull, not, or, when, coalesce
c("isNull", "isNull(r.a)", "a = null", { record: { a: null } }, ({ record: r }) => isNull(r.a), true);
c("isNull", "isNull(r.a)", 'a = "x"', { record: { a: "x" } }, ({ record: r }) => isNull(r.a), false);
c("isNull", "isNull(r.a)", "a not carried", { record: {} }, ({ record: r }) => isNull(r.a), "matches: not carried");
c("not", "not(isNull(r.a))", "a not carried", { record: {} }, ({ record: r }) => not(isNull(r.a)), "matches: not carried");
c("not", 'not(eq(r.s, "a"))', 's = "b"', { record: { s: "b" } }, ({ record: r }) => not(eq(r.s, "a")), true);
c("not", "not(lt(coalesce(r.n, 0), 5))", "n = null (coalesce guards it)", { record: { n: null } }, ({ record: r }) => not(lt(coalesce(r.n, 0), 5)), false);
c("or", "or(isNull(r.a), eq(r.a, i.me))", "a = null", { record: { a: null }, input: { me: "ana" } }, ({ record: r, input: i }) => or(isNull(r.a), eq(r.a, i.me)), true);
c("or", "or(isNull(r.a), eq(r.a, i.me))", 'a = "bo", me = "ana"', { record: { a: "bo" }, input: { me: "ana" } }, ({ record: r, input: i }) => or(isNull(r.a), eq(r.a, i.me)), false);
c("when", 'when(isNull(r.a), true, eq(r.a, "x"))', "a = null", { record: { a: null } }, ({ record: r }) => when(isNull(r.a), true, eq(r.a, "x")), true);
c("coalesce", 'eq(r.s, coalesce(i.s, "open"))', 's = "open", input s absent', { record: { s: "open" }, input: {} }, ({ record: r, input: i }) => eq(r.s, coalesce(i.s, "open")), true);
c("coalesce", 'eq(r.s, coalesce(i.s, "open"))', 's = "open", input s = null (present)', { record: { s: "open" }, input: { s: null } }, ({ record: r, input: i }) => eq(r.s, coalesce(i.s, "open")), true);
c("and", "and(eq(r.w, i.w), serverMatches(i.q, r.title))", "any title", { record: { w: "w1", title: "zzz" }, input: { w: "w1", q: "lobby" } }, ({ record: r, input: i }) => and(eq(r.w, i.w), serverMatches(i.q, r.title)), true);
// values (predicted values; evaluated over `prior`, the record beneath)
v("add", "add(p.n, 1)", "n = 2", { prior: { n: 2 } }, ({ prior: p }) => add(p.n, 1), { value: 3 });
v("add", "add(p.n, 1)", "n not held", { prior: {} }, ({ prior: p }) => add(p.n, 1), { fails: true });
v("add", "add(p.n, p.n)", "n = 1e308 (overflow)", { prior: { n: 1e308 } }, ({ prior: p }) => add(p.n, p.n), { fails: true });
v("sub", "sub(p.n, i.k)", "n = 10, k = 3", { prior: { n: 10 }, input: { k: 3 } }, ({ prior: p, input: i }) => sub(p.n, i.k), { value: 7 });
v("when", "when(i.b, 1, add(p.missing, 1))", "b = true (the other branch is not evaluated)", { prior: {}, input: { b: true } }, ({ prior: p, input: i }) => when(i.b, 1, add(p.missing, 1)), { value: 1 });
v("coalesce", "coalesce(p.n, 0)", "n = null", { prior: { n: null } }, ({ prior: p }) => coalesce(p.n, 0), { value: 0 });
v("opaque", "opaque([p.n], throws)", "the function throws", { prior: { n: 1 } }, ({ prior: p }) => opaque([p.n], () => { throw new Error("boom"); }), { fails: true });

export const conformance = rows;
