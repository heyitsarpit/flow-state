// D140: the mailbox, as a value. A send used to copy every queued mail, so a burst was quadratic. Consecutive mail of one actor is a run: a window on a buffer that only grows. Old worlds keep their windows, so the log and a replay still read what they read; a second writer on one buffer, a branch, copies. Taking is near the head by construction: D122's rota serves oldest first within each actor.
type Item = { readonly actor: string; readonly restored?: boolean };
type Run<T> = { readonly actor: string; readonly buf: T[]; readonly start: number; readonly end: number };

export class MailQ<T extends Item> {
  private constructor(
    private readonly runs: readonly Run<T>[],
    readonly length: number,
    readonly restored: number, // how many restored endings: the disk's one reason to look through mail on every step (D72), and almost always none
  ) {}
  static empty<T extends Item>(): MailQ<T> {
    return new MailQ<T>([], 0, 0);
  }
  static of<T extends Item>(items: Iterable<T>): MailQ<T> {
    let q = MailQ.empty<T>();
    for (const x of items) q = q.push(x);
    return q;
  }
  push(x: T): MailQ<T> {
    const last = this.runs.at(-1);
    if (last && last.actor === x.actor) {
      const buf = last.buf.length === last.end ? last.buf : last.buf.slice(last.start, last.end);
      const start = buf === last.buf ? last.start : 0;
      buf.push(x);
      const runs = this.runs.slice();
      runs[runs.length - 1] = { actor: x.actor, buf, start, end: buf.length };
      return new MailQ(runs, this.length + 1, this.restored + (x.restored ? 1 : 0));
    }
    return new MailQ([...this.runs, { actor: x.actor, buf: [x], start: 0, end: 1 }], this.length + 1, this.restored + (x.restored ? 1 : 0));
  }
  has(actor: string): boolean {
    return this.runs.some((r) => r.actor === actor);
  }
  first(): T | undefined {
    const r = this.runs[0];
    return r?.buf[r.start];
  }
  // The oldest mail of an actor, and the queue without it.
  take(actor: string): { readonly item: T; readonly rest: MailQ<T> } | undefined {
    const i = this.runs.findIndex((r) => r.actor === actor);
    if (i < 0) return undefined;
    return this.drop(i);
  }
  takeFirst(): { readonly item: T; readonly rest: MailQ<T> } | undefined {
    return this.runs.length ? this.drop(0) : undefined;
  }
  private drop(i: number) {
    const r = this.runs[i]!;
    const item = r.buf[r.start]!;
    const runs = this.runs.slice();
    if (r.start + 1 === r.end) {
      runs.splice(i, 1);
      // Two runs of one actor made neighbours join, so `push`'s one-run-at-the-end stays a fact about order only.
    } else runs[i] = { ...r, start: r.start + 1 };
    return { item, rest: new MailQ(runs, this.length - 1, this.restored - (item.restored ? 1 : 0)) };
  }
  filter(keep: (x: T) => boolean): MailQ<T> {
    const kept = [...this].filter(keep);
    return kept.length === this.length ? this : MailQ.of(kept);
  }
  *[Symbol.iterator](): IterableIterator<T> {
    for (const r of this.runs) for (let i = r.start; i < r.end; i++) yield r.buf[i]!;
  }
  toJSON(): readonly T[] {
    return [...this];
  }
}
