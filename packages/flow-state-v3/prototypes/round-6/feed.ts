// Streams T6: `Feed.callback`'s queue, as runtime code (D79). A pushed source's only way in, so nothing unbounded stands between a socket
// and a session. Values up to the bound, one signal group between two values, drain then fail. `onFailing` is the out-of-band row: a
// stopped pull cannot hear a failure at the end of a queue it is not reading (review H7). Prior art: Effect's Queue for shape only.
import { Effect, Stream } from "effect";
import type { Emit, FeedCallback } from "../conformance/fixtures/compiled.ts";

type Sig = { readonly _feed: string; readonly [k: string]: unknown };
type Group = { down1?: Sig; live?: Sig; down2?: Sig; ping?: boolean };
type Slot = { readonly v: unknown } | { readonly g: Group };
const isSig = (x: unknown): x is Sig => {
  const k = (x as Sig | undefined)?._feed;
  return k === "live" || k === "ping" || k === "down";
};
// No merge upgrades an answer or hides a drop. A reset cannot be hidden; otherwise the weaker of two registrations.
const weaker = (a: Sig | undefined, b: Sig): Sig => {
  if (!a) return b;
  if (a["restartAt"] !== undefined) return a;
  if (b["restartAt"] !== undefined) return b;
  return a["proof"] !== undefined ? b : a;
};
const merge = (g: Group, s: Sig) => {
  if (s._feed === "ping") g.ping = true;
  else if (s._feed === "down") {
    if (g.live) g.down2 = s;
    else g.down1 = s;
  } else {
    if (g.down2) {
      g.down1 = g.down2;
      delete g.down2;
    }
    g.live = weaker(g.live, s);
  }
};
const END = Symbol("end");
export const feedStream = (
  cb: FeedCallback,
  o: { latest?: boolean; onFailing?: (why: string) => void; onDropped?: () => void } = {},
): Stream.Stream<unknown, unknown> => {
  const bound = cb.bound ?? 1024;
  const q: Slot[] = [];
  const out: unknown[] = []; // a pulled group, one signal at a time
  let values = 0;
  let closing: { readonly fail?: unknown; readonly failing: boolean } | undefined;
  let released = false;
  let wake: (() => void) | undefined;
  let room: (() => void) | undefined;
  let started = false;
  let finalizer: void | (() => unknown);
  const poke = () => {
    const w = wake;
    wake = undefined;
    w?.();
  };
  const emit = ((x: unknown) => {
    if (closing || released) {
      o.onDropped?.();
      return Promise.resolve();
    }
    if (isSig(x)) {
      const last = q.at(-1);
      if (last && "g" in last) merge(last.g, x);
      else {
        const g: Group = {};
        merge(g, x);
        q.push({ g });
      }
      poke();
      return Promise.resolve();
    }
    if (o.latest) {
      // A signal is a fence: at most (signal group, one value). It never overflows.
      const at = q.findLastIndex((s) => "v" in s);
      if (at >= 0 && at === q.length - 1) q[at] = { v: x };
      else {
        q.push({ v: x });
        values++;
      }
      poke();
      return Promise.resolve();
    }
    if (values >= bound) {
      closing = { fail: { _tag: "Overflow" }, failing: true };
      o.onDropped?.();
      o.onFailing?.("Overflow");
      poke();
      return new Promise<void>(() => {});
    }
    q.push({ v: x });
    values++;
    poke();
    if (values < bound) return Promise.resolve();
    return new Promise<void>((resolve) => {
      room = resolve;
    });
  }) as Emit;
  (emit as { fail: Emit["fail"] }).fail = (e) => {
    if (closing || released) return;
    closing = { fail: e, failing: true };
    poke();
  };
  (emit as { end: Emit["end"] }).end = () => {
    if (closing || released) return;
    closing = { failing: false };
    poke();
  };
  const take = (): { readonly got: unknown } | undefined => {
    if (out.length) return { got: out.shift() };
    const head = q.shift();
    if (!head) return undefined;
    if ("v" in head) {
      values--;
      const r = room;
      room = undefined;
      r?.();
      return { got: head.v };
    }
    const { down1, live, down2, ping } = head.g;
    if (down1) out.push(down1);
    if (live) out.push(live);
    if (down2) out.push(down2);
    if (!down1 && !live && !down2 && ping) out.push({ _feed: "ping" });
    return take();
  };
  const next = Effect.callback<unknown, unknown>((resume) => {
    if (!started) {
      started = true;
      finalizer = cb.start(emit);
    }
    const give = () => {
      const t = take();
      if (t) return resume(Effect.succeed(t.got));
      if (closing) {
        if (closing.failing) return resume(Effect.fail(closing.fail));
        return resume(Effect.succeed(END));
      }
      wake = give;
    };
    give();
    return Effect.sync(() => {
      wake = undefined;
    });
  });
  return Stream.fromEffectRepeat(next).pipe(
    Stream.takeWhile((x) => x !== END),
    Stream.ensuring(
      Effect.suspend(() => {
        released = true;
        const r = typeof finalizer === "function" ? finalizer() : undefined;
        return (Effect.isEffect(r) ? r : Effect.void) as Effect.Effect<void>;
      }),
    ),
  );
};
