// Event alphabet shared by main.ts (one lane) and identity.ts (two lanes).
import {
  A, CONFIG, RULES, commitsIn, doAck, doAckRefused, doCaptureRefused, doDispose, doHydrate, doInvoke, doLand, doReload, doRuntimeDispose, doStart,
  endingTurn, holds, laneSt, prepRestore, runTurn, turnEnd,
} from "./model.ts";
import type { Ctx, EndKind, S, Spec } from "./model.ts";

export const mk = (label: string, guard: Spec["guard"], acts: Spec["acts"], outcome: Spec["outcome"] = "ok"): Spec => ({ label, guard, acts, outcome });
export const USER: Spec[] = [
  mk("commit", "none", ["commit"]), mk("commit/Denied", "none", ["commit"], "Denied"), mk("commit/Unhandled", "none", ["commit"], "Unhandled"),
  mk("commit/InvalidTurn", "none", ["commit"], "InvalidTurn"), mk("retry", "none", ["retry"]), mk("cancel", "none", ["cancel"]),
  mk("cancel;cancel", "none", ["cancel", "cancel"]), mk("commit;commit", "none", ["commit", "commit"]), mk("commit;cancel", "none", ["commit", "cancel"]),
  mk("cancel;commit", "none", ["cancel", "commit"]), mk("retry;cancel", "none", ["retry", "cancel"]), mk("idle?commit", "idle", ["commit"]),
  mk("retryable?retry", "retryable", ["retry"]),
];
export const USER_R = USER.filter((u) => ["commit", "commit/Denied", "retry", "cancel", "cancel;cancel", "commit;commit"].includes(u.label));
export const HS: Spec[] = [
  mk("h:none", "none", []), mk("h:retry", "none", ["retry"]), mk("h:cancel", "none", ["cancel"]), mk("h:cancel;cancel", "none", ["cancel", "cancel"]),
  mk("h:commit", "none", ["commit"]), mk("h:Denied(retry)", "none", ["retry"], "Denied"), mk("h:Unhandled(cancel)", "none", ["cancel"], "Unhandled"),
  mk("h:InvalidTurn(commit)", "none", ["commit"], "InvalidTurn"), mk("h:retryable?retry", "retryable", ["retry"]), mk("h:idle?commit", "idle", ["commit"]),
];
export const HS_R = HS.filter((h) => ["h:none", "h:retry", "h:cancel"].includes(h.label));

export interface Ev { label: string; run: (s: S, c: Ctx) => void }
export const restoreTurns = (x: S, c: Ctx, ids: number[], h: Spec) => {
  if (ids.length === 0) turnEnd(x);
  for (const id of ids) runTurn(x, c, h, () => { prepRestore(x, id); return id; });
};
export function events(s: S, reduced: boolean): Ev[] {
  const out: Ev[] = [];
  const left = CONFIG.maxCommits - s.commits;
  const hs = (reduced ? HS_R : HS).filter((h) => commitsIn(h.acts) <= left);
  const users = (reduced ? USER_R : USER).filter((u) => commitsIn(u.acts) <= left && (s.mode !== "allow" || (!u.acts.includes("retry") && !u.acts.includes("cancel") && u.guard !== "retryable")));
  const withH = (label: string, f: (x: S, c: Ctx, h: Spec) => void) => { for (const h of hs) out.push({ label: `${label}/${h.label}`, run: (x, c) => f(x, c, h) }); };
  if (!s.disposed) {
    if (s.bound) for (const u of users) out.push({ label: u.label, run: (x, c) => runTurn(x, c, u) });
    for (const a of s.atts.filter((q) => q.lane === s.laneId)) {
      const id = a.id;
      if (a.status === "waiting" && !a.acked && !a.everSent) {
        out.push({ label: `ack(${id})`, run: (x) => doAck(x, id) });
        out.push({ label: `ack-refused(${id})`, run: (x, c) => doAckRefused(x, c, id) });
      }
      if (a.status === "waiting" && !a.acked && a.everSent) { // only when a re-send needs its own acknowledgement (revision 9)
        out.push({ label: `ack(${id})`, run: (x) => doAck(x, id) });
      }
      if (a.status === "waiting" && a.everSent) { // a re-send whose lane-record capture fails before invocation
        const delivers = s.bound && RULES.refusedResendDelivers;
        if (delivers) withH(`capture-refused(${id})`, (x, c, h) => { const d = doCaptureRefused(x, c, id); if (d) runTurn(x, c, h, () => d); else turnEnd(x); });
        else out.push({ label: `capture-refused(${id})`, run: (x, c) => { doCaptureRefused(x, c, id); turnEnd(x); } });
      }
      if (a.status === "waiting" && a.acked && !a.noInvoke) out.push({ label: `invoke(${id})`, run: (x, c) => doInvoke(x, c, id) });
      if (a.status === "wire") {
        const kinds: EndKind[] = [];
        if (s.applied.includes(id)) kinds.push("success");
        if (s.refused.includes(id)) kinds.push("failure");
        kinds.push("unknown", "interrupt");
        for (const k of kinds) {
          const withHandler = s.bound && (s.mode === "allow" ? s.out.includes(id) : s.head === id);
          for (const h of withHandler ? hs : [HS[0]!])
            out.push({ label: `end-${k}(${id})${withHandler ? "/" + h.label : " [evidence]"}`, run: (x, c) => endingTurn(x, c, id, k, h) });
        }
      }
    }
  }
  for (const id of [...new Set(s.net)]) {
    out.push({ label: `land(${id})`, run: (x) => doLand(x, id, false) });
    if (!s.applied.includes(id) && !s.refused.includes(id)) out.push({ label: `land-refuse(${id})`, run: (x) => doLand(x, id, true) });
  }
  if (!s.disposed) {
    if (s.bound) out.push({ label: "dispose", run: (x, c) => doDispose(x, c) });
    if (!s.bound) {
      if (holds(s.mode) && laneSt(s) === "Held") withH("start/Restored", (x, c, h) => { const id = doStart(x, c); runTurn(x, c, h, () => id); });
      else out.push({ label: "start", run: (x, c) => { doStart(x, c); } });
    }
    out.push({ label: "runtime-dispose", run: (x, c) => doRuntimeDispose(x, c) });
    if (s.atts.length === 0) out.push({ label: "hydrate", run: (x, c) => doHydrate(x, c) });
  }
  if (s.bound && laneSt(s) !== "Idle" && !s.disposed) withH("reload", (x, c, h) => restoreTurns(x, c, doReload(x, c), h));
  else out.push({ label: "reload", run: (x, c) => { restoreTurns(x, c, doReload(x, c), HS[0]!); } });
  return out;
}

