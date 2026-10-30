// @ts-nocheck: the rows use untyped proxies (r and i are any); types.ts checks the types.
// The conformance table (M5-D3): the condition evaluator's own test, CEL-style. Each row is an operator, the
// values it sees and the result: yes, no, or maybe with its cause (not carried, failed, server). main.ts runs
// every row and prints the table that proposal.md section 3.2 reproduces.
import { and, between, condition, contains, eq, gt, gte, isNull, lt, lte, not, oneOf, or, overlaps, serverMatches } from "./flow.ts";
import type { Env, IR } from "./flow.ts";

export type Row = { op: string; written: string; given: string; env: Env; expr: IR; expect: string };
const d = (iso: string) => new Date(iso);
const J1 = d("2026-01-01T00:00Z");
const rows: Row[] = [];
const c = (op: string, written: string, given: string, env: Env, f: (x: any) => unknown, expect: string) => rows.push({ op, written, given, env, expr: condition(f), expect });

// eq
c("eq", 'eq(r.s, "a")', 's = "a"', { record: { s: "a" } }, ({ record: r }) => eq(r.s, "a"), "yes");
c("eq", 'eq(r.s, "a")', 's = "A"', { record: { s: "A" } }, ({ record: r }) => eq(r.s, "a"), "no");
c("eq", "eq(r.n, null)", "n = null", { record: { n: null } }, ({ record: r }) => eq(r.n, null), "yes");
c("eq", "eq(r.n, i.x)", 'n = "a", x absent', { record: { n: "a" }, input: {} }, ({ record: r, input: i }) => eq(r.n, i.x), "yes");
c("eq", "eq(r.n, i.x)", "n = null, x = null (present)", { record: { n: null }, input: { x: null } }, ({ record: r, input: i }) => eq(r.n, i.x), "maybe: server");
c("eq", 'eq(r.s, "a")', "s not carried", { record: {} }, ({ record: r }) => eq(r.s, "a"), "maybe: not carried");
c("eq", "eq(r.n, 1)", "n = NaN", { record: { n: Number.NaN } }, ({ record: r }) => eq(r.n, 1), "maybe: failed");
c("eq", "eq(r.t, i.t)", "equal at the millisecond", { record: { t: J1 }, input: { t: d("2026-01-01T00:00Z") } }, ({ record: r, input: i }) => eq(r.t, i.t), "maybe: server");
c("eq", "eq(r.t, i.t)", "a day apart", { record: { t: J1 }, input: { t: d("2026-01-02T00:00Z") } }, ({ record: r, input: i }) => eq(r.t, i.t), "no");
c("eq", "eq(r.t, i.t)", "t = invalid Date", { record: { t: d("nope") }, input: { t: J1 } }, ({ record: r, input: i }) => eq(r.t, i.t), "maybe: failed");
// oneOf, contains
c("oneOf", "oneOf(r.s, i.xs)", 's = "b", xs = ["a", "b"]', { record: { s: "b" }, input: { xs: ["a", "b"] } }, ({ record: r, input: i }) => oneOf(r.s, i.xs), "yes");
c("oneOf", "oneOf(r.s, i.xs)", 's = "c", xs = ["a", "b"]', { record: { s: "c" }, input: { xs: ["a", "b"] } }, ({ record: r, input: i }) => oneOf(r.s, i.xs), "no");
c("oneOf", "oneOf(r.s, i.xs)", "xs = []", { record: { s: "b" }, input: { xs: [] } }, ({ record: r, input: i }) => oneOf(r.s, i.xs), "maybe: server");
c("oneOf", "oneOf(r.s, i.xs)", "xs absent", { record: { s: "b" }, input: {} }, ({ record: r, input: i }) => oneOf(r.s, i.xs), "yes");
c("contains", 'contains(r.tags, "x")', 'tags = ["x"]', { record: { tags: ["x"] } }, ({ record: r }) => contains(r.tags, "x"), "yes");
c("contains", 'contains(r.tags, "x")', "tags = []", { record: { tags: [] } }, ({ record: r }) => contains(r.tags, "x"), "no");
c("contains", 'contains(r.tags, "x")', "tags = null", { record: { tags: null } }, ({ record: r }) => contains(r.tags, "x"), "maybe: failed");
// ordering
c("lt", "lt(r.n, 5)", "n = 3", { record: { n: 3 } }, ({ record: r }) => lt(r.n, 5), "yes");
c("gte", "gte(r.n, 5)", "n = 5", { record: { n: 5 } }, ({ record: r }) => gte(r.n, 5), "yes");
c("lte", "lte(r.n, 5)", "n = 6", { record: { n: 6 } }, ({ record: r }) => lte(r.n, 5), "no");
c("lt", "lt(r.n, 5)", "n = null", { record: { n: null } }, ({ record: r }) => lt(r.n, 5), "maybe: server");
c("not", "not(lt(r.n, 5))", "n = null (the two-valued trap is gone)", { record: { n: null } }, ({ record: r }) => not(lt(r.n, 5)), "maybe: server");
c("gt", "gt(r.n, 5)", "n = Infinity", { record: { n: Number.POSITIVE_INFINITY } }, ({ record: r }) => gt(r.n, 5), "maybe: failed");
c("gt", "gt(r.n, 5)", "n = {} (bad data)", { record: { n: {} } }, ({ record: r }) => gt(r.n, 5), "maybe: failed");
c("lt", "lt(r.n, i.x)", "x absent", { record: { n: 9 }, input: {} }, ({ record: r, input: i }) => lt(r.n, i.x), "yes");
c("lt", "lt(r.t, i.t)", "a month earlier", { record: { t: J1 }, input: { t: d("2026-02-01T00:00Z") } }, ({ record: r, input: i }) => lt(r.t, i.t), "yes");
c("lt", "lt(r.t, i.t)", "equal at the millisecond", { record: { t: J1 }, input: { t: d("2026-01-01T00:00Z") } }, ({ record: r, input: i }) => lt(r.t, i.t), "maybe: server");
c("lt", "lt(r.t, 5)", "a Date against a number", { record: { t: J1 } }, ({ record: r }) => lt(r.t, 5), "maybe: failed");
// between, overlaps: each bound is its own term; an absent bound is no bound, the other stays
c("between", "between(r.n, 1, 3)", "n = 1", { record: { n: 1 } }, ({ record: r }) => between(r.n, 1, 3), "yes");
c("between", "between(r.n, 1, 3)", "n = 3", { record: { n: 3 } }, ({ record: r }) => between(r.n, 1, 3), "no");
c("between", "between(r.n, i.from, i.to)", "from absent, to = 3, n = -100", { record: { n: -100 }, input: { to: 3 } }, ({ record: r, input: i }) => between(r.n, i.from, i.to), "yes");
c("between", "between(r.n, i.from, i.to)", "from absent, to = 3, n = 5", { record: { n: 5 }, input: { to: 3 } }, ({ record: r, input: i }) => between(r.n, i.from, i.to), "no");
c("between", "between(r.n, 1, 3)", "n = null", { record: { n: null } }, ({ record: r }) => between(r.n, 1, 3), "maybe: server");
c("overlaps", "overlaps(r.s, r.e, 2, 5)", "[1, 3)", { record: { s: 1, e: 3 } }, ({ record: r }) => overlaps(r.s, r.e, 2, 5), "yes");
c("overlaps", "overlaps(r.s, r.e, 2, 5)", "[1, 2)", { record: { s: 1, e: 2 } }, ({ record: r }) => overlaps(r.s, r.e, 2, 5), "no");
c("overlaps", "overlaps(r.s, r.e, i.from, i.to)", "to absent, from = 2, [10, 11)", { record: { s: 10, e: 11 }, input: { from: 2 } }, ({ record: r, input: i }) => overlaps(r.s, r.e, i.from, i.to), "yes");
c("overlaps", "overlaps(r.s, r.e, i.from, i.to)", "to absent, from = 2, [0, 1)", { record: { s: 0, e: 1 }, input: { from: 2 } }, ({ record: r, input: i }) => overlaps(r.s, r.e, i.from, i.to), "no");
c("overlaps", "overlaps(r.s, r.e, 2, 5)", "s = 1, e = null", { record: { s: 1, e: null } }, ({ record: r }) => overlaps(r.s, r.e, 2, 5), "maybe: server");
c("overlaps", "overlaps(r.s, r.e, 2, 5)", "s = 6, e = null (the start term decides)", { record: { s: 6, e: null } }, ({ record: r }) => overlaps(r.s, r.e, 2, 5), "no");
c("overlaps", "overlaps(r.s, r.e, i.from, i.to)", "e = null, from absent, s = 1, to = 5", { record: { s: 1, e: null }, input: { to: 5 } }, ({ record: r, input: i }) => overlaps(r.s, r.e, i.from, i.to), "yes");
c("overlaps", "overlaps(r.s, r.e, 5, 2)", "from after to", { record: { s: 1, e: 9 } }, ({ record: r }) => overlaps(r.s, r.e, 5, 2), "maybe: server");
// isNull, not, or, and, serverMatches
c("isNull", "isNull(r.a)", "a = null", { record: { a: null } }, ({ record: r }) => isNull(r.a), "yes");
c("isNull", "isNull(r.a)", 'a = "x"', { record: { a: "x" } }, ({ record: r }) => isNull(r.a), "no");
c("isNull", "isNull(r.a)", "a not carried", { record: {} }, ({ record: r }) => isNull(r.a), "maybe: not carried");
c("not", "not(isNull(r.a))", "a not carried", { record: {} }, ({ record: r }) => not(isNull(r.a)), "maybe: not carried");
c("not", 'not(eq(r.s, "a"))', 's = "b"', { record: { s: "b" } }, ({ record: r }) => not(eq(r.s, "a")), "yes");
c("or", "or(isNull(r.a), eq(r.a, i.me))", "a = null", { record: { a: null }, input: { me: "ana" } }, ({ record: r, input: i }) => or(isNull(r.a), eq(r.a, i.me)), "yes");
c("or", "or(isNull(r.a), eq(r.a, i.me))", 'a = "bo", me = "ana"', { record: { a: "bo" }, input: { me: "ana" } }, ({ record: r, input: i }) => or(isNull(r.a), eq(r.a, i.me)), "no");
c("or", 'or(eq(r.team, i.t), eq(r.status, "open"))', 'team not carried, status = "open"', { record: { status: "open" }, input: { t: "red" } }, ({ record: r, input: i }) => or(eq(r.team, i.t), eq(r.status, "open")), "yes");
c("or", 'or(eq(r.team, i.t), eq(r.status, "open"))', 'team not carried, status = "closed"', { record: { status: "closed" }, input: { t: "red" } }, ({ record: r, input: i }) => or(eq(r.team, i.t), eq(r.status, "open")), "maybe: not carried");
c("or", "or(eq(r.s, i.s), isNull(r.a))", 's absent (outside `and`), a = "x"', { record: { s: "b", a: "x" }, input: {} }, ({ record: r, input: i }) => or(eq(r.s, i.s), isNull(r.a)), "maybe: server");
c("and", "and(eq(r.w, i.w), serverMatches(i.q, r.title))", "w equal", { record: { w: "w1", title: "zzz" }, input: { w: "w1", q: "lobby" } }, ({ record: r, input: i }) => and(eq(r.w, i.w), serverMatches(i.q, r.title)), "maybe: server");
c("and", "and(eq(r.w, i.w), serverMatches(i.q, r.title))", "w differs", { record: { w: "w2", title: "zzz" }, input: { w: "w1", q: "lobby" } }, ({ record: r, input: i }) => and(eq(r.w, i.w), serverMatches(i.q, r.title)), "no");
c("or", "or(eq(r.a, i.me), serverMatches(i.q, r.title))", "a = me", { record: { a: "ana", title: "x" }, input: { me: "ana", q: "q" } }, ({ record: r, input: i }) => or(eq(r.a, i.me), serverMatches(i.q, r.title)), "yes");
c("or", "or(eq(r.a, i.me), serverMatches(i.q, r.title))", "a = someone else", { record: { a: "bo", title: "x" }, input: { me: "ana", q: "q" } }, ({ record: r, input: i }) => or(eq(r.a, i.me), serverMatches(i.q, r.title)), "maybe: server");
c("not", "not(serverMatches(i.q, r.title))", "any record", { record: { title: "x" }, input: { q: "q" } }, ({ record: r, input: i }) => not(serverMatches(i.q, r.title)), "maybe: server");

export const conformance = rows;
