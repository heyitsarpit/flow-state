import { describe, expect, it } from "vite-plus/test";

import { IncidentStore } from "./store";

describe("incident API store", () => {
  it("returns stable cursor pages without looping past the final cursor", () => {
    const store = new IncidentStore();

    const first = store.list({});
    if (first.nextCursor === null) throw new Error("expected a second page");
    const second = store.list({ cursor: first.nextCursor });
    if (second.nextCursor === null) throw new Error("expected a third page");
    const third = store.list({ cursor: second.nextCursor });
    const finalIncident = third.incidents.at(-1);
    if (finalIncident === undefined) throw new Error("expected a final incident");
    const exhausted = store.list({ cursor: finalIncident.id });

    expect(first.incidents).toHaveLength(5);
    expect(second.incidents).toHaveLength(5);
    expect(third.incidents).toHaveLength(5);
    expect(
      new Set([...first.incidents, ...second.incidents, ...third.incidents].map(({ id }) => id))
        .size,
    ).toBe(15);
    expect(third.nextCursor).toBeNull();
    expect(exhausted).toEqual({
      incidents: [],
      nextCursor: null,
    });

    store.cancelAllRunbooks();
  });

  it("filters the queue and enforces optimistic versions", () => {
    const store = new IncidentStore();
    const filtered = store.list({ service: "api", severity: "critical", status: "open" });
    const incident = filtered.incidents[0];

    expect(incident).toBeDefined();
    if (incident === undefined) return;

    const committed = store.patch(incident.id, {
      expectedVersion: incident.version,
      assignee: "Avery",
    });
    const stale = store.patch(incident.id, {
      expectedVersion: incident.version,
      status: "acknowledged",
    });

    expect(committed).toMatchObject({
      kind: "success",
      incident: { assignee: "Avery", version: incident.version + 1 },
    });
    expect(stale).toMatchObject({
      kind: "conflict",
      current: { assignee: "Avery", version: incident.version + 1 },
    });

    store.cancelAllRunbooks();
  });

  it("resets runbook identity and resolves a deterministic cancellation race", () => {
    const store = new IncidentStore();
    const first = store.startRunbook("INC-001");

    expect(first).toMatchObject({ id: "run-1", status: "queued" });
    if (first === undefined) return;

    store.arm("runbook-cancel-race");
    expect(store.cancelRunbook(first.id)).toMatchObject({ status: "succeeded" });

    store.reset("normal");
    expect(store.getRunbook(first.id)).toBeUndefined();
    expect(store.startRunbook("INC-001")).toMatchObject({ id: "run-1", status: "queued" });

    store.cancelAllRunbooks();
  });

  it("uses incident-local event sequences and creates a visible bounded-burst gap", async () => {
    const store = new IncidentStore();
    expect(store.events("INC-001").map(({ id }) => id)).toEqual(["evt-1"]);
    expect(store.events("INC-002").map(({ id }) => id)).toEqual(["evt-1"]);

    expect(await store.burstTimeline("INC-001", 12)).toBe(12);
    const ids = store.events("INC-001").map(({ id }) => id);
    expect(ids).toContain("evt-9");
    expect(ids).not.toContain("evt-10");
    expect(ids.at(-1)).toBe("evt-14");
  });

  it("rejects malformed and unsafe timeline cursors before replay", () => {
    const store = new IncidentStore();

    expect(() => store.events("INC-001", "other-1")).toThrow("evt-N");
    expect(() => store.events("INC-001", "evt-9007199254740992")).toThrow("safe range");
    expect(store.events("INC-001", "evt-0")).toHaveLength(1);
  });

  it("keeps cursor traversal stable when a row disappears between pages", () => {
    const store = new IncidentStore();
    const first = store.list({});
    if (first.nextCursor === null) throw new Error("expected a second page");
    store.remove("INC-006");
    const second = store.list({ cursor: first.nextCursor });
    const ids = [...first.incidents, ...second.incidents].map(({ id }) => id);
    expect(second.incidents[0]?.id).toBe("INC-007");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
