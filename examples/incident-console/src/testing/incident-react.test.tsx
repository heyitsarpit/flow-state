// @vitest-environment happy-dom

import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { Effect } from "effect";

import { FlowProvider, useActor, useResource, useView } from "flow-state/react";

import { incidentConsoleMachine } from "../features/incidents/machine";
import { incidentDetailResource, incidentListResource } from "../features/incidents/resources";
import { incidentConsoleView } from "../features/incidents/view";
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
      <button
        type="button"
        onClick={() => actor.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id })}
      >
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
