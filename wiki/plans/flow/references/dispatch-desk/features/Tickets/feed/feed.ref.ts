// unchanged except its comment (the stream's `registered` mark is gone; the bookmark is saved with the memory).
import { actorRef } from "flow-state";
import { DeskFeedMachine } from "./feed.machine.js";

export const feedRef = (workspaceId: string) =>
  actorRef(DeskFeedMachine, workspaceId, { persist: true });
