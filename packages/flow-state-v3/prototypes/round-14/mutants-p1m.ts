// Phase 1 record migration's wrong runtimes (and OD53's `dropAt` fix, folded in): each undoes one decision, and the named case must go red by assertion.
type M = { readonly id: string; readonly kills: readonly string[]; readonly edits: ReadonlyArray<readonly [string, string, string]> };
const m = (id: string, kills: readonly string[], file: string, find: string, replace: string): M => ({ id, kills, edits: [[file, find, replace]] });
const S = "sessions.ts";
export const MUTANTS: readonly M[] = [
  // OD53 (11): `lose` sets `dropAt` only on leaving `Live` or `Repairing`, or when none is set. Wrong: every time, as before.
  m("od53.lose-always-stamps", ["P1-S/a-connection-that-never-registered-keeps-the-earlier-dropat"], S, "    ...(x.liveSince !== undefined || x.dropAt === undefined ? { dropAt: cx.now } : {}),", "    dropAt: cx.now,"),
  // OD53 (11), T1's `down` row in `Connecting`: "`dropAt = now` if none". Wrong: only on leaving.
  m("od53.down-first-unset", ["P1-S/a-down-on-a-first-connection-sets-dropat"], S, "...(leaving || x.dropAt === undefined ? { dropAt: cx.now } : {}),", "...(leaving ? { dropAt: cx.now } : {}),"),
];
