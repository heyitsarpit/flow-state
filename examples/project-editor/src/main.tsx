import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FlowProvider, createRuntime, flow, useFlow, useSelector } from "@flow-state/core";

import { projectEditorMachine, selectCanSave, selectIsDirty } from "./projectFlow";

const runtime = createRuntime();

function ProjectEditorExample(): React.ReactElement {
  const actor = useFlow(projectEditorMachine);
  const snapshot = useSelector(actor, (current) => current);
  const isDirty = selectIsDirty(snapshot.context);
  const canSave = selectCanSave(snapshot.context);

  return (
    <main>
      <h1>Project Editor</h1>
      <p>State: {snapshot.value}</p>
      <p>Dirty: {isDirty ? "yes" : "no"}</p>
      <button
        type="button"
        onClick={() => actor.send({ type: "OPEN_PROJECT", projectId: "project-1" })}
      >
        Open project
      </button>
      <button type="button" disabled={!flow.can(actor, { type: "SAVE_PROJECT" }) || !canSave}>
        Save
      </button>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <FlowProvider runtime={runtime}>
      <ProjectEditorExample />
    </FlowProvider>
  </StrictMode>,
);
