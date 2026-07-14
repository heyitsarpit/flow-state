import type {
  FlowChildSnapshot,
  FlowReceipt,
  FlowTestChildSummary,
  FlowTestChildTree,
  FlowTestChildTreeNode,
} from "../core/api/types.js";
import { canonicalFactFamily } from "../core/inspection/canonical-receipt.js";

function createEmptyStatusBuckets(): Record<FlowChildSnapshot["status"], string[]> {
  return {
    idle: [],
    active: [],
    success: [],
    failure: [],
    interrupt: [],
    stopped: [],
  };
}

function toChildTreeNode(snapshot: FlowChildSnapshot): FlowTestChildTreeNode {
  const nestedChildren = snapshot.snapshot?.children ?? {};

  return Object.freeze({
    id: snapshot.id,
    ...(snapshot.actorId === undefined ? {} : { actorId: snapshot.actorId }),
    status: snapshot.status,
    ...(snapshot.state === undefined ? {} : { state: snapshot.state }),
    ...(snapshot.parentState === undefined ? {} : { parentState: snapshot.parentState }),
    ...(snapshot.supervision === undefined ? {} : { supervision: snapshot.supervision }),
    children: createChildTree(nestedChildren),
  });
}

export function createChildTree(
  children: Readonly<Record<string, FlowChildSnapshot>>,
): FlowTestChildTree {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(children).map(([id, snapshot]) => [id, toChildTreeNode(snapshot)]),
    ),
  );
}

export function createChildSummary(
  children: Readonly<Record<string, FlowChildSnapshot>>,
  receipts: ReadonlyArray<FlowReceipt>,
): FlowTestChildSummary {
  const idsByStatus = createEmptyStatusBuckets();
  const byId: Record<string, FlowTestChildSummary["byId"][string]> = {};
  const outcomes = {
    start: [] as string[],
    success: [] as string[],
    failure: [] as string[],
    interrupt: [] as string[],
    stop: [] as string[],
  };

  for (const [id, snapshot] of Object.entries(children)) {
    idsByStatus[snapshot.status].push(id);
    byId[id] = Object.freeze({
      ...(snapshot.actorId === undefined ? {} : { actorId: snapshot.actorId }),
      status: snapshot.status,
      ...(snapshot.state === undefined ? {} : { state: snapshot.state }),
      ...(snapshot.parentState === undefined ? {} : { parentState: snapshot.parentState }),
      ...(snapshot.supervision === undefined ? {} : { supervision: snapshot.supervision }),
    });
  }

  for (const receipt of receipts) {
    if (canonicalFactFamily(receipt.type) !== "child" || typeof receipt.id !== "string") {
      continue;
    }

    switch (receipt.type) {
      case "child:start":
        outcomes.start.push(receipt.id);
        break;
      case "child:success":
        outcomes.success.push(receipt.id);
        break;
      case "child:failure":
        outcomes.failure.push(receipt.id);
        break;
      case "child:interrupt":
        outcomes.interrupt.push(receipt.id);
        break;
      case "child:stop":
        outcomes.stop.push(receipt.id);
        break;
    }
  }

  return Object.freeze({
    idsByStatus: Object.freeze(
      Object.fromEntries(
        Object.entries(idsByStatus).map(([status, ids]) => [status, Object.freeze([...ids])]),
      ) as FlowTestChildSummary["idsByStatus"],
    ),
    outcomes: Object.freeze(
      Object.fromEntries(
        Object.entries(outcomes).map(([key, ids]) => [key, Object.freeze([...ids])]),
      ) as FlowTestChildSummary["outcomes"],
    ),
    byId: Object.freeze(byId),
  });
}
