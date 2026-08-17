import type * as flow from "flow-state";
import type { IntentFilters } from "./domain";
import {
  EverclearExampleApp,
  EverclearIntentsRef,
  EverclearNewIntentRef,
  EverclearWalletRef,
} from "./app";
import { Intents, NewIntent } from "./machines";
import type { UrlIntentInput } from "./machines/new-intent.machine";

type EverclearRuntime = flow.Runtime<typeof EverclearExampleApp>;
type RouteHostLease = ReturnType<EverclearRuntime["ensureActor"]>;
type RouteHostActor = ReturnType<EverclearRuntime["getActor"]>;
type RouteHostLeases = Readonly<{
  wallet: RouteHostLease;
  newIntent: RouteHostLease;
  intents: RouteHostLease;
}>;
type RouteHostActors = Readonly<{
  wallet: RouteHostActor;
  newIntent: RouteHostActor;
  intents: RouteHostActor;
}>;
type RouteHostSnapshots = Readonly<{
  wallet: ReturnType<RouteHostActor["getSnapshot"]>;
  newIntent: ReturnType<RouteHostActor["getSnapshot"]>;
  intents: ReturnType<RouteHostActor["getSnapshot"]>;
}>;

export const createEverclearRouteHost = (
  runtime: EverclearRuntime,
  initialNewIntentInput: UrlIntentInput,
) => {
  const leases: RouteHostLeases = {
    wallet: runtime.ensureActor(EverclearWalletRef, {}),
    newIntent: runtime.ensureActor(EverclearNewIntentRef, {
      input: initialNewIntentInput,
      contextBindings: { walletAccounts: EverclearWalletRef },
    }),
    intents: runtime.ensureActor(EverclearIntentsRef, {}),
  };

  // Lookup is separate from ownership. These handles are exact shared actors; neither the handles
  // nor their refs can dispose them, while this host retains the three owner leases below.
  const actors: RouteHostActors = {
    wallet: runtime.getActor(EverclearWalletRef),
    newIntent: runtime.getActor(EverclearNewIntentRef),
    intents: runtime.getActor(EverclearIntentsRef),
  };

  return {
    actors,
    showNewIntentRoute(input: UrlIntentInput): void {
      actors.intents.send(Intents.E.RouteLeft());
      actors.newIntent.send(NewIntent.E.RouteEntered(input));
    },
    showIntentsRoute(filters: IntentFilters): void {
      actors.newIntent.send(NewIntent.E.RouteLeft());
      actors.intents.send(Intents.E.RouteEntered(filters));
    },
    leaveExplorerRoutes(): void {
      actors.newIntent.send(NewIntent.E.RouteLeft());
      actors.intents.send(Intents.E.RouteLeft());
    },
    snapshots: (): RouteHostSnapshots => ({
      wallet: actors.wallet.getSnapshot(),
      newIntent: actors.newIntent.getSnapshot(),
      intents: actors.intents.getSnapshot(),
    }),
    inspection: () => runtime.inspection.snapshot(),
    dispose: async (): Promise<void> => {
      // Individual disposal is explicit and idempotent. The host releases its owners only after
      // route consumers have stopped using the handles; runtime shutdown remains the final owner.
      await leases.intents.dispose();
      await leases.newIntent.dispose();
      await leases.wallet.dispose();
    },
  };
};

export type EverclearRouteHost = ReturnType<typeof createEverclearRouteHost>;

// React's useActor performs the corresponding prepared -> active and active <-> suspended
// lifecycle for local actors. This non-React host keeps its exact shared actors active until its
// leases are disposed, while snapshots and inspection expose actor:start, actor:suspend,
// actor:resume, and actor:dispose evidence from the same production runtime.
