// Audit S1b's batch (phase 1 streams, the last batch): each of the narrow re-audit's survivors (`mutants-audit-s1b.ts`, unedited) aimed at the
// case written for it from the design text, its three suite kills kept standing, audit S1's `s1.silent-unpinged-ends` now red by assertion, and
// the batch's own runtime fix undone. Standing.
import { MUTANTS as AUDIT_S1 } from "./mutants-audit-s1.ts";
import { MUTANTS as AUDIT_S1B } from "./mutants-audit-s1b.ts";

type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const P = "P1-S/";
const S = "sessions.ts";
const AIM: Readonly<Record<string, readonly string[]>> = {
  "s1b.bound-128": [`${P}the-256th-bookmark-keeps-the-oldest-and-the-257th-evicts-it`],
  "s1b.backoff-factor-4": [`${P}the-default-delay-doubles-each-try`],
  "s1b.jitter-per-session": [`${P}each-default-delay-draws-its-own-jitter`],
  "s1b.down-stamps-unconfirmed": [`${P}a-down-keeps-an-unconfirmed-last-at`],
  "s1b.lose-stamps-unconfirmed": [`${P}a-lose-keeps-an-unconfirmed-last-at`],
  "s1b.dropat-first-only": [`${P}a-second-drop-sets-dropat-again`],
  "s1b.hub-readd-on-join": [`${P}joining-an-open-socket-adds-only-a-keys-first-session`],
  "s1b.fills-other-key-on-return": [`${P}returning-to-a-key-with-its-own-bookmark-is-not-flagged`],
  "s1b.hub-adds-departed-key": [`${P}a-key-unwatched-while-the-socket-connects-is-never-added`, `${P}a-socket-drop-reaches-every-symbol-and-each-reconnects`],
  "lie:s1b.fail-skips-finalizer": [`${P}eventsource-a-server-end-reaches-the-recipe-and-the-browser-never-retries`],
  "lie:s1b.hub-add-unsent": [`${P}a-symbols-own-failure-ends-only-that-key-and-names-it`, `${P}re-watching-a-symbol-restores-its-last`],
  "s1.silent-unpinged-ends": [`${P}a-silent-end-with-no-ping-in-the-connection-is-flagged`],
  "s1.from-is-first-claim": [`${P}a-reconnect-claims-the-bookmark-at-that-connect`],
};
const aimed = (list: readonly M[]) => list.filter((m) => Object.hasOwn(AIM, m.id)).map((m) => ({ ...m, kills: AIM[m.id]! }));
export const MUTANTS: readonly M[] = [
  ...aimed(AUDIT_S1B as readonly M[]),
  ...aimed(AUDIT_S1 as readonly M[]),
  // 2.11.10 "jittered": the jitter's hash had no final mix, so one session's successive factors differed by under 0.01 (0.848, 0.847, ...).
  {
    id: "as1b.jitter-unmixed",
    kills: [`${P}each-default-delay-draws-its-own-jitter`],
    edits: [[S, "  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);\n  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);\n  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;", "  return (h >>> 0) / 4294967296;"]],
  },
  // `Feed.multiplex`: a session joining a key the server already registered never sends `add`, so hears no reply; without the replayed
  // registration it stays `Connecting` until `idle` ends it `Silent`, every 25 s.
  {
    id: "as1b.hub-late-member-unregistered",
    kills: [`${P}joining-an-open-socket-adds-only-a-keys-first-session`],
    edits: [["../conformance/fixtures/multiplex.ts", "const member: Member = { early: route.live ? [{ _feed: \"live\" }] : [] };", "const member: Member = { early: [] };"]],
  },
];
