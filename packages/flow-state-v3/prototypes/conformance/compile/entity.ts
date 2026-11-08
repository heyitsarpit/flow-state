// Phase 1 E round 3 (Q4 A): `patch` split in two. An entity's constructors, typed so the split is a type error at the call site, and compiled to
// the `Predicted` and `Carried` data the store reads. `changesOf` and `predictionsOf` stand in for `listen(c).as([...], f)` and
// `write(c).predicts(f)`, which this prototype has no builder for: only their return types matter here.
import type { Carried, Predicted } from "../fixtures/compiled.ts";
import type { Fields, TypeOf } from "./core.ts";

type Row<F extends Fields> = TypeOf<F>;
type KeyOf<F extends Fields, K extends keyof F> = Pick<Row<F>, K & keyof Row<F>>;
type Rest<F extends Fields, K extends keyof F> = Partial<Omit<Row<F>, K & keyof Row<F>>>;

/** A prediction in `.predicts`, and only there. */
export type Patch = Predicted & { readonly evidence?: never };
/** A server's partial change, in `listen` only. Ordered by its version, which it must carry. */
export type Delta = Carried & { readonly evidence: "partial"; readonly removed?: never };
/** A whole row: what it omits is absent, not unknown. */
export type WholeRow = Carried & { readonly evidence: "whole"; readonly removed?: never };
/** A removal at a version. */
export type Removal = Carried & { readonly removed: true; readonly evidence?: never };
/** What a `listen` mapper may return. A `Patch` is not one. */
export type Change = Delta | WholeRow | Removal;

/**
 * An entity: its fields, its key, and the field that says what version an answer speaks from.
 *
 * When to use: one per server record kind a domain reads, writes or listens to.
 *
 * Details: `patch(key, fields)` is a prediction. `delta(key, fields)` is a server change that must carry `version`. `row(r)` is a whole row.
 * `delete(key, { version })` is a removal.
 *
 * Gotchas: `version` must be monotonic across a key's re-creations; if the server restarts it, leave the entity unversioned.
 */
export const entity = <const F extends Fields, const K extends readonly (keyof F & string)[], const V extends keyof F & string>(e: {
  readonly id: string;
  readonly fields: F;
  readonly primaryKey: K;
  readonly version: V;
}) => {
  const ref = (key: KeyOf<F, K[number]>) => `${e.id}|${e.primaryKey.map((k) => String((key as Record<string, unknown>)[k])).join("|")}`;
  const keyless = (o: object) => Object.fromEntries(Object.entries(o).filter(([k]) => !e.primaryKey.includes(k)));
  return {
    id: e.id,
    fields: e.fields,
    version: e.version,
    ref,
    patch: (key: KeyOf<F, K[number]>, fields: Rest<F, K[number]>): Patch => ({ ref: ref(key), patch: fields as Readonly<Record<string, unknown>> }),
    delta: (key: KeyOf<F, K[number]>, fields: Rest<F, K[number]> & Pick<Row<F>, V & keyof Row<F>>): Delta => ({
      ref: ref(key),
      fields: { ...(key as object), ...keyless(fields) },
      evidence: "partial",
    }),
    row: (row: Row<F>): WholeRow => ({ ref: ref(row as KeyOf<F, K[number]>), fields: row as Readonly<Record<string, unknown>>, evidence: "whole" }),
    delete: (key: KeyOf<F, K[number]>, o: { readonly version: Row<F>[V & keyof Row<F>] }): Removal => ({ ref: ref(key), removed: true, version: o.version }),
  };
};
/** The return type of `listen(c).as([...], f)`: a server says changes, never predictions. */
export const changesOf = <A>(f: (value: A) => readonly Change[]) => f;
/** The return type of `write(c).predicts(f)`: a prediction, never a server's change. */
export const predictionsOf = <I>(f: (input: I) => readonly Patch[]) => f;
