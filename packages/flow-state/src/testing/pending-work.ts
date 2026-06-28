import type { FlowChildSnapshot, FlowTestPendingWork } from "../public/types.js";

type PendingTimerEntry = Readonly<{
  readonly id: string;
  readonly dueAt: number;
  readonly parentState?: string;
}>;

type CreatePendingWorkSnapshotArgs = Readonly<{
  readonly machineId: string;
  readonly ready: number;
  readonly activeFibers: number;
  readonly timers: ReadonlyArray<PendingTimerEntry>;
  readonly streams: ReadonlyArray<string>;
  readonly transactions: ReadonlyArray<string>;
  readonly children: Readonly<Record<string, FlowChildSnapshot>>;
  readonly now?: number;
}>;

function pendingChildren(
  children: Readonly<Record<string, FlowChildSnapshot>>,
): FlowTestPendingWork["children"] {
  return Object.freeze(
    Object.values(children)
      .filter((child) => child.status === "active" || child.status === "idle")
      .map((child) => {
        const nextChild: FlowTestPendingWork["children"][number] = {
          id: child.id,
          status: child.status,
          ...(child.actorId === undefined ? {} : { actorId: child.actorId }),
          ...(child.state === undefined ? {} : { state: child.state }),
          ...(child.parentState === undefined ? {} : { parentState: child.parentState }),
        };
        return Object.freeze(nextChild);
      }),
  );
}

export function createPendingWorkSnapshot(
  args: CreatePendingWorkSnapshotArgs,
): FlowTestPendingWork {
  const nextAfterMillis =
    args.timers.length === 0 || args.now === undefined
      ? undefined
      : Math.max(0, Math.min(...args.timers.map((entry) => entry.dueAt)) - args.now);

  return Object.freeze({
    ready: args.ready,
    activeFibers: args.activeFibers,
    mailboxes:
      args.ready === 0
        ? Object.freeze([])
        : Object.freeze([
            Object.freeze({
              id: args.machineId,
              pending: args.ready,
            }),
          ]),
    timers: Object.freeze(
      args.timers.map((entry) => {
        const nextTimer: FlowTestPendingWork["timers"][number] = {
          id: entry.id,
          dueAt: entry.dueAt,
          ...(entry.parentState === undefined ? {} : { parentState: entry.parentState }),
        };
        return Object.freeze(nextTimer);
      }),
    ),
    streams: Object.freeze([...args.streams]),
    transactions: Object.freeze([...args.transactions]),
    children: pendingChildren(args.children),
    ...(nextAfterMillis === undefined ? {} : { nextAfterMillis }),
  });
}

export function createSettleBoundsError(
  kind: "maxFibers" | "maxTicks",
  bounds: Readonly<{
    readonly maxTicks: number;
    readonly maxFibers: number;
  }>,
  pending: FlowTestPendingWork,
): Error {
  return new Error(
    [
      `flowTest.settle exceeded ${kind} with maxTicks=${bounds.maxTicks} and maxFibers=${bounds.maxFibers}`,
      `ready=${pending.ready}`,
      `activeFibers=${pending.activeFibers}`,
      `mailboxes=[${pending.mailboxes.map((entry) => `${entry.id}#${entry.pending}`).join(", ")}]`,
      `transactions=[${pending.transactions.join(", ")}]`,
      `streams=[${pending.streams.join(", ")}]`,
      `timers=[${pending.timers.map((entry) => `${entry.id}@${entry.dueAt}`).join(", ")}]`,
      `children=[${pending.children.map((entry) => `${entry.id}:${entry.status}`).join(", ")}]`,
    ].join("; "),
  );
}
