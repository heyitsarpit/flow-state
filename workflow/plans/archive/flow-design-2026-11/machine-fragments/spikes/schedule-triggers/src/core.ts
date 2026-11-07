import { Schema } from "effect";

// ---- state spec -------------------------------------------------------
export type Spec = readonly (string | { readonly [k: string]: Spec })[];

export type Names<S extends Spec> = S[number] extends infer E
  ? E extends string ? E : E extends { readonly [k: string]: Spec } ? keyof E & string : never
  : never;

export type SubSpec<S extends Spec, K extends string> = S[number] extends infer E
  ? E extends { readonly [P in K]: infer Sub } ? Sub extends Spec ? Sub : never : never
  : never;

type Join<P extends string, K extends string> = P extends "" ? K : `${P}.${K}`;

export type Paths<S extends Spec, P extends string = ""> = string extends Names<S>
  ? string
  : {
      [K in Names<S>]: Join<P, K> | Paths<[SubSpec<S, K>] extends [never] ? readonly [] : SubSpec<S, K>, Join<P, K>>;
    }[Names<S>];

export interface StateToken<P extends string> { readonly _state: P }
export type StateTokens<S extends Spec, P extends string = ""> = {
  readonly [K in Names<S>]: StateToken<Join<P, K>> &
    StateTokens<[SubSpec<S, K>] extends [never] ? readonly [] : SubSpec<S, K>, Join<P, K>>;
};

// ---- events -----------------------------------------------------------
export type EventFields = { readonly [k: string]: Schema.Top };
export type EventsInput = { readonly [k: string]: EventFields };
export interface EventToken<N extends string> { readonly _event: N }

// ---- definition -------------------------------------------------------
export interface Definition<
  S extends Spec = Spec,
  Ev extends EventsInput = EventsInput,
  IEv extends EventsInput = EventsInput,
  T extends { readonly [k: string]: {} } = {},
> {
  readonly id: string;
  readonly states: S;
  readonly events: Ev;
  readonly internalEvents: IEv;
  readonly schedules: T;
}
export type AnyDef = Definition<any, any, any, any>;

export function definition<
  const S extends Spec,
  const Ev extends EventsInput,
  const IEv extends EventsInput = {},
  const T extends { readonly [k: string]: {} } = {},
>(d: {
  id: string; states: S; events: Ev; internalEvents?: IEv; schedules?: T;
}): Definition<S, Ev, IEv, T> {
  return { id: d.id, states: d.states, events: d.events, internalEvents: (d.internalEvents ?? {}) as IEv, schedules: (d.schedules ?? {}) as T };
}

export type ExtEventNames<D extends AnyDef> = keyof D["events"] & string;
export type AllEventNames<D extends AnyDef> = (keyof D["events"] | keyof D["internalEvents"]) & string;

export type Tokens<D extends AnyDef> = {
  readonly S: StateTokens<D["states"]>;
  readonly E: { readonly [K in AllEventNames<D>]: EventToken<K> };
};

// ---- config (parametrised by how arm/schedules are typed) ----------------
export interface Sched { readonly schedule: string; readonly send: EventToken<string> }

export interface Transition<D extends AnyDef, Arm> {
  readonly target: "self" | StateToken<Paths<D["states"]>>;
  readonly guard?: (ctx: unknown) => boolean;
  readonly arm?: readonly Arm[];
  readonly disarm?: readonly Arm[];
  readonly actions?: readonly (() => void)[];
}

export interface NodeCfg<D extends AnyDef, Sub extends Spec, Arm, SchedT> {
  readonly default?: StateToken<Paths<D["states"]>>;
  readonly schedules?: SchedT;
  readonly on?: {
    readonly [K in ExtEventNames<D>]?: Transition<D, Arm> | readonly Transition<D, Arm>[];
  };
  readonly states?: {
    readonly [K in Names<Sub>]?: NodeCfg<D, [SubSpec<Sub, K>] extends [never] ? readonly [] : SubSpec<Sub, K>, Arm, SchedT>;
  };
}

// ---- view -------------------------------------------------------------
export type TimerView<N extends string> = { readonly [K in N]: { dueAt: number } | undefined };
export interface Machine<D extends AnyDef, T extends string> {
  readonly definition: D;
  readonly snapshot: { readonly schedules: TimerView<T> };
}
export const fakeMachine = <D extends AnyDef, T extends string>(definition: D): Machine<D, T> =>
  ({ definition, snapshot: { schedules: {} as TimerView<T> } });

export function tokens<D extends AnyDef>(_d: D): Tokens<D> {
  return { S: new Proxy({}, { get: () => ({}) }), E: new Proxy({}, { get: () => ({}) }) } as unknown as Tokens<D>;
}
