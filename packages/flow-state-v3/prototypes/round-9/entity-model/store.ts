// Throwaway executable model of the proposed judge. One record, one store. No runtime.
export const ABSENT = Symbol("absent");
export type V = number | undefined;
export type Cell = { value: unknown; at: V; exact: boolean; since: number; landed: number; claim: boolean };
export type Doubt = { f: string; to: number | null; attempt?: string; resolved?: boolean; asked?: boolean };
export type E = {
  carries: Record<string, unknown>;
  at: V;
  from: number;
  rest: "none" | "unchanged" | "unknown";
  claim?: boolean;
};
export type Overlay = { attempt: string; fields: Record<string, unknown>; ended?: boolean };
export type Flags = {
  noFieldScope?: boolean; // mutant: a partial clears every doubt
  recordVersionMoves?: boolean; // mutant: old `Rec.version`
  noUnknown?: boolean; // mutant: unknown takes
  noBehind?: boolean; // mutant: projection says nothing about the rest
  noFloor?: boolean; // mutant: a claim has no floor
  readClearsOpen?: boolean; // mutant: a read clears a lost write's doubt
  volatileDoubts?: boolean; // mutant: doubts die at reload
  noGap?: boolean; // mutant: a gap or a restore marks nothing
  sameKeepsLanded?: boolean; // mutant: an equal answer does not refresh `landed`
};
export class Store {
  pos = 1;
  cells: Record<string, Cell> = {};
  seen: V = undefined;
  doubts: Doubt[] = [];
  overlays: Overlay[] = [];
  staleBefore = 0;
  log: string[] = [];
  constructor(readonly FIELDS: string[], readonly flags: Flags = {}) {}
  tick() {
    return ++this.pos;
  }
  order(e: E, f: string, c: Cell | undefined): "after" | "same" | "before" | "unknown" {
    if (!c) return "after";
    if (e.at !== undefined && c.at !== undefined) {
      if (c.exact) return e.at > c.at ? "after" : e.at === c.at ? "same" : "before";
      if (!this.flags.noFloor && e.at <= c.at) return "before";
    }
    if (e.from >= c.landed) return "after";
    return "unknown";
  }
  judge(e: E) {
    const now = this.tick();
    if (this.flags.recordVersionMoves && e.at !== undefined) this.seen = e.at;
    for (const [f, v] of Object.entries(e.carries)) {
      const c = this.cells[f];
      let o = this.order(e, f, c);
      if (this.flags.noUnknown && o === "unknown") o = "after";
      const equal = c !== undefined && c.value === v;
      if (o === "after") {
        const keepFloor = e.at === undefined && c?.at !== undefined;
        this.cells[f] = {
          value: v,
          at: keepFloor ? c!.at : e.at,
          exact: !keepFloor && e.at !== undefined,
          since: e.from,
          landed: now,
          claim: !!e.claim,
        };
      } else if (o === "same" && !equal) {
        this.doubts.push({ f, to: now });
      } else if (o === "same" || (o === "unknown" && equal)) {
        if (!this.flags.sameKeepsLanded) {
          if (o === "unknown" && e.at !== undefined) {
            c!.at = e.at;
            c!.exact = true;
          }
          if (!e.claim) c!.claim = false;
          c!.landed = Math.max(c!.landed, now);
          c!.since = Math.max(c!.since, e.from);
        }
      } else if (o === "unknown") {
        this.doubts.push({ f, to: now });
      }
      const settled = o === "after" || ((o === "same" || o === "unknown") && equal);
      if (settled && !e.claim)
        this.doubts = this.doubts.filter(
          (d) =>
            d.f !== f ||
            (this.flags.readClearsOpen
              ? false
              : d.to === null || e.from < d.to),
        );
    }
    if (this.flags.noFieldScope)
      this.doubts = this.doubts.filter((d) => d.to === null);
    if (e.rest !== "unchanged" && e.at !== undefined && !this.flags.noBehind)
      this.seen = this.seen === undefined || e.at > this.seen ? e.at : this.seen;
  }
  gap(end: number) {
    if (!this.flags.noGap) this.staleBefore = end;
  }
  status(f: string): { value: unknown; marked: string | null } {
    const c = this.cells[f];
    let value = c ? c.value : ABSENT;
    let predicted = false;
    for (const o of this.overlays)
      if (f in o.fields) {
        value = o.fields[f];
        predicted = true;
      }
    if (predicted) return { value, marked: "predicted" };
    if (!c || c.value === ABSENT) return { value, marked: c ? "absent" : "missing" };
    if (this.doubts.some((d) => d.f === f)) return { value, marked: "uncertain" };
    if (c.claim) return { value, marked: "unconfirmed:claim" };
    if (c.at !== undefined && this.seen !== undefined && c.at < this.seen)
      return { value, marked: "unconfirmed:behind" };
    if (c.since < this.staleBefore) return { value, marked: "unconfirmed:gap" };
    return { value, marked: null };
  }
  wantsRepair() {
    return this.doubts.some((d) => !d.asked);
  }
}
