"use client";

import { useEffect, useState } from "react";

import { FlowProvider } from "flow-state/react";

import { createFeedRuntime } from "../app/runtime";
import { FeedScreen } from "./FeedScreen";

export function FlowRoot() {
  const [runtime] = useState(createFeedRuntime);
  useEffect(() => () => void runtime.dispose(), [runtime]);
  return (
    <FlowProvider runtime={runtime}>
      <FeedScreen />
    </FlowProvider>
  );
}
