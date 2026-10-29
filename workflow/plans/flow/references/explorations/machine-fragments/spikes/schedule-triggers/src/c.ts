// Strategy (c): arm by reference. `const cooldown = timer("30 seconds", E.CooldownOver)`.
import { type AnyDef, type EventToken, type Machine, type NodeCfg, type Tokens, fakeMachine, tokens } from "./core.ts";

export interface Timer<Ev extends string = string> { readonly _timer: Ev; readonly schedule: string; readonly send: EventToken<Ev> }
export const timer = <Ev extends string>(schedule: string, send: EventToken<Ev>): Timer<Ev> =>
  ({ schedule, send }) as Timer<Ev>;

type SchedRec = { readonly [k: string]: Timer };
type Cfg<D extends AnyDef> = NodeCfg<D, D["states"], Timer, SchedRec> & { readonly default: unknown };

type Own<N> = N extends { readonly schedules: infer Sc } ? keyof Sc & string : never;
type OwnVals<N> = N extends { readonly schedules: infer Sc } ? Sc[keyof Sc] : never;
export type AllNames<N> =
  | Own<N>
  | (N extends { readonly states: infer St } ? { [K in keyof St]: AllNames<St[K]> }[keyof St] : never);

// Scoped check: armed timers must be registered on this node or an ancestor (identity = Timer<Ev> type)
type VTr1<A> = { readonly arm?: readonly A[]; readonly disarm?: readonly A[] };
type VTr<T, A> = T extends readonly unknown[] ? { readonly [K in keyof T]: VTr1<A> } : VTr1<A>;
type VNode<N, A> = {
  readonly on?: N extends { readonly on: infer O } ? { readonly [E in keyof O]: VTr<O[E], A | OwnVals<N>> } : unknown;
  readonly states?: N extends { readonly states: infer St } ? { readonly [K in keyof St]: VNode<St[K], A | OwnVals<N>> } : unknown;
};

export function machine<const D extends AnyDef, const C extends Cfg<D>>(
  d: D,
  f: (t: Tokens<D>) => C & VNode<C, never>,
): Machine<D, AllNames<C>> {
  f(tokens(d));
  return fakeMachine(d);
}
// Unchecked variant: only the base constraint (any Timer is accepted in arm)
export function machineLoose<const D extends AnyDef, const C extends Cfg<D>>(
  d: D,
  f: (t: Tokens<D>) => C,
): Machine<D, AllNames<C>> {
  f(tokens(d));
  return fakeMachine(d);
}
