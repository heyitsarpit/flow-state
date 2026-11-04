// Round 12, the compile prototypes (HANDOFF plan cut, step 3): what the machine, fragment and operations compilers share. Each compiler starts from the
// design's public API (machine-design 2.2-2.4, 2.7, 2.9) and emits `CompiledOutput`; where it differs from the design, `round-12/api-changes.md` says so.
import type { Schema } from "effect";
import type { Slot } from "../fixtures/compiled.ts";

export type Fields = Readonly<Record<string, Schema.Top>>;
// Schema's own struct type, so an `optionalKey` field is optional to a select, as it is to `Schema.Struct`.
export type TypeOf<F extends Fields> = Schema.Struct.Type<F>;
export type Tagged = { readonly _tag: string };
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
export type Simplify<A> = { [K in keyof A]: A[K] } & {};

// The one erasure. A closure's types are the author's; `Compiled` holds them as data, checked at run time by the seal (D65).
export const erased = <F>(f: unknown): F => f as F;
export const slotOf = <F>(definition: string, path: string, f: unknown): Slot<F> => ({ run: erased<F>(f), at: { definition, path } });
export const list = <X>(x: X | ReadonlyArray<X> | undefined): readonly X[] => (x === undefined ? [] : Array.isArray(x) ? (x as readonly X[]) : [x as X]);
export const isFn = (x: unknown): x is (...a: never[]) => unknown => typeof x === "function";
// Built on first use, not at `machine()`: the compile is the app's load cost (D194).
export const lazy = <A>(f: () => A) => {
  let v: A | undefined;
  return () => (v ??= f());
};
