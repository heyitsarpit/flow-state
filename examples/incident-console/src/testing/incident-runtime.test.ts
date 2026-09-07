import { Deferred, Effect, Option, Stream } from "effect";
import { TestClock } from "effect/testing";
import { FastCheck } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { selectView } from "flow-state";
import { graphOf, whyNoTransition } from "flow-state/inspect";
import { runFlowScenario, test } from "flow-state/testing";

import { IncidentApp } from "../app/app";
import { incidentStories } from "../app/behavior";
import type { Incident } from "../domain/incidents";
import { incidentConsoleMachine } from "../features/incidents/machine";
import { incidentDetailResource, incidentListResource } from "../features/incidents/resources";
import { runbookMachine } from "../features/incidents/runbook";
import { incidentConsoleView } from "../features/incidents/view";
import { IncidentEvents } from "../features/incidents/vocabulary";
import { HttpFailure, isRetryable, type TimelineSignal } from "../services/incident-api";
import { fixtureIncident, fixturePage, fixtureRunbook, fixtureTimelineEvent } from "./fixtures";
import { createIncidentTestRuntime, fixtureIncidentApi, incidentApiLayer } from "./test-runtime";

describe("incident console runtime", () => {
  it("runs cached navigation, an optimistic mutation, timeline delivery, and owner cleanup", async () => {
    let timelineFinalizations = 0;
    const patchStarted = Effect.runSync(Deferred.make<void>());
    const patchGate = Effect.runSync(Deferred.make<Incident>());
    let currentIncident = fixtureIncident;
    const runtime = createIncidentTestRuntime(
      fixtureIncidentApi({
        list: () => Effect.sync(() => ({ incidents: [currentIncident], nextCursor: null })),
        detail: () => Effect.sync(() => currentIncident),
        patch: () =>
          Deferred.succeed(patchStarted, undefined).pipe(
            Effect.andThen(Deferred.await(patchGate)),
            Effect.tap((incident) => Effect.sync(() => void (currentIncident = incident))),
          ),
        timeline: () =>
          Stream.fromIterable<TimelineSignal>([
            { type: "connected" },
            { type: "event", event: fixtureTimelineEvent },
          ]).pipe(
            Stream.concat(Stream.never),
            Stream.ensuring(Effect.sync(() => void (timelineFinalizations += 1))),
          ),
      }),
    );
    const actor = runtime.orchestrators.start(incidentConsoleMachine);

    try {
      await actor.flush();
      actor.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id });
      await actor.flush();
      expect(selectView(actor.getSnapshot(), incidentConsoleView)).toMatchObject({
        screen: "detail",
        incident: { id: fixtureIncident.id, assignee: null },
      });

      await actor.flush();
      expect(selectView(actor.getSnapshot(), incidentConsoleView)).toMatchObject({
        timelineConnection: "live",
        timeline: [{ id: fixtureTimelineEvent.id }],
      });

      actor.send({ type: "ASSIGN", assignee: "Avery" });
      await Effect.runPromise(Deferred.await(patchStarted));
      expect(
        runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value,
      ).toMatchObject({
        assignee: "Avery",
        version: 1,
      });

      Effect.runSync(
        Deferred.succeed(patchGate, { ...fixtureIncident, assignee: "Avery", version: 2 }),
      );
      await actor.flush();
      expect(
        runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value,
      ).toMatchObject({
        assignee: "Avery",
        version: 2,
      });
      expect(actor.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "transaction:preview-patch", id: "incidents.mutate" }),
          expect.objectContaining({ type: "transaction:success", id: "incidents.mutate" }),
        ]),
      );

      actor.send({ type: "BACK_TO_QUEUE" });
      await actor.flush();
      expect(timelineFinalizations).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  it("rolls a real transaction failure back and exposes the authoritative conflict", async () => {
    const authoritative: Incident = {
      ...fixtureIncident,
      assignee: "Jordan",
      version: 2,
    };
    const conflict = new HttpFailure({
      status: 409,
      message: "Incident version changed",
      error: {
        code: "version_conflict",
        message: "Incident version changed",
        current: authoritative,
      },
    });
    const runtime = createIncidentTestRuntime(
      fixtureIncidentApi({ patch: () => Effect.fail(conflict) }),
    );
    const actor = runtime.orchestrators.start(incidentConsoleMachine);

    try {
      await actor.flush();
      actor.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id });
      await actor.flush();
      actor.send({ type: "ASSIGN", assignee: "Avery" });
      await actor.flush();

      expect(runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value).toEqual(
        fixtureIncident,
      );
      expect(selectView(actor.getSnapshot(), incidentConsoleView)).toMatchObject({
        conflict: authoritative,
        mutationPending: false,
      });
      expect(actor.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "transaction:rollback", id: "incidents.mutate" }),
        ]),
      );
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects a repeated mutation without a second external write or preview", async () => {
    const patchStarted = Effect.runSync(Deferred.make<void>());
    const patchGate = Effect.runSync(Deferred.make<Incident>());
    let patchCalls = 0;
    const runtime = createIncidentTestRuntime(
      fixtureIncidentApi({
        patch: () => {
          patchCalls += 1;
          return Deferred.succeed(patchStarted, undefined).pipe(
            Effect.andThen(Deferred.await(patchGate)),
          );
        },
      }),
    );
    const actor = runtime.orchestrators.start(incidentConsoleMachine);

    try {
      await actor.flush();
      actor.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id });
      await actor.flush();
      actor.send({ type: "ASSIGN", assignee: "Avery" });
      await Effect.runPromise(Deferred.await(patchStarted));
      actor.send({ type: "ASSIGN", assignee: "Riley" });
      expect(patchCalls).toBe(1);
      expect(
        runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value,
      ).toMatchObject({
        assignee: "Avery",
      });
      expect(actor.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "transaction:reject",
            id: "incidents.mutate",
            overlapCause: "reject-while-running",
          }),
        ]),
      );
      Effect.runSync(
        Deferred.succeed(patchGate, { ...fixtureIncident, assignee: "Avery", version: 2 }),
      );
      await actor.flush();
      expect(patchCalls).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  it("lets an actor-owned mutation complete after navigation without routing feedback to the queue", async () => {
    const patchStarted = Effect.runSync(Deferred.make<void>());
    const patchGate = Effect.runSync(Deferred.make<Incident>());
    let patchFinalizations = 0;
    let currentIncident = fixtureIncident;
    const runtime = createIncidentTestRuntime(
      fixtureIncidentApi({
        list: () => Effect.sync(() => ({ incidents: [currentIncident], nextCursor: null })),
        detail: () => Effect.sync(() => currentIncident),
        patch: () =>
          Effect.scoped(
            Effect.acquireRelease(Deferred.succeed(patchStarted, undefined), () =>
              Effect.sync(() => void (patchFinalizations += 1)),
            ).pipe(
              Effect.andThen(Deferred.await(patchGate)),
              Effect.tap((incident) => Effect.sync(() => void (currentIncident = incident))),
            ),
          ),
      }),
    );
    const actor = runtime.orchestrators.start(incidentConsoleMachine);

    try {
      await actor.flush();
      actor.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id });
      await actor.flush();
      actor.send({ type: "ASSIGN", assignee: "Avery" });
      await Effect.runPromise(Deferred.await(patchStarted));
      expect(
        runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value,
      ).toMatchObject({
        assignee: "Avery",
      });

      actor.send({ type: "BACK_TO_QUEUE" });
      await actor.flush();
      expect(
        runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value,
      ).toMatchObject({
        assignee: "Avery",
        version: 1,
      });
      expect(patchFinalizations).toBe(0);

      Effect.runSync(
        Deferred.succeed(patchGate, { ...fixtureIncident, assignee: "Avery", version: 2 }),
      );
      await actor.flush();
      expect(actor.getSnapshot().value).toBe("queue");
      expect(
        runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value,
      ).toMatchObject({
        assignee: "Avery",
        version: 1,
      });
      expect(runtime.resources.get(incidentListResource.ref({}))).toMatchObject({
        freshness: "invalidated",
        value: { incidents: [{ assignee: "Avery", version: 1 }] },
      });
      expect(selectView(actor.getSnapshot(), incidentConsoleView).notification).toBeUndefined();
      expect(patchFinalizations).toBe(1);

      actor.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id });
      await actor.flush();
      expect(
        runtime.resources.get(incidentDetailResource.ref(fixtureIncident.id))?.value,
      ).toMatchObject({
        assignee: "Avery",
        version: 2,
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("polls the typed runbook child on TestClock and finalizes its remote lease", async () => {
    let runbookReads = 0;
    let cancellations = 0;
    const runtime = createIncidentTestRuntime(
      fixtureIncidentApi({
        getRunbook: () => {
          runbookReads += 1;
          return Effect.succeed(fixtureRunbook(runbookReads === 1 ? "running" : "succeeded"));
        },
        cancelRunbook: () => {
          cancellations += 1;
          return Effect.succeed(fixtureRunbook("succeeded"));
        },
      }),
    );
    const actor = runtime.orchestrators.start(incidentConsoleMachine);

    try {
      await actor.flush();
      actor.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id });
      await actor.flush();
      actor.send({ type: "START_RUNBOOK" });
      await actor.flush();
      expect(actor.getSnapshot().value).toBe("runbook");
      expect(actor.getSnapshot().children["incidents.runbook"]).toBeDefined();

      await runtime.runPromise(TestClock.adjust("150 millis"));
      await actor.flush();
      expect(actor.getSnapshot().value).toBe("detail");
      expect(selectView(actor.getSnapshot(), incidentConsoleView).notification?.message).toBe(
        "Runbook succeeded",
      );
      expect(runbookReads).toBe(2);
      expect(cancellations).toBe(1);
    } finally {
      await runtime.dispose();
    }
  });

  it("interrupts pending request and stream work exactly once during runtime disposal", async () => {
    const listStarted = Effect.runSync(Deferred.make<void>());
    const listGate = Effect.runSync(Deferred.make<typeof fixturePage>());
    let requestFinalizations = 0;
    const runtime = createIncidentTestRuntime(
      fixtureIncidentApi({
        list: () =>
          Effect.scoped(
            Effect.acquireRelease(Deferred.succeed(listStarted, undefined), () =>
              Effect.sync(() => void (requestFinalizations += 1)),
            ).pipe(Effect.andThen(Deferred.await(listGate))),
          ),
      }),
    );
    runtime.orchestrators.start(incidentConsoleMachine);
    await Effect.runPromise(Deferred.await(listStarted));

    await runtime.dispose();
    expect(requestFinalizations).toBe(1);
  });

  it("cancels and restores the one-shot runbook 503 retry at its exact deadline", async () => {
    let runbookReads = 0;
    const unavailable = new HttpFailure({
      status: 503,
      message: "Runbook temporarily unavailable",
      error: { code: "unavailable", message: "Runbook temporarily unavailable" },
    });
    expect(isRetryable(unavailable)).toBe(true);
    const api = fixtureIncidentApi({
      getRunbook: () => {
        runbookReads += 1;
        return Effect.succeed(fixtureRunbook("succeeded"));
      },
    });
    const layer = incidentApiLayer(api);
    const path = graphOf(runbookMachine).pathFromEvents([
      { type: "RUNBOOK_LOAD_FAILED", error: unavailable },
    ]);
    if (path === undefined) throw new Error("expected runbook retry path");
    const source = test
      .model(runbookMachine, {
        input: {
          incidentId: Option.some(fixtureIncident.id),
          runId: Option.some("run-1"),
        },
      })
      .replay(path);
    expect(source.state()).toBe("retrying");
    expect(source.getSnapshot().timers["incidents.runbook-retry"]).toMatchObject({
      status: "scheduled",
    });
    await source.advance("150 millis");
    const snapshot = source.getSnapshot();
    expect(runbookReads).toBe(0);

    const restored = test.app(IncidentApp).rehydrate(runbookMachine, {
      snapshot,
      provide: layer,
    });
    try {
      await restored.advance("150 millis");
      await restored.advance("149 millis");
      expect(runbookReads).toBe(0);
      await restored.advance("1 millis");
      await restored.flush();
      expect(restored.state()).toBe("succeeded");
      expect(runbookReads).toBe(1);
      expect(restored.pendingWork()).toMatchObject({
        ready: 0,
        activeFibers: 0,
        timers: [],
        streams: [],
        transactions: [],
        children: [],
      });
    } finally {
      await restored.dispose();
    }
  });
});

