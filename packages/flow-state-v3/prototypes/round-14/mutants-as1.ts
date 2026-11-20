// Audit S1's gap batch (phase 1 streams round 2): each of the auditor's 16 survivors (`mutants-audit-s1.ts`, unedited) aimed at the case written for
// it from the design text, and the round's own wrong runtimes, each undoing one fix (failing first) or one promise of `Feed.multiplex`. Standing.
import { MUTANTS as AUDIT_S1 } from "./mutants-audit-s1.ts";

type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const P = "P1-S/";
const S = "sessions.ts";
const H = "../conformance/fixtures/multiplex.ts";
const AIM: Readonly<Record<string, readonly string[]>> = {
  "s1.wait-per-op": [`${P}a-new-key-does-not-wait-for-another-keys-close`],
  "s1.wait-ignores-actor": [`${P}equal-keys-in-two-actors-do-not-wait-on-each-other`],
  "s1.leave-forgets-last": [`${P}re-watching-a-symbol-restores-its-last`],
  "s1.ping-dropped-arms": [`${P}pings-while-dropped-do-not-arm-the-deadline`],
  "s1.silent-resets-flaps": [`${P}a-silent-end-neither-adds-nor-resets-flaps`],
  "s1.value-resets-flaps": [`${P}values-do-not-reset-flaps`],
  "s1.unregistered-flaps": [`${P}connections-that-never-register-never-flap`],
  "s1.leave-live-no-stamp": [`${P}a-quiet-symbol-stays-live-on-the-sockets-pings-and-a-half-open-socket-is-silent`],
  "s1.dropped-value-own": [`${P}a-value-while-dropped-is-aged-from-the-drop-and-a-proof-does-not-confirm-it`],
  "s1.reconnect-forgets-heard": [`${P}an-equal-price-after-a-reconnect-is-undimmed-and-not-heard`],
  "s1.no-fence-in-mail": [`${P}a-tick-in-mail-before-a-drop-is-fenced`],
  "s1.bookmark-max": [`${P}the-bookmark-moves-backward`],
  "s1.merge-upgrades": [`${P}a-merged-group-keeps-the-weaker-registration`],
  "s1.merge-hides-down": [`${P}a-merged-group-keeps-a-drop-after-a-registration`],
  "s1.callback-bound-4096": [`${P}a-pushed-source-holds-1024-by-default`],
  "lie:s1.row-says-live": [`${P}a-dropped-session-reads-connecting`],
};
// The value-while-Dropped line now ages from the drop; the auditor's wrong runtime (own: true) re-anchored on it, the edit otherwise the same.
const ANCHOR: Readonly<Record<string, ReadonlyArray<readonly [string, string, string]>>> = {
  "s1.dropped-value-own": [[S, "last: { v: f, at: live ? cx.now : (y0.dropAt ?? cx.now), own: live },", "last: { v: f, at: live ? cx.now : (y0.dropAt ?? cx.now), own: true },"]],
};
const aimed = (list: readonly M[]) =>
  list.filter((m) => Object.hasOwn(AIM, m.id)).map((m) => ({ ...m, kills: AIM[m.id]!, edits: ANCHOR[m.id] ?? m.edits }));
