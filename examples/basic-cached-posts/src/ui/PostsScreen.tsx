"use client";

import { useMemo } from "react";

import { useActor, useResource, useView } from "flow-state/react";

import { postsScreenMachine } from "../features/posts/machine";
import { postDetailResource, postsResource } from "../features/posts/resources";
import { postsScreenView } from "../features/posts/view";

export function PostsScreen() {
  const actor = useActor(postsScreenMachine, { id: "posts.screen" });
  const screen = useView(actor, postsScreenView);
  const list = useResource(postsResource.ref());
  const detailRef = useMemo(
    () =>
      screen.selectedPostId === undefined
        ? postDetailResource.ref(1)
        : postDetailResource.ref(screen.selectedPostId),
    [screen.selectedPostId],
  );
  const detail = useResource(detailRef);

  if (screen.screen === "list") {
    return (
      <main>
        <h1>Posts</h1>
        {list?.status === "loading" || list === null ? <p>Loading…</p> : null}
        {list?.status === "failure" ? (
          <p role="alert">
            Posts unavailable. <button onClick={() => actor.send({ type: "RETRY" })}>Retry</button>
          </p>
        ) : null}
        {list?.value?.map((post) => (
          <button key={post.id} onClick={() => actor.send({ type: "OPEN_POST", postId: post.id })}>
            {post.title}
          </button>
        ))}
      </main>
    );
  }

  return (
    <main>
      <button onClick={() => actor.send({ type: "BACK" })}>Back</button>
      {detail?.status === "loading" || detail === null ? <p>Loading…</p> : null}
      {detail?.status === "failure" ? (
        <p role="alert">
          Post unavailable. <button onClick={() => actor.send({ type: "RETRY" })}>Retry</button>
        </p>
      ) : null}
      {detail?.value === undefined ? null : (
        <article>
          <h1>{detail.value.title}</h1>
          <p>{detail.value.body}</p>
          <small>Revision {detail.value.revision}</small>
        </article>
      )}
      <button onClick={() => actor.send({ type: "REFRESH" })}>Refresh</button>
      {screen.refreshing ? <p>Background updating…</p> : null}
    </main>
  );
}
