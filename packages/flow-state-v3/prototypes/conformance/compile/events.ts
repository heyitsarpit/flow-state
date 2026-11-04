// Round 12, compile prototypes: event tokens, shared by the operations' `outcomes` and the bodies. A payload is a fields record (Machines O1, 2.2.1).
// `Flow.uncertain(fields)` marks the only kind of event an operation's `unknown:` may target (rule 13); the operations compiler refuses any other.
import type { Fields, TypeOf } from "./core.ts";

export type Token<Tag extends string, P> = { readonly tag: Tag; readonly _p?: (p: P) => void };
export type EndCtx = { readonly key: unknown; readonly input: unknown; readonly reason?: string };
export type From<V, Tag extends string = string> = { readonly tag: Tag; readonly fromFn: (v: V, c: EndCtx) => unknown };
export type EventToken<Tag extends string, P> = Token<Tag, P> & {
  readonly from: <V>(f: (v: V, c: EndCtx) => P) => From<V, Tag>;
};
export type EventsOf<Ev extends Readonly<Record<string, Fields>>> = { readonly [K in keyof Ev & string]: EventToken<K, TypeOf<Ev[K]>> };
export type EventPayloads<Ev extends Readonly<Record<string, Fields>>> = { readonly [K in keyof Ev]: TypeOf<Ev[K]> };

const uncertainSet = new WeakSet<object>();
export const uncertain = <F extends Fields>(fields: F): F => {
  uncertainSet.add(fields);
  return fields;
};
export const isUncertain = (fields: unknown) => typeof fields === "object" && fields !== null && uncertainSet.has(fields);

// Round 13 (round 12 review M3): each event's payload fields, as `Compiled.events.payloads` holds them (copied, so `Compiled` shares no object with the
// author's records). The admission door and a Story's sends have data to check against.
export const payloadsOf = (ev: Readonly<Record<string, Fields>>): Readonly<Record<string, Readonly<Record<string, unknown>>>> =>
  Object.fromEntries(Object.entries(ev).map(([tag, f]) => [tag, { ...f }]));
export const tokens =<Ev extends Readonly<Record<string, Fields>>>(ev: Ev): EventsOf<Ev> =>
  Object.fromEntries(Object.keys(ev).map((tag) => [tag, { tag, from: (fromFn: unknown) => ({ tag, fromFn }) }])) as EventsOf<Ev>;