const m = (id: string, kills: string, edits: ReadonlyArray<readonly [string, string, string]>): M => ({ id, kills: [`${P}${kills}`], edits });
export const MUTANTS: readonly M[] = [
  ...aimed(AUDIT_S1 as readonly M[]),
  // Runtime bugs, each failing first: the fix undone.
  m("as1.down-keeps-the-age", "a-down-stamps-last-at", [[S, "        ...(leaving && x.last && x.confirmed ? { last: { ...x.last, at: cx.now } } : {}), // T5: leaving `Live`\n", ""]]),
  m("as1.dropped-value-aged-now", "a-value-while-dropped-is-aged-from-the-drop-and-a-proof-does-not-confirm-it", [[S, "at: live ? cx.now : (y0.dropAt ?? cx.now),", "at: cx.now,"]]),
  m("as1.no-bookmark-bound", "at-most-256-bookmarks-per-operation-oldest-out", [[S, "for (const k of same.slice(0, Math.max(0, same.length - (BOUND - 1)))) delete rest[k];", "void same;"]]),
  m("as1.slot-per-contract", "two-operations-on-one-contract-and-key-keep-their-own-bookmarks", [[S, "      const made = fresh(a, p, input, key);", "      const made = { ...fresh(a, p, input, key), slot: `${spec.id}|${text(key)}` };"]]),
  m("as1.old-default-backoff", "with-no-backoff-the-default-schedule-runs", [[S, "  Math.min(30_000, Math.round(500 * 2 ** n * (0.8 + 0.4 * unit(`${id}#${n}`))));", "  Math.min(30_000, 1000 * 2 ** n + 0 * unit(id));"]]),
  m("as1.default-not-jittered", "with-no-backoff-the-default-schedule-runs", [[S, "(0.8 + 0.4 * unit(`${id}#${n}`))", "(1 + 0 * unit(id))"]]),
  m("as1.no-fills-other-key", "a-key-change-that-keeps-the-old-keys-items-is-flagged", [[S, '  if (!b && !E && otherFilled(cx, x)) cx.note("FillsOtherKey", { op: x.op }); // Q2 A: the field holds another key\'s items\n', ""]]),
  m("as1.fills-other-key-always", "a-key-change-that-empties-the-field-is-a-first-open", [[S, "if (!b && !E && otherFilled(cx, x))", "if (!b && otherFilled(cx, x))"]]),
  m("as1.select-undefined-silent", "a-select-returning-undefined-releases-with-an-issue", [[S, 'cx.issue("SelectedNoKey", { op: p.activity.op });', "void 0;"]]),
  m("as1.select-undefined-keeps", "a-select-returning-undefined-releases-with-an-issue", [[S, "        continue;\n      }\n      for (const input of list) {", "        for (const x of ofPlacement(s, a.key, p)) wanted.push({ p, input: x.input, key: x.key, id: x.id });\n        continue;\n      }\n      for (const input of list) {"]]),
  // `Feed.multiplex` (Q1 B): each promise undone in the helper.
  m("as1.hub-add-per-session", "a-key-shared-by-two-actors-is-subscribed-once-and-removed-with-the-last", [[H, "            r.added = true;\n            yield* ops.add(r.key);", "            r.added = true;\n            for (const _m of r.members) yield* ops.add(r.key);"]]),
  m("as1.hub-remove-per-session", "a-key-shared-by-two-actors-is-subscribed-once-and-removed-with-the-last", [[H, "if (route.members.size === 0 && conn.routes.get(k) === route) {", "if (conn.routes.get(k) === route) {"]]),
  m("as1.hub-never-closes", "the-socket-closes-with-the-last-key-and-reopens-for-the-next", [[H, "            yield* Scope.close(conn.scope, Exit.void);", "            void Exit;"]]),
  m("as1.hub-one-socket-per-key", "a-socket-drop-reaches-every-symbol-and-each-reconnects", [
    [H, "const fresh = current === undefined;", "const fresh = current === undefined || current.routes.size > 0;"],
    [H, "const conn: Conn<K> = current ?? {", "const conn: Conn<K> = (fresh ? undefined : current) ?? {"],
  ]),
  m("as1.hub-key-fail-drops-all", "a-symbols-own-failure-ends-only-that-key-and-names-it", [[H, "          if (key !== undefined) {", "          if (key !== undefined && false) {"]]),
  m("as1.hub-refused-key-removed", "a-symbols-own-failure-ends-only-that-key-and-names-it", [[H, "            c.routes.delete(name(key));\n            r.added = false;", "            void r.added;"]]),
];
