// The persistence edge, from round-7/edge-proposal.md, replacing the driver's persist path. Per actor, one batch is out at a time, and it carries everything not known to have landed.
export type Bytes = { readonly key: string; readonly value: string | undefined };
export type Write = {
  readonly key: string;
  readonly value?: string | undefined;
  readonly record?: unknown;
};
export type Ticket = {
  readonly attempt: string;
  readonly ticket: string;
  readonly purpose: "capture" | "acknowledge";
};
export type Persist = {
  readonly k: "persist";
  readonly scope: string;
  readonly writes: readonly Write[];
  readonly now: boolean;
  readonly ticket?: Ticket;
};
export type Issue = { readonly code: string; readonly origin?: string; readonly input?: unknown };
export type Purpose = "capture" | "acknowledge" | "flush";
export type EdgeHost = {
  now(): number;
  later(f: () => void): void;
  setTimer(at: number, f: () => void): () => void;
  isHidden(): boolean;
  storage: {
    write(
      writes: readonly Bytes[],
      purpose: Purpose,
      answer: (ok: boolean, why?: string) => void,
    ): void;
  };
};
export type EdgeOptions = {
  readonly captureMs: number;
  readonly storageMs: number;
  readonly retryMaxMs: number;
  encode(record: unknown): string;
  stored(ticket: Ticket, ok: boolean): void;
  report(issue: Issue): void;
};

type Out = {
  readonly writes: readonly Bytes[];
  readonly tickets: readonly Ticket[];
  readonly stopSilent: () => void;
};
type Slot = {
  readonly dirty: Map<string, Write>;
  tickets: Ticket[];
  out: Out | undefined;
  due: number;
  stopWake: (() => void) | undefined;
  failures: number;
};

export const makeEdge = (host: EdgeHost, o: EdgeOptions) => {
  const slots = new Map<string, Slot>(); // a clean scope has no entry: no state at all

  // A timer firing means due, whatever the clock says now (clock back). Firing late only delays an older cut's replacement.
  const wakeAt = (scope: string, s: Slot, at: number) => {
    if (at === s.due) return;
    s.stopWake?.();
    s.due = at;
    s.stopWake =
      at === Infinity || at <= host.now()
        ? undefined
        : host.setTimer(at, () => {
            s.due = -Infinity; // fired means due, whatever the clock says now
            pump(scope);
          });
  };

  const encodeAll = (scope: string, s: Slot): Map<string, string> | undefined => {
    const out = new Map<string, string>();
    try {
      for (const w of s.dirty.values())
        if (w.record !== undefined) out.set(w.key, o.encode(w.record));
      return out;
    } catch (e) {
      o.report({ code: "UnencodableValue", origin: scope, input: String(e) });
      return undefined;
    }
  };

  // THE RULE: everything dirty goes, as one batch. Sole exception: memory that cannot encode stays, and lane deletes stay with it.
  const issue = (scope: string, s: Slot) => {
    const encoded = encodeAll(scope, s);
    const writes: Bytes[] = [];
    for (const w of [...s.dirty.values()]) {
      const bytes = w.record !== undefined ? encoded?.get(w.key) : w.value;
      const goes = encoded !== undefined || (w.record === undefined && w.value !== undefined);
      if (!goes) continue;
      writes.push({ key: w.key, value: bytes });
      s.dirty.delete(w.key);
    }
    wakeAt(scope, s, Infinity);
    if (writes.length === 0) return;
    const tickets = s.tickets;
    s.tickets = [];
    const out: Out = {
      writes,
      tickets,
      // A batch with a ticket: `step`'s own storage timer says it, as evidence and on the waiting Attempt. This is for a batch nobody waits on.
      stopSilent:
        tickets.length > 0
          ? () => {}
          : host.setTimer(host.now() + o.storageMs, () =>
              o.report({ code: "StorageSilent", origin: scope }),
            ),
    };
    s.out = out;
    const purpose: Purpose = tickets.some((t) => t.purpose === "capture")
      ? "capture"
      : tickets.length > 0
        ? "acknowledge"
        : "flush";
    host.storage.write(writes, purpose, (ok, why) => answered(scope, s, out, ok, why));
  };

  const answered = (scope: string, s: Slot, out: Out, ok: boolean, why?: string) => {
    out.stopSilent();
    s.out = undefined;
    if (ok) {
      s.failures = 0;
    } else {
      // Put it back unless something newer has been accepted. Then the next batch still holds everything not known to have landed.
      for (const w of out.writes) if (!s.dirty.has(w.key)) s.dirty.set(w.key, w);
      s.failures++;
      wakeAt(scope, s, host.now() + Math.min(o.retryMaxMs, 1000 * 2 ** (s.failures - 1)));
      // A ticket's machine hears it as an ending. The issue is for what nobody would otherwise hear.
      if (s.failures === 1 && out.tickets.length === 0)
        o.report({ code: "StorageFailure", origin: scope, input: why });
    }
    for (const t of out.tickets) o.stored(t, ok); // runs a turn, whose writes land in dirty, so they beat what was put back
    pump(scope);
    if (!s.out && s.dirty.size === 0 && s.tickets.length === 0 && s.failures === 0) {
      s.stopWake?.();
      slots.delete(scope);
    }
  };

  const pump = (scope: string) => {
    const s = slots.get(scope);
    if (s === undefined || s.out !== undefined || s.dirty.size === 0) return;
    if (s.tickets.length > 0 || host.now() >= s.due) issue(scope, s);
  };

  return {
    // Called for each persist command of a step, on the turn. No encoding, no I/O: map writes, one comparison.
    accept(c: Persist) {
      let s = slots.get(c.scope);
      if (s === undefined) {
        s = {
          dirty: new Map(),
          tickets: [],
          out: undefined,
          due: Infinity,
          stopWake: undefined,
          failures: 0,
        };
        slots.set(c.scope, s);
      }
      for (const w of c.writes) s.dirty.set(w.key, w);
      if (c.ticket) s.tickets.push(c.ticket);
      const inBackoff = s.failures > 0 && s.due !== Infinity;
      const urgent = c.now || c.ticket !== undefined || host.isHidden() || o.captureMs <= 0;
      const at = urgent ? 0 : host.now() + o.captureMs;
      if (!inBackoff && at < s.due) wakeAt(c.scope, s, at);
      if (urgent) host.later(() => pump(c.scope)); // off the turn, and after the whole step's commands
    },
    // In the hide handler's own task: later tasks may never run. A scope with a batch out cannot go: see "costs".
    hide() {
      for (const [scope, s] of slots) if (!s.out && s.dirty.size > 0) issue(scope, s);
    },
    quiet: () => slots.size === 0,
    // For the suite's hash: what is held back decides the future too.
    text: () =>
      JSON.stringify(
        [...slots].map(([k, s]) => [k, [...s.dirty.keys()].sort(), s.tickets.length, s.out?.writes.map((w) => w.key) ?? null, s.failures]).sort(),
      ),
  };
};
