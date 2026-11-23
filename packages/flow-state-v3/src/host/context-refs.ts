import type { ActorRef, AnyDefinition, Machine } from "../definition.ts";
import type { Parts } from "../derive.ts";

/**
 * The provider a context slot reads from: its state tree and memory.
 */
// oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- reads a slot's phantom type, which holds no value
export type ProviderOf<S> = S extends { readonly "~provider"?: infer P }
  ? Exclude<P, undefined>
  : never;

/**
 * The refs that wire a definition's context slots: each names an actor of its slot's provider.
 */
export type ContextRefs<Cx> = string extends keyof Cx
  ? Readonly<Record<string, ActorRef>>
  : { readonly [K in keyof Cx]?: ActorRef<AnyDefinition & ProviderOf<Cx[K]>> };

// An entry as `app` checks it: a machine, or a machine with refs whose slots are its machine's and
// whose refs are each slot's provider's, and no other key.
type CheckedEntry<E> = E extends Machine
  ? E
  : E extends { readonly machine: Machine<infer D> }
    ? {
        readonly machine: Machine<D>;
        // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an entry with no context wires no slot by default
        readonly context?: E extends { readonly context: infer X }
          ? string extends keyof X
            ? Readonly<Record<string, ActorRef>>
            : ContextRefs<Parts<D>["Slots"]> & {
                readonly [P in Exclude<keyof X, keyof Parts<D>["Slots"]>]: never;
              }
          : ContextRefs<Parts<D>["Slots"]>;
      } & { readonly [P in Exclude<keyof E, "machine" | "context">]: never }
    : never;

/**
 * An app's entries as `app` checks them.
 */
export type CheckedEntries<M> = { readonly [K in keyof M]: CheckedEntry<M[K]> };
