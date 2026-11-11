// Throwaway executable model of entity-proposal-2's judge. One record, one store. No runtime, no types kept.
export const ABSENT = Symbol("absent");
export type V = number | undefined;
export type Cell = {
  value: unknown;
  at: V;
  exact: boolean; // false: `at` is only a floor (the value came with no version)
  since: number; // window start of the evidence that proved it
  landed: number;
  claim: false | "value" | "blank"; // a success that did not carry this field
};
export type Conflict = { kind: "conflict"; f: string; to: number; asks: number; asked: boolean; wentBack: boolean };
export type Open = { kind: "open"; f: string; attempt: string; given: number | null; quiet: boolean; basedOn?: number };
export type Doubt = Conflict | Open;
export type Evidence = { carries: Record<string, unknown>; at: V; from: number; origin?: "refresh" };
export type Overlay = { attempt: string; fields: Record<string, unknown>; ended?: boolean };
export type Flags = { [k: string]: boolean | undefined };
export const MAX_ASKS = 3;

export class Store {
  pos = 1;
  cells: Record<string, Cell> = {};
  seen: V = undefined;
  doubts: Doubt[] = [];
  overlays: Overlay[] = [];
  staleBefore = 0;
  forced = false; // an Attempt's ending or a give-up wants one read
  gen = 0; // non-refresh events: what a live answer's refresh is budgeted against
  covered: () => boolean = () => false;
  perCollection = false;
  flags: Flags;
  conflictsRaised = 0;
  spurious = 0;
  constructor(flags: Flags = {}) {
    this.flags = flags;
  }
  tick() {
    return ++this.pos;
  }
  eq(a: unknown, b: unknown) {
    if (this.flags.identityEq || a === ABSENT || b === ABSENT) return a === b;
    return JSON.stringify(a) === JSON.stringify(b); // stands in for Schema.toEquivalence
  }
  // The one comparison. Internal.
  position(e: Evidence, c: Cell | undefined): "after" | "before" | "overlap" | "backwards" {
    if (!c) return "after";
    const asked = e.from >= c.landed; // asked after we knew: a local fact, and the only proof
    if (e.at === undefined || c.at === undefined) return asked ? "after" : "overlap";
    const k = e.at > c.at ? 1 : e.at === c.at ? 0 : -1;
    if (c.exact) {
      if (k > 0) return "after";
      if (k === 0) return asked && !this.flags.noTie ? "after" : "overlap";
      return asked && !this.flags.silentBefore ? "backwards" : "before";
    }
    // `at` is a floor
    if (k > 0) return asked ? "after" : "overlap";
    if (k === 0) {
      if (!asked) return "overlap"; // a tie that overlaps cannot be ordered, claim or not: a version need not move
      return c.claim === "value" && !this.flags.silentBefore ? "backwards" : "after";
    }
    return asked && !this.flags.silentBefore ? "backwards" : "before";
  }
  raise(f: string, now: number, wentBack: boolean) {
    this.conflictsRaised++;
    const d = this.doubts.find((x): x is Conflict => x.kind === "conflict" && x.f === f);
    if (d) {
      d.to = now;
      d.wentBack = wentBack;
      if (!this.flags.noReask) d.asked = false;
      return;
    }
    this.doubts.push({ kind: "conflict", f, to: now, asks: 0, asked: false, wentBack });
  }
  settled(f: string, from: number) {
    if (!this.flags.conflictsNeverClose)
      this.doubts = this.doubts.filter((d) => {
        if (d.kind !== "conflict" || d.f !== f) return true;
        return from < d.to;
      });
    for (const d of this.doubts)
      if (d.kind === "open" && d.f === f && d.given !== null && from >= d.given && !this.flags.noDemote) d.quiet = true;
    if (this.flags.readClearsOpen)
      this.doubts = this.doubts.filter((d) => !(d.kind === "open" && d.f === f));
    if (this.flags.readClearsQuiet)
      this.doubts = this.doubts.filter((d) => !(d.kind === "open" && d.f === f && d.quiet));
  }
  judge(e: Evidence) {
    const now = this.tick();
    if (e.origin !== "refresh" || this.flags.refreshFeeds) this.gen++;
    if (this.flags.fromAtLanding) e = { ...e, from: now };
    this.proof(e);
    for (const [f, v] of Object.entries(e.carries)) {
      const c = this.cells[f];
      let o = this.position(e, c);
      if (this.flags.noUnknown && o === "overlap") o = "after";
      const equal = c !== undefined && this.eq(c.value, v);
      if (c && !equal && JSON.stringify(c.value) === JSON.stringify(v) && c.value !== ABSENT && v !== ABSENT) this.spurious++;
      if (o === "after") {
        const silent = e.at === undefined && c?.at !== undefined;
        this.cells[f] = { value: v, at: silent ? c!.at : e.at, exact: !silent && e.at !== undefined, since: e.from, landed: now, claim: false };
        this.settled(f, e.from);
      } else if (o === "before") {
        // A stale answer. If it started after a doubt, the cell is newer than something that started after that doubt.
        if (!this.flags.beforeClosesNothing) this.settled(f, e.from);
      } else if (equal && o === "overlap" && c!.claim === "blank" && !this.flags.blankAgrees) {
        // A blank claim has no value to agree with: an answer that overlaps the write says nothing about it. Keep the mark.
        this.settled(f, e.from);
      } else if (equal) {
        if (!this.flags.sameKeepsLanded) {
          if (e.at !== undefined && (c!.at === undefined || e.at >= c!.at)) {
            c!.at = e.at;
            c!.exact = true;
          }
          c!.claim = false;
          c!.landed = Math.max(c!.landed, now);
          c!.since = Math.max(c!.since, e.from);
        }
        this.settled(f, e.from);
      } else {
        this.raise(f, now, o === "backwards");
      }
    }
    if (this.flags.noFieldScope) this.doubts = this.doubts.filter((d) => d.kind === "open");
    if (e.at !== undefined && !this.perCollection && !this.covered() && !this.flags.noBehind)
      this.seen = this.seen === undefined || e.at > this.seen ? e.at : this.seen;
    if (this.flags.perCollectionBehind && e.at !== undefined) this.seen = this.seen === undefined || e.at > this.seen ? e.at : this.seen;
  }
  // A given-up Attempt guarded by `basedOn`: a version past its base proves it can no longer land.
  // It proves nothing about what the record held before that version, so it becomes a conflict the same evidence can close, field by field.
  proof(e: Evidence) {
    if (e.at === undefined) return;
    const proven = this.doubts.filter((d) => d.kind === "open" && d.given !== null && d.basedOn !== undefined && (this.flags.proofAtEqual ? e.at! >= d.basedOn : e.at! > d.basedOn));
    if (!proven.length) return;
    this.doubts = this.doubts.filter((d) => !proven.includes(d));
    for (const d of proven) if (!this.doubts.some((x) => x.kind === "conflict" && x.f === d.f)) this.doubts.push({ kind: "conflict", f: d.f, to: e.from, asks: 0, asked: false, wentBack: false });
  }
  // The one constructor for "a success did not carry this field it touched". Value: the prediction. Blank: `.alsoChanges`, the version field.
  claim(f: string, value: { v: unknown } | undefined, from: number) {
    const now = this.tick();
    this.gen++;
    const c = this.cells[f];
    if (!c) {
      if (value) this.cells[f] = { value: value.v, at: undefined, exact: false, since: from, landed: now, claim: "value" };
      return;
    }
    let held = value !== undefined; // does the cell now hold what we claim?
    if (value && !this.eq(c.value, value.v)) {
      if (from >= c.landed) c.value = value.v;
      else {
        this.raise(f, now, false);
        held = false; // only a read against a value we hold can contradict it
      }
    }
    if (!(this.flags.claimNoRev && !value)) {
      c.claim = held ? "value" : "blank";
      c.exact = false;
      c.landed = now;
    }
    for (const d of this.doubts) if (d.kind === "open" && d.f === f && d.given !== null && from >= d.given && !this.flags.noDemote) d.quiet = true;
  }
  open(f: string, attempt: string, given: number | null, basedOn?: number) {
    this.doubts.push({ kind: "open", f, attempt, given, quiet: false, ...(basedOn === undefined ? {} : { basedOn }) });
    this.forced = true;
  }
  give(attempt: string, now: number) {
    for (const d of this.doubts) if (d.kind === "open" && d.attempt === attempt) d.given = now;
    this.forced = true;
  }
  closeAttempt(attempt: string) {
    this.doubts = this.doubts.filter((d) => !(d.kind === "open" && d.attempt === attempt));
  }
  gap(end: number) {
    if (!this.flags.noGap) this.staleBefore = end;
    this.gen++;
  }
  clearable(f: string) {
    const c = this.cells[f];
    if (!c || c.value === ABSENT) return false;
    return !!c.claim || (c.at !== undefined && this.seen !== undefined && c.at < this.seen) || c.since < this.staleBefore;
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
    if (this.flags.markEverything) return { value, marked: "uncertain" };
    if (!c) return { value, marked: "missing" };
    if (c.value === ABSENT) return { value, marked: "absent" };
    const mine = this.flags.recordScopeMarks ? this.doubts : this.doubts.filter((d) => d.f === f);
    if (mine.some((d) => d.kind === "conflict")) return { value, marked: "uncertain" };
    if (mine.some((d) => d.kind === "open" && !d.quiet)) return { value, marked: "uncertain" };
    if (mine.length) return { value, marked: "unconfirmed:mayLand" };
    if (c.claim) return { value, marked: "unconfirmed:claim" };
    if (c.at !== undefined && this.seen !== undefined && c.at < this.seen) return { value, marked: "unconfirmed:behind" };
    if (c.since < this.staleBefore) return { value, marked: "unconfirmed:gap" };
    return { value, marked: null };
  }
  wantsRepair() {
    return this.forced || this.doubts.some((d) => d.kind === "conflict" && !d.asked && d.asks < MAX_ASKS);
  }
  asking() {
    this.forced = false;
    for (const d of this.doubts)
      if (d.kind === "conflict" && !d.asked) {
        d.asked = true;
        d.asks++;
      }
  }
}
