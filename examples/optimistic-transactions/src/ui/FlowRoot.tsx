"use client";

import { useEffect, useState } from "react";

import { FlowProvider } from "flow-state/react";

import { createOptimisticRuntime } from "../app/runtime";
import { TodoEditor } from "./TodoEditor";

export function FlowRoot() {
  const [runtime] = useState(createOptimisticRuntime);
  useEffect(() => () => void runtime.dispose(), [runtime]);
  return (
    <FlowProvider runtime={runtime}>
      <TodoEditor />
    </FlowProvider>
  );
}
