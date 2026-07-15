import type { ServerResponse } from "node:http";

import type {
  FaultName,
  Incident,
  IncidentEvent,
  IncidentFilters,
  IncidentPage,
  IncidentPatch,
  Runbook,
} from "../src/domain/incidents";

const pageSize = 5;

const titles = [
  "Elevated API latency",
  "Payment retries exhausted",
  "Login token verification errors",
  "Search index falling behind",
  "API error budget burn",
  "Duplicate invoice notifications",
  "Identity provider timeout",
  "Search suggestions unavailable",
  "Webhook delivery backlog",
  "Billing export delayed",
  "Session refresh failures",
  "Search shard imbalance",
  "Public API saturation",
  "Card authorization spike",
  "Account recovery email delay",
] as const;

const services = ["api", "billing", "identity", "search"] as const;
const severities = ["critical", "high", "medium", "low"] as const;
const assignees = [null, "Avery", "Jordan", "Morgan", "Riley"] as const;

const normalSeed = (): ReadonlyArray<Incident> =>
  titles.map((title, index) => ({
    id: `INC-${String(index + 1).padStart(3, "0")}`,
    title,
    description: `${title} is affecting the ${services[index % services.length]} service. Triage the current signal and follow the runbook when the impact is confirmed.`,
    service: services[index % services.length]!,
    severity: severities[index % severities.length]!,
    status: index % 5 === 0 ? "acknowledged" : index % 7 === 0 ? "resolved" : "open",
    assignee: assignees[index % assignees.length]!,
    version: 1,
    updatedAt: new Date(Date.UTC(2026, 6, 15, 8, index)).toISOString(),
  }));

type TimelineSubscriber = Readonly<{ response: ServerResponse; disconnectAfterFirst: boolean }>;

const runbookSteps = ["Confirm impact", "Drain unhealthy traffic", "Verify recovery"] as const;

export class IncidentStore {
  readonly #incidents = new Map<string, Incident>();
  readonly #events = new Map<string, Array<IncidentEvent>>();
  readonly #subscribers = new Map<string, Set<TimelineSubscriber>>();
  readonly #runbooks = new Map<string, Runbook>();
  readonly #runbookTimers = new Map<string, Set<ReturnType<typeof setTimeout>>>();
  readonly #faults = new Set<FaultName>();
  readonly #eventSequences = new Map<string, number>();
  #runbookSequence = 0;

  constructor() {
    this.reset("normal");
  }

  reset(seed: "normal" | "empty") {
    this.cancelAllRunbooks();
    this.#incidents.clear();
    this.#events.clear();
    this.#runbooks.clear();
    this.#faults.clear();
    this.#eventSequences.clear();
    this.#runbookSequence = 0;
    for (const incident of seed === "normal" ? normalSeed() : []) {
      this.#incidents.set(incident.id, incident);
      this.appendEvent(
        incident.id,
        "created",
        "Incident entered the triage queue",
        incident.version,
      );
    }
  }

  arm(fault: FaultName) {
    this.#faults.add(fault);
  }

