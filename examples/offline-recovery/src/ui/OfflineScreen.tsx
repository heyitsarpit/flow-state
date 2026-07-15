"use client";

import { useEffect } from "react";

import { useActor, useResource, useView } from "flow-state/react";

import { offlineMachine } from "../features/offline/machine";
import { movieResource, outboxResource } from "../features/offline/resources";
import { offlineView } from "../features/offline/view";
import { outboxWorker } from "../features/offline/worker";

export function OfflineScreen() {
  const actor = useActor(offlineMachine, { id: "offline.recovery.screen" });
  const selection = useView(actor, offlineView);
  const movie = useResource(movieResource.ref("movie-1"));
  const outbox = useResource(outboxResource.ref());

  useEffect(() => {
    actor.send({ type: "START" });
  }, [actor]);

  return (
    <main>
      <h1>Offline movie recovery</h1>
      <p>{selection.online ? "Online" : "Offline"}</p>
      <p>
        {movie?.availability === "value" ? movie.value.title : "Movie unavailable"}:{" "}
        {movie?.availability === "value" ? movie.value.comment : "No cached comment"}
      </p>
      <p>Queued comments: {outbox?.availability === "value" ? outbox.value.pending.length : 0}</p>
      <button onClick={() => actor.send({ type: "ONLINE" })}>Go online</button>
      <button onClick={() => actor.send({ type: "OFFLINE" })}>Go offline</button>
      <button
        onClick={() =>
          actor.send({
            type: "QUEUE_PAIR",
            first: "Watch on the train",
            second: "Sync when connected",
          })
        }
      >
        Queue comments
      </button>
      {selection.state === "queueing" ? (
        <button onClick={() => actor.send({ type: "CANCEL_QUEUE" })}>Cancel queued work</button>
      ) : null}
      {selection.failed ? (
        <button onClick={() => actor.retryChild(outboxWorker.id)}>Retry sync worker</button>
      ) : null}
      <p>Worker: {selection.workerStatus}</p>
    </main>
  );
}
