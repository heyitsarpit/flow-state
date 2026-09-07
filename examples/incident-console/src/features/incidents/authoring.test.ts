import { describe, expect, it } from "vite-plus/test";

import { capabilitiesFor } from "./capabilities";
import { incidentConsoleMachine } from "./machine";
import { IncidentStates, type IncidentConsoleState } from "./vocabulary";

const states = Object.values(IncidentStates);
const accepts = (state: IncidentConsoleState, event: string) =>
  Object.hasOwn(incidentConsoleMachine.config.states[state]?.on ?? {}, event);

describe("incident console authoring conventions", () => {
  it("keeps visible capabilities aligned with accepted events", () => {
    for (const state of states) {
      const capabilities = capabilitiesFor(state);
      expect(accepts(state, "BACK_TO_QUEUE")).toBe(capabilities.back);
      expect(accepts(state, "REFRESH_QUEUE")).toBe(capabilities.refreshQueue);
      expect(accepts(state, "REFRESH_DETAIL")).toBe(capabilities.refreshDetail);
      expect(accepts(state, "START_RUNBOOK")).toBe(capabilities.startRunbook);
      expect(accepts(state, "CANCEL_RUNBOOK")).toBe(capabilities.cancelRunbook);
      expect(accepts(state, "REPLACE_RUNBOOK")).toBe(capabilities.replaceRunbook);
      expect(accepts(state, "OPEN_INCIDENT")).toBe(capabilities.openIncident);
    }
  });

  it("gives every detail owner the complete navigation and timeline protocol", () => {
    const detailStates = states.filter((state) => state !== IncidentStates.queue);
    for (const state of detailStates) {
      for (const event of [
        "BACK_TO_QUEUE",
        "OPEN_INCIDENT",
        "TIMELINE_CONNECTED",
        "TIMELINE_RECONNECTING",
        "TIMELINE_EVENT",
        "TIMELINE_FAILED",
      ]) {
        expect(accepts(state, event)).toBe(true);
      }
    }
  });
});