  consume(fault: FaultName) {
    if (!this.#faults.delete(fault)) return false;
    return true;
  }

  list(filters: IncidentFilters): IncidentPage {
    const incidents = Array.from(this.#incidents.values())
      .filter((incident) => filters.service === undefined || incident.service === filters.service)
      .filter(
        (incident) => filters.severity === undefined || incident.severity === filters.severity,
      )
      .filter((incident) => filters.status === undefined || incident.status === filters.status)
      .filter(
        (incident) =>
          filters.assignee === undefined ||
          (filters.assignee === "unassigned"
            ? incident.assignee === null
            : incident.assignee === filters.assignee),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    const nextIndex =
      filters.cursor === undefined
        ? 0
        : incidents.findIndex((incident) => incident.id > filters.cursor!);
    const start = nextIndex < 0 ? incidents.length : nextIndex;
    const page = incidents.slice(start, start + pageSize);
    return {
      incidents: page,
      nextCursor:
        start + pageSize < incidents.length && page.length > 0 ? page[page.length - 1]!.id : null,
    };
  }

  get(id: string) {
    return this.#incidents.get(id);
  }

  remove(id: string) {
    this.#incidents.delete(id);
  }

  patch(
    id: string,
    patch: IncidentPatch,
  ):
    | Readonly<{ readonly kind: "success"; readonly incident: Incident }>
    | Readonly<{ readonly kind: "not-found" }>
    | Readonly<{ readonly kind: "conflict"; readonly current: Incident }> {
    const current = this.#incidents.get(id);
    if (current === undefined) return { kind: "not-found" };
    if (current.version !== patch.expectedVersion) return { kind: "conflict", current };
    const updated: Incident = {
      ...current,
      ...(patch.assignee === undefined ? {} : { assignee: patch.assignee }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.#incidents.set(id, updated);
    if (patch.assignee !== undefined) {
      this.appendEvent(
        id,
        "assignment",
        patch.assignee === null ? "Incident unassigned" : `Assigned to ${patch.assignee}`,
        updated.version,
      );
    }
    if (patch.status !== undefined) {
      this.appendEvent(id, "status", `Status changed to ${patch.status}`, updated.version);
    }
    return { kind: "success", incident: updated };
  }

  events(id: string, afterId?: string) {
    const events = this.#events.get(id) ?? [];
    if (afterId === undefined) return events;
    const match = /^evt-(0|[1-9]\d*)$/.exec(afterId);
    if (match === null) throw new Error("timeline cursor must use the evt-N format");
    const sequence = Number(match[1]);
    if (!Number.isSafeInteger(sequence)) throw new Error("timeline cursor exceeds safe range");
    return events.filter((event) => Number(event.id.replace(/^evt-/, "")) > sequence);
  }

  subscribe(id: string, subscriber: TimelineSubscriber) {
    const subscribers = this.#subscribers.get(id) ?? new Set<TimelineSubscriber>();
    subscribers.add(subscriber);
    this.#subscribers.set(id, subscribers);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) this.#subscribers.delete(id);
    };
  }

  appendEvent(incidentId: string, type: IncidentEvent["type"], message: string, version: number) {
    const sequence = (this.#eventSequences.get(incidentId) ?? 0) + 1;
    this.#eventSequences.set(incidentId, sequence);
    const event: IncidentEvent = {
      id: `evt-${sequence}`,
      incidentId,
      type,
      message,
      at: new Date().toISOString(),
      version,
    };
    const events = this.#events.get(incidentId) ?? [];
    events.push(event);
    this.#events.set(incidentId, events);
    for (const subscriber of this.#subscribers.get(incidentId) ?? []) {
      subscriber.response.write(
        `id: ${event.id}\nevent: incident\ndata: ${JSON.stringify(event)}\n\n`,
      );
      if (subscriber.disconnectAfterFirst) subscriber.response.end();
    }
    return event;
  }

  async burstTimeline(incidentId: string, count = 120) {
    const incident = this.#incidents.get(incidentId);
    if (incident === undefined) return 0;
    for (let index = 0; index < count; index += 1) {
      if (index === 8) {
        this.#eventSequences.set(incidentId, (this.#eventSequences.get(incidentId) ?? 0) + 1);
      }
      this.appendEvent(incidentId, "note", `Bounded timeline burst ${index + 1}`, incident.version);
      if (index % 8 === 7) await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return count;
  }

  startRunbook(incidentId: string) {
    const incident = this.#incidents.get(incidentId);
    if (incident === undefined) return undefined;
    const id = `run-${++this.#runbookSequence}`;
    const runbook: Runbook = {
      id,
      incidentId,
      status: "queued",
      steps: runbookSteps.map((label, index) => ({
        id: `step-${index + 1}`,
        label,
        status: "pending",
      })),
    };
    this.#runbooks.set(id, runbook);
    const fail = this.consume("runbook-failure");
    const timers = new Set<ReturnType<typeof setTimeout>>();
    this.#runbookTimers.set(id, timers);
    const schedule = (delay: number, work: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        work();
      }, delay);
      timers.add(timer);
    };
    schedule(200, () => this.advanceRunbook(id, 0, "running"));
    schedule(700, () => this.advanceRunbook(id, 1, fail ? "failed" : "running"));
    if (!fail) schedule(1_200, () => this.advanceRunbook(id, 2, "succeeded"));
    this.appendEvent(incidentId, "runbook", `Runbook ${id} queued`, incident.version);
    return runbook;
  }

  #setRunbook(runbook: Runbook) {
    this.#runbooks.set(runbook.id, runbook);
    return runbook;
  }

  advanceRunbook(id: string, stepIndex: number, terminal: "running" | "failed" | "succeeded") {
    const current = this.#runbooks.get(id);
    if (current === undefined || current.status === "cancelled") return;
    const steps = current.steps.map((step, index) => ({
      ...step,
      status:
        index < stepIndex
          ? ("succeeded" as const)
          : index === stepIndex
            ? terminal === "failed"
              ? ("failed" as const)
              : ("running" as const)
            : step.status,
    }));
    if (terminal === "succeeded") steps[stepIndex] = { ...steps[stepIndex]!, status: "succeeded" };
    const runbook = this.#setRunbook({ ...current, status: terminal, steps });
    const incident = this.#incidents.get(current.incidentId);
    if (incident !== undefined) {
      this.appendEvent(
        current.incidentId,
        "runbook",
        `Runbook ${id} ${runbook.status}`,
        incident.version,
      );
    }
    if (terminal !== "running") this.clearRunbookTimers(id);
  }

  getRunbook(id: string) {
    return this.#runbooks.get(id);
  }

  cancelRunbook(id: string) {
    if (this.consume("runbook-cancel-race")) this.advanceRunbook(id, 2, "succeeded");
    const current = this.#runbooks.get(id);
    if (current === undefined) return undefined;
    if (
      current.status === "succeeded" ||
      current.status === "failed" ||
      current.status === "cancelled"
    ) {
      return current;
    }
    this.clearRunbookTimers(id);
    return this.#setRunbook({
      ...current,
      status: "cancelled",
      steps: current.steps.map((step) =>
        step.status === "succeeded" ? step : { ...step, status: "cancelled" },
      ),
    });
  }

  clearRunbookTimers(id: string) {
    for (const timer of this.#runbookTimers.get(id) ?? []) clearTimeout(timer);
    this.#runbookTimers.delete(id);
  }

  cancelAllRunbooks() {
    for (const id of this.#runbookTimers.keys()) this.clearRunbookTimers(id);
  }

  diagnostics() {
    return {
      incidents: this.#incidents.size,
      subscribers: Array.from(this.#subscribers.values()).reduce(
        (total, subscribers) => total + subscribers.size,
        0,
      ),
      activeRunbooks: this.#runbookTimers.size,
    };
  }

  disconnectSubscribers() {
    let disconnected = 0;
    for (const subscribers of this.#subscribers.values()) {
      for (const subscriber of subscribers) {
        subscriber.response.end();
        disconnected += 1;
      }
    }
    return disconnected;
  }
}
