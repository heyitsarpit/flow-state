// Strategy (b): names in the definition (`schedules: { cooldown: {}, settle: {} }`).
import { type AnyDef, type Machine, type NodeCfg, type Sched, type Tokens, fakeMachine, tokens } from "./core.ts";

type TimerNames<D extends AnyDef> = keyof D["schedules"] & string;
type SchedRec<D extends AnyDef> = { readonly [K in TimerNames<D>]?: Sched };
type Cfg<D extends AnyDef> = NodeCfg<D, D["states"], TimerNames<D>, SchedRec<D>> & { readonly default: unknown };

type Own<N> = N extends { readonly schedules: infer Sc } ? keyof Sc & string : never;
type Filled<N> =
  | Own<N>
  | (N extends { readonly states: infer St } ? { [K in keyof St]: Filled<St[K]> }[keyof St] : never);

// every declared timer must be filled somewhere in the machine
type Complete<D extends AnyDef, C> = [Exclude<TimerNames<D>, Filled<C>>] extends [never]
  ? [Exclude<Filled<C>, TimerNames<D>>] extends [never]
    ? unknown
    : { readonly __undeclaredSchedules: Exclude<Filled<C>, TimerNames<D>> }
  : { readonly __unfilledTimers: Exclude<TimerNames<D>, Filled<C>> };

export function machine<const D extends AnyDef, const C extends Cfg<D>>(
  d: D,
  f: (t: Tokens<D>) => C & Complete<D, C>,
): Machine<D, TimerNames<D>> {
  f(tokens(d));
  return fakeMachine(d);
}

// B+: names from the definition AND ancestor-or-self scoping (needs inferred C again)
type VTr1<A extends string> = { readonly arm?: readonly A[]; readonly disarm?: readonly A[] };
type VTr<T, A extends string> = T extends readonly unknown[] ? { readonly [K in keyof T]: VTr1<A> } : VTr1<A>;
type VNode<N, A extends string> = {
  readonly on?: N extends { readonly on: infer O } ? { readonly [E in keyof O]: VTr<O[E], A | Own<N>> } : unknown;
  readonly states?: N extends { readonly states: infer St } ? { readonly [K in keyof St]: VNode<St[K], A | Own<N>> } : unknown;
};
export function machineScoped<const D extends AnyDef, const C extends Cfg<D>>(
  d: D,
  f: (t: Tokens<D>) => C & Complete<D, C> & VNode<C, never>,
): Machine<D, TimerNames<D>> {
  f(tokens(d));
  return fakeMachine(d);
}
