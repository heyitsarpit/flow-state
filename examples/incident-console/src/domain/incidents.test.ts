import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  IncidentCommand,
  applyIncidentPatch,
  decideIncidentCommand,
  statusValues,
  type Incident,
} from "./incidents";

const incident = (status: Incident["status"]): Incident => ({
  id: "INC-001",
  title: "Test incident",
  description: "Test",
  service: "api",
  severity: "high",
  status,
  assignee: null,
  version: 4,
  updatedAt: "2026-07-15T08:00:00.000Z",
});

describe("incident command policy", () => {
  it("owns every status transition and its accepted patch", () => {
    const accepted = new Set([
      "open->acknowledged",
      "open->resolved",
      "acknowledged->resolved",
      "resolved->open",
    ]);
    for (const current of statusValues) {
      for (const target of statusValues) {
        const decision = decideIncidentCommand(
          incident(current),
          IncidentCommand.changeStatus(target),
        );
        expect(Result.isSuccess(decision)).toBe(accepted.has(`${current}->${target}`));
        if (Result.isSuccess(decision)) {
          expect(decision.success).toEqual({ expectedVersion: 4, status: target });
          expect(applyIncidentPatch(incident(current), decision.success).status).toBe(target);
        } else {
          expect(decision.failure.message.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("accepts assignments through one patch owner", () => {
    const assigned = decideIncidentCommand(incident("open"), IncidentCommand.assign("Avery"));
    expect(assigned).toEqual(Result.succeed({ expectedVersion: 4, assignee: "Avery" }));

    expect(decideIncidentCommand(incident("open"), IncidentCommand.assign(null))).toEqual(
      Result.succeed({ expectedVersion: 4, assignee: null }),
    );
  });
});

