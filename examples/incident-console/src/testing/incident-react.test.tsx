// @vitest-environment happy-dom

import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { Effect } from "effect";

import { FlowProvider, useActor, useResource, useView } from "flow-state/react";

import { incidentConsoleMachine } from "../features/incidents/machine";
import { incidentDetailResource, incidentListResource } from "../features/incidents/resources";
import { incidentConsoleView } from "../features/incidents/view";
import { IncidentEvents } from "../features/incidents/vocabulary";
import { useOwnedFlowRuntime } from "../ui/useOwnedFlowRuntime";
import { fixtureIncident, fixturePage } from "./fixtures";
import { createIncidentTestRuntime, fixtureIncidentApi } from "./test-runtime";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Consumer({ label }: Readonly<{ readonly label: string }>) {
  const actor = useActor(incidentConsoleMachine, { id: "shared-incident-console" });
  const selection = useView(actor, incidentConsoleView);
  const detail = useResource(incidentDetailResource.ref(fixtureIncident.id));
  return (
    <section data-testid={label}>
      <span>{`${label}:${selection.screen}:v${detail?.value?.version ?? "none"}`}</span>
      <button type="button" onClick={() => actor.send(IncidentEvents.open(fixtureIncident.id))}>
        Open
      </button>
    </section>
  );
}

describe("incident console React ownership", () => {
  for (const survivor of ["first", "second"] as const) {
    it(`shares one demand across Strict Mode consumers when ${survivor} unmounts last`, async () => {
      let detailCalls = 0;
      const runtime = createIncidentTestRuntime(
        fixtureIncidentApi({
          detail: () => {
            detailCalls += 1;
            return Effect.succeed(fixtureIncident);
          },
        }),
      );
      runtime.resources.seedResources([{ ref: incidentListResource.ref({}), value: fixturePage }]);
      const container = document.createElement("div");
      const root = createRoot(container);

      const render = async (first: boolean, second: boolean) => {
        await act(async () => {
          root.render(
            <StrictMode>
              <FlowProvider runtime={runtime}>
                {first ? <Consumer label="first" /> : null}
                {second ? <Consumer label="second" /> : null}
              </FlowProvider>
            </StrictMode>,
          );
        });
      };

      try {
        await render(true, true);
        const actor = runtime.orchestrators.get("shared-incident-console");
        expect(actor).toBeDefined();
        expect(container.textContent).toContain("first:queue");
        expect(container.textContent).toContain("second:queue");

        const open = container.querySelector<HTMLButtonElement>("button");
        await act(async () => open?.click());
        await act(async () => actor?.flush());
        expect(container.textContent).toContain("first:detail:v1");
        expect(container.textContent).toContain("second:detail:v1");
        expect(detailCalls).toBe(1);

        await render(survivor === "first", survivor === "second");
        expect(runtime.orchestrators.get("shared-incident-console")).toBe(actor);
        await act(async () => {
          runtime.resources.patch(incidentDetailResource.ref(fixtureIncident.id), (current) => ({
            ...(current ?? fixtureIncident),
            version: 3,
          }));
        });
        expect(container.textContent).toContain(`${survivor}:detail:v3`);

        await act(async () => root.unmount());
        await act(async () => Promise.resolve());
        expect(runtime.orchestrators.get("shared-incident-console")).toBeNull();
      } finally {
        await runtime.dispose();
        document.body.innerHTML = "";
      }
    });
  }
});

describe("owned runtime lifecycle", () => {
  it("creates and disposes each Strict Mode generation exactly once", async () => {
    let creations = 0;
    let disposals = 0;
    let closeNotifications = 0;
    const createRuntime = () => {
      creations += 1;
      return {
        dispose: async () => {
          disposals += 1;
        },
      };
    };
    const Owned = () => {
      const owned = useOwnedFlowRuntime(createRuntime, () => {
        closeNotifications += 1;
      });
      return owned.state.status === "ready" ? (
        <button type="button" onClick={owned.close}>
          Close
        </button>
      ) : (
        <span>{owned.state.status}</span>
      );
    };
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <StrictMode>
          <Owned />
        </StrictMode>,
      ),
    );
    expect(creations).toBe(1);
    const close = container.querySelector<HTMLButtonElement>("button");
    await act(async () => close?.click());
    await act(async () => Promise.resolve());
    expect(disposals).toBe(1);
    expect(closeNotifications).toBe(1);

    await act(async () => root.unmount());
    await act(async () => Promise.resolve());
    expect(disposals).toBe(1);
  });

  it("contains startup failure without attempting disposal", async () => {
    const createRuntime = (): Readonly<{ readonly dispose: () => Promise<void> }> => {
      throw new Error("startup failed");
    };
    const Owned = () => {
      const owned = useOwnedFlowRuntime(createRuntime, () => undefined);
      return (
        <span>{owned.state.status === "failure" ? owned.state.message : owned.state.status}</span>
      );
    };
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () =>
      root.render(
        <StrictMode>
          <Owned />
        </StrictMode>,
      ),
    );
    expect(container.textContent).toBe("startup failed");
    await act(async () => root.unmount());
  });
});
