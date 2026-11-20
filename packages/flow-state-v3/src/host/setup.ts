import type { Layer } from "effect";
import { flowError, flowErrorOf } from "../error.ts";
import type { RequirementsOf } from "../contract.ts";
import type { Machine } from "../definition.ts";
import type { ActorRef } from "./refs.ts";
import type { Store, StoreScope } from "./store.ts";

/**
 * One machine an app runs: the machine, or the machine with the default wiring of its context
 * slots, each to the ref of the actor that provides it.
 */
export type AppEntry =
  | Machine
  | {
      readonly machine: Machine;
      // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: an entry with no context wires no slot by default
      readonly context?: Readonly<Record<string, ActorRef>>;
    };

/**
 * The machine of an app entry.
 */
export type MachineOf<E> = E extends { readonly machine: infer M extends Machine } ? M : E;

/**
 * The machine of an app entry.
 */
export const machineOf = (entry: AppEntry) => ("machine" in entry ? entry.machine : entry);

/**
 * An app: every machine a Runtime may run, by key.
 */
export type App<M extends Readonly<Record<string, AppEntry>> = Readonly<Record<string, AppEntry>>> =
  {
    readonly id: string;
    readonly machines: M;
  };

/**
 * The services an app's contracts require: what its setup's services Layer, or a Story's fixtures,
 * must provide.
 */
export type ServicesOf<A extends App> = {
  readonly [K in keyof A["machines"]]: RequirementsOf<
    MachineOf<A["machines"][K]>["definition"]["operations"]
  >;
}[keyof A["machines"]];

/**
 * The definitions an app runs: its machines' definitions, as a union.
 */
export type DefsOf<A extends App> = MachineOf<A["machines"][keyof A["machines"]]>["definition"];

/**
 * The Runtime's construction options.
 */
export type RuntimeConfig = {
  readonly app: App;
  // FLOW_STATE_ALLOW_UNKNOWN: a services Layer may fail with its own error; the boot reports it as a Defect.
  readonly services?: Layer.Layer<never, unknown, StoreScope>;
  readonly scope?: string;
  readonly persistence?: { readonly captureMs?: number };
};

/**
 * A setup's services Layer: it provides `R`, and may read the `StoreScope` the Runtime gives while
 * it builds them.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a services Layer may fail with its own error; the boot reports it as a Defect.
export type ServicesLayer<R> = Layer.Layer<R, unknown, StoreScope>;

// The services a setup that saves nothing must provide: every service the app's contracts list,
// and no Layer at all when they list none.
type ServicesFor<R> = [R] extends [never]
  ? { readonly services?: ServicesLayer<never> }
  : { readonly services: ServicesLayer<R> };

/**
 * What `runtimeSetup` takes: the services Layer must provide every service the app's contracts
 * list, unless they list none. Saving takes a scope and persistence together, since either alone
 * saves nothing, and then the services must provide the `Store` too.
 */
export type SetupConfig<A extends App> = { readonly app: A } & (
  | ({ readonly scope?: never; readonly persistence?: never } & ServicesFor<ServicesOf<A>>)
  | {
      readonly scope: string;
      readonly persistence: { readonly captureMs?: number };
      readonly services: ServicesLayer<ServicesOf<A> | Store>;
    }
);

/**
 * The boot's error for a services Layer that failed to build, keeping its cause.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a services Layer may fail with its own error; the boot reports it as a Defect.
export const servicesFailed = (cause: unknown) =>
  flowErrorOf(
    [
      {
        code: "Defect",
        path: ["services"],
        summary: "the services Layer failed to build",
        help: "Fix the failing service; its cause is on this error.",
      },
    ],
    cause,
  );

/**
 * The boot's error for a persisted setup whose services provide no Store.
 */
export const noStore = flowError([
  {
    code: "StorageFailure",
    path: ["services"],
    summary: "persistence is on, but the services provide no Store",
    help: "Provide a Store Layer in the setup's services, such as layerIndexedDb() from flow-state/persistence.",
  },
]);
