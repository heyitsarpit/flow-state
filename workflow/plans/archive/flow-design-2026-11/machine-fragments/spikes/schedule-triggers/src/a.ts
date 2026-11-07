// Strategy (a): validate after inference. Timer names exist only in config.
import { type AnyDef, type Machine, type NodeCfg, type Sched, type Tokens, fakeMachine, tokens } from "./core.ts";

type SchedRec = { readonly [k: string]: Sched };
type Cfg<D extends AnyDef> = NodeCfg<D, D["states"], string, SchedRec> & { readonly default: unknown };

// own schedule names of a node
type Own<N> = N extends { readonly schedules: infer Sc } ? keyof Sc & string : never;
// every schedule name in the tree
export type AllTimers<N> =
  | Own<N>
  | (N extends { readonly states: infer St } ? { [K in keyof St]: AllTimers<St[K]> }[keyof St] : never);

type VTr1<A extends string> = { readonly arm?: readonly A[]; readonly disarm?: readonly A[] };
type VTr<T, A extends string> = T extends readonly (infer U)[] ? readonly VTr1<A>[] & { readonly [K in keyof T]: VTr1<A> } : VTr1<A>;

type VNode<N, A extends string> = {
  readonly on?: N extends { readonly on: infer O } ? { readonly [E in keyof O]: VTr<O[E], A | Own<N>> } : unknown;
  readonly states?: N extends { readonly states: infer St }
    ? { readonly [K in keyof St]: VNode<St[K], A | Own<N>> }
    : unknown;
};

// Variant 1: ancestors-or-self scoping. Variant 2 (machine-wide) is `VNodeAny` below.
export function machine<const D extends AnyDef, const C extends Cfg<D>>(
  d: D,
  f: (t: Tokens<D>) => C & VNode<C, never>,
): Machine<D, AllTimers<C>> {
  f(tokens(d));
  return fakeMachine(d);
}

// machine-wide: any declared name anywhere is OK
type VNodeAny<N, All extends string> = {
  readonly on?: N extends { readonly on: infer O } ? { readonly [E in keyof O]: VTr<O[E], All> } : unknown;
  readonly states?: N extends { readonly states: infer St } ? { readonly [K in keyof St]: VNodeAny<St[K], All> } : unknown;
};
export function machineWide<const D extends AnyDef, const C extends Cfg<D>>(
  d: D,
  f: (t: Tokens<D>) => C & VNodeAny<C, AllTimers<C>>,
): Machine<D, AllTimers<C>> {
  f(tokens(d));
  return fakeMachine(d);
}
