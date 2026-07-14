"use client";

import { useEffect, useState } from "react";

import { FlowProvider } from "flow-state/react";

import { createPostsRuntime } from "../app/runtime";
import { PostsScreen } from "./PostsScreen";

export function FlowRoot() {
  const [runtime] = useState(createPostsRuntime);

  useEffect(() => () => void runtime.dispose(), [runtime]);

  return (
    <FlowProvider runtime={runtime}>
      <PostsScreen />
    </FlowProvider>
  );
}