describe("incident console public testing facade", () => {
  it("does not let an old dismissal clear a newer notification", () => {
    const resources = [
      { ref: incidentListResource.ref({}), value: fixturePage },
      { ref: incidentDetailResource.ref(fixtureIncident.id), value: fixtureIncident },
    ];
    const harness = test
      .app(IncidentApp)
      .scenario(incidentConsoleMachine)
      .with({ resources, provide: incidentApiLayer(fixtureIncidentApi()) })
      .run([IncidentEvents.open(fixtureIncident.id)]);

    harness.send(IncidentEvents.mutationSucceeded({ ...fixtureIncident, version: 2 }));
    const first = selectView(harness.getSnapshot(), incidentConsoleView).notification;
    harness.send(IncidentEvents.mutationSucceeded({ ...fixtureIncident, version: 3 }));
    const second = selectView(harness.getSnapshot(), incidentConsoleView).notification;
    if (first === undefined || second === undefined) throw new Error("expected notifications");

    harness.send(IncidentEvents.dismissNotification(first.id));
    expect(selectView(harness.getSnapshot(), incidentConsoleView).notification?.id).toBe(second.id);
    harness.send(IncidentEvents.dismissNotification(second.id));
    expect(selectView(harness.getSnapshot(), incidentConsoleView).notification).toBeUndefined();
  });

  it("shares seeded production resources across scenario and model projection", () => {
    const resources = [
      { ref: incidentListResource.ref({}), value: fixturePage },
      { ref: incidentDetailResource.ref(fixtureIncident.id), value: fixtureIncident },
    ];
    const harness = test
      .app(IncidentApp)
      .scenario(incidentConsoleMachine)
      .with({ resources, provide: incidentApiLayer(fixtureIncidentApi()) })
      .run([{ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id }]);
    expect(harness.state()).toBe("detail");
    expect(selectView(harness.getSnapshot(), incidentConsoleView).incident).toEqual(
      fixtureIncident,
    );

    const path = graphOf(incidentConsoleMachine).pathFromEvents([
      { type: "SET_SERVICE_FILTER", value: "api" },
      { type: "CLEAR_FILTERS" },
    ]);
    if (path === undefined) throw new Error("expected queue filter path");
    const replay = test
      .app(IncidentApp)
      .model(incidentConsoleMachine, undefined, { resources })
      .replay(path);
    expect(replay.state()).toBe("queue");
    expect(replay.context().filters.service).toBe("all");
    expect(harness.can({ type: "CHANGE_STATUS", status: "resolved" })).toBe(true);

    const queueHarness = test
      .app(IncidentApp)
      .scenario(incidentConsoleMachine)
      .with({ resources, provide: incidentApiLayer(fixtureIncidentApi()) })
      .run();
    const rejected = { type: "CHANGE_STATUS" as const, status: "resolved" as const };
    expect(queueHarness.can(rejected)).toBe(false);
    expect(
      whyNoTransition(incidentConsoleMachine, queueHarness.getSnapshot(), rejected),
    ).toMatchObject({
      reason: "ignored-in-state",
    });
  });

  it("deduplicates timeline replay and reports numeric and retention gaps", () => {
    const resources = [
      { ref: incidentListResource.ref({}), value: fixturePage },
      { ref: incidentDetailResource.ref(fixtureIncident.id), value: fixtureIncident },
    ];
    const harness = test
      .app(IncidentApp)
      .scenario(incidentConsoleMachine)
      .with({ resources, provide: incidentApiLayer(fixtureIncidentApi()) })
      .run([{ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id }]);
    const event = (sequence: number) => ({
      ...fixtureTimelineEvent,
      id: `evt-${sequence}`,
      message: `Event ${sequence}`,
    });

    harness.send({ type: "TIMELINE_EVENT", event: event(1) });
    harness.send({ type: "TIMELINE_EVENT", event: event(1) });
    for (let sequence = 3; sequence <= 108; sequence += 1) {
      harness.send({ type: "TIMELINE_EVENT", event: event(sequence) });
    }

    const selection = selectView(harness.getSnapshot(), incidentConsoleView);
    expect(selection.timelineGap).toBe(true);
    expect(selection.timeline).toHaveLength(100);
    expect(selection.timeline.at(-1)?.id).toBe("evt-108");
    expect(selection.timeline.filter(({ id }) => id === "evt-1")).toHaveLength(0);
  });

  it("keeps browse, conflict, and runbook facts aligned with the direct runtime", async () => {
    const authoritative = { ...fixtureIncident, assignee: "Jordan", version: 2 };
    const conflict = new HttpFailure({
      status: 409,
      message: "Incident version changed",
      error: {
        code: "version_conflict",
        message: "Incident version changed",
        current: authoritative,
      },
    });
    const api = fixtureIncidentApi({ patch: () => Effect.fail(conflict) });
    const layer = incidentApiLayer(api);
    const directRuntime = createIncidentTestRuntime(api);
    const direct = directRuntime.orchestrators.start(incidentConsoleMachine);
    const harness = test
      .app(IncidentApp)
      .scenario(incidentConsoleMachine)
      .with({ provide: layer })
      .run();
    const drive = async (target: {
      send: (event: Parameters<typeof direct.send>[0]) => unknown;
      flush: () => Promise<void>;
    }) => {
      await target.flush();
      target.send({ type: "OPEN_INCIDENT", incidentId: fixtureIncident.id });
      await target.flush();
      target.send({ type: "ASSIGN", assignee: "Avery" });
      await target.flush();
      target.send({ type: "START_RUNBOOK" });
      await target.flush();
    };

    try {
      await drive(direct);
      await drive(harness);
      const directView = selectView(direct.getSnapshot(), incidentConsoleView);
      const harnessView = selectView(harness.getSnapshot(), incidentConsoleView);
      expect(harnessView).toMatchObject({
        state: directView.state,
        screen: directView.screen,
        incident: directView.incident,
        conflict: directView.conflict,
        notification: directView.notification,
        actionFailure: directView.actionFailure,
      });
      const receiptFacts = (
        receipts: ReadonlyArray<{ readonly type: string; readonly id?: string }>,
      ) => receipts.map(({ type, id }) => ({ type, id: type === "actor:start" ? undefined : id }));
      expect(receiptFacts(harness.receipts())).toEqual(receiptFacts(direct.receipts()));
      const issueFacts = (issues: ReturnType<typeof direct.issues>) =>
        issues.map(({ kind, source, id, handled, facts }) => ({
          kind,
          source,
          id,
          handled,
          parentState: facts?.parentState,
          receiptTypes: facts?.receiptTypes,
        }));
      expect(issueFacts(harness.issues())).toEqual(issueFacts(direct.issues()));
      expect(harness.issues()[0]?.error).toMatchObject({
        _tag: "HttpFailure",
        status: 409,
      });
      expect(harness.pendingWork()).toMatchObject({
        ready: 0,
        activeFibers: 1,
        timers: [],
        streams: ["incidents.timeline"],
        transactions: [],
        children: [],
      });
    } finally {
      await directRuntime.dispose();
    }
  });

  it("executes every production queue story deterministically", async () => {
    for (const story of incidentStories.stories) {
      const first = await runFlowScenario(incidentConsoleMachine, story);
      const second = await runFlowScenario(incidentConsoleMachine, story);
      expect(first).toMatchObject({ kind: "story-run", status: "success" });
      expect(second).toEqual(first);
    }
  });

  it("keeps model filter projection aligned for generated event sequences", () => {
    const eventArbitrary = FastCheck.constantFrom(
      { type: "SET_SERVICE_FILTER" as const, value: "api" as const },
      { type: "SET_SERVICE_FILTER" as const, value: "billing" as const },
      { type: "SET_STATUS_FILTER" as const, value: "open" as const },
      { type: "SET_STATUS_FILTER" as const, value: "resolved" as const },
      { type: "CLEAR_FILTERS" as const },
    );
    const resources = [{ ref: incidentListResource.ref({}), value: fixturePage }];

    FastCheck.assert(
      FastCheck.property(FastCheck.array(eventArbitrary, { maxLength: 20 }), (events) => {
        const path = graphOf(incidentConsoleMachine).pathFromEvents(events);
        if (path === undefined) throw new Error("expected generated queue path");
        const replay = test
          .app(IncidentApp)
          .model(incidentConsoleMachine, undefined, { resources })
          .replay(path);
        const expected = events.reduce(
          (filters, event) =>
            event.type === "CLEAR_FILTERS"
              ? { service: "all" as const, status: "all" as const }
              : event.type === "SET_SERVICE_FILTER"
                ? { ...filters, service: event.value }
                : { ...filters, status: event.value },
          {
            service: "all" as "all" | "api" | "billing",
            status: "all" as "all" | "open" | "resolved",
          },
        );
        expect(replay.context().filters).toMatchObject(expected);
      }),
      { numRuns: 50 },
    );
  });
});

