"use client";

import { useActor, useResource, useView } from "flow-state/react";

import type { ProjectCursor } from "../domain/projects";
import { feedMachine } from "../features/feed/machine";
import { projectPageResource } from "../features/feed/resources";
import { feedView } from "../features/feed/view";

function PageStatus({ cursor }: Readonly<{ readonly cursor: ProjectCursor }>) {
  const page = useResource(projectPageResource.ref(cursor));
  if (page === null || page.status === "loading") return <p>Loading page {cursor}…</p>;
  if (page.status === "failure") return <p role="alert">Page {cursor} unavailable.</p>;
  return null;
}

export function FeedScreen() {
  const actor = useActor(feedMachine, { id: "feed.window" });
  const view = useView(actor, feedView);

  return (
    <main>
      <h1>Bounded project feed</h1>
      <p>Visible cursors: {view.cursors.join(", ")}</p>
      <button disabled={!view.canLoadPrevious} onClick={() => actor.send({ type: "PREVIOUS" })}>
        Load older
      </button>
      <button disabled={!view.canLoadNext} onClick={() => actor.send({ type: "NEXT" })}>
        Load newer
      </button>
      <button onClick={() => actor.send({ type: "REFRESH" })}>Refresh</button>
      <button onClick={() => actor.send({ type: "RETRY" })}>Retry</button>
      {view.refreshing ? <p>Background updating…</p> : null}
      {view.cursors.map((cursor) => (
        <PageStatus key={cursor} cursor={cursor} />
      ))}
      {view.projects.map((project) => (
        <article key={project.id}>
          {project.name} · revision {project.revision}
        </article>
      ))}
    </main>
  );
}
