import { createRoot } from "react-dom/client";

import { FlowProvider, flow } from "@flow-state/core";

import { fixtureProject } from "./domain";
import { Project, launchApiCoverage, launchRuntime } from "./launchWorkspace";
import "./styles.css";

function LaunchWorkspaceShell(): React.ReactElement {
  const editor = flow.use(Project.editor);
  const editorView = flow.useView(editor, Project.editorView);
  const projectResource = flow.useResource(Project.byId.ref(fixtureProject.id));

  const openProject = (): void => {
    editor.send({ type: "OPEN_PROJECT", projectId: fixtureProject.id });
    editor.send({ type: "PROJECT_READY", project: fixtureProject });
  };

  const editProject = (): void => {
    editor.send({ type: "EDIT" });
  };

  const saveProject = (): void => {
    editor.send({ type: "SAVE" });
  };

  return (
    <main className="workspace-shell">
      <aside className="rail" aria-label="Launch workspace sections">
        {["Overview", "Editor", "Assets", "Approval", "Assistant", "Chat", "Trace"].map((item) => (
          <button className={item === "Editor" ? "active" : ""} key={item} type="button">
            {item}
          </button>
        ))}
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">vNext API proving app</p>
            <h1>Launch Workspace</h1>
          </div>
          <div className="commands" aria-label="Editor commands">
            <button type="button" onClick={openProject}>
              Open
            </button>
            <button
              type="button"
              onClick={editProject}
              disabled={!flow.can(editor.getSnapshot(), { type: "EDIT" })}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={saveProject}
              disabled={!flow.can(editor.getSnapshot(), { type: "SAVE" })}
            >
              Save
            </button>
          </div>
        </header>

        <div className="status-strip" aria-label="Runtime status">
          <span>State: {editorView.state}</span>
          <span>Resource: {projectResource === null ? "contract-only" : "ready"}</span>
          <span>Mutation: {editorView.saveStatus}</span>
          <span>Commands: {editorView.commandLabels.join(", ")}</span>
        </div>

        <section className="editor-surface" aria-label="Editor">
          <div>
            <p className="section-label">Project</p>
            <h2>{fixtureProject.name}</h2>
            <p>{fixtureProject.summary}</p>
          </div>
          <dl>
            <div>
              <dt>Launch date</dt>
              <dd>{fixtureProject.launchDate}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{fixtureProject.version}</dd>
            </div>
            <div>
              <dt>vNext surfaces assigned</dt>
              <dd>{launchApiCoverage.length}</dd>
            </div>
          </dl>
        </section>
      </section>
    </main>
  );
}

const root = document.getElementById("root");

if (root !== null) {
  createRoot(root).render(
    <FlowProvider runtime={launchRuntime}>
      <LaunchWorkspaceShell />
    </FlowProvider>,
  );
}
